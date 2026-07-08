import { Vector3 } from 'three';
import type { DirectorCameraShot } from './directorProject';

export interface CameraViewSnapshot {
  fov: number;
  position: [number, number, number];
  target: [number, number, number];
}

export const DEFAULT_DIRECTOR_VIEW: CameraViewSnapshot = {
  fov: 50,
  position: [0, 1.55, 5.4],
  target: [0, 1.05, 0],
};

const FRUSTUM_DEPTH = 1.8;

export function getCameraViewFromShot(camera: DirectorCameraShot): CameraViewSnapshot {
  const rig = new Vector3(...camera.transform.position);
  const target = new Vector3(...camera.target);
  const forward = target.clone().sub(rig).normalize();
  const viewPos = rig.clone().add(forward.multiplyScalar(FRUSTUM_DEPTH));
  return {
    fov: camera.fov,
    position: [viewPos.x, viewPos.y, viewPos.z],
    target: camera.target,
  };
}

export function buildCameraPrompt(camera: DirectorCameraShot): string {
  const [x, y, z] = camera.transform.position;
  const [tx, ty, tz] = camera.target;
  return `Camera shot "${camera.name}", FOV ${camera.fov}°, position (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}), looking at (${tx.toFixed(1)}, ${ty.toFixed(1)}, ${tz.toFixed(1)})`;
}
