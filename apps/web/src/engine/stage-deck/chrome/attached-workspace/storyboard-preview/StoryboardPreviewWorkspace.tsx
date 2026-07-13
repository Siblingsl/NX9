import { useCallback, useEffect, useMemo } from 'react';
import { ChevronDown, GripVertical, Sparkles } from 'lucide-react';
import {
  canConfirmStoryboardPreview,
  lookupBlock,
  storyboardPreviewSummary,
  type StoryboardPreviewGridColumns,
  type StoryboardPreviewPayload,
  type StoryboardPreviewViewMode,
} from '@nx9/shared';
import { useReactFlow } from '@xyflow/react';
import { useDeckUi } from '../../../stores/deck-ui';
import { useActivityLog } from '../../../../../stores/activity-log';
import { useStoryboardPreviewState } from './useStoryboardPreviewState';
import { StoryboardPreviewGrid } from './StoryboardPreviewGrid';
import { StoryboardPreviewTimeline } from './StoryboardPreviewTimeline';
import { StoryboardPreviewFrameEditor } from './StoryboardPreviewFrameEditor';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

const VIEW_MODES: { id: StoryboardPreviewViewMode; label: string }[] = [
  { id: 'grid', label: 'Grid' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'storyboard', label: 'Scene' },
];

const GRID_COLS: StoryboardPreviewGridColumns[] = [2, 3, 4];

export interface StoryboardPreviewWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

