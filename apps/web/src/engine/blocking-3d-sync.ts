import { useWorkspaceDocument } from '../stores/workspace-document';
import { useFlowRuntime } from '../stores/flow-runtime';

/**
 * Sync camera data from blocking-stage node to Director3D node.
 * When a blocking-stage node has camera presets, push them to the linked Director3D.
 */
export function syncBlockingToDirector3d(): void {
  const runtime = useFlowRuntime.getState().runtime;
  if (!runtime) return;
  
  const nodes = runtime.getNodes();
  const blockingNode = nodes.find(n => n.type === 'blocking-stage');
  const director3dNode = nodes.find(n => n.type === 'director-3d');
  
  if (!blockingNode || !director3dNode) return;
  
  const cameraPreset = (blockingNode.data as any)?.cameraPreset;
  const cameraPosition = (blockingNode.data as any)?.cameraPosition;
  const cameraRotation = (blockingNode.data as any)?.cameraRotation;
  
  if (cameraPosition || cameraRotation) {
    runtime.updateNodeData(director3dNode.id, {
      importedCamera: {
        position: cameraPosition,
        rotation: cameraRotation,
        preset: cameraPreset,
      },
    });
  }
}

/**
 * Sync Director3D camera export back to blocking-stage.
 * Called after Director3D captures/exports camera.
 */
export function syncDirector3dToBlocking(cameraJson: string): void {
  const runtime = useFlowRuntime.getState().runtime;
  if (!runtime) return;
  
  const nodes = runtime.getNodes();
  const blockingNode = nodes.find(n => n.type === 'blocking-stage');
  if (!blockingNode) return;
  
  try {
    const camera = JSON.parse(cameraJson);
    runtime.updateNodeData(blockingNode.id, {
      importedFromDirector3d: camera,
      cameraPosition: camera.position,
      cameraRotation: camera.rotation,
    });
  } catch {
    // Not JSON — ignore
  }
}
