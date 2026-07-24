import { useFlowRuntime } from '../stores/flow-runtime';
import { useFlowCommands } from '../stores/flow-commands';
import type { StoryboardShot } from '@nx9/shared';

export function spawnCameraBlocksForShots(
  mode: '3d' | 'live',
  shots: StoryboardShot[],
): void {
  if (mode === 'live') {
    const runtime = useFlowRuntime.getState().runtime;
    if (!runtime) return;

    for (const shot of shots) {
      const approved =
        shot.keyframeStatus === 'approved' ||
        shot.status === 'approved';
      if (!approved || !shot.firstFrameAssetId) continue;

      runtime.spawnBlockForShot(shot.id, 'director-desk');
    }
    return;
  }

  useFlowCommands.getState().requestSpawn('director-desk');
}
