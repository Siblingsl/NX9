import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { useStoryboardUi } from '../../../stores/flow-runtime';
import { useViewMode } from '../stores/view-mode';
import { useContextRailUi } from '../stores/context-rail-ui';

/** 审阅关卡阻塞时：切审片模式 + 故事板网格 + 定位首个待审镜头 */
export function openReviewGateSession(pendingIndices?: number[]) {
  useViewMode.getState().setMode('review');
  useStoryboardUi.getState().setOpen(true);
  useStoryboardUi.getState().setView('grid');
  useContextRailUi.getState().requestTab('storyboard');

  if (!pendingIndices?.length) return;

  const shots = useWorkspaceDocument.getState().storyboard.shots;
  const first = shots.find((s) => pendingIndices.includes(s.index));
  if (!first) return;

  useStoryboardUi.getState().selectShot(first.id);
  useStoryboardUi.getState().requestScrollToShot(first.id);
}
