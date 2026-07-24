import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  CLIP_GEN_ASPECTS,
  CLIP_GEN_MODELS,
  enrichPromptWithCharacters,
  enrichPromptWithAssetMentions,
  characterToItem,
  workspaceItemToAsset,
  soundToItem,
  templateToAsset,
  BUILTIN_BACKLOT_TEMPLATES,
  gatherUpstream,
  pickReferenceImage,
  resolveBlockCharacters,
  bridgePromptSuffix,
  validateSClassReferences,
  SCLASS_MAX_REF_IMAGES,
  SCLASS_MAX_REF_VIDEOS,
  VIDEO_RESOLUTION_OPTIONS,
  VIDEO_ORIENTATION_OPTIONS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_SIZE_PRESETS,
  resolveVideoGenParams,
  buildStudioVideoPrompt,
  filterStoryboardGuideOverlay,
  resolveStoryboardGuideOverlay,
  buildVideoGuidePromptSuffix,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { CharacterBadge, CharacterSelect } from '../shared/CharacterSelect';
import { GenUpstreamHint } from '../shared/upstream-hints';
import { useUpstreamPrompt } from '../shared/use-upstream-prompt';
import { useActivityLog } from '../../stores/activity-log';
import { MentionEditor } from '../../engine/stage-deck/chrome/MentionEditor';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import {
  enabledGuideKinds,
  readStoryboardGuidePrefs,
} from '../../stores/storyboard-guide-prefs';
import { api } from '../../api/client';
import { pollClipTask } from '../../engine/picture-gen-runner';
import { composeStoryboardGuideFrameDataUrl } from '../../engine/storyboard-guide-compose';
import GenSettingsPills from '../shared/GenSettingsPills';

