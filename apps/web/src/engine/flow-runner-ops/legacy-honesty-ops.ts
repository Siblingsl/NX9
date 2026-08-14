import { hasEffectiveTimeline, parseTimelineDraft } from '@nx9/shared';
import { api } from '../../api/client';
import { pollMontageTaskUntilDone } from '../clip-editor-render';
import { resolveShotsForBlock } from '../chain-storyboard-utils';
import type { FlowExecuteDeps } from './types';

export async function executeLegacyOps(deps: FlowExecuteDeps): Promise<void> {
  const { block, kind, prompt, upstream, updateNodeData, ctx } = deps;
  const d = block.data ?? {};
  if (kind === 'export-pack') {
    if (!ctx) throw new Error('export-pack 缺少画布上下文');
    const shots = resolveShotsForBlock(block.id, ctx.nodes, ctx.edges, false);
    const { runExportPack } = await import('../export-pack-runner');
    const { hasEffectiveTimeline } = await import('@nx9/shared');
    const mode = (d.exportMode as string) || 'zip';
    const prefix = (d.exportPrefix as string) || 'nx9-shot';
    const audioUrl = (d.episodeAudioUrl as string) || '';
    let timeline = parseTimelineDraft(d.timelineDraft as import('@nx9/shared').TimelineDraftRaw);
    if (!hasEffectiveTimeline(timeline)) {
      const incoming = ctx.edges.filter((e) => e.target === block.id);
      for (const edge of incoming) {
        const src = ctx.nodes.find((n) => n.id === edge.source);
        if (src?.type !== 'clip-editor') continue;
        const parsed = parseTimelineDraft(
            (src.data as Record<string, unknown> | undefined)?.timelineDraft as import('@nx9/shared').TimelineDraftRaw,
        );
        if (hasEffectiveTimeline(parsed)) {
          timeline = parsed;
          break;
        }
      }
    }
    try {
      const res = await runExportPack({
        mode: mode as 'zip' | 'ffmpeg-episode' | 'hyperframes-episode' | 'remotion-bundle' | 'ecom-pack',
        prefix,
        audioUrl,
        pictures: upstream.pictures ?? [],
        clips: upstream.clips ?? [],
        sounds: upstream.sounds ?? [],
        prompts: upstream.prompts ?? [],
        shots,
        timeline,
        selectedSpecs: (d.selectedSpecs as string[] | undefined) ?? [],
      });
      if (!res.ok) {
        updateNodeData(block.id, {
          status: 'error',
          exportReady: false,
          message: res.message,
          error: res.message,
        });
        throw new Error(res.message ?? '导出未通过');
      }
      if (res.taskId && !res.exportReady) {
        updateNodeData(block.id, {
          status: 'running',
          exportReady: false,
          hfTaskId: res.taskId,
          message: res.message ?? 'submitted',
        });
        const url = await pollMontageTaskUntilDone(res.taskId, 'hyperframes');
        updateNodeData(block.id, {
          status: 'success',
          exportReady: true,
          episodeUrl: url,
          hfTaskId: res.taskId,
          exportCount: 1,
        });
        return;
      }
      updateNodeData(block.id, {
        status: 'success',
        exportReady: res.exportReady === true,
        episodeUrl: res.url,
        exportCount: res.exportCount ?? 0,
        message: res.message,
        hfTaskId: res.taskId,
      });
    } catch (e) {
      updateNodeData(block.id, { status: 'error', error: String(e), exportReady: false });
      throw e;
    }
    return;
  }

  if (kind === 'audio-mix' || (kind === 'clip-editor' && (d.editorMode as string) === 'audio')) {
    const tracks = upstream.sounds ?? [];
    if (tracks.length < 2) throw new Error('至少需要 2 条音频');
    const res = await api.mixAudio(tracks, (d.normalize as boolean | undefined) ?? true);
    if (!res.ok || !res.url) throw new Error(res.message ?? '混音失败');
    updateNodeData(block.id, {
      status: 'success',
      outputSound: res.url,
      sounds: [res.url],
      meta: { trackCount: res.trackCount },
    });
    return;
  }

  if (kind === 'color-grade' || (kind === 'clip-editor' && (d.editorMode as string) === 'grade')) {
    const source = upstream.clips?.[0] ?? upstream.pictures?.[0];
    if (!source) throw new Error('需要上游图像或视频');
    const res = await api.colorGrade({
      sourceUrl: source,
      brightness: (d.brightness as number) ?? 0,
      contrast: (d.contrast as number) ?? 1,
      saturation: (d.saturation as number) ?? 1,
    });
    if (!res.ok || !res.url) throw new Error(res.message ?? '调色失败');
    if (res.mediaKind === 'clip') {
      updateNodeData(block.id, { status: 'success', clips: [res.url], outputUrl: res.url });
    } else {
      updateNodeData(block.id, { status: 'success', pictures: [res.url], outputUrl: res.url });
    }
    return;
  }

  if (kind === 'variant-fork') {
    const label = (d.variantLabel as string) || 'A';
    updateNodeData(block.id, {
      // DEEP-03：变体分叉未接入真分叉计算，禁止假绿；仅保留标签与透传，显式 skipped。
      status: 'skipped',
      noop: true,
      meta: { variant: label, forkNotes: d.forkNotes },
      content: `变体 ${label}：仅标记，不产生变体（变体能力已收敛至导演台）`,
      output: upstream.prompts?.[0],
      pictures: upstream.pictures,
      clips: upstream.clips,
      sounds: upstream.sounds,
    });
    return;
  }

  if (kind === 'prompt-diff') {
    const prompts = upstream.prompts ?? [];
    if (prompts.length < 2) throw new Error('至少需要 2 路 prompt');
    // DEEP-17：模型随节点/设置可配，未指定时交给网关全局配置，禁止写死。
    const diffModel = ((d.llmModel as string) || (d.model as string) || '').trim() || undefined;
    const res = await api.proxyLlm({
      ...(diffModel ? { model: diffModel } : {}),
      messages: [
        { role: 'system', content: '合并两版 prompt，保留优点，输出一段简洁英文 prompt。' },
        { role: 'user', content: `A:\n${prompts[0]}\n\nB:\n${prompts[1]}` },
      ],
    });
    const merged = (res as { content?: string }).content?.trim() ?? '';
    updateNodeData(block.id, {
      status: 'success',
      mergeSuggestion: merged,
      content: merged,
      output: merged,
      meta: { sourceCount: prompts.length },
    });
    return;
  }

  // NODE-02: 遗留 kind 明示不可用；迁移表已将 music-gen→sound-gen、lipsync-pass→clip-gen，
  // 此处仅兜底未迁移的旧图，禁止假成功。
  if (kind === 'music-gen') {
    throw new Error(
      'music-gen 已弃用：请改用「声音生成」节点并将模式设为 BGM（soundMode=music）。旧画布打开时应自动迁移。',
    );
  }

  if (kind === 'lipsync-pass') {
    throw new Error(
      'lipsync-pass 已弃用：口型同步未接真实模型，请改用「视频生成」节点。旧画布打开时应自动迁移为 clip-gen。',
    );
  }
}
