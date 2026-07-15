import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetLibraryKind, StoryboardShot } from '@nx9/shared';
import {
  activeEpisodeShots,
  adoptStoryboardVideoVersion,
  CLIP_GEN_MODELS,
  lookupBlock,
  resolveStoryboardVideoVersions,
} from '@nx9/shared';
import { useReactFlow } from '@xyflow/react';
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
import { VideoGenModeChip } from './VideoGenModeChip';
import { VideoParamChips } from './VideoParamChips';
import { VideoFrameStrip } from './VideoFrameStrip';
import {
  patchVideoGenMode,
  readVideoGenMode,
  showVideoFrameStrip,
  type VideoGenMode,
} from './video-gen-modes';
import { useWorkspaceDocument } from '../../../../../../stores/workspace-document';
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
  const storyboard = useWorkspaceDocument((state) => state.storyboard);
  const shots = useMemo(() => activeEpisodeShots(storyboard), [storyboard]);
  const updateShot = useWorkspaceDocument((state) => state.updateShot);
  const [retryingShotId, setRetryingShotId] = useState<string | null>(null);
  const [previewVersionIds, setPreviewVersionIds] = useState<Record<string, string>>({});

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
      if (shots.length > 0) {
        await batchGenerateVideosFromShots();
        appendLog(`当前集视频生成完成 · ${shots.length} 镜`);
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
  }, [blockId, runtime, meta, kind, appendLog, flushNow, shots.length]);

  const retryShot = useCallback(async (shotId: string) => {
    setRetryingShotId(shotId);
    try {
      await batchGenerateVideosFromShots([shotId], true);
    } finally {
      setRetryingShotId(null);
    }
  }, []);

  const approveAllVideos = useCallback(() => {
    for (const shot of shots) {
      const versions = resolveStoryboardVideoVersions(shot);
      const selected = versions.find((version) => version.url === shot.videoAssetId) ?? versions.at(-1);
      if (!selected) continue;
      const patch = adoptStoryboardVideoVersion(shot, selected.id);
      if (patch) updateShot(shot.id, patch);
    }
  }, [shots, updateShot]);

  const adoptVersion = useCallback((shot: StoryboardShot, versionId: string) => {
    const patch = adoptStoryboardVideoVersion(shot, versionId);
    if (patch) updateShot(shot.id, patch);
  }, [updateShot]);

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
          {shots.length > 0 && (
            <div className="border-b border-line/25 px-3 py-2">
              <div className="mb-1.5 flex items-center gap-2">
                <p className="text-[10px] font-medium text-ink/65">
                  当前集 {shots.length} 镜 · 已生成 {shots.filter((shot) => shot.videoAssetId).length}
                </p>
                <button
                  type="button"
                  disabled={shots.some((shot) => !shot.videoAssetId)}
                  onClick={approveAllVideos}
                  className="ml-auto rounded-md bg-ok/10 px-2 py-0.5 text-[9px] text-ok disabled:opacity-35"
                >
                  全部采用
                </button>
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto nx9-scroll">
                {shots.map((shot) => {
                  const versions = resolveStoryboardVideoVersions(shot);
                  const defaultVersion = versions.find((version) => version.url === shot.videoAssetId) ?? versions.at(-1);
                  const displayVersion = versions.find((version) => version.id === previewVersionIds[shot.id]) ?? defaultVersion;
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
                      <p className="text-[8px] text-ink/35">
                        {shot.videoStatus ?? 'draft'} · {versions.length} 个版本
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!displayVersion || (
                        shot.videoStatus === 'approved' && (
                          displayVersion.id === shot.adoptedVideoVersionId ||
                          (!shot.adoptedVideoVersionId && displayVersion.status === 'adopted')
                        )
                      )}
                      onClick={() => displayVersion && adoptVersion(shot, displayVersion.id)}
                      className="rounded border border-ok/25 px-1 py-0.5 text-[8px] text-ok disabled:opacity-35"
                    >
                      采用
                    </button>
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
                                  : 'bg-white text-ink/45'
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
