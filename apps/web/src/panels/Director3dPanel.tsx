import { useEffect } from 'react';
import { resolvePerfToast } from '@nx9/shared';
import { Director3dHostController } from '../engine/director3d-host-controller';
import { useActivityLog } from '../stores/activity-log';
import { useDirector3dUi } from '../stores/director3d-ui';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useToast } from '../stores/toast';
import { useWorkspaceDocument } from '../stores/workspace-document';

/** 全屏容器；chain、shot、存储、上传与提交均由唯一 3D host 处理。 */
export function Director3dPanel() {
  const open = useDirector3dUi((state) => state.open);
  const blockId = useDirector3dUi((state) => state.blockId);
  const linkedShotId = useDirector3dUi((state) => state.linkedShotId);
  const initialProject = useDirector3dUi((state) => state.project);
  const close = useDirector3dUi((state) => state.close);
  const selectShot = useDirector3dUi((state) => state.selectShot);
  const runtime = useFlowRuntime((state) => state.runtime);
  const appendLog = useActivityLog((state) => state.append);
  const characters = useWorkspaceDocument(
    (state) => state.characters.characters,
  );
  const nodes = runtime?.getNodes() ?? [];
  const edges = runtime?.getEdges() ?? [];
  const graphNodeCount = nodes.length;
  const graphEdgeCount = edges.length;
  const thresholdToast = resolvePerfToast(graphNodeCount, graphEdgeCount);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, open]);

  // F-012: 仅计数达阈值才提示「3D 预览已降质」，不因制作模式 forced intensive 误报
  useEffect(() => {
    if (!open) return;
    const toast = resolvePerfToast(graphNodeCount, graphEdgeCount);
    if (!toast) return;
    useToast.getState().push({
      id: 'director3d-perf',
      message: '3D 预览已降质',
      variant: 'info',
    });
  }, [open, graphNodeCount, graphEdgeCount]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <Director3dHostController
        contextBlockId={blockId ?? '__standalone__'}
        requestedShotId={linkedShotId}
        initialProject={initialProject}
        nodes={nodes}
        edges={edges}
        getNodes={() => runtime?.getNodes() ?? []}
        updateNodeData={(id, patch) => runtime?.updateNodeData(id, patch)}
        characters={characters}
        appendLog={appendLog}
        onSelectShot={selectShot}
        onClose={close}
        performanceMode={thresholdToast ? 'low' : 'normal'}
        nodeCount={graphNodeCount}
      />
    </div>
  );
}
