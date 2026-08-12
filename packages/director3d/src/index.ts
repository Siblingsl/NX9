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
  Director3dCommittedSceneSnapshot,
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
  applySceneTemplateToShotState,
  restoreCommittedSnapshot,
  applyCandidateUploadResult,
  quarantineDirector3dShotStates,
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
  NX9_SCULPT_MESH_CONTRACT,
  P1_VIEWPORT_PARAM_IDS,
  assertSculptMeshContract,
  isP1ViewportParam,
  type SculptCompatibilityReport,
  type SculptModelSource,
} from './sculpt/sculpt-contract';
export { applyFaceRigToObject, readBoneScale, readMorphInfluence } from './sculpt/apply-face-rig';
export { createBareSculptRoot, createProxyCharacter } from './sculpt/procedural-body';
export { createProxyHeadMesh } from './sculpt/procedural-head';
export { CharacterSculptViewport } from './sculpt/CharacterSculptViewport';
export type { CharacterSculptViewportHandle } from './sculpt/CharacterSculptViewport';
export { CharacterSculptScene } from './sculpt/CharacterSculptScene';
export type { SculptViewState } from './sculpt/CharacterSculptScene';
export {
  exportProjectJson,
  importProjectJson,
  exportSceneTemplateJson,
  importSceneTemplateJson,
} from './io/projectIo';

/** @deprecated use DirectorProject */
export type Director3dScene = DirectorProject;
export { emptyDirectorProject as emptyDirector3dScene } from './schema/directorProject';
