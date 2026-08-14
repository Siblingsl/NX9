import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetLibraryKind, StoryboardShot } from '@nx9/shared';
import {
  adoptStoryboardVideoVersion,
  appendStoryboardVideoVersion,
  approveStoryboardVideoShot,
  CLIP_GEN_MODELS,
  lookupBlock,
  rejectStoryboardVideoShot,
  validateVideoModelParams,
} from '@nx9/shared';
import { useReactFlow, useNodes, useEdges } from '@xyflow/react';
import { AssetMentionInput } from '../../../asset-mention/AssetMentionInput';
import { ComposerModelSelect } from '../../composer/ComposerModelSelect';
import { ComposerWorkspaceShell, COMPOSER_PROMPT_TEXTAREA_CLASS } from '../../composer/ComposerWorkspaceShell';
import { useWorkspaceAiLog } from '../../composer/useWorkspaceAiLog';
import { useDeckUi } from '../../../../stores/deck-ui';
import { useFlowRuntime } from '../../../../../../stores/flow-runtime';
import { useActivityLog } from '../../../../../../stores/activity-log';
import { usePromptHistory } from '../../../../stores/prompt-history';
import { useAttachedNodeData } from '../use-attached-node-data';
import { useLocalNodePrompt } from '../use-local-node-prompt';
import { useUpstreamShots } from '../use-upstream-shots';
import { useUpstreamMedia } from '../use-upstream-media';
import { useExecutionQueue } from '../../../../../../stores/execution-queue';
import {
  buildClipGenPlaybookPatch,
  clearClipGenPlaybookPatch,
  readClipGenPlaybook,
  validateReferenceSlots,
  type ReferenceSlot,
} from '@nx9/shared';
import { VideoGenModeChip } from './VideoGenModeChip';
import { VideoShotReviewGrid } from './VideoShotReviewGrid';
import { VideoParamChips } from './VideoParamChips';
import { VideoFrameStrip, VideoSourceStrip } from './VideoFrameStrip';
import { VideoPlaybookMenu } from './VideoPlaybookMenu';
import { VideoPlaybookTools } from './VideoPlaybookTools';
import { lookupVideoPlaybookAction, type VideoPlaybookActionDef } from './video-playbooks';
import {
  patchVideoGenMode,
  readVideoGenMode,
  showVideoFrameStrip,
  showVideoSourceStrip,
  videoFrameStripSlots,
  type VideoGenMode,
} from './video-gen-modes';
import {
  batchGenerateVideosFromShots,
  resumePendingVideoTasks,
  type PendingVideoTask,
} from '../../../../../core-pipeline-runner';
import { api } from '../../../../../../api/client';
import { setMediaPinDragData } from '../../../../../media-pin-drag';

