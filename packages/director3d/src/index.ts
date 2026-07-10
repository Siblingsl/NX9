import type { DirectorProject } from './schema/directorProject';

export type { Director3dHostOptions, Director3dMountHandle, Director3dCapturePayload, Director3dPerformanceMode } from './bridge/types';
export type {
  DirectorProject,
  DirectorObject,
  DirectorCameraShot,
  DirectorCameraCapture,
  ViewportAspectRatio,
  ViewMode,
} from './schema/directorProject';
export {
  emptyDirectorProject,
  normalizeDirectorProject,
} from './schema/directorProject';
export { buildCameraPrompt } from './schema/cameraGeometry';
export { POSE_PRESETS, BODY_TYPES, lookupPose, lookupBody } from './presets/characterPresets';
export { Director3dShell, Director3dViewport } from './app/Director3dShell';
export { DirectorCanvas } from './canvas/DirectorCanvas';
export { useDirectorStore } from './store/directorStore';
export { mountDirector3d } from './mount';
export { isWebGLAvailable } from './util/webgl';
export { exportProjectJson, importProjectJson } from './io/projectIo';

/** @deprecated use DirectorProject */
export type Director3dScene = DirectorProject;
export { emptyDirectorProject as emptyDirector3dScene } from './schema/directorProject';
