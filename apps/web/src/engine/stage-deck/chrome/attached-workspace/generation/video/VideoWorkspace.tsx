import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetLibraryKind, StoryboardShot } from '@nx9/shared';
import {
  adoptStoryboardVideoVersion,
  approveStoryboardVideoShot,
  CLIP_GEN_MODELS,
  lookupBlock,
  rejectStoryboardVideoShot,
  resolveStoryboardVideoVersions,
  resolveVideoStatusBadge,
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
import { VideoGenModeChip } from './VideoGenModeChip';
import { VideoParamChips } from './VideoParamChips';
import { VideoFrameStrip } from './VideoFrameStrip';
import {
  patchVideoGenMode,
  readVideoGenMode,
  showVideoFrameStrip,
  type VideoGenMode,
} from './video-gen-modes';
import { batchGenerateVideosFromShots } from '../../../../../core-pipeline-runner';

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
  const [previewVersionIds, setPreviewVersionIds] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!hasUpstream) {
      if (Array.isArray(data.linkedShotIds) && (data.linkedShotIds as string[]).length > 0) {
        updateNodeData(blockId, { linkedShotIds: [] });
      }
      return;
    }
    const prev = Array.isArray(data.linkedShotIds) ? (data.linkedShotIds as string[]) : [];
    if (prev.length === shotIds.length && prev.every((id, i) => id === shotIds[i])) return;
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

  useEffect(() => {
    const ta = promptContainerRef.current?.querySelector('textarea');
    ta?.focus();
  }, [blockId, focusNonce]);

  const meta = lookupBlock(kind);

  const handleRun = useCallback(async () => {
    flushNow();
    if (!runtime) return;
    try {
      if (hasUpstream && shotIds.length > 0) {
        // F-004: 传入链镜表避免回退全局
        await batchGenerateVideosFromShots(shotIds, false, blockId, shots as any);
        appendLog(`上游镜头视频生成完成 · ${shotIds.length} 镜`);
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
      });
      appendLog(`运行 · ${meta?.label ?? kind}`);
    } catch (e) {
      appendLog(`运行失败: ${String(e)}`);
    }
  }, [blockId, runtime, meta, kind, appendLog, flushNow, hasUpstream, shotIds]);

  const retryShot = useCallback(async (shotId: string) => {
    setRetryingShotId(shotId);
    try {
      // F-004: 传入链镜表避免回退全局
      await batchGenerateVideosFromShots([shotId], true, blockId, shots as any);
    } finally {
      setRetryingShotId(null);
    }
  }, [blockId]);

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

  const [rejectingShotId, setRejectingShotId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

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
          className="w-full rounded-lg border border-line/50 px-2 py-1 text-[11px] focus:outline-none focus:border-brand/40"
        />
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
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[9px] text-ink/50">
            <span>重试</span>
            <select
              value={String((data.maxRetry as number) ?? 1)}
              onChange={(e) => handlePatch({ maxRetry: Number(e.target.value) })}
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

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={handleCollapse}
      headerTrailing={
        <ComposerModelSelect
          value={model}
          options={CLIP_GEN_MODELS.map((m) => ({ id: m.id, label: m.label }))}
          onChange={(v) => handlePatch({ model: v })}
        />
      }
      topSlot={
        <>
          {showFrames && (
            <VideoFrameStrip
              startFrameUrl={data.startFrameUrl as string | undefined}
              endFrameUrl={data.endFrameUrl as string | undefined}
              referenceFrameUrl={data.referenceFrameUrl as string | undefined}
              onStartChange={(url) => handlePatch({ startFrameUrl: url })}
              onEndChange={(url) => handlePatch({ endFrameUrl: url })}
              onReferenceChange={(url) => handlePatch({ referenceFrameUrl: url })}
            />
          )}
          {hasUpstream && shots.length > 0 && (
            <div className="border-b border-line/25 px-3 py-2">
              <div className="mb-1.5 flex items-center gap-2">
                <p className="text-[10px] font-medium text-ink/65">
                  上游 {shots.length} 镜 · 已生成 {shots.filter((shot) => shot.videoAssetId).length}
                </p>
                <button
                  type="button"
                  disabled={shots.some((shot) => !shot.videoAssetId)}
                  onClick={approveAllVideos}
                  className="ml-auto rounded-md bg-ok/10 px-2 py-0.5 text-[9px] text-ok disabled:opacity-35"
                >
                  {/* F-008: 全部批准 */}
                  全部批准
                </button>
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto nx9-scroll">
                {shots.map((shot) => {
                  const versions = resolveStoryboardVideoVersions(shot);
                  const defaultVersion = versions.find((version) => version.url === shot.videoAssetId) ?? versions.at(-1);
                  const displayVersion = versions.find((version) => version.id === previewVersionIds[shot.id]) ?? defaultVersion;
                  const badge = resolveVideoStatusBadge(shot.videoStatus);
                  const badgeClass =
                    badge.tone === 'approved'
                      ? 'bg-ok/10 text-ok'
                      : badge.tone === 'rejected'
                        ? 'bg-error/10 text-error'
                        : 'bg-ink/10 text-ink/50';
                  return (
                  <div key={shot.id} className="rounded-lg bg-surface/45 p-1.5">
                    <div className="flex items-center gap-2">
                    <div className="h-9 w-14 shrink-0 overflow-hidden rounded bg-black/5">
                      {displayVersion?.url ? (
                        <video src={displayVersion.url} controls className="h-full w-full object-cover" />
                      ) : shot.firstFrameAssetId ? (
                        <img src={shot.firstFrameAssetId} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[9px] text-ink/65">#{shot.index + 1} {shot.descriptionZh}</p>
                      {/* F-008: pending 灰 / approved 绿 / rejected 红 */}
                      <p className="text-[8px]">
                        <span className={`inline-block px-1 py-0.5 rounded-full text-[7px] font-medium ${badgeClass}`}>
                          {badge.label}
                        </span>
                        <span className="ml-1 text-ink/35">· {versions.length} 个版本</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!shot.videoAssetId || shot.videoStatus === 'approved'}
                      onClick={() => {
                        if (displayVersion && displayVersion.url !== shot.videoAssetId) {
                          adoptVersion(shot, displayVersion.id);
                        } else {
                          approveShot(shot);
                        }
                      }}
                      className="rounded border border-ok/25 px-1 py-0.5 text-[8px] text-ok disabled:opacity-35"
                    >
                      批准
                    </button>
                    {/* F-008: 打回必填原因 */}
                    {rejectingShotId === shot.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="原因必填…"
                          className="w-16 rounded border border-line px-1 py-0.5 text-[8px]"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && rejectReason.trim()) {
                              rejectShot(shot.id, rejectReason);
                              setRejectingShotId(null);
                              setRejectReason('');
                            }
                            if (e.key === 'Escape') {
                              setRejectingShotId(null);
                              setRejectReason('');
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={!rejectReason.trim()}
                          onClick={() => {
                            if (!rejectReason.trim()) return;
                            rejectShot(shot.id, rejectReason);
                            setRejectingShotId(null);
                            setRejectReason('');
                          }}
                          className="rounded border border-red/25 px-1 py-0.5 text-[8px] text-red disabled:opacity-35"
                        >
                          确认
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={!shot.videoAssetId}
                        onClick={() => setRejectingShotId(shot.id)}
                        className="rounded border border-red/20 px-1 py-0.5 text-[8px] text-red/60 hover:text-red disabled:opacity-35"
                      >
                        打回
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={retryingShotId === shot.id || shot.keyframeStatus !== 'approved'}
                      onClick={() => void retryShot(shot.id)}
                      className="rounded border border-brand/20 px-1 py-0.5 text-[8px] text-brand disabled:opacity-35"
                    >
                      {retryingShotId === shot.id ? '生成中' : '重生成'}
                    </button>
                    </div>
                    {versions.length > 0 && (
                      <div className="mt-1 flex items-center gap-1 overflow-x-auto nx9-scroll">
                        {versions.map((version, index) => (
                          <button
                            key={version.id}
                            type="button"
                            onClick={() => setPreviewVersionIds((current) => ({ ...current, [shot.id]: version.id }))}
                            title={new Date(version.createdAt).getTime() > 0 ? new Date(version.createdAt).toLocaleString() : '历史版本'}
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] ${
                              displayVersion?.id === version.id
                                ? 'bg-brand text-white'
                                : version.status === 'adopted'
                                  ? 'bg-ok/10 text-ok'
                                  : 'bg-surface text-ink/45'
                            }`}
                          >V{index + 1}{version.status === 'adopted' ? ' ✓' : ''}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      }
      toolbarLeft={toolbarLeft}
      toolbarAdvanced={toolbarAdvanced}
      history={history}
      onApplyHistory={applyText}
      onAiAction={handleAiAction}
      onRun={() => void handleRun()}
      running={data.status === 'running'}
      promptContainerRef={promptContainerRef}
    >
      <AssetMentionInput
        as="textarea"
        value={draft}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="描述你想生成的视频… 输入 @ 引用角色、场景、镜头、情绪、声音"
        kinds={VIDEO_MENTION_KINDS}
        className={COMPOSER_PROMPT_TEXTAREA_CLASS}
      />
    </ComposerWorkspaceShell>
  );
}
