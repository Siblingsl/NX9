import { useWorkspaceDocument } from '../../../stores/workspace-document';
import { CanvasFlowRail } from './CanvasFlowRail';

export function PipelineCapsule() {
  const session = useWorkspaceDocument((s) => s.playbookSession);

  if (session && !session.dismissed) return null;

  return <CanvasFlowRail />;
}
