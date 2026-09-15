import { memo, useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { type NodeProps, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import {
  CLIP_GEN_ASPECTS,
  CLIP_GEN_MODE_CONFIGS,
  gatherUpstream,
  isSeedanceModel,
  lookupVideoGenModelHint,
  normalizeClipGenVideoModeData,
  pickReferenceImage,
  resolveBlockCharacters,
  resolveRunLabel,
  validateSClassReferences,
  VIDEO_RESOLUTION_OPTIONS,
  VIDEO_ORIENTATION_OPTIONS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_SIZE_PRESETS,
  readChainStoryboard,
  extractReferencePack,
  readClipGenPlaybook,
  type DirectorKeyframeBatch,
  type ReferencePack,
} from '@nx9/shared';
import { BlockShell } from '../shared/BlockShell';
import { CharacterBadge, CharacterSelect } from '../shared/CharacterSelect';
import { GenUpstreamHint } from '../shared/upstream-hints';
import { useUpstreamPrompt } from '../shared/use-upstream-prompt';
import { useActivityLog } from '../../stores/activity-log';
import { toastError } from '../../stores/toast';
import { MentionEditor } from '../../engine/stage-deck/chrome/MentionEditor';
import { useWorkspaceDocument } from '../../stores/workspace-document';
import { api } from '../../api/client';
import { describeDirectorKeyframeBatchStatus } from '../../engine/director-keyframe-batch-runner';
import GenSettingsPills from '../shared/GenSettingsPills';
import { useConnectedVideoModels } from '../../hooks/use-connected-video-models';
import { useCredentialVault } from '../../stores/credential-vault';

/**
 * ClipGenBlock — 视频生成节点（非 canvasFirst 回退卡面）。
 * VG-29: run() 委托 flow-runner clip-gen（组装器 / 超时恢复），不自建 proxyVideo。
 * 批量出片在 VideoWorkspace；卡面只消费上游 chainStoryboard（F-003）。
 */
function ClipGenBlock(props: NodeProps) {
  const { updateNodeData, fitView } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();
  const appendLog = useActivityLog((s) => s.append);
  const characters = useWorkspaceDocument((s) => s.characters.characters);
  const rawVideoMode = (props.data?.videoMode as string) ?? 'single';
  // F-035: Seedance 不是 videoMode；历史 videoMode=seedance 视为 single
  const videoMode = rawVideoMode === 'bridge' ? 'bridge' : 'single';
  const model = (props.data?.model as string) ?? '';
  const seedanceModel = isSeedanceModel(model);

  useEffect(() => {
    const normalized = normalizeClipGenVideoModeData(
      (props.data ?? {}) as Record<string, unknown>,
    );
    if (normalized.videoMode !== props.data?.videoMode || normalized.model !== props.data?.model) {
      updateNodeData(props.id, {
        videoMode: normalized.videoMode,
        model: normalized.model,
        videoGenMode: normalized.videoGenMode,
      });
    }
  }, [props.data?.videoMode, props.data?.model, props.data?.videoGenMode, props.id, updateNodeData]);
  const {
    options: videoModelOptions,
    hasConnections: hasVideoConnections,
    preferredModel,
    isKnownModel,
    selectModel: selectVideoModel,
    openConnectionsSettings,
  } = useConnectedVideoModels(model);
  const connections = useCredentialVault((s) => s.settings?.connections);

  useEffect(() => {
    if (!preferredModel || preferredModel === model) return;
    if (!hasVideoConnections) return;
    if (isKnownModel(model)) return;
    updateNodeData(props.id, { model: preferredModel });
  }, [hasVideoConnections, isKnownModel, model, preferredModel, props.id, updateNodeData]);
  const aspect = (props.data?.aspect as string) ?? '16:9';
  const durationSec = (props.data?.durationSec as number) ?? 5;
  const resolution = (props.data?.resolution as string) ?? '720';
  const orientation = (props.data?.orientation as string) ?? 'landscape';
  const generateAudio = (props.data?.generateAudio as boolean | undefined) ?? false;
  const status = props.data?.status as string | undefined;
  const videoUrl = props.data?.videoUrl as string | undefined;
  const taskId = props.data?.taskId as string | undefined;
  // VG-10+: 卡面直接显示待恢复任务数（徽章）
  const pendingCount = Object.keys(
    (props.data?.pendingVideoTasks as Record<string, unknown> | undefined) ?? {},
  ).length;
  const upstreamPrompt = props.data?.upstreamPrompt as string | undefined;
  const characterId = (props.data?.characterId as string) ?? '';
  const linkedShotId = props.data?.linkedShotId as string | undefined;
  const localContent = (props.data?.content as string) ?? '';
  const { hasUpstream, preview: upstreamPreview } = useUpstreamPrompt(props.id);

  /** F-035/F-049: videoMode 仅 single|bridge；Seedance 走 model */
  const VIDEO_MODES = CLIP_GEN_MODE_CONFIGS.map((c) => ({ id: c.mode, label: c.label }));

  // F-003/F-004: 从上游 chainStoryboard 读取镜头。
  // 无上游链时返回空数组（禁止回退全局镜表批出）。
  const shots = useMemo(() => {
    const incomingEdges = edges.filter((e) => e.target === props.id);
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) continue;
      const chain = readChainStoryboard(sourceNode.data as Record<string, unknown>);
      if (chain && chain.shots.length > 0) {
        return chain.shots;
      }
    }
    return [];
  }, [props.id, nodes, edges]);

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
    const data = props.data as Record<string, unknown>;
    const policy = data.upstreamPolicy as import('@nx9/shared').UpstreamPolicy | undefined;
    const primarySourceId = data.primarySourceId as string | null | undefined;
    return gatherUpstream(props.id, flowBlocks, flowLinks, policy, primarySourceId);
  }, [props.id, nodes, edges, props.data]);

  /** 本节点热门玩法（优先于上游参考板） */
  const localPlaybook = useMemo(
    () => readClipGenPlaybook((props.data ?? {}) as Record<string, unknown>),
    [props.data],
  );

  /** 上游参考板结构化引用包（兼容旧路径） */
  const upstreamReferencePack = useMemo((): ReferencePack | null => {
    const incoming = edges.filter((e) => e.target === props.id);
    for (const edge of incoming) {
      const src = nodes.find((n) => n.id === edge.source);
      if (!src || src.type !== 'reference-board') continue;
      const pack = extractReferencePack((src.data ?? {}) as Record<string, unknown>);
      if (pack) return pack;
    }
    return null;
  }, [props.id, nodes, edges]);

  const linkedShot = useMemo(
    () => shots.find((s) => s.id === linkedShotId),
    [shots, linkedShotId],
  );
  const directorKeyframeBatch = props.data?.directorKeyframeBatch as DirectorKeyframeBatch | undefined;
  const directorBatchImages = directorKeyframeBatch?.shots.map((shot) => shot.imageUrl) ?? [];
  const directorDeskRefs = (props.data?.directorDeskRefs as string[] | undefined) ?? [];
  const packImages =
    (localPlaybook
      ? localPlaybook.slots
          .filter((s) => s.assetUrl && s.mediaType !== 'video' && s.role !== 'depth_motion')
          .map((s) => s.assetUrl!)
      : null) ??
    upstreamReferencePack?.imageUrls ??
    [];
  const localDepthUrl = localPlaybook?.slots.find(
    (s) => s.role === 'depth_motion' && s.assetUrl,
  )?.assetUrl;
  const imageUrl =
    directorBatchImages[0] ||
    packImages[0] ||
    linkedShot?.firstFrameAssetId ||
    directorDeskRefs[0] ||
    pickReferenceImage(activeCharacters, upstreamMedia.pictures);
  const hasAudioUpstream = (upstreamMedia.sounds?.length ?? 0) > 0;
  const refImageCount = Math.max(
    upstreamMedia.pictures?.length ?? 0,
    packImages.length,
    imageUrl ? 1 : 0,
  );
  const refVideoCount = Math.max(
    upstreamMedia.clips?.length ?? 0,
    localDepthUrl ? 1 : 0,
    upstreamReferencePack?.videoUrls?.length ?? 0,
  );
  const refError = validateSClassReferences(refImageCount, refVideoCount);
  const overRefImages = refImageCount > 9;
  const overRefVideos = refVideoCount > 3;

  const run = useCallback(async () => {
    // VG-29: 卡面 run 委托 flow-runner clip-gen 路径（组装器 / 超时恢复），避免与工作台双实现漂移
    updateNodeData(props.id, { status: 'running', error: undefined });
    appendLog(`视频生成启动 · ${props.id}`);
    try {
      const { runFlowBatch } = await import('../../engine/flow-runner');
      let finalPhase = '';
      let finalError = '';
      await runFlowBatch(
        nodes,
        edges,
        (id, patch) => updateNodeData(id, patch),
        (progress) => {
          finalPhase = progress.phase;
          finalError = progress.error ?? '';
        },
        undefined,
        new Set([props.id]),
      );
      if (finalPhase === 'done') {
        appendLog(
          directorKeyframeBatch?.version === 1
            ? `导演关键帧批次消费完成 · ${directorKeyframeBatch.shots.length} 镜`
            : `视频生成完成 · ${props.id}`,
        );
      } else {
        appendLog(
          `视频生成${finalPhase === 'blocked' ? '已阻断' : '执行结束'}${finalError ? ` · ${finalError}` : ''}`,
        );
      }
    } catch (e) {
      const msg = `视频生成失败 · ${String(e)}`;
      updateNodeData(props.id, { status: 'error', error: String(e) });
      appendLog(msg);
      toastError(msg);
    }
  }, [
    appendLog, props.id, updateNodeData, nodes, edges, directorKeyframeBatch,
  ]);

  const poll = useCallback(async () => {
    if (!taskId) return;
    updateNodeData(props.id, { status: 'running' });
    try {
      const providerBaseUrl = props.data?.providerBaseUrl as string | undefined;
      const res = await api.pollVideo(taskId, providerBaseUrl);
      if (res.status === 'success' && res.url) {
        updateNodeData(props.id, {
          status: 'success',
          videoUrl: res.url,
          message: undefined,
          error: undefined,
        });
        if (linkedShot) {
          const deskId = findUpstreamDeskId(props.id, nodes, edges);
          if (deskId) {
            const deskNode = nodes.find((n) => n.id === deskId);
            if (deskNode) {
              const chain = readChainStoryboard(deskNode.data as Record<string, unknown>);
              if (chain) {
                const newShots = chain.shots.map((s) =>
                  s.id === linkedShot.id
                    ? { ...s, videoAssetId: res.url, videoStatus: 'review' as const }
                    : s,
                );
                updateNodeData(deskId, { chainStoryboard: { ...chain, shots: newShots } } as Record<string, unknown>);
              }
            }
          } else {
            appendLog('无上游分镜台，轮询结果未写回全局（F-004）');
          }
        }
        appendLog('视频轮询完成');
      } else if (res.status === 'success' && !res.url) {
        const msg = '视频任务标成功但未返回 URL，禁止空成功';
        updateNodeData(props.id, {
          status: 'error',
          error: msg,
        });
        toastError(msg);
      } else if (res.status === 'failed') {
        const msg = res.message ?? '视频生成任务失败';
        updateNodeData(props.id, { status: 'error', error: msg });
        toastError(msg);
      } else {
        updateNodeData(props.id, { status: 'running', message: '仍在生成中，请稍后再查' });
      }
    } catch (e) {
      const msg = String(e);
      updateNodeData(props.id, { status: 'error', error: msg });
      toastError(`视频轮询失败：${msg}`);
    }
  }, [taskId, props.id, props.data, updateNodeData, appendLog, linkedShot, nodes, edges]);

  const nodesAll = useNodes();

  const focusSmartEdit = useCallback(() => {
    const outgoing = edges.filter((e) => e.source === props.id).map((e) => e.target);
    const clipNode =
      nodesAll.find((n) => n.type === 'clip-editor' && outgoing.includes(n.id)) ??
      nodesAll.find((n) => n.type === 'clip-editor');
    if (!clipNode) { appendLog('画布上无智能剪辑节点'); return; }
    fitView({ nodes: [{ id: clipNode.id }], duration: 300 });
    appendLog('已聚焦智能剪辑节点');
  }, [nodesAll, edges, fitView, appendLog, props.id]);

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
        {videoMode === 'bridge' && (
          <p className="text-[10px] text-ink/45">Bridge 续拍：上游视频尾帧 + 本镜 Prompt</p>
        )}
        {videoMode === 'single' && linkedShot?.firstFrameAssetId && (
          <p className="text-[10px] text-ink/45">将使用关联镜头关键帧作为图生视频参考</p>
        )}
        {directorKeyframeBatch?.version === 1 && (
          <p className="text-[10px] text-brand/70">
            {describeDirectorKeyframeBatchStatus(directorKeyframeBatch)
              ?? `导演关键帧批次 · ${directorKeyframeBatch.shots.length} 镜 · ${directorKeyframeBatch.status}`}
          </p>
        )}
        {directorKeyframeBatch?.receipt?.failed.length ? (
          <div className="rounded-lg border border-warn/30 bg-warn/5 px-2 py-1.5 text-[10px] text-warn/90">
            <div>失败镜 {directorKeyframeBatch.receipt.failed.map((f) => `#${f.index}`).join('、')}</div>
            {directorKeyframeBatch.receipt.failed.map((f) => (
              <div key={f.shotId} className="truncate text-[9px] text-warn/60" title={f.error}>#{f.index} · {f.error}</div>
            ))}
            {directorKeyframeBatch.status === 'partial' && (
              <button
                type="button"
                disabled={status === 'running'}
                onClick={() => void run()}
                className="mt-1 rounded-md border border-warn/40 px-2 py-0.5 text-[10px] text-warn hover:bg-warn/10 disabled:opacity-45"
              >
                重试失败 {directorKeyframeBatch.receipt.failed.length} 镜
              </button>
            )}
          </div>
        ) : null}
        <GenUpstreamHint hasUpstream={hasUpstream} />
        {shots.length === 0 && (
          <p className="text-[10px] text-warn/80 rounded-lg border border-warn/30 bg-warn/5 px-2 py-1.5">
            无上游链镜表：请连接分镜台或导演台。已禁止批出全局镜表（F-004）。
          </p>
        )}
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
            已连接上游音频 · 音画对齐能力未定，仅透传参考
            <span className="text-ink/40 ml-1">({upstreamMedia.sounds?.length ?? 0} 条)</span>
          </p>
        )}
        {seedanceModel && (refImageCount > 0 || refVideoCount > 0) && (
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
        {seedanceModel && (
          <div className="rounded-lg bg-surface p-2 space-y-1.5">
            <p className="text-[10px] text-brand font-medium">Seedance 模型（非 videoMode）</p>
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
          onChange={(e) => {
            void selectVideoModel(e.target.value, (id) => updateNodeData(props.id, { model: id }));
          }}
          className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
        >
          {!hasVideoConnections ? (
            <option value="">请先在设置 → 连接中配置视频模型</option>
          ) : (
            videoModelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))
          )}
        </select>
        {!hasVideoConnections && (
          <button
            type="button"
            className="text-[10px] text-accent underline"
            onClick={() => openConnectionsSettings()}
          >
            打开连接设置
          </button>
        )}
        <p className="text-[10px] text-ink/40">
          {resolution}p · {orientation === 'landscape' ? '16:9' : orientation === 'portrait' ? '9:16' : '1:1'} · {durationSec}s · {generateAudio ? '有声' : '无声'}
        </p>
        <p className="text-[10px] text-ink/40">
          {lookupVideoGenModelHint(model, connections)}
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
          {(props.data?.concurrency as number | undefined) != null
            ? ` · 并发 ${(props.data.concurrency as number)}`
            : ''}
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
        {localPlaybook && (
          <p className="text-[10px] text-ink/55 bg-surface rounded px-1.5 py-1 border border-line/50">
            热门玩法：{localPlaybook.playbookId}
            {localDepthUrl ? ' · 已含深度视频' : ''}
            {packImages.length ? ` · 参考图×${packImages.length}` : ''}
          </p>
        )}
        {!localPlaybook && upstreamReferencePack && (
          <p className="text-[10px] text-ink/55 bg-surface rounded px-1.5 py-1 border border-line/50">
            参考板玩法：{upstreamReferencePack.playbookId}
            {upstreamReferencePack.depthVideoUrl ? ' · 已含深度视频' : ''}
            {upstreamReferencePack.characterUrls.length
              ? ` · 人物×${upstreamReferencePack.characterUrls.length}`
              : ''}
            {upstreamReferencePack.enforce && !upstreamReferencePack.ready
              ? ` · 未就绪：${upstreamReferencePack.blockReason || '请确认装配'}`
              : upstreamReferencePack.assembledPrompt
                ? ' · 已装配提示词'
                : ''}
          </p>
        )}
        {refError && (
          <p className="text-[10px] text-red-600 bg-red-50 rounded px-1 py-0.5">{refError}</p>
        )}
        {(props.data?.message as string) && (
          <p className="text-[10px] text-warn">{props.data.message as string}</p>
        )}
        {pendingCount > 0 && (
          <p className="text-[10px] text-warn bg-warn/5 border border-warn/30 rounded px-1.5 py-1">
            待恢复视频任务 {pendingCount} 个 · 打开视频工作台将自动查询（也可手动点「继续查询」）
          </p>
        )}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void run()}
            disabled={
              status === 'running' ||
              Boolean(refError) ||
              Boolean(upstreamReferencePack?.enforce && !upstreamReferencePack.ready && !localPlaybook)
            }
            className="flex-1 rounded-xl bg-brand text-white text-sm py-2 disabled:opacity-50"
          >
            {resolveRunLabel('clip-gen', status).primary}
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

/** Find the upstream storyboard-desk node id for a given block. */
function findUpstreamDeskId(
  blockId: string,
  nodes: ReturnType<typeof useNodes>,
  edges: ReturnType<typeof useEdges>,
): string | null {
  const incoming = edges.filter((e) => e.target === blockId);
  for (const edge of incoming) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (!sourceNode) continue;
    const data = sourceNode.data as Record<string, unknown>;
    if (sourceNode.type === 'storyboard-desk' && data.chainStoryboard) {
      return sourceNode.id;
    }
    if (sourceNode.type === 'director-desk') {
      // Director desk may also have chain data
      return sourceNode.id;
    }
  }
  return null;
}

export default memo(ClipGenBlock);
