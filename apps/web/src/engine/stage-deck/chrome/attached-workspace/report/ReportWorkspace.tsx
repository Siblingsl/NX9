import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  activeEpisodeShots,
  appendStoryboardReviewEvent,
  filterStoryboardGuideOverlay,
  resolveStoryboardGuideOverlay,
  STORYBOARD_GUIDE_KINDS,
  type StoryboardReviewStage,
  type StoryboardShot,
} from '@nx9/shared';
import { ComposerWorkspaceShell } from '../composer/ComposerWorkspaceShell';
import { useDeckUi } from '../../../stores/deck-ui';
import { useAttachedNodeData } from '../generation/use-attached-node-data';
import { useWorkspaceDocument } from '../../../../../stores/workspace-document';
import { useFlowRuntime } from '../../../../../stores/flow-runtime';
import { useStoryboardGuidePrefs } from '../../../../../stores/storyboard-guide-prefs';
import { batchGenerateKeyframesFromShots } from '../../../../core-pipeline-runner';
import { resolveStoryboardBoardMeta } from '../storyboard-preview/storyboard-board-meta';
import { StoryboardGuideOverlayView } from '../storyboard-preview/StoryboardGuideOverlay';
import '../../../../../styles/storyboard-board.css';

export interface ReportWorkspaceProps {
  blockId: string;
  kind: string;
  onCollapse?: () => void;
}

function lastRejectedComment(shot: StoryboardShot, stage: 'keyframe' | 'video'): string | undefined {
  return [...(shot.reviewHistory ?? [])]
    .reverse()
    .find((event) => event.stage === stage && event.decision === 'rejected')
    ?.comment ?? undefined;
}

function shotMediaUrl(shot: StoryboardShot, isVideo: boolean): string | null {
  if (isVideo) return shot.videoAssetId || shot.firstFrameAssetId || null;
  return shot.firstFrameAssetId || null;
}

function isShotApproved(shot: StoryboardShot, isVideo: boolean): boolean {
  return isVideo
    ? shot.videoStatus === 'approved'
    : shot.keyframeStatus === 'approved';
}