export function StoryboardPreviewWorkspace({
  blockId,
  kind,
  onCollapse,
}: StoryboardPreviewWorkspaceProps) {
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const appendLog = useActivityLog((s) => s.append);
  const { getNode } = useReactFlow();
  const actions = useStoryboardPreviewState(blockId);

  const node = getNode(blockId);
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const payload = actions.readPayload(data);
  const meta = lookupBlock(kind);
  const status = (data.status as string) ?? 'idle';
  const summary = storyboardPreviewSummary(payload);
  const canConfirm = canConfirmStoryboardPreview(payload);

  useEffect(() => {
    if (payload.frames.length === 0 && actions.shotCount > 0) {
      actions.syncFromStoryboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once when shots available
  }, [blockId, actions.shotCount, payload.frames.length]);

  const framesByScene = useMemo(() => {
    const map = new Map<string, typeof payload.frames>();
    for (const f of payload.frames) {
      const key = f.sceneCode ?? f.sceneId ?? '未分场';
      const list = map.get(key) ?? [];
      list.push(f);
      map.set(key, list);
    }
    return map;
  }, [payload.frames]);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  const handleConsistencyCheck = useCallback(() => {
    appendLog('AI 一致性检查（即将推出）');
  }, [appendLog]);

  const handleBatchRegenerate = useCallback(() => {
    const unlocked = payload.frames.filter((f) => !f.locked && f.status !== 'generating');
    if (unlocked.length === 0) {
      appendLog('无可重新生成的分镜（已全部锁定或生成中）');
      return;
    }
    unlocked.forEach((f) => actions.regenerateFrame(f.id));
    appendLog(`批量重新生成 ${unlocked.length} 张（跳过锁定）`);
  }, [actions, appendLog, payload.frames]);

  const selectedFrame = payload.selectedFrameId
    ? payload.frames.find((f) => f.id === payload.selectedFrameId)
    : undefined;

  return (
    <div
      className="flex flex-col w-full h-[min(480px,55vh)] min-h-[320px] px-3 py-2 nodrag"
      onMouseDown={stop}
      onPointerDown={stop}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 shrink-0 h-8">
        <GripVertical size={13} className="text-ink/20 nx9-prompt-bar-drag-handle cursor-grab" />
        <p className="flex-1 text-[13px] font-medium text-ink truncate">
          {meta?.label ?? '分镜预览'}
          <span className="ml-2 text-[10px] font-normal text-ink/40">Video Proof</span>
        </p>
        <span className="text-[10px] text-ink/45 tabular-nums">
          {summary.success}/{summary.total} · 🔒 {summary.locked}
        </span>
        <button type="button" onClick={handleCollapse} className="p-1 rounded-lg text-ink/35 hover:text-ink">
          <ChevronDown size={15} />
        </button>
      </div>

      <div className="flex-1 min-h-0 mt-1.5 rounded-xl border border-line/35 bg-white shadow-[0_1px_8px_rgba(15,15,15,0.03)] flex flex-col overflow-hidden">
        <StoryboardPreviewTimeline
          frames={payload.frames}
          totalDurationSec={payload.totalDurationSec}
          selectedFrameId={payload.selectedFrameId}
          onSelect={actions.selectFrame}
        />

        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-line/20">
          <div className="flex rounded-lg bg-surface/80 p-0.5 border border-line/50">
            {VIEW_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={stop}
                onClick={() => actions.setViewMode(m.id)}
                className={`px-2 py-0.5 rounded-md text-[10px] nodrag ${
                  payload.viewMode === m.id ? 'bg-white text-brand shadow-sm font-medium' : 'text-ink/45'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {payload.viewMode === 'grid' && (
            <div className="flex gap-1 ml-1">
              {GRID_COLS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={stop}
                  onClick={() => actions.setGridColumns(c)}
                  className={`px-1.5 py-0.5 rounded text-[9px] border nodrag ${
                    payload.gridColumns === c
                      ? 'border-brand/40 bg-brand/10 text-brand'
                      : 'border-line text-ink/40'
                  }`}
                >
                  {c}列
                </button>
              ))}
            </div>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onMouseDown={stop}
            onClick={handleConsistencyCheck}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] text-ink/50 hover:text-brand"
          >
            <Sparkles size={11} />
            一致性检查
          </button>
          <button
            type="button"
            onMouseDown={stop}
            onClick={handleBatchRegenerate}
            className="px-2 py-0.5 rounded-md text-[10px] text-ink/50 hover:text-brand border border-line/50"
          >
            批量重生（跳过锁定）
          </button>
          <button
            type="button"
            onMouseDown={stop}
            onClick={actions.syncFromStoryboard}
            className="px-2 py-0.5 rounded-md text-[10px] text-ink/50 hover:text-brand"
          >
            同步 Storyboard
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto nowheel overscroll-contain">
          {selectedFrame ? (
            <StoryboardPreviewFrameEditor
              frame={selectedFrame}
              onClose={() => actions.selectFrame(null)}
              onUpdate={(patch) => actions.updateFrame(selectedFrame.id, patch)}
              onRegenerate={() => actions.regenerateFrame(selectedFrame.id)}
            />
          ) : payload.viewMode === 'storyboard' ? (
            <div className="p-3 space-y-3">
              {[...framesByScene.entries()].map(([scene, frames]) => (
                <div key={scene}>
                  <p className="text-[10px] font-medium text-ink/55 mb-1.5">Scene · {scene}</p>
                  <StoryboardPreviewGrid
                    frames={frames}
                    columns={payload.gridColumns}
                    selectedFrameId={payload.selectedFrameId}
                    onSelect={actions.selectFrame}
                    onToggleLock={actions.toggleLock}
                    onRegenerate={actions.regenerateFrame}
                    onInsertAfter={actions.insertAfter}
                    onRemove={actions.removeFrame}
                  />
                </div>
              ))}
            </div>
          ) : payload.viewMode === 'timeline' ? (
            <StoryboardPreviewGrid
              frames={[...payload.frames].sort((a, b) => a.startSec - b.startSec)}
              columns={Math.min(4, Math.max(2, payload.gridColumns)) as StoryboardPreviewGridColumns}
              selectedFrameId={payload.selectedFrameId}
              onSelect={actions.selectFrame}
              onToggleLock={actions.toggleLock}
              onRegenerate={actions.regenerateFrame}
              onInsertAfter={actions.insertAfter}
              onRemove={actions.removeFrame}
            />
          ) : (
            <StoryboardPreviewGrid
              frames={payload.frames}
              columns={payload.gridColumns}
              selectedFrameId={payload.selectedFrameId}
              onSelect={actions.selectFrame}
              onToggleLock={actions.toggleLock}
              onRegenerate={actions.regenerateFrame}
              onInsertAfter={actions.insertAfter}
              onRemove={actions.removeFrame}
            />
          )}
        </div>

        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-line/30 bg-surface/20">
          <p className="text-[10px] text-ink/40">
            AI 计算 {payload.computedFrameCount} 张 · 总时长 {payload.totalDurationSec.toFixed(0)}s
          </p>
          <div className="flex-1" />
          <button
            type="button"
            disabled={!canConfirm || status === 'running'}
            onClick={actions.confirmAll}
            className="px-3 py-1.5 rounded-lg bg-brand text-white text-[11px] font-medium hover:bg-brand/90 disabled:opacity-40"
          >
            确认进入视频生成
          </button>
        </div>
      </div>
    </div>
  );
}