function ClipGenBlock(props: NodeProps) {
  const { updateNodeData, fitView } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const appendLog = useActivityLog((s) => s.append);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const rawVideoMode = (props.data?.videoMode as string) ?? 'single';
  const videoMode =
    rawVideoMode === 'bridge' ? 'bridge'
    : rawVideoMode === 'episode-queue' ? 'episode-queue'
    : 'single';
  const model = (props.data?.model as string) ?? 'veo';
  const aspect = (props.data?.aspect as string) ?? '16:9';
  const durationSec = (props.data?.durationSec as number) ?? 5;
  const resolution = (props.data?.resolution as string) ?? '720';
  const orientation = (props.data?.orientation as string) ?? 'landscape';
  const generateAudio = (props.data?.generateAudio as boolean | undefined) ?? false;
  const clipConcurrency = (props.data?.concurrency as number | undefined) ?? 2;
  const clipMaxRetry = (props.data?.maxRetry as number | undefined) ?? 1;
  const status = props.data?.status as string | undefined;
  const videoUrl = props.data?.videoUrl as string | undefined;
  const taskId = props.data?.taskId as string | undefined;
  const upstreamPrompt = props.data?.upstreamPrompt as string | undefined;
  const characterId = (props.data?.characterId as string) ?? '';
  const linkedShotId = props.data?.linkedShotId as string | undefined;
  const localContent = (props.data?.content as string) ?? '';
  const { hasUpstream, preview: upstreamPreview } = useUpstreamPrompt(props.id);

  /** 仅展示已闭环能力；chain/motion 元数据未真出片，已从 UI 下线 */
  const VIDEO_MODES = [
    { id: 'single', label: '单镜' },
    { id: 'bridge', label: 'Bridge 续拍' },
    { id: 'episode-queue', label: '本集批出' },
  ] as const;

  // 本集队列统计（仅 episode-queue 模式使用）
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const updateShot = useWorkspaceDocument((s) => s.updateShot);
  const queueInfo = useMemo(() => {
    if (videoMode !== 'episode-queue') return { total: 0, eligible: 0, done: 0, eligibleShots: [] as typeof shots };
    const activeId = storyboard.activeEpisodeId;
    const episodeShots = activeId ? shots.filter((s) => s.episodeId === activeId) : shots;
    const eligible = episodeShots.filter((s) => Boolean(s.firstFrameAssetId) && !s.videoAssetId);
    const done = episodeShots.filter((s) => Boolean(s.videoAssetId)).length;
    return { total: episodeShots.length, eligible: eligible.length, done, eligibleShots: eligible };
  }, [videoMode, storyboard.activeEpisodeId, shots]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueProgress, setQueueProgress] = useState({ current: 0, total: 0 });
  const abortRef = useRef(false);

  const activeCharacters = useMemo(() => {
    const shot = shots.find((s) => s.id === linkedShotId);
    return resolveBlockCharacters(props.data as Record<string, unknown>, shot, characters);
  }, [props.data, linkedShotId, shots, characters]);

  const upstreamMedia = useMemo(() => {
    const flowBlocks = nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'prompt',
      position: n.position,
      data: (n.data ?? {}) as Record<string, unknown>,
    }));
    const flowLinks = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    }));
    return gatherUpstream(props.id, flowBlocks, flowLinks);
  }, [props.id, nodes, edges]);

  const linkedShot = useMemo(
    () => shots.find((s) => s.id === linkedShotId),
    [shots, linkedShotId],
  );
  const directorDeskRefs = (props.data?.directorDeskRefs as string[] | undefined) ?? [];
  const imageUrl =
    linkedShot?.firstFrameAssetId ||
    directorDeskRefs[0] ||
    pickReferenceImage(activeCharacters, upstreamMedia.pictures);
  const hasAudioUpstream = (upstreamMedia.sounds?.length ?? 0) > 0;
  const refImageCount = Math.max(upstreamMedia.pictures?.length ?? 0, imageUrl ? 1 : 0);
  const refVideoCount = upstreamMedia.clips?.length ?? 0;
  const refError = validateSClassReferences(refImageCount, refVideoCount);
  const overRefImages = refImageCount > 9;
  const overRefVideos = refVideoCount > 3;

  const run = useCallback(async () => {
    updateNodeData(props.id, { status: 'running' });
    appendLog(`视频生成启动 · ${props.id}`);
    try {
      const bridgeRefs: string[] = [];
      const incomingEdges = edges.filter((e) => e.target === props.id);
      for (const e of incomingEdges) {
        const up = nodes.find((n) => n.id === e.source);
        const refs = (up?.data?.bridgeRefs as string[] | undefined);
        if (refs) bridgeRefs.push(...refs);
      }
      const videoParams = resolveVideoGenParams({ resolution, orientation, aspect, durationSec });
      const studioVideo = linkedShot
        ? buildStudioVideoPrompt({
            shot: linkedShot,
            characters: activeCharacters,
          })
        : '';
      const base =
        upstreamMedia.prompts.filter(Boolean).join('\n\n') ||
        localContent ||
        linkedShot?.videoPromptPro ||
        linkedShot?.videoPromptEn ||
        studioVideo ||
        linkedShot?.promptEn ||
        (props.data?.content as string) ||
        '';
      const bridgeSuffix = bridgePromptSuffix(
        bridgeRefs.length ? [{ bridgePreset: 'dissolve', durationSec: 0.5, refImageIds: bridgeRefs }] : [],
      );
      const motionLocks = [
        videoParams.aspect !== '16:9' ? `aspect ratio ${videoParams.aspect}` : '',
        videoParams.durationSec ? `${videoParams.durationSec}s continuous clip` : '',
        'identity-locked motion, no jump cuts, no text overlay',
      ].filter(Boolean).join(', ');
      let prompt = enrichPromptWithCharacters(
        `${base}${bridgeSuffix ? `\n${bridgeSuffix}` : ''}${motionLocks ? `\n${motionLocks}` : ''}`.trim(),
        activeCharacters,
      );
      {
        const doc = useWorkspaceDocument.getState();
        const privateItems = [
          ...doc.characters.characters.map((c) => characterToItem(c, 'private')),
          ...doc.soundLibrary.sounds.map((s) => soundToItem(s, 'private')),
          ...doc.backlotWorkspace.items.map((i) => workspaceItemToAsset(i, 'private')),
        ];
        const publicItems = BUILTIN_BACKLOT_TEMPLATES.map((tpl) => templateToAsset(tpl as any, 'public', true));
        prompt = enrichPromptWithAssetMentions(prompt, privateItems, publicItems);
      }
      let refImageUrl = imageUrl;
      if (linkedShot && imageUrl) {
        const guidePrefs = readStoryboardGuidePrefs();
        if (guidePrefs.useForVideo) {
          const guide = filterStoryboardGuideOverlay(
            resolveStoryboardGuideOverlay(linkedShot),
            { enabled: true, kinds: enabledGuideKinds(guidePrefs) },
          );
          prompt = `${prompt}\n\n${buildVideoGuidePromptSuffix(guide)}`.trim();
          if (guide.arrows.length || guide.marks.length) {
            try {
              const composed = await composeStoryboardGuideFrameDataUrl(imageUrl, guide);
              if (composed) refImageUrl = composed;
            } catch {
              /* keep clean frame */
            }
          }
        }
      }
      const audioUrl = hasAudioUpstream ? upstreamMedia.sounds[0] : undefined;
      const res = await api.proxyVideo({
        prompt,
        model,
        imageUrl: refImageUrl,
        duration: videoParams.durationSec,
        aspect_ratio: videoParams.aspect,
        size: videoParams.size,
        resolution: videoParams.resolution,
        generateAudio,
        ...(audioUrl ? { audioUrl } : {}),
      });
      updateNodeData(props.id, {
        status: res.status === 'success' ? 'success' : res.status === 'processing' ? 'running' : 'error',
        videoUrl: res.url,
        taskId: res.taskId,
        message: res.message,
        content: prompt,
        referenceImageUsed: imageUrl,
        characterInjected: activeCharacters.map((c) => c.id),
        lastResult: res,
      });
      // 写回故事板：闭环视频状态
      if (res.url && linkedShot) {
        useWorkspaceDocument.getState().updateShot(linkedShot.id, {
          videoAssetId: res.url,
          videoStatus: 'review',
          status: 'review',
        });
      }
      appendLog(
        res.status === 'success'
          ? `视频生成完成 · ${props.id}`
          : res.message ?? `视频任务 · ${res.status}`,
      );
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(`视频生成失败 · ${String(e)}`);
    }
  }, [
    appendLog,
    model,
    aspect,
    durationSec,
    resolution,
    imageUrl,
    linkedShot,
    orientation,
    generateAudio,
    localContent,
    props.data,
    props.id,
    updateNodeData,
    activeCharacters,
    upstreamMedia,
    edges,
    nodes,
  ]);

  const poll = useCallback(async () => {
    if (!taskId) return;
    updateNodeData(props.id, { status: 'running' });
    try {
      const url = await pollClipTask(taskId);
      if (url) {
        updateNodeData(props.id, { status: 'success', videoUrl: url, message: undefined });
        if (linkedShot) {
          useWorkspaceDocument.getState().updateShot(linkedShot.id, {
            videoAssetId: url,
            videoStatus: 'review',
            status: 'review',
          });
        }
        appendLog('视频轮询完成');
      } else {
        updateNodeData(props.id, { status: 'running', message: '仍在生成中，请稍后再查' });
      }
    } catch (e) {
      updateNodeData(props.id, { status: 'error', error: String(e) });
    }
  }, [taskId, props.id, updateNodeData, appendLog, linkedShot]);

  const nodesAll = useNodes();
  // 本集队列批出（并发 + 重试 + 去智能剪辑深链）
  const processOneShot = useCallback(async (shot: typeof shots[0], _retryCount = 0): Promise<boolean> => {
    const maxRetry = clipMaxRetry;
    try {
      updateNodeData(props.id, { linkedShotId: shot.id, status: 'running' });
      const videoParams = resolveVideoGenParams({ resolution, orientation, aspect, durationSec });
      const base = [localContent.trim() || linkedShot?.videoPromptPro || linkedShot?.videoPromptEn || ''].filter(Boolean).join('\n');
      const motionLocks = [videoParams.aspect !== '16:9' ? `aspect ratio ${videoParams.aspect}` : '', `${videoParams.durationSec}s continuous clip`, 'identity-locked motion, no jump cuts, no text overlay'].filter(Boolean).join(', ');
      const prompt = enrichPromptWithCharacters(`${base}${motionLocks ? `\n${motionLocks}` : ''}`.trim(), characters);
      const body: Record<string, unknown> = { prompt, model, resolution: videoParams.resolution, size: videoParams.size, orientation, duration: videoParams.durationSec };
      if (shot.firstFrameAssetId) body.imageUrl = shot.firstFrameAssetId;
      const res = await api.proxyVideo(body);
      if (!res.ok || !res.taskId) throw new Error(res.message || '失败');
      const url = await pollClipTask(res.taskId as string);
      if (url) {
        updateShot(shot.id, { videoAssetId: url, videoStatus: 'review', status: 'review' });
        appendLog(`镜 ${shot.index} 完成 · ${url.slice(-16)}`);
      }
      return true;
    } catch (e) {
      if (_retryCount < maxRetry) {
        appendLog(`镜 ${shot.index} 失败，重试中…`);
        return processOneShot(shot, _retryCount + 1);
      }
      appendLog(`镜 ${shot.index} 失败: ${String(e)}`);
      return false;
    }
  }, [appendLog, aspect, characters, clipMaxRetry, durationSec, localContent, linkedShot?.videoPromptPro, linkedShot?.videoPromptEn, model, orientation, props.id, resolution, updateNodeData, updateShot]);

  const runQueue = useCallback(async () => {
    const eligibleShots = shots.filter((s) => Boolean(s.firstFrameAssetId) && !s.videoAssetId && (storyboard.activeEpisodeId ? s.episodeId === storyboard.activeEpisodeId : true));
    if (eligibleShots.length === 0) { appendLog('本集无可生成视频的镜头（需有关键帧且无视频）'); return; }
    abortRef.current = false;
    setQueueRunning(true);
    setQueueProgress({ current: 0, total: eligibleShots.length });
    const MAX_CONCURRENCY = clipConcurrency;
    let completed = 0;
    let succeeded = 0;
    const slots = Array.from({ length: Math.min(MAX_CONCURRENCY, eligibleShots.length) }, (_, i) => i);
    const initialBatch = eligibleShots.slice(0, slots.length);
    const rest = eligibleShots.slice(slots.length);
    const processBatch = async () => {
      const promises = initialBatch.map(async (shot) => {
        if (abortRef.current) return;
        const ok = await processOneShot(shot);
        completed++;
        succeeded += ok ? 1 : 0;
        setQueueProgress({ current: completed, total: eligibleShots.length });
        if (!abortRef.current) {
          const next = rest.shift();
          if (next) {
            const okNext = await processOneShot(next);
            completed++;
            succeeded += okNext ? 1 : 0;
            setQueueProgress({ current: completed, total: eligibleShots.length });
          }
        }
      });
      await Promise.allSettled(promises);
    };
    await processBatch();
    // Continue with remaining shots in the rest array
    while (rest.length > 0 && !abortRef.current) {
      const shot = rest.shift()!;
      const ok = await processOneShot(shot);
      completed++;
      succeeded += ok ? 1 : 0;
      setQueueProgress({ current: completed, total: eligibleShots.length });
    }
    setQueueRunning(false);
    updateNodeData(props.id, { status: succeeded > 0 ? 'success' : 'error', linkedShotId: props.data?.linkedShotId });
    appendLog(`本集批出完成 · 成功 ${succeeded}/${eligibleShots.length}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appendLog, clipConcurrency, processOneShot, props.data?.linkedShotId, props.id, updateNodeData, shots, storyboard.activeEpisodeId]);

  const focusSmartEdit = useCallback(() => {
    const clipNode = nodesAll.find((n) => n.type === 'clip-editor');
    if (!clipNode) { appendLog('画布上无智能剪辑节点'); return; }
    fitView({ nodes: [{ id: clipNode.id }], duration: 300 });
    appendLog('已聚焦智能剪辑节点');
  }, [nodesAll, fitView, appendLog]);

  return (
    <BlockShell {...props}>
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-1">
          {VIDEO_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => updateNodeData(props.id, { videoMode: m.id })}
              className={`px-2 py-0.5 rounded-md text-[10px] border ${
                videoMode === m.id
                  ? 'border-brand bg-brand/10 text-brand font-medium'
                  : 'border-line text-ink/50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {videoMode === 'episode-queue' && (
          <div className="flex flex-col gap-1 text-[10px] border border-line rounded-lg p-2 bg-surface/50">
            <div className="flex justify-between text-ink/60">
              <span>本集 {queueInfo.total} 镜 · 已有视频 {queueInfo.done} · 待出 {queueInfo.eligible}</span>
              {queueRunning && <span>{queueProgress.current}/{queueProgress.total}</span>}
            </div>
            <div className="flex gap-2 text-ink/50 items-center">
              <span>并发</span>
              {[1, 2, 3].map((n) => (
                <button key={n} type="button" className={`px-1.5 py-0.5 rounded-full border ${clipConcurrency === n ? 'border-brand text-brand bg-brand/10' : 'border-line'} text-[9px]`} onClick={() => updateNodeData(props.id, { concurrency: n })}>{n}</button>
              ))}
              <span className="ml-1">重试</span>
              {[0, 1, 2].map((n) => (
                <button key={n} type="button" className={`px-1.5 py-0.5 rounded-full border ${clipMaxRetry === n ? 'border-brand text-brand bg-brand/10' : 'border-line'} text-[9px]`} onClick={() => updateNodeData(props.id, { maxRetry: n })}>{n}</button>
              ))}
            </div>
            {queueRunning && (
              <div style={{ height: 4, borderRadius: 2, background: 'var(--desk-line)' }}>
                <div style={{ width: `${queueProgress.total > 0 ? (queueProgress.current / queueProgress.total) * 100 : 0}%`, height: '100%', borderRadius: 2, background: 'var(--desk-accent)' }} />
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <button type="button" disabled={queueRunning || queueInfo.eligible === 0} onClick={() => void runQueue()}
                className="flex-1 rounded-lg bg-brand text-white text-[10px] py-1.5 disabled:opacity-50">
                {queueRunning ? `批出中 ${queueProgress.current}/${queueProgress.total}` : `批出本集缺片 · ${queueInfo.eligible}`}
              </button>
              {queueRunning && <button type="button" disabled={!queueRunning} onClick={() => { abortRef.current = true; }} className="rounded-lg border border-line px-2 text-[10px]">停止</button>}
            </div>
            {!queueRunning && queueInfo.done > 0 && (
              <button type="button" className="text-[10px] text-brand underline" onClick={focusSmartEdit}>
                去智能剪辑编排时间线
              </button>
            )}
          </div>
        )}
        {videoMode === 'bridge' && (
          <p className="text-[10px] text-ink/45">Bridge 续拍：上游视频尾帧 + 本镜 Prompt</p>
        )}
        {videoMode === 'single' && linkedShot?.firstFrameAssetId && (
          <p className="text-[10px] text-ink/45">将使用关联镜头关键帧作为图生视频参考</p>
        )}
        <GenUpstreamHint hasUpstream={hasUpstream} />
        {(upstreamPrompt || upstreamPreview) && (
          <p className="text-[10px] text-ink/50 line-clamp-2" title={upstreamPrompt || upstreamPreview}>
            上游: {upstreamPrompt || upstreamPreview}
          </p>
        )}
        {imageUrl && (
          <img src={imageUrl} alt="" className="w-full rounded-lg border border-line max-h-24 object-cover" />
        )}
        {hasAudioUpstream && (
          <p className="text-[10px] text-brand/70">
            已连接上游音频 · 已传入音画对齐
            <span className="text-ink/40 ml-1">({upstreamMedia.sounds?.length ?? 0} 条)</span>
          </p>
        )}
        {model === 'seedance' && (refImageCount > 0 || refVideoCount > 0) && (
          <div className="flex gap-2 text-[10px]">
            <span className={overRefImages ? 'text-warn font-bold' : 'text-ink/50'}>
              参考图 {refImageCount}/{9}
            </span>
            <span className={overRefVideos ? 'text-warn font-bold' : 'text-ink/50'}>
              参考视频 {refVideoCount}/{3}
            </span>
          </div>
        )}
        <MentionEditor
          blockId={props.id}
          value={localContent}
          onChange={(value) => updateNodeData(props.id, { content: value })}
          placeholder="视频 Prompt… 输入 @ 引用上游"
          className="w-full min-h-[64px] rounded-xl border border-line bg-surface px-2 py-1.5 text-sm resize-y focus:outline-none focus:border-brand/40"
        />
          {model === 'seedance' && (
            <div className="rounded-lg bg-surface p-2 space-y-1.5">
              <p className="text-[10px] text-brand font-medium">Seedance 模式</p>
              <label className="flex items-center gap-2 text-[10px]">
                <input
                  type="checkbox"
                  checked={generateAudio}
                  onChange={(e) => updateNodeData(props.id, { generateAudio: e.target.checked })}
                />
                生成音频
              </label>
            </div>
          )}
          <select
            value={model}
            onChange={(e) => updateNodeData(props.id, { model: e.target.value })}
            className="w-full rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
          >
            {CLIP_GEN_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-ink/40">
            {resolution}p · {orientation === 'landscape' ? '16:9' : orientation === 'portrait' ? '9:16' : '1:1'} · {durationSec}s · {generateAudio ? '有声' : '无声'}
          </p>
        <p className="text-[10px] text-ink/40">
          {CLIP_GEN_MODELS.find((m) => m.id === model)?.hint}
        </p>
        <div className="border-t border-line pt-2 mt-2">
          <p className="text-[10px] text-ink/40 mb-1">视频设置</p>
          <GenSettingsPills
            label="清晰度"
            options={VIDEO_RESOLUTION_OPTIONS}
            value={resolution}
            onChange={(v) => updateNodeData(props.id, { resolution: v })}
          />
          <GenSettingsPills
            label="屏幕"
            options={VIDEO_ORIENTATION_OPTIONS}
            value={orientation}
            onChange={(v) => {
              const orientMap: Record<string, string> = { landscape: '16:9', portrait: '9:16', square: '1:1' };
              updateNodeData(props.id, { orientation: v, aspect: orientMap[v] || '16:9' });
            }}
          />
          <div className="flex items-center gap-2 text-[10px] text-ink/40 mt-1">
            <span>{(VIDEO_SIZE_PRESETS as Record<string, Record<string, string>>)[resolution]?.[orientation] || '1280x720'}</span>
            <button
              type="button"
              onClick={() => updateNodeData(props.id, { sizeCustomMode: !(props.data?.sizeCustomMode as boolean) })}
              className="text-brand/60 hover:text-brand underline"
            >
              {(props.data?.sizeCustomMode as boolean) ? '使用预设' : '高级编辑'}
            </button>
          </div>
          {(props.data?.sizeCustomMode as boolean) && (
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={(props.data?.customWidth as number) ?? 1280}
                onChange={(e) => updateNodeData(props.id, { customWidth: Number(e.target.value) || 1280 })}
                className="w-16 rounded border border-line px-1 py-0.5 text-[10px]"
                placeholder="W"
              />
              <span className="text-[10px] text-ink/40">×</span>
              <input
                type="number"
                value={(props.data?.customHeight as number) ?? 720}
                onChange={(e) => updateNodeData(props.id, { customHeight: Number(e.target.value) || 720 })}
                className="w-16 rounded border border-line px-1 py-0.5 text-[10px]"
                placeholder="H"
              />
            </div>
          )}
          <GenSettingsPills
            label="时长"
            options={VIDEO_DURATION_OPTIONS.map((d) => ({ id: String(d), label: `${d}s` }))}
            value={String(durationSec)}
            onChange={(v) => updateNodeData(props.id, { durationSec: Number(v) })}
          />
          <label className="mt-2 flex items-center gap-2 text-[10px] text-ink/55">
            <input
              type="checkbox"
              checked={generateAudio}
              onChange={(e) => updateNodeData(props.id, { generateAudio: e.target.checked })}
            />
            生成音频
          </label>
        </div>
        <p className="text-[10px] text-ink/40">
          {resolution}p · {orientation === 'landscape' ? '16:9' : orientation === 'portrait' ? '9:16' : '1:1'} · {durationSec}s · {generateAudio ? '有声' : '无声'}
        </p>
        <CharacterSelect
          characters={characters}
          value={characterId}
          onChange={(id) => updateNodeData(props.id, { characterId: id || undefined })}
        />
        <CharacterBadge names={activeCharacters.map((c) => c.name)} />
        {videoUrl && (
          <video src={videoUrl} controls className="w-full rounded-lg max-h-36" />
        )}
        {refError && (
          <p className="text-[10px] text-red-600 bg-red-50 rounded px-1 py-0.5">{refError}</p>
        )}
        {(props.data?.message as string) && (
          <p className="text-[10px] text-warn">{props.data.message as string}</p>
        )}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void run()}
            disabled={status === 'running' || Boolean(refError)}
            className="flex-1 rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
          >
            {status === 'running' ? '生成中…' : '运行生成'}
          </button>
          {taskId && !videoUrl && (
            <button
              type="button"
              onClick={() => void poll()}
              className="rounded-xl border border-line px-3 text-xs hover:border-brand/40"
            >
              查询
            </button>
          )}
        </div>
      </div>
    </BlockShell>
  );
}

export default memo(ClipGenBlock);