function hasShotMedia(shot: StoryboardShot, isVideo: boolean): boolean {
  return isVideo ? Boolean(shot.videoAssetId) : Boolean(shot.firstFrameAssetId);
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
  const gateMode: StoryboardReviewStage =
    (data.gateMode as string | undefined) === 'video' ? 'video' : 'keyframe';
  const isVideo = gateMode === 'video';
  const stage: StoryboardReviewStage = gateMode;
  const storyboard = useWorkspaceDocument((state) => state.storyboard);
  const shots = useMemo(() => activeEpisodeShots(storyboard), [storyboard]);
  const updateShot = useWorkspaceDocument((state) => state.updateShot);
  const runtime = useFlowRuntime((state) => state.runtime);
  const guideShowOverlay = useStoryboardGuidePrefs((s) => s.showOverlay);
  const guideKindsMap = useStoryboardGuidePrefs((s) => s.kinds);
  const setGuideShowOverlay = useStoryboardGuidePrefs((s) => s.setShowOverlay);
  const guideKinds = useMemo(
    () => STORYBOARD_GUIDE_KINDS.filter((k) => guideKindsMap[k] !== false),
    [guideKindsMap],
  );
  const [regeneratingShotId, setRegeneratingShotId] = useState<string | null>(null);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [rejectionDrafts, setRejectionDrafts] = useState<Record<string, string>>({});
  const isReviewGate = kind === 'review-gate';

  const counts = useMemo(() => {
    if (!isReviewGate) return { missing: 0, pending: 0, approved: 0 };
    let missing = 0;
    let pending = 0;
    let approved = 0;
    for (const shot of shots) {
      if (!hasShotMedia(shot, isVideo)) missing += 1;
      else if (isShotApproved(shot, isVideo)) approved += 1;
      else pending += 1;
    }
    return { missing, pending, approved };
  }, [isReviewGate, isVideo, shots]);

  const allApproved =
    isReviewGate &&
    shots.length > 0 &&
    counts.missing === 0 &&
    counts.pending === 0 &&
    counts.approved === shots.length;

  useEffect(() => {
    if (!allApproved || data.gatePassed === true) return;
    runtime?.updateNodeData(blockId, {
      status: 'success',
      gatePassed: true,
      pendingShots: [],
      meta: { gatePassed: true, gateMode },
    });
  }, [allApproved, blockId, data.gatePassed, gateMode, runtime]);

  const focusPreview = useCallback(() => {
    const preview = runtime?.getNodes().find((node) => node.type === 'storyboard-preview');
    if (preview) runtime?.focusBlock(preview.id);
  }, [runtime]);

  const approveShot = useCallback(
    (shot: StoryboardShot) => {
      const event = {
        id: `review-${shot.id}-${Date.now()}`,
        stage,
        decision: 'approved' as const,
        createdAt: new Date().toISOString(),
      };
      if (isVideo) {
        updateShot(shot.id, {
          status: 'approved',
          videoStatus: 'approved',
          reviewHistory: appendStoryboardReviewEvent(shot, event),
        });
      } else {
        updateShot(shot.id, {
          status: 'approved',
          keyframeStatus: 'approved',
          keyframeReviewNote: null,
          reviewHistory: appendStoryboardReviewEvent(shot, event),
        });
      }
    },
    [isVideo, stage, updateShot],
  );

  const rejectShot = useCallback(
    async (shot: StoryboardShot, regenerate: boolean) => {
      const comment = (rejectionDrafts[shot.id] ?? shot.keyframeReviewNote ?? '').trim();
      if (!comment) return;
      const event = {
        id: `review-${shot.id}-${Date.now()}`,
        stage,
        decision: 'rejected' as const,
        comment,
        createdAt: new Date().toISOString(),
      };
      runtime?.updateNodeData(blockId, { status: 'blocked', gatePassed: false });
      if (isVideo) {
        updateShot(shot.id, {
          status: 'failed',
          videoStatus: 'failed',
          reviewHistory: appendStoryboardReviewEvent(shot, event),
        });
      } else {
        updateShot(shot.id, {
          status: 'failed',
          keyframeStatus: 'failed',
          keyframeReviewNote: comment,
          reviewHistory: appendStoryboardReviewEvent(shot, event),
        });
      }
      setEditingShotId(null);
      if (!regenerate || isVideo) return;
      setRegeneratingShotId(shot.id);
      try {
        await batchGenerateKeyframesFromShots([shot.id], true);
      } finally {
        setRegeneratingShotId(null);
      }
    },
    [blockId, isVideo, rejectionDrafts, runtime, stage, updateShot],
  );

  const approveAll = useCallback(() => {
    if (!isReviewGate || shots.length === 0 || counts.missing > 0) return;
    for (const shot of shots) {
      if (!isShotApproved(shot, isVideo) && hasShotMedia(shot, isVideo)) {
        approveShot(shot);
      }
    }
    runtime?.updateNodeData(blockId, {
      status: 'success',
      gatePassed: true,
      pendingShots: [],
      meta: { gatePassed: true, gateMode },
    });
  }, [approveShot, blockId, counts.missing, gateMode, isReviewGate, isVideo, runtime, shots]);

  const gateTitle = isVideo ? '成片批审' : '分镜批审';

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
      heightClass={
        isReviewGate
          ? 'h-[min(560px,62vh)] max-h-[600px]'
          : 'h-[min(420px,50vh)] max-h-[460px]'
      }
      bodyClassName="flex-1 min-h-0 px-3 py-2.5 overflow-y-auto nowheel overscroll-contain text-xs"
    >
      {isReviewGate && (
        <div className="flex h-full min-h-0 flex-col gap-2">
          <div className="shrink-0 rounded-lg border border-line/40 bg-surface/30 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink/80">{gateTitle}</p>
                <p className="mt-1 text-[10px] text-ink/45">
                  共 {shots.length} 镜 · 待审 {counts.pending} ·{' '}
                  {isVideo ? '缺片' : '缺图'} {counts.missing}
                  {counts.approved > 0 ? ` · 已过 ${counts.approved}` : ''}
                </p>
              </div>
              {allApproved && (
                <span className="rounded-md bg-ok/15 px-2 py-0.5 text-[10px] text-ok">已全部通过</span>
              )}
            </div>
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
                disabled={shots.length === 0 || counts.missing > 0 || counts.pending === 0}
                onClick={approveAll}
                className="flex-1 rounded-lg bg-brand py-1.5 text-[10px] text-white disabled:opacity-40"
              >
                全部通过
              </button>
            </div>
            {counts.missing > 0 && (
              <p className="mt-1.5 text-[9px] text-warn">
                请先补齐全部{isVideo ? '成片' : '分镜图'}，再执行批量通过。
              </p>
            )}
          </div>

          <div className="sb-board min-h-0 flex-1 overflow-y-auto nx9-scroll pr-0.5">
            {!isVideo && (
              <div className="sb-guide-legend shrink-0 sticky top-0 z-10">
                <button
                  type="button"
                  onClick={() => setGuideShowOverlay(!guideShowOverlay)}
                  className={`sb-guide-toggle ${guideShowOverlay ? 'is-on' : ''}`}
                >
                  导引 {guideShowOverlay ? '开' : '关'}
                </button>
              </div>
            )}
            {shots.length === 0 ? (
              <p className="py-8 text-center text-[11px] text-ink/35">故事板暂无镜头</p>
            ) : (
              <div className="sb-board-grid is-cols-3">
                {shots.map((shot) => {
                  const media = shotMediaUrl(shot, isVideo);
                  const approved = isShotApproved(shot, isVideo);
                  const hasMedia = hasShotMedia(shot, isVideo);
                  const note = shot.keyframeReviewNote;
                  const lastNote = lastRejectedComment(shot, stage);
                  const editing = editingShotId === shot.id;
                  const board = resolveStoryboardBoardMeta(shot);
                  const guide = filterStoryboardGuideOverlay(
                    resolveStoryboardGuideOverlay(shot),
                    { enabled: guideShowOverlay && !isVideo, kinds: guideKinds },
                  );
                  return (
                    <div
                      key={shot.id}
                      className={`sb-cell ${approved ? 'is-selected' : ''} ${!hasMedia ? 'is-checked' : ''}`}
                      style={
                        approved
                          ? { borderColor: 'color-mix(in srgb, var(--desk-ok, #4a8a62) 70%, #2c2c2c)' }
                          : !hasMedia
                            ? { borderColor: 'color-mix(in srgb, #c05621 55%, #2c2c2c)' }
                            : undefined
                      }
                    >
                      <div className="sb-cell__head">
                        <span className="sb-cell__index">{board.index}.</span>
                        <span className="sb-cell__title" title={board.title}>
                          {board.title}
                        </span>
                      </div>
                      <div className="sb-cell__art">
                        {media ? (
                          isVideo && shot.videoAssetId ? (
                            <video src={shot.videoAssetId} muted playsInline preload="metadata" />
                          ) : (
                            <img src={media} alt={`镜头 ${shot.index + 1}`} />
                          )
                        ) : (
                          <div className="sb-cell__art-empty">{isVideo ? '缺片' : '缺图'}</div>
                        )}
                        {!isVideo && media && (guide.arrows.length > 0 || guide.marks.length > 0) && (
                          <StoryboardGuideOverlayView overlay={guide} />
                        )}
                        {board.dialogue && (
                          <div className="sb-cell__bubble is-tr">
                            {board.dialogue.length > 40 ? `${board.dialogue.slice(0, 40)}…` : board.dialogue}
                          </div>
                        )}
                        <span
                          className={`sb-cell__status ${
                            approved
                              ? 'bg-ok/90 text-white'
                              : !hasMedia
                                ? 'bg-warn/90 text-white'
                                : 'bg-black/50 text-white/90'
                          }`}
                        >
                          {approved
                            ? '已过'
                            : !hasMedia
                              ? isVideo
                                ? '缺片'
                                : '缺图'
                              : (isVideo ? shot.videoStatus : shot.keyframeStatus) ?? 'draft'}
                        </span>
                      </div>
                      <div className="sb-cell__foot">
                        {board.chips.length > 0 && (
                          <div className="sb-cell__chips">
                            {board.chips.map((chip) => (
                              <span
                                key={`${chip.tone}-${chip.text}`}
                                className={`sb-cell__chip is-${chip.tone}`}
                              >
                                {chip.text}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="sb-cell__body">{board.body || '（无描述）'}</p>
                        {note && <p className="sb-cell__chip is-grade">修改：{note}</p>}
                        {!note && lastNote && (
                          <p className="sb-cell__chip is-note">上次：{lastNote}</p>
                        )}
                      </div>
                      <div className="flex gap-1 px-1.5 pb-1.5">
                        <button
                          type="button"
                          disabled={!hasMedia || approved}
                          onClick={() => approveShot(shot)}
                          className="flex-1 rounded-md border border-ok/25 py-1 text-[9px] text-ok disabled:opacity-35"
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
                          className="flex-1 rounded-md border border-warn/25 py-1 text-[9px] text-warn disabled:opacity-35"
                        >
                          {regeneratingShotId === shot.id ? '重生中' : '退回'}
                        </button>
                      </div>
                      {editing && (
                        <div className="mx-1.5 mb-1.5 rounded-md bg-warn/5 p-1.5">
                          <textarea
                            autoFocus
                            rows={2}
                            value={rejectionDrafts[shot.id] ?? ''}
                            onChange={(event) =>
                              setRejectionDrafts((current) => ({
                                ...current,
                                [shot.id]: event.target.value,
                              }))
                            }
                            placeholder="必须填写修改意见…"
                            className="w-full resize-none rounded border border-warn/25 bg-white px-2 py-1 text-[9px] outline-none"
                          />
                          <div className="mt-1 flex flex-wrap justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingShotId(null)}
                              className="px-1.5 py-1 text-[8px] text-ink/40"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              disabled={!rejectionDrafts[shot.id]?.trim()}
                              onClick={() => void rejectShot(shot, false)}
                              className="rounded border border-warn/25 px-1.5 py-1 text-[8px] text-warn disabled:opacity-35"
                            >
                              仅保存意见
                            </button>
                            {!isVideo && (
                              <button
                                type="button"
                                disabled={!rejectionDrafts[shot.id]?.trim()}
                                onClick={() => void rejectShot(shot, true)}
                                className="rounded bg-warn px-1.5 py-1 text-[8px] text-white disabled:opacity-35"
                              >
                                保存并重生
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {summary && (
        <div className="rounded-lg bg-ink/5 p-2">
          <p className="mb-1 font-medium text-ink/80">结论摘要</p>
          <p className="text-ink/60">{summary}</p>
        </div>
      )}
      {issues && issues.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium text-ink/80">问题列表（{issues.length}）</p>
          {issues.map((issue, i) => (
            <div key={i} className="rounded-lg border border-warn/20 bg-warn/5 p-2 text-warn/80">
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
