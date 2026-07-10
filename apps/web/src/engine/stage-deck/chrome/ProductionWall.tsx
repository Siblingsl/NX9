import { useCallback, useMemo } from 'react';
import { AlertTriangle, Film, Loader2 } from 'lucide-react';
import { useExecutionQueue } from '../../../stores/execution-queue';
import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { useStoryboardUi, useRemotionUi } from '../../../stores/flow-runtime';
import { useContextRailUi } from '../stores/context-rail-ui';

export function ProductionWall() {
  const phase = useExecutionQueue((s) => s.phase);
  const progress = useExecutionQueue((s) => s.progress);
  const currentLabel = useExecutionQueue((s) => s.currentLabel);
  const shots = useWorkspaceDocument((s) => s.storyboard.shots);
  const setOpen = useStoryboardUi((s) => s.setOpen);
  const selectShot = useStoryboardUi((s) => s.selectShot);
  const requestScroll = useStoryboardUi((s) => s.requestScrollToShot);
  const isBlocked = useContextRailUi((s) => s.banner?.kind === 'blocked');

  const pendingShots = useMemo(
    () => shots.filter((s) => s.status !== 'approved'),
    [shots],
  );

  const approvedCount =
    phase === 'running' || isBlocked
      ? shots.filter((s) => s.status === 'approved').length
      : 0;
  const totalShots = shots.length;

  const handleReview = useCallback(() => {
    setOpen(true);
    const firstUnapproved = shots.find((s) => s.status !== 'approved');
    if (firstUnapproved) {
      selectShot(firstUnapproved.id);
      requestScroll(firstUnapproved.id);
    }
  }, [shots, setOpen, selectShot, requestScroll]);

  if (!isBlocked && phase !== 'running') return null;

  if (isBlocked) {
    return (
      <div className="nx9-status-chip nx9-status-chip--warn">
        <AlertTriangle size={12} className="shrink-0" />
        <span className="font-medium">审阅阻塞</span>
        <span className="text-ink/45 hidden sm:inline">{pendingShots.length} 镜待审</span>
        <button type="button" onClick={handleReview} className="text-brand hover:underline ml-0.5">
          去审阅
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => useRemotionUi.getState().setOpen(true)}
      className="nx9-status-chip nx9-status-chip--running"
      title={currentLabel ?? undefined}
    >
      <Loader2 size={12} className="shrink-0 animate-spin" />
      <span className="tabular-nums">
        {progress.done}/{progress.total}
      </span>
      {currentLabel && (
        <span className="hidden xl:inline truncate max-w-[120px] text-ink/45">{currentLabel}</span>
      )}
      <span className="text-ink/40 hidden sm:inline">
        · 审阅 {approvedCount}/{totalShots}
      </span>
      <Film size={11} className="shrink-0 opacity-50 ml-0.5" />
    </button>
  );
}
