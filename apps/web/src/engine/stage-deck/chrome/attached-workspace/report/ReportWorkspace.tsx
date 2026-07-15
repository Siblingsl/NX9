import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  activeEpisodeShots,
  appendStoryboardReviewEvent,
  type StoryboardShot,
} from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useDeckUi } from '../../../stores/deck-ui';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { batchGenerateKeyframesFromShots } from '../../../../core-pipeline-runner';

export interface ReportWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

function lastRejectedComment(shot: StoryboardShot): string | undefined {
  return [...(shot.reviewHistory ?? [])]
    .reverse()
    .find((event) => event.stage === 'keyframe' && event.decision === 'rejected')
    ?.comment ?? undefined;
}

export function ReportWorkspace({ blockId, kind, onCollapse }: ReportWorkspaceProps) {
  const collapsePromptBar = useDeckUi((s) => s.collapsePromptBar);
  const data = useAttachedNodeData(blockId);

  const handleCollapse = useCallback(() => {
    collapsePromptBar();
    onCollapse?.();
  }, [collapsePromptBar, onCollapse]);

  const summary = data.summary as string | undefined;
  const issues = data.issues as Array<{ message: string }> | undefined;
  const status = (data.status as string) ?? 'idle';
  const storyboard = useWorkspaceDocument((state) => state.storyboard);
  const shots = useMemo(() => activeEpisodeShots(storyboard), [storyboard]);
  const updateShot = useWorkspaceDocument((state) => state.updateShot);
  const runtime = useFlowRuntime((state) => state.runtime);
  const [regeneratingShotId, setRegeneratingShotId] = useState<string | null>(null);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [rejectionDrafts, setRejectionDrafts] = useState<Record<string, string>>({});
  const isReviewGate = kind === 'review-gate';
  const missingFrames = isReviewGate ? shots.filter((shot) => !shot.firstFrameAssetId).length : 0;
  const pendingFrames = isReviewGate
    ? shots.filter((shot) => shot.firstFrameAssetId && shot.keyframeStatus !== 'approved').length
    : 0;
  const allApproved = isReviewGate && shots.length > 0 && shots.every(
    (shot) => shot.firstFrameAssetId && shot.keyframeStatus === 'approved',
  );

  useEffect(() => {
    if (!allApproved || data.gatePassed === true) return;
    runtime?.updateNodeData(blockId, {
      status: 'success',
      gatePassed: true,
      pendingShots: [],
      meta: { gatePassed: true, gateMode: 'keyframe' },
    });
  }, [allApproved, blockId, data.gatePassed, runtime]);

  const focusPreview = useCallback(() => {
    const preview = runtime?.getNodes().find((node) => node.type === 'storyboard-preview');
    if (preview) runtime?.focusBlock(preview.id);
  }, [runtime]);

  const approveShot = useCallback((shot: StoryboardShot) => {
    const event = {
      id: `review-${shot.id}-${Date.now()}`,
      stage: 'keyframe' as const,
      decision: 'approved' as const,
      createdAt: new Date().toISOString(),
    };
    updateShot(shot.id, {
      status: 'approved',
      keyframeStatus: 'approved',
      keyframeReviewNote: null,
      reviewHistory: appendStoryboardReviewEvent(shot, event),
    });
  }, [updateShot]);

  const rejectShot = useCallback(async (shot: StoryboardShot, regenerate: boolean) => {
    const comment = (rejectionDrafts[shot.id] ?? shot.keyframeReviewNote ?? '').trim();
    if (!comment) return;
    const event = {
      id: `review-${shot.id}-${Date.now()}`,
      stage: 'keyframe' as const,
      decision: 'rejected' as const,
      comment,
      createdAt: new Date().toISOString(),
    };
    runtime?.updateNodeData(blockId, { status: 'blocked', gatePassed: false });
    updateShot(shot.id, {
      status: 'failed',
      keyframeStatus: 'failed',
      keyframeReviewNote: comment,
      reviewHistory: appendStoryboardReviewEvent(shot, event),
    });
    setEditingShotId(null);
    if (!regenerate) return;
    setRegeneratingShotId(shot.id);
    try {
      await batchGenerateKeyframesFromShots([shot.id], true);
    } finally {
      setRegeneratingShotId(null);
    }
  }, [blockId, rejectionDrafts, runtime, updateShot]);

  const approveAll = useCallback(() => {
    if (!isReviewGate || shots.length === 0 || missingFrames > 0) return;
    for (const shot of shots) {
      approveShot(shot);
    }
    runtime?.updateNodeData(blockId, {
      status: 'success',
      gatePassed: true,
      pendingShots: [],
      meta: { gatePassed: true, gateMode: 'keyframe' },
    });
  }, [approveShot, blockId, isReviewGate, missingFrames, runtime, shots]);

  return (
    <ComposerWorkspaceShell
      kind={kind}
      status={status as any}
      onCollapse={handleCollapse}
      showRun={false}
      showAi={false}
      showAdvanced={false}
      showHistory={false}
      showToolbar={false}
      heightClass="h-[min(420px,50vh)] max-h-[460px]"
      bodyClassName="flex-1 min-h-0 px-3 py-2.5 overflow-y-auto nowheel overscroll-contain text-xs"
    >
      {isReviewGate && (
        <div className="rounded-lg border border-line/40 bg-surface/30 p-2.5">
          <p className="font-medium text-ink/80">分镜批审</p>
          <p className="mt-1 text-[10px] text-ink/45">
            共 {shots.length} 镜 · 待审 {pendingFrames} · 缺图 {missingFrames}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={focusPreview}
              className="flex-1 rounded-lg border border-brand/25 bg-white py-1.5 text-[10px] text-brand"
            >
              返回分镜预览修改
            </button>
            <button
              type="button"
              disabled={shots.length === 0 || missingFrames > 0 || pendingFrames === 0}
              onClick={approveAll}
              className="flex-1 rounded-lg bg-brand py-1.5 text-[10px] text-white disabled:opacity-40"
            >
              全部通过
            </button>
          </div>
          {missingFrames > 0 && (
            <p className="mt-1.5 text-[9px] text-warn">请先补齐全部分镜图，再执行批量通过。</p>
          )}
          <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto nx9-scroll">
            {shots.map((shot) => (
              <div key={shot.id} className="rounded-lg border border-line/35 bg-white p-1.5">
                <div className="flex items-center gap-2">
                <div className="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-surface">
                  {shot.firstFrameAssetId ? (
                    <img src={shot.firstFrameAssetId} alt={`镜头 ${shot.index + 1}`} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] text-ink/70">#{shot.index + 1} {shot.descriptionZh}</p>
                  <p className="text-[9px] text-ink/35">{shot.keyframeStatus ?? 'draft'}</p>
                  {shot.keyframeReviewNote && (
                    <p className="mt-0.5 truncate text-[8px] text-warn">修改：{shot.keyframeReviewNote}</p>
                  )}
                  {!shot.keyframeReviewNote && lastRejectedComment(shot) && (
                    <p className="mt-0.5 truncate text-[8px] text-ink/35">上次意见：{lastRejectedComment(shot)}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!shot.firstFrameAssetId || shot.keyframeStatus === 'approved'}
                  onClick={() => approveShot(shot)}
                  className="rounded-md border border-ok/25 px-1.5 py-1 text-[9px] text-ok disabled:opacity-35"
                >
                  通过
                </button>
                <button
                  type="button"
                  disabled={regeneratingShotId === shot.id}
                  onClick={() => {
                    setEditingShotId(shot.id);
                    setRejectionDrafts((current) => ({
                      ...current,
                      [shot.id]: current[shot.id] ?? shot.keyframeReviewNote ?? '',
                    }));
                  }}
                  className="rounded-md border border-warn/25 px-1.5 py-1 text-[9px] text-warn disabled:opacity-35"
                >
                  {regeneratingShotId === shot.id ? '重生中' : '退回修改'}
                </button>
                </div>
                {editingShotId === shot.id && (
                  <div className="mt-1.5 rounded-md bg-warn/5 p-1.5">
                    <textarea
                      autoFocus
                      rows={2}
                      value={rejectionDrafts[shot.id] ?? ''}
                      onChange={(event) => setRejectionDrafts((current) => ({
                        ...current,
                        [shot.id]: event.target.value,
                      }))}
                      placeholder="必须填写需要修改的画面、人物、构图或风格…"
                      className="w-full resize-none rounded border border-warn/25 bg-white px-2 py-1 text-[9px] outline-none"
                    />
                    <div className="mt-1 flex justify-end gap-1">
                      <button type="button" onClick={() => setEditingShotId(null)} className="px-1.5 py-1 text-[8px] text-ink/40">取消</button>
                      <button
                        type="button"
                        disabled={!rejectionDrafts[shot.id]?.trim()}
                        onClick={() => void rejectShot(shot, false)}
                        className="rounded border border-warn/25 px-1.5 py-1 text-[8px] text-warn disabled:opacity-35"
                      >仅保存意见</button>
                      <button
                        type="button"
                        disabled={!rejectionDrafts[shot.id]?.trim()}
                        onClick={() => void rejectShot(shot, true)}
                        className="rounded bg-warn px-1.5 py-1 text-[8px] text-white disabled:opacity-35"
                      >保存并重生</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {summary && (
        <div className="rounded-lg bg-ink/5 p-2">
          <p className="font-medium text-ink/80 mb-1">结论摘要</p>
          <p className="text-ink/60">{summary}</p>
        </div>
      )}
      {issues && issues.length > 0 && (
        <div className="space-y-1 mt-2">
          <p className="font-medium text-ink/80 text-xs">问题列表（{issues.length}）</p>
          {issues.map((issue, i) => (
            <div key={i} className="rounded-lg bg-warn/5 border border-warn/20 p-2 text-warn/80">
              {issue.message}
            </div>
          ))}
        </div>
      )}
      {!isReviewGate && !summary && !issues && (
        <p className="text-ink/40">暂无报告数据。运行节点后查看分析结果。</p>
      )}
    </ComposerWorkspaceShell>
  );
}
