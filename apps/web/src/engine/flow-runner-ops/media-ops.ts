import type { TextSplitMode } from '@nx9/shared';
import {
  mergeUpstreamPrompt,
  migrateTimelinePayload,
  parseTimelineDraft,
  resolveAssetImportItems,
  resolveEngine,
  resolveUpstreamShotsFromGraph,
  resolveVoiceCastLines,
  splitText,
} from '@nx9/shared';
import { api } from '../../api/client';
import { renderClipEditorTimeline } from '../clip-editor-render';
import { runSoundGenBgm, runSoundGenCast, synthesizeTts } from '../sound-gen-runner';
import { patchUpstreamShot } from '../chain-storyboard-utils';
import { advanceIteratorIndex } from '../stage-deck/execution/iterator-index';
import type { FlowExecuteDeps } from './types';

export async function executeMediaOps(deps: FlowExecuteDeps): Promise<void> {
  const { block, kind, prompt, upstream, updateNodeData, ctx } = deps;
  const d = block.data ?? {};
  if (kind === 'chat-model') {
    const messages = [
      ...(d.systemPrompt ? [{ role: 'system', content: d.systemPrompt as string }] : []),
      { role: 'user', content: prompt || (d.content as string) || 'Hello' },
    ];
    try {
      const res = (await api.proxyLlm({
        messages,
        model: (d.model as string) || 'gpt-4o-mini',
      })) as { choices?: { message?: { content?: string } }[]; content?: string };
      const reply =
        (typeof res.content === 'string' ? res.content : '') ||
        res.choices?.[0]?.message?.content ||
        '';
      if (!reply.trim()) {
        updateNodeData(block.id, {
          status: 'error',
          error: 'LLM 返回空回复，禁止空成功',
        });
        return;
      }
      updateNodeData(block.id, {
        status: 'success',
        lastReply: reply,
        output: reply,
        content: reply,
      });
    } catch (e) {
      updateNodeData(block.id, { status: 'error', error: String(e) });
    } finally {
      const s = block.data?.status as string | undefined;
      if (s === 'running') {
        updateNodeData(block.id, { status: 'idle' });
      }
    }
    return;
  }

  if (kind === 'sound-gen') {
    const soundMode = (d.soundMode as string) || 'tts';
    if (soundMode === 'music') {
      const bgmPrompt = (d.content as string) || prompt || '';
      const url = await runSoundGenBgm(bgmPrompt, 30);
      updateNodeData(block.id, { status: 'success', audioUrl: url, content: bgmPrompt });
      return;
    }
    if (soundMode === 'sfx') {
      const url = typeof d.audioUrl === 'string' ? d.audioUrl.trim() : '';
      if (!url) {
        throw new Error('音效模式：请先从声音库导入音频（画布 run 不会自动生成音效），禁止空成功');
      }
      updateNodeData(block.id, { status: 'success', audioUrl: url, soundKind: 'sfx' });
      return;
    }
    if (soundMode === 'cast') {
      const { lines, source } = resolveVoiceCastLines(
        d.lines as { speaker: string; text: string; emotion?: string }[] | undefined,
        upstream.lines,
      );
      const profileMap = (d.profileMap as Record<string, string>) ?? {};
      if (lines.length === 0) {
        throw new Error('无可解析的对白（请连接编剧台或已拆镜的分镜台），禁止空成功');
      }
      const { results, audioUrls } = await runSoundGenCast(lines, profileMap);
      updateNodeData(block.id, {
        status: audioUrls.length > 0 ? 'success' : 'error',
        results,
        sounds: audioUrls,
        audioUrl: audioUrls[0],
        lines,
        lineSource: source,
        profileMap,
        meta: { total: results.length, failed: results.filter((r) => r.error).length, lineSource: source },
      });
      if (audioUrls.length === 0) throw new Error('多角色配音全部失败，禁止空成功');
      try {
        const { useWorkspaceDocument } = await import('../../stores/workspace-document');
        const store = useWorkspaceDocument.getState();
        const existing = store.voice.lines;
        const toAdd: import('@nx9/shared').VoiceLine[] = [];
        for (let i = 0; i < results.length; i++) {
          const r = results[i]!;
          if (!r.audioUrl) continue;
          const shotId = r.shotId ?? lines[i]?.shotId ?? null;
          const hit = existing.find(
            (l) =>
              l.text === r.text &&
              l.speaker === r.speaker &&
              (shotId ? l.shotId === shotId : true),
          );
          if (hit) {
            store.updateVoiceLine(hit.id, {
              audioAssetId: r.audioUrl,
              status: 'ready',
              shotId: shotId ?? hit.shotId,
              durationSec: r.durationSec ?? hit.durationSec,
            });
          } else {
            toAdd.push({
              id: `vl-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`,
              shotId,
              speaker: r.speaker,
              text: r.text,
              audioAssetId: r.audioUrl,
              durationSec: r.durationSec ?? null,
              status: 'ready',
            });
          }
        }
        if (toAdd.length > 0) store.addVoiceLines(toAdd);
      } catch {
        /* 纯测环境无 store */
      }
      return;
    }
    const text = prompt || (d.content as string) || (d.text as string) || '';
    if (!text.trim()) throw new Error('配音文本为空，禁止空成功');
    const provider = (d.provider as string) || 'cloud';
    const referenceAudioUrl = (d.referenceAudioUrl as string) || '';
    const res = await synthesizeTts({
      input: text,
      voice: (d.voice as string) || 'alloy',
      provider,
      referenceAudioUrl,
      characterId: (d.characterId as string) || undefined,
      audioFormat: (d.audioFormat as string) || undefined,
      speechRate: typeof d.speechRate === 'number' ? d.speechRate : undefined,
      instructions: (d.instructions as string) || undefined,
    });
    updateNodeData(block.id, {
      status: 'success',
      audioUrl: res.url,
      content: text,
      providerUsed: res.provider,
    });
    return;
  }

  if (kind === 'grid-split') {
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少 picture 输入，禁止空成功');
    const rows = (d.rows as number) ?? 3;
    const cols = (d.cols as number) ?? 3;
    const res = await api.gridSplit({ sourceUrl, rows, cols });
    if (!res.ok || !res.urls?.length) throw new Error('宫格拆分失败，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      splitUrls: res.urls,
      pictures: res.urls,
    });
    return;
  }

  if (kind === 'grid-compose') {
    const imageUrls = upstream.pictures;
    if (imageUrls.length === 0) throw new Error('缺少 picture 输入，禁止空成功');
    const rows = (d.rows as number) ?? 3;
    const cols = (d.cols as number) ?? 3;
    const res = await api.gridCompose({ imageUrls, rows, cols });
    if (!res.ok || !res.url) throw new Error('宫格合成失败，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      composedUrl: res.url,
      previewUrl: res.url,
    });
    return;
  }

  if (kind === 'asset-import') {
    const items = resolveAssetImportItems(d as Record<string, unknown>);
    if (items.length === 0) throw new Error('资产导入列表为空，禁止空成功');
    const pictures = items.filter((i) => i.mediaKind === 'picture').map((i) => i.url);
    updateNodeData(block.id, {
      status: 'success',
      output: items[0]?.url,
      previewUrl: pictures[0] ?? (items[0]?.mediaKind === 'picture' ? items[0].url : undefined),
      previewUrls: pictures,
    });
    return;
  }

  if (kind === 'text-chunker') {
    const source =
      upstream.prompts.join('\n\n') || (d.content as string) || '';
    if (!String(source).trim()) throw new Error('文本切分源为空，禁止空成功');
    const mode = ((d.mode as string) || 'paragraph') as TextSplitMode;
    const chunks = splitText(source, mode, d.regex as string | undefined);
    if (chunks.length === 0) throw new Error('文本切分结果为空，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      chunks,
      content: chunks.join('\n\n'),
      chunkCount: chunks.length,
    });
    return;
  }

  if (kind === 'iterator') {
    const pool = [
      ...upstream.prompts,
      ...upstream.pictures,
      ...upstream.clips,
      ...((d.pool as string[]) ?? []),
    ];
    if (pool.length === 0) {
      updateNodeData(block.id, {
        status: 'skipped',
        noop: true,
        content: '迭代器：上游池为空，禁止空成功',
        iterItems: [],
      });
      return;
    }
    const idx = ((d.currentIndex as number) ?? 0) % pool.length;
    const next = pool[idx] ?? '';
    updateNodeData(block.id, {
      status: 'success',
      currentIndex: advanceIteratorIndex(idx, pool.length),
      lastEmittedIndex: idx,
      iterItems: pool,
      content: next,
      output: next,
    });
    return;
  }

  if (kind === 'picker') {
    const pool = upstream.pictures.length
      ? upstream.pictures
      : upstream.clips.length
        ? upstream.clips
        : upstream.prompts;
    if (pool.length === 0) {
      updateNodeData(block.id, {
        status: 'skipped',
        noop: true,
        content: '选择器：上游池为空，禁止空成功',
        iterItems: [],
      });
      return;
    }
    const pickIndex = Math.min(
      Math.max(0, (d.pickIndex as number) ?? 0),
      pool.length - 1,
    );
    const picked = pool[pickIndex] ?? '';
    updateNodeData(block.id, {
      status: 'success',
      pickIndex,
      iterItems: pool,
      content: picked,
      output: picked,
      previewUrl: upstream.pictures.length ? picked : undefined,
      videoUrl: upstream.clips.length ? picked : undefined,
    });
    return;
  }

  if (kind === 'clip-editor') {
    const editorMode = (d.editorMode as string) ?? '';
    // SE-04: audio/grade 为显式工具模式（无新剪辑台 UI 入口）；仅当节点数据显式设置 editorMode 时进入。
    // 智能剪辑主路径走下方 timeline + renderClipEditorTimeline，勿与此混用。
    if (editorMode === 'audio') {
      const tracks = upstream.sounds ?? [];
      if (tracks.length < 2) throw new Error('至少需要 2 条音频（editorMode=audio 混音工具），禁止空成功');
      const mixRes = await api.mixAudio(tracks, (d.normalize as boolean | undefined) ?? true);
      if (!mixRes.ok || !mixRes.url) throw new Error(mixRes.message ?? '混音失败，禁止空成功');
      updateNodeData(block.id, {
        status: 'success',
        outputSound: mixRes.url,
        sounds: [mixRes.url],
        meta: { trackCount: mixRes.trackCount, legacyTool: 'audio-mix' },
      });
      return;
    }
    if (editorMode === 'grade') {
      const source = upstream.clips?.[0] ?? upstream.pictures?.[0];
      if (!source) throw new Error('需要上游图像或视频（editorMode=grade 调色工具），禁止空成功');
      const gradeRes = await api.colorGrade({
        sourceUrl: source,
        brightness: (d.brightness as number) ?? 0,
        contrast: (d.contrast as number) ?? 1,
        saturation: (d.saturation as number) ?? 1,
      });
      if (!gradeRes.ok || !gradeRes.url) throw new Error(gradeRes.message ?? '调色失败，禁止空成功');
      updateNodeData(block.id, {
        status: 'success',
        outputUrl: gradeRes.url,
        previewUrl: gradeRes.url,
        videoUrl: upstream.clips?.[0] ? gradeRes.url : undefined,
        meta: { legacyTool: 'color-grade' },
      });
      return;
    }
    // Smart edit: 节点本地时间线 + 连接链镜表，禁止读全局 storyboard
    const parsed = parseTimelineDraft(d.timelineDraft as import('@nx9/shared').TimelineDraftRaw);
    let timelineDraft = parsed ? migrateTimelinePayload(parsed) : null;
    const profile = ((d.profile as string) ?? 'drama') as import('@nx9/shared').SmartEditProfile;
    if (!timelineDraft) {
      const { orchestrateDramaTimeline, orchestrateViralTimeline } = await import('../smart-edit-orchestrator');
      if (profile === 'drama') {
        if (!ctx) throw new Error('智能剪辑缺少画布上下文，禁止空成功');
        const linkedIds = (d.linkedShotIds as string[] | undefined) ?? [];
        const upstreamShots = resolveUpstreamShotsFromGraph(block.id, ctx.nodes, ctx.edges);
        const shots =
          linkedIds.length > 0
            ? upstreamShots.shots.filter((s) => linkedIds.includes(s.id))
            : upstreamShots.shots;
        if (shots.length === 0) {
          throw new Error('智能剪辑未连接镜头上游，无法漫剧编排，禁止空成功');
        }
        const result = await orchestrateDramaTimeline({
          approvedOnly: true,
          shots,
          bgmUrl: upstream.bgmUrls?.[0],
        });
        if (result.timeline) {
          let timeline = result.timeline;
          // SF-05/19/20: 画布 run 挂对白+字幕+音效；BGM 已由 orchestrate 注入
          try {
            const { buildVoiceDramaTimeline } = await import('@nx9/shared');
            const { useWorkspaceDocument } = await import('../../stores/workspace-document');
            const voiceLines = useWorkspaceDocument.getState().voice.lines.filter(
              (l) => l.audioAssetId && l.shotId,
            );
            const sfxUrls = upstream.sfxUrls ?? [];
            if (voiceLines.length > 0 || sfxUrls.length > 0) {
              timeline = buildVoiceDramaTimeline(timeline, voiceLines, { sfxUrls });
            }
          } catch {
            /* 无工作区 store 时跳过（纯测路径） */
          }
          timelineDraft = migrateTimelinePayload(timeline);
          updateNodeData(block.id, {
            timelineDraft: timeline,
            suggestions: result.suggestions,
            pendingSuggestionIds: result.suggestions.map((s) => s.id),
          });
        }
      } else if (upstream.clips.length > 0) {
        const result = await orchestrateViralTimeline({
          clips: upstream.clips,
          bgmUrl: upstream.bgmUrls?.[0],
        });
        if (result.timeline) {
          timelineDraft = migrateTimelinePayload(result.timeline);
          updateNodeData(block.id, {
            timelineDraft: result.timeline,
            suggestions: result.suggestions,
            pendingSuggestionIds: result.suggestions.map((s) => s.id),
          });
        }
      }
    }
    const freshTimeline = timelineDraft;
    if (!freshTimeline) throw new Error('编排未生成时间线，禁止空成功');
    const engine = resolveEngine(
      profile,
      ((d.engine as string) ?? 'auto') as import('@nx9/shared').SmartEditEngine,
    );
    updateNodeData(block.id, { status: 'running' });
    const rendered = await renderClipEditorTimeline(freshTimeline, engine, {
      profile,
      title: (d.title as string) || '智能剪辑',
      templateId: (d.templateId as string) || 'nx9-vertical-episode',
    });
    updateNodeData(block.id, {
      status: 'success',
      videoUrl: rendered.url,
      outputUrl: rendered.url,
      renderTaskId: rendered.taskId,
      renderBackend: rendered.engine,
    });
    return;
  }

  if (kind === 'asset-bundle') {
    const items: { kind: string; url: string; label?: string }[] = [];
    upstream.pictures.forEach((url, i) => items.push({ kind: 'picture', url, label: `图 ${i + 1}` }));
    upstream.clips.forEach((url, i) => items.push({ kind: 'clip', url, label: `视频 ${i + 1}` }));
    upstream.sounds.forEach((url, i) => items.push({ kind: 'sound', url, label: `音频 ${i + 1}` }));
    upstream.prompts.forEach((url, i) => items.push({ kind: 'text', url, label: `文本 ${i + 1}` }));
    updateNodeData(block.id, {
      status: 'success',
      bundleItems: items,
      bundleCount: items.length,
    });
    return;
  }

  if (kind === 'render-slot') {
    const fillUrl = upstream.pictures[0] || upstream.clips[0];
    updateNodeData(block.id, {
      status: 'success',
      filledUrl: fillUrl,
      previewUrl: upstream.pictures[0],
      videoUrl: upstream.clips[0],
      slotPrompt: (d.slotPrompt as string) || prompt,
    });
    return;
  }

  if (kind === 'frame-endpoints') {
    const videoUrl = upstream.clips[0] || (d.videoUrl as string);
    if (!videoUrl) throw new Error('缺少视频输入，禁止空成功');
    const res = await api.extractFrames(videoUrl, (d.frameCount as number) ?? 2);
    if (!res.ok || !res.frames?.length) throw new Error(res.message ?? '抽帧失败，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      frameUrls: res.frames,
      firstFrameUrl: res.frames[0],
      lastFrameUrl: res.frames[res.frames.length - 1],
      pictures: res.frames,
      previewUrl: res.frames[0],
    });
    return;
  }

  if (kind === 'frame-sampler') {
    const videoUrl = upstream.clips[0] || (d.videoUrl as string);
    if (!videoUrl) throw new Error('缺少视频输入，禁止空成功');
    const res = await api.extractFrames(videoUrl, (d.frameCount as number) ?? 6);
    if (!res.ok || !res.frames?.length) throw new Error(res.message ?? '抽帧失败，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      frameUrls: res.frames,
      pictures: res.frames,
      previewUrl: res.frames[0],
    });
    return;
  }

  if (kind === 'scale-fit') {
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少 picture 输入，禁止空成功');
    const res = await api.resizeImage({
      sourceUrl,
      width: (d.width as number) ?? 1024,
      height: (d.height as number) ?? 1024,
      fit: ((d.fit as string) ?? 'cover') as 'cover' | 'contain' | 'fill' | 'inside' | 'outside',
    });
    if (!res.ok || !res.url) throw new Error('缩放适配失败，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'picture-merge') {
    const imageUrls = upstream.pictures;
    if (imageUrls.length < 2) throw new Error('至少需要 2 张图片，禁止空成功');
    const res = await api.mergeImages({
      imageUrls,
      direction: ((d.direction as string) ?? 'horizontal') as 'horizontal' | 'vertical' | 'grid',
      cols: (d.cols as number) ?? 2,
    });
    if (!res.ok || !res.url) throw new Error('图片合并失败，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      composedUrl: res.url,
      previewUrl: res.url,
    });
    return;
  }

  if (kind === 'inpaint-edit') {
    const img = upstream.pictures?.[0] || (d.imageUrl as string);
    const mask = (d.maskUrl as string) || '';
    const inpaintPrompt = prompt || (d.content as string) || '';
    const { runInpaintEdit, resolveInpaintModel, writeBackInpaintShot } = await import(
      '../inpaint-edit-runner'
    );
    const rendered = await runInpaintEdit({
      imageUrl: img as string,
      maskUrl: mask,
      prompt: inpaintPrompt,
      model: resolveInpaintModel(d),
    });
    if (ctx?.nodes && ctx?.edges) {
      writeBackInpaintShot({
        updateNodeData,
        nodeId: block.id,
        nodes: ctx.nodes,
        edges: ctx.edges,
        linkedShotId: d.linkedShotId as string | undefined,
        imageUrl: rendered.url,
      });
    }
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: rendered.url,
      output: rendered.url,
      inpaintModel: rendered.model,
    });
    return;
  }

  if (kind === 'thumbnail-maker') {
    const src = upstream.pictures?.[0] || (d.imageUrl as string);
    if (!src) throw new Error('封面制作：需要上游图片，禁止空成功');
    const title = (d.title as string) || '';
    const res = await api.thumbnailCompose({ imageUrl: src, title });
    if (!res.ok || !res.url) throw new Error('封面合成失败，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      output: res.url,
      content: title,
      pictures: [res.url],
    });
    return;
  }

  // VG-19/31: seedance-chain / motion-story 已由 migrateBlockKind → clip-gen，无独立执行分支

  if (kind === 'caption-asr') {
    const captionMode = (d.captionMode as string) ?? 'asr';
    const shotIds = (upstream.shotIds ?? []) as string[];

    // F-036: 写回 subtitle 到 shot
    const writeBackSubtitle = (subtitle: string) => {
      if (shotIds.length > 0 && ctx?.nodes && ctx?.edges) {
        for (const shotId of shotIds) {
          patchUpstreamShot(updateNodeData, block.id, ctx.nodes, ctx.edges, shotId, {
            subtitleText: subtitle.trim(),
          });
        }
      }
    };

    if (captionMode === 'burn') {
      const clip = upstream.clips?.[0];
      const subtitle = (d.subtitle as string) || (d.srtContent as string) || prompt || upstream.prompts?.[0] || '';
      if (!clip) throw new Error('字幕烧录：需要上游视频，禁止空成功');
      if (!subtitle.trim()) throw new Error('字幕烧录：字幕为空，禁止空成功');
      const res = await api.renderShotMp4({
        videoUrl: clip,
        subtitle: subtitle.trim(),
        durationSec: (d.durationSec as number) ?? 4,
        skipReview: true,
      });
      if (!res.ok || !res.url) throw new Error(res.message ?? '字幕烧录失败，禁止空成功');
      writeBackSubtitle(subtitle);
      updateNodeData(block.id, {
        status: 'success',
        outputClip: res.url,
        clips: [res.url],
        content: subtitle,
      });
      return;
    }
    const src = upstream.clips?.[0] || upstream.sounds?.[0] || (d.sourceUrl as string);
    if (!src) throw new Error('语音转字幕：需要上游音频或视频，禁止空成功');
    const language = (d.language as string) || 'zh';
    const res = await api.transcribeAudio(src, language);
    if (!res.ok || !String(res.srtContent ?? '').trim()) {
      throw new Error('语音转字幕失败或结果为空，禁止空成功');
    }
    writeBackSubtitle(res.srtContent);
    updateNodeData(block.id, {
      status: 'success',
      srtContent: res.srtContent,
      cues: res.cues,
      language,
      subtitle: res.srtContent,
      output: res.srtContent,
    });
    return;
  }

  if (kind === 'voice-cast') {
    const { lines, source } = resolveVoiceCastLines(d.lines, upstream.lines);
    const profileMap = (d.profileMap as Record<string, string>) ?? {};
    if (lines.length === 0) {
      updateNodeData(block.id, {
        status: 'error',
        error: '无可解析的对白（请连接编剧台或已拆镜的分镜台），禁止空成功',
        lineSource: source,
        meta: { total: 0, failed: 0, lineSource: source },
      });
      throw new Error('无可解析的对白（请连接编剧台或已拆镜的分镜台），禁止空成功');
    }
    const { results, audioUrls } = await runSoundGenCast(lines, profileMap);
    updateNodeData(block.id, {
      status: audioUrls.length > 0 ? 'success' : 'error',
      results,
      sounds: audioUrls,
      audioUrl: audioUrls[0],
      lines,
      lineSource: source,
      meta: { total: results.length, failed: results.filter((r) => r.error).length, lineSource: source },
    });
    if (audioUrls.length === 0) throw new Error('多角色配音全部失败，禁止空成功');
    return;
  }

  if (kind === 'photo-speak') {
    const imageUrl = upstream.pictures[0] || (d.imageUrl as string);
    const text = mergeUpstreamPrompt(upstream, (d.content as string) || (d.script as string));
    if (!imageUrl) throw new Error('缺少图片，禁止空成功');
    if (!text.trim()) throw new Error('口播文本为空，禁止空成功');
    const voiceMode = (d.voiceMode as string) || 'cloud';
    const referenceAudioUrl = (d.referenceAudioUrl as string) || '';
    const res = await api.photoSpeak({
      imageUrl,
      text: text.trim(),
      voice:
        voiceMode === 'luxtts' && referenceAudioUrl
          ? `luxtts:${referenceAudioUrl}`
          : (d.voice as string) || 'alloy',
      useLuxTts: voiceMode === 'luxtts',
      referenceAudioUrl: voiceMode === 'luxtts' ? referenceAudioUrl : undefined,
      characterId: (d.characterId as string) || undefined,
    });
    if (!res.ok || !res.url) throw new Error(res.message ?? '照片说话失败，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      videoUrl: res.url,
      audioUrl: res.audioUrl,
      content: text,
    });
    return;
  }

  if (kind === 'bg-remove') {
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少图片，禁止空成功');
    const res = await api.proxyFal({
      model: 'fal-ai/birefnet/v2',
      input: { image_url: sourceUrl },
    });
    if (!res.ok || !res.url) throw new Error('抠图未返回图片，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'upscale-lite') {
    const sourceUrl = upstream.pictures[0];
    if (!sourceUrl) throw new Error('缺少图片，禁止空成功');
    const res = await api.upscaleImage({
      sourceUrl,
      scale: (d.scale as number) ?? 2,
    });
    if (!res.ok || !res.url) throw new Error('放大失败，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }

  if (kind === 'watermark-clean') {
    const sourceUrl = upstream.pictures[0] || upstream.clips[0];
    if (!sourceUrl) throw new Error('缺少媒体，禁止空成功');
    const res = await api.stripMetadata({ sourceUrl });
    if (!res.ok || !res.url) throw new Error('元数据清理失败，禁止空成功');
    updateNodeData(block.id, {
      status: 'success',
      previewUrl: res.url,
      outputUrl: res.url,
    });
    return;
  }
}
