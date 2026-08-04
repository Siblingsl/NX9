import type { DirectorProject } from './schema/directorProject';

export type {
  Director3dHostOptions,
  Director3dMountHandle,
  Director3dCapturePayload,
  Director3dPerformanceMode,
  Director3dShotContext,
  Director3dShotListItem,
} from './bridge/types';
export type {
  DirectorProject,
  DirectorObject,
  DirectorCameraShot,
  DirectorCameraCapture,
  DirectorTransform,
  CharacterBodyType,
  ViewportAspectRatio,
  ViewMode,
  Director3dCandidate,
  Director3dCandidateStatus,
  Director3dCommitPayload,
  Director3dSceneTemplate,
  Director3dShotState,
  DirectorShotCamera,
} from './schema/directorProject';
export {
  emptyDirectorProject,
  normalizeDirectorProject,
  emptyShotState,
  normalizeShotState,
  projectFromSceneTemplate,
  projectFromShotState,
  sceneTemplateFromProject,
  shotStateFromProject,
} from './schema/directorProject';
export { buildCameraPrompt } from './schema/cameraGeometry';
export { POSE_PRESETS, BODY_TYPES, lookupPose, lookupBody } from './presets/characterPresets';
export { Director3dShell, Director3dViewport } from './app/Director3dShell';
export { DirectorCanvas } from './canvas/DirectorCanvas';
export { useDirectorStore } from './store/directorStore';
export { mountDirector3d } from './mount';
export { isWebGLAvailable } from './util/webgl';
export {
  exportProjectJson,
  importProjectJson,
  exportSceneTemplateJson,
  importSceneTemplateJson,
} from './io/projectIo';

/** @deprecated use DirectorProject */
export type Director3dScene = DirectorProject;
export { emptyDirectorProject as emptyDirector3dScene } from './schema/directorProject';