const EMPTY_HISTORY: { id: string; blockId: string; text: string; savedAt: number }[] = [];
const VIDEO_MENTION_KINDS: AssetLibraryKind[] = [
  'character',
  'scene',
  'shot',
  'emotion',
  'sound',
];

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface VideoWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function VideoWorkspace({ blockId, kind, onCollapse }: VideoWorkspaceProps) {
  const focusNonce = useDeckUi((s) => s.promptFocusNonce);
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const runtime = useFlowRuntime((s) => s.runtime);
  const appendLog = useActivityLog((s) => s.append);
  const promptContainerRef = useRef<HTMLDivElement>(null);
  const promptEntries = usePromptHistory((s) => s.entries);
  const pushHistory = usePromptHistory((s) => s.push);
  const { updateNodeData } = useReactFlow();
  const handleAiAction = useWorkspaceAiLog();

  const data = useAttachedNodeData(blockId);
  const { hasUpstream, shots, shotIds } = useUpstreamShots(blockId);
  const { clips: upstreamClips } = useUpstreamMedia(blockId);
  const runAbortRef = useRef<AbortController | null>(null);
  const nodes = useNodes();
  const edges = useEdges();
  const { getNodes } = useReactFlow();
  const deskId = useMemo(() => {
    // F-003: 查找上游 storyboard-desk（经 director 再向上游）
    const incoming = edges.filter((e) => e.target === blockId);
    for (const edge of incoming) {
      const src = nodes.find((n) => n.id === edge.source);
      if (src?.type === 'storyboard-desk') return src.id;
      if (src?.type === 'director-desk') {
        const deskEdge = edges.find((e) => e.target === src.id);
        const desk = deskEdge
          ? nodes.find((n) => n.id === deskEdge.source && n.type === 'storyboard-desk')
          : undefined;
        if (desk) return desk.id;
      }
    }
    return null;
  }, [blockId, nodes, edges]);

  // F-003: 写回 chainStoryboard；无上游 desk 禁止写全局
  const { updateNodeData: updateNodeDataFlow } = useReactFlow();
  const patchChainShotLocal = useCallback((shotId: string, patch: Partial<StoryboardShot>) => {
    if (!deskId) {
      console.warn('[F-004] VideoWorkspace 无上游 desk，跳过写回（禁止写全局）');
      return;
    }
    const allNodes = getNodes();
    const desk = allNodes.find((n) => n.id === deskId);
    if (!desk) return;
    const chain = (desk.data as any)?.chainStoryboard;
    if (!chain || !Array.isArray(chain.shots)) {
      console.warn('[F-004] VideoWorkspace 上游 desk 无 chainStoryboard，跳过写回');
      return;
    }
    const newShots = chain.shots.map((s: StoryboardShot) =>
      s.id === shotId ? { ...s, ...patch } : s
    );
    updateNodeDataFlow(deskId, { chainStoryboard: { ...chain, shots: newShots } } as any);
  }, [deskId, getNodes, updateNodeDataFlow]);
  const [retryingShotId, setRetryingShotId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasUpstream) {
      if (Array.isArray(data.linkedShotIds) && (data.linkedShotIds as string[]).length > 0) {
        updateNodeData(blockId, { linkedShotIds: [] });
      }
      return;
    }
    const prev = Array.isArray(data.linkedShotIds) ? (data.linkedShotIds as string[]) : [];
    // VG-44: 仅在空/未定义时默认全选，保留导演台推送或用户编辑的子集
    if (prev.length > 0) return;
    updateNodeData(blockId, {
      linkedShotIds: shotIds,
      linkedShotId: shotIds[0] ?? undefined,
    });
  }, [hasUpstream, shotIds, blockId, updateNodeData, data.linkedShotIds]);

  const history = useMemo(
    () => (promptEntries ?? EMPTY_HISTORY).filter((e) => e.blockId === blockId).slice(0, 20),
    [promptEntries, blockId],
  );

  const handlePatch = useCallback(
    (patch: Record<string, unknown>) => updateNodeData(blockId, patch),
    [blockId, updateNodeData],
  );

  const pushHistoryDebounced = useCallback(
    (text: string) => pushHistory(blockId, text),
    [blockId, pushHistory],
  );

  const { draft, onChange, onFocus, onBlur, applyText, flushNow } = useLocalNodePrompt({
    blockId,
    data,
    updateNodeData,
    onHistoryPush: pushHistoryDebounced,
  });

  const model = (data.model as string) ?? 'veo';
  const status = (data.status as string) ?? 'idle';
  const videoGenMode = readVideoGenMode(data);
  const showFrames = showVideoFrameStrip(videoGenMode);
  const frameSlots = videoFrameStripSlots(videoGenMode);
  const showSource = showVideoSourceStrip(videoGenMode);
  const sourceClipUrl = (data.sourceClipUrl as string | undefined) || undefined;
  const modelParamsError = validateVideoModelParams((data.modelParams as string) ?? '');
  const playbookState = useMemo(
    () => readClipGenPlaybook(data as Record<string, unknown>),
    [data],
  );
  const playbookAction = lookupVideoPlaybookAction(playbookState?.playbookId);
  const [playbookMsg, setPlaybookMsg] = useState('');

  const handleSelectPlaybook = useCallback(
    (action: VideoPlaybookActionDef) => {
      handlePatch(buildClipGenPlaybookPatch(action.id));
      appendLog(`热门玩法 · ${action.label}`);
    },
    [appendLog, handlePatch],
  );

  const handleClearPlaybook = useCallback(() => {
    handlePatch(clearClipGenPlaybookPatch());
    setPlaybookMsg('');
    appendLog('已清除热门玩法');
  }, [appendLog, handlePatch]);

  const handlePlaybookSlots = useCallback(
    (slots: ReferenceSlot[]) => {
      handlePatch({ videoPlaybookSlots: slots });
    },
    [handlePatch],
  );

  useEffect(() => {
    const ta = promptContainerRef.current?.querySelector('textarea');
    ta?.focus();
  }, [blockId, focusNonce]);

  const meta = lookupBlock(kind);

  const handleRun = useCallback(async () => {
    flushNow();
    if (!runtime) return;
    // VG-21: Bridge 无源视频禁止回落单镜
    if (videoGenMode === 'bridge') {
      const source = sourceClipUrl || upstreamClips[0];
      if (!source) {
        updateNodeData(blockId, {
          status: 'error',
          error: 'Bridge 续拍需要源视频：请连接上游视频节点或上传源片',
        });
        appendLog('Bridge 续拍已阻断：缺少源视频');
        return;
      }
      if (!sourceClipUrl && upstreamClips[0]) {
        updateNodeData(blockId, { sourceClipUrl: upstreamClips[0] });
      }
    }
    runAbortRef.current?.abort();
    const controller = new AbortController();
    runAbortRef.current = controller;
    updateNodeData(blockId, { status: 'running', error: undefined });
    try {
      // VG-07: Bridge 续拍走级联（上游视频抽尾帧），不进批量
      if (hasUpstream && shotIds.length > 0 && videoGenMode !== 'bridge') {
        const res = await batchGenerateVideosFromShots(shotIds, false, blockId, shots as any, {
          signal: controller.signal,
        });
        // VG-43: 未批审 / 无分镜图镜头上报跳过，不再静默
        appendLog(
          res.skipped > 0
            ? `上游镜头视频生成完成 · 成功 ${res.ok} · 失败 ${res.fail} · 跳过 ${res.skipped}（关键帧未批审或无分镜图）`
            : `上游镜头视频生成完成 · ${res.ok}/${shotIds.length} 镜`,
        );
        return;
      }
      const { runCascadeFromBlock } = await import('../../../../execution/cascade-runner');
      await runCascadeFromBlock({
        blockId,
        nodes: runtime.getNodes(),
        edges: runtime.getEdges(),
        setEdges: (updater) => {
          if (typeof updater === 'function') {
            runtime.setEdges(updater(runtime.getEdges()));
          }
        },
        updateNodeData: (id, patch) => runtime.updateNodeData(id, patch),
        signal: {
          get cancelled() {
            return controller.signal.aborted;
          },
          abortSignal: controller.signal,
        },
      });
      appendLog(`运行 · ${meta?.label ?? kind}`);
    } catch (e) {
      if (controller.signal.aborted) {
        appendLog('已停止；已提交的任务可继续查询');
      } else {
        appendLog(`运行失败: ${String(e)}`);
      }
    } finally {
      if (runAbortRef.current === controller) runAbortRef.current = null;
    }
  }, [
    blockId, runtime, meta, kind, appendLog, flushNow, hasUpstream, shotIds, shots,
    videoGenMode, sourceClipUrl, upstreamClips, updateNodeData,
  ]);

  const handleStop = useCallback(() => {
    const controller = runAbortRef.current;
    if (controller) {
      controller.abort();
      runAbortRef.current = null;
    }
    useExecutionQueue.getState().cancel();
    appendLog('已停止生成');
  }, [appendLog]);

  const retryShot = useCallback(async (shotId: string) => {
    // VG-44: 单镜重试纳入 runAbortRef，可被工作台「停止」打断
    runAbortRef.current?.abort();
    const controller = new AbortController();
    runAbortRef.current = controller;
    setRetryingShotId(shotId);
    try {
      // F-004: 传入链镜表避免回退全局
      await batchGenerateVideosFromShots([shotId], true, blockId, shots as any, {
        signal: controller.signal,
      });
    } finally {
      if (runAbortRef.current === controller) runAbortRef.current = null;
      setRetryingShotId(null);
    }
  }, [blockId, shots]);

  // VG-10: 恢复后台任务（批量 pendingVideoTasks + 单镜 taskId）
  const pendingVideoTasks = (data.pendingVideoTasks ?? {}) as Record<string, PendingVideoTask>;
  const pendingTaskCount = Object.keys(pendingVideoTasks).length;
  const singleTaskId = data.taskId as string | undefined;
  const hasSinglePending = Boolean(singleTaskId && !data.videoUrl);
  const [resuming, setResuming] = useState(false);
  const resumeTasks = useCallback(async () => {
    setResuming(true);
    try {
      if (pendingTaskCount > 0) {
        await resumePendingVideoTasks(blockId);
      }
      if (hasSinglePending && singleTaskId) {
        const providerBaseUrl = data.providerBaseUrl as string | undefined;
        const res = await api.pollVideo(singleTaskId, providerBaseUrl);
        if (res.status === 'success' && res.url) {
          // VG-38: 单镜恢复成功也写回链镜表 + videoVersions，并清脏字段
          const linkedShotId = data.linkedShotId as string | undefined;
          const shot = linkedShotId
            ? shots.find((s) => s.id === linkedShotId)
            : shots.length === 1
              ? shots[0]
              : undefined;
          if (shot) {
            const version = {
              id: `video-${shot.id}-${Date.now()}`,
              url: res.url,
              createdAt: new Date().toISOString(),
              prompt: (data.lastCompiledPrompt as string | undefined) ?? '',
              model,
              status: 'candidate' as const,
            };
            patchChainShotLocal(shot.id, appendStoryboardVideoVersion(shot, version));
          }
          updateNodeData(blockId, {
            status: 'success',
            videoUrl: res.url,
            error: undefined,
            taskId: undefined,
            providerBaseUrl: undefined,
            message: undefined,
          });
          appendLog('视频任务已完成');
        } else if (res.status === 'failed') {
          updateNodeData(blockId, { status: 'error', error: res.message ?? '视频生成任务失败' });
          appendLog('视频任务失败');
        } else {
          appendLog('视频仍在生成中，请稍后再查');
        }
      }
    } catch (e) {
      updateNodeData(blockId, { status: 'error', error: String(e) });
      appendLog(`任务查询失败: ${String(e)}`);
    } finally {
      setResuming(false);
    }
  }, [blockId, pendingTaskCount, hasSinglePending, singleTaskId, data, shots, model, patchChainShotLocal, updateNodeData, appendLog]);

  const approveAllVideos = useCallback(() => {
    for (const shot of shots) {
      const patch = approveStoryboardVideoShot(shot);
      if (patch) patchChainShotLocal(shot.id, patch);
    }
  }, [shots, patchChainShotLocal]);

  const approveShot = useCallback((shot: StoryboardShot) => {
    const patch = approveStoryboardVideoShot(shot);
    if (patch) patchChainShotLocal(shot.id, patch);
  }, [patchChainShotLocal]);

  const adoptVersion = useCallback((shot: StoryboardShot, versionId: string) => {
    const patch = adoptStoryboardVideoVersion(shot, versionId);
    if (patch) patchChainShotLocal(shot.id, patch);
  }, [patchChainShotLocal]);

  // F-008: 打回镜头（必填原因）
  const rejectShot = useCallback((shotId: string, reason: string) => {
    const shot = shots.find((s) => s.id === shotId);
    if (!shot) return;
    const patch = rejectStoryboardVideoShot(shot, reason);
    if (!patch) return;
    patchChainShotLocal(shotId, patch);
  }, [shots, patchChainShotLocal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
      const ta = promptContainerRef.current?.querySelector('textarea');
      if (document.activeElement !== ta) return;
      e.preventDefault();
      void handleRun();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRun]);

  const handleCollapse = useCallback(() => {
    flushNow();
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse, flushNow]);

  const videoUrl = (data.videoUrl as string | undefined) || undefined;

  const toolbarLeft = (
    <div className="flex items-center gap-1" onMouseDown={stop}>
      <VideoGenModeChip
        mode={videoGenMode}
        onChange={(mode: VideoGenMode) => handlePatch(patchVideoGenMode(mode))}
      />
      <span className="w-px h-3.5 bg-line/50" />
      <VideoParamChips blockId={blockId} onPatch={handlePatch} />
    </div>
  );

  const toolbarAdvanced = (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">Seed</span>
        <input
          type="text"
          value={data.seed != null ? String(data.seed) : ''}
          onChange={(e) =>
            handlePatch({ seed: e.target.value ? Number(e.target.value) : undefined })
          }
          onMouseDown={stop}
          placeholder="留空随机"
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] focus:outline-none focus:border-brand/40"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">Negative Prompt</span>
        <textarea
          value={(data.negativePrompt as string) ?? ''}
          onChange={(e) => handlePatch({ negativePrompt: e.target.value })}
          onMouseDown={stop}
          placeholder="排除元素…"
          rows={2}
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] resize-none focus:outline-none focus:border-brand/40"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[10px] text-ink/45">Provider 参数</span>
        <input
          type="text"
          value={(data.modelParams as string) ?? ''}
          onChange={(e) => handlePatch({ modelParams: e.target.value || undefined })}
          onMouseDown={stop}
          placeholder="JSON 或 key=value"
          className={`w-full rounded-lg border px-2 py-1 text-[11px] focus:outline-none ${
            modelParamsError
              ? 'border-error/60 focus:border-error/60'
              : 'border-line/50 focus:border-brand/40'
          }`}
        />
        {modelParamsError && (
          <span className="text-[9px] text-error">{modelParamsError}</span>
        )}
      </label>
      {/* F-048: 并发/重试配置单轨 UI */}
      <div className="border-t border-line/20 pt-2 mt-1 space-y-1.5">
        <p className="text-[9px] text-ink/40 font-medium">批出配置</p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[9px] text-ink/50">
            <span>并发</span>
            <select
              value={String((data.concurrency as number) ?? 2)}
              onChange={(e) => handlePatch({ concurrency: Number(e.target.value) })}
              className="rounded border border-line/40 px-1 py-0.5 text-[10px]"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[9px] text-ink/50">
            <span>重试</span>
            <select
              value={String((data.maxRetries as number) ?? (data.maxRetry as number) ?? 1)}
              onChange={(e) =>
                // VG-06: 单轨字段 maxRetries（清掉旧 maxRetry，避免双轨漂移）
                handlePatch({ maxRetries: Number(e.target.value), maxRetry: undefined })
              }
              className="rounded border border-line/40 px-1 py-0.5 text-[10px]"
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>{n === 0 ? '不重试' : `${n} 次`}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );

  const playbookReady = playbookState
    ? validateReferenceSlots(playbookState.slots, playbookState.enforce)
    : { ready: true as boolean, reason: undefined as string | undefined };

  const runLabel = playbookAction ? '运行 · 深度复刻' : undefined;

  const playbookTop =
    playbookAction?.needsSlotTools && playbookState ? (
      <VideoPlaybookTools
        label={playbookAction.label}
        hint={playbookAction.hint}
        slots={playbookState.slots}
        statusText={playbookMsg || (!playbookReady.ready ? playbookReady.reason : undefined)}
        onClearPlaybook={handleClearPlaybook}
        onSlotsChange={handlePlaybookSlots}
        onBusy={setPlaybookMsg}
      />
    ) : playbookAction ? (
      <div className="shrink-0 flex items-center gap-2 px-3 pt-2 pb-1.5 border-b border-line/25">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/10 text-brand text-[10px] font-medium border border-brand/20">
          {playbookAction.label}
          <button
            type="button"
            onMouseDown={stop}
            onClick={handleClearPlaybook}
            className="opacity-55 hover:opacity-100"
            title="清除热门玩法"
          >
            ×
          </button>
        </span>
        <span className="text-[9px] text-ink/35 truncate">{playbookAction.hint}</span>
      </div>
    ) : null;

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={handleCollapse}
      headerTrailing={
        <div className="flex items-center gap-1" onMouseDown={stop}>
          <VideoPlaybookMenu
            activeId={playbookState?.playbookId}
            onSelect={handleSelectPlaybook}
            variant="header"
          />
          <ComposerModelSelect
            value={model}
            options={CLIP_GEN_MODELS.map((m) => ({ id: m.id, label: m.label }))}
            onChange={(v) => handlePatch({ model: v })}
            width={220}
            tone="desk"
          />
        </div>
      }
      topSlot={
        <>
          {playbookTop}
          {videoGenMode === 'text-to-video' && hasUpstream && (
            <div
              className="shrink-0 px-3 py-1.5 border-b border-line/25 nodrag nopan"
              onMouseDown={stop}
            >
              <p className="text-[9px] text-warn/75">
                文生视频模式不会携带分镜首帧；需要首帧约束请切换「图生视频」。
              </p>
            </div>
          )}
          {(pendingTaskCount > 0 || hasSinglePending) && (
            <div
              className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-line/25 nodrag nopan"
              onMouseDown={stop}
            >
              <span className="text-[10px] text-warn/85">
                {pendingTaskCount > 0
                  ? `${pendingTaskCount} 个视频任务仍在后台生成`
                  : '视频任务仍在后台生成'}
              </span>
              <button
                type="button"
                disabled={resuming}
                onClick={() => void resumeTasks()}
                className="ml-auto rounded-md border border-brand/30 bg-brand/8 px-2 py-0.5 text-[10px] text-brand hover:bg-brand/15 disabled:opacity-45"
              >
                {resuming ? '查询中…' : '继续查询'}
              </button>
            </div>
          )}
          {showSource && (
            <VideoSourceStrip
              sourceClipUrl={sourceClipUrl}
              upstreamClips={upstreamClips}
              onChange={(url) => handlePatch({ sourceClipUrl: url })}
            />
          )}
          {showFrames && (
            <VideoFrameStrip
              startFrameUrl={data.startFrameUrl as string | undefined}
              endFrameUrl={data.endFrameUrl as string | undefined}
              referenceFrameUrl={data.referenceFrameUrl as string | undefined}
              slots={frameSlots}
              hint={
                videoGenMode === 'omni-ref'
                  ? '上游图/视频会一并作为参考'
                  : videoGenMode === 'image-ref'
                    ? '参考图进入参考数组，不作为首帧'
                    : undefined
              }
              onStartChange={(url) => handlePatch({ startFrameUrl: url })}
              onEndChange={(url) => handlePatch({ endFrameUrl: url })}
              onReferenceChange={(url) => handlePatch({ referenceFrameUrl: url })}
            />
          )}
          {videoUrl && (
            <div className="border-b border-line/25 px-3 py-2 nodrag nopan" onMouseDown={stop}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <p className="text-[10px] font-medium text-ink/65">生成结果</p>
                <span className="text-[9px] text-ink/28">拖出钉到画布</span>
              </div>
              <div
                draggable
                onDragStart={(e) => {
                  const el = e.currentTarget.querySelector('video');
                  setMediaPinDragData(
                    e.dataTransfer,
                    {
                      url: videoUrl,
                      source: 'generated',
                      label: '生成视频',
                      pinKind: 'clip',
                      sourceBlockId: blockId,
                    },
                    el,
                  );
                }}
                className="w-28 h-16 rounded-lg overflow-hidden border border-line/40 cursor-grab active:cursor-grabbing"
                title="拖出钉到画布"
              >
                <video
                  src={videoUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover pointer-events-none"
                />
              </div>
            </div>
          )}
          {hasUpstream && shots.length > 0 && (
            <VideoShotReviewGrid
              blockId={blockId}
              shots={shots}
              retryingShotId={retryingShotId}
              onApproveAll={approveAllVideos}
              onApprove={approveShot}
              onAdoptVersion={adoptVersion}
              onReject={rejectShot}
              onRetry={(shotId) => void retryShot(shotId)}
            />
          )}
        </>
      }
      toolbarLeft={toolbarLeft}
      toolbarAdvanced={toolbarAdvanced}
      history={history}
      onApplyHistory={applyText}
      onAiAction={handleAiAction}
      onRun={() => void handleRun()}
      onStop={handleStop}
      running={data.status === 'running'}
      runLabel={runLabel}
      runDisabled={
        Boolean(playbookState && !playbookReady.ready)
        || (videoGenMode === 'bridge' && !sourceClipUrl && upstreamClips.length === 0)
      }
      promptContainerRef={promptContainerRef}
    >
      <AssetMentionInput
        as="textarea"
        value={draft}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={
          playbookAction
            ? '补句：风格、台词、情绪、禁则… 输入 @ 引用资产'
            : '描述你想生成的视频… 输入 @ 引用角色、场景、镜头、情绪、声音'
        }
        kinds={VIDEO_MENTION_KINDS}
        className={COMPOSER_PROMPT_TEXTAREA_CLASS}
        tone="desk"
      />
    </ComposerWorkspaceShell>
  );
}
