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
  DirectorLight,
  DirectorLightRole,
  DirectorLightType,
  SceneSettings,
  CharacterBodyType,
  ViewportAspectRatio,
  ViewMode,
  Director3dCandidate,
  Director3dCandidateStatus,
  Director3dCameraKey,
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
  syncShotStateWithProject,
  coerceDirectorLights,
  cameraKeysFromProject,
  cameraKeysFromCameras,
  directorCamerasFromCameraKeys,
  coerceCameraKeys,
  shotCameraEquals,
  createDefaultSceneLights,
  createDefaultScene,
  resolveAmbientIntensity,
  DEFAULT_SCENE,
  DEFAULT_SCENE_LIGHTS,
  DEFAULT_AMBIENT_INTENSITY,
  DEFAULT_EXPOSURE,
  PANORAMA_AMBIENT_INTENSITY,
  DIRECTOR_LIGHT_TYPES,
} from './schema/directorProject';
export { buildCameraPrompt, describeCameraShot, getOrbit, setOrbit, angleLabel, shotLabel, focalLengthMm, fovFromFocalMm, applyOrbitToCamera, interpolateCamera, viewLabel, DEFAULT_PROMPT_DETAILS, PROMPT_DETAIL_LABELS } from './schema/cameraGeometry';
export type { CameraMoveId, CameraOrbit, BuildCameraPromptOptions, PromptDetailFlags } from './schema/cameraGeometry';
export { skinCameraPrompt, PROMPT_PLATFORMS } from './schema/promptSkin';
export type { PromptPlatformId } from './schema/promptSkin';
export { buildTimelineKeys, sampleTimeline } from './ui/ShotPreviewTimeline';
export {
  MOVE_TIMELINE_CAMERA_PREFIX,
  buildCameraMoveKeyframes,
  describeMoveTimelinePlan,
  moveTimelineToDirectorCameras,
  sampleCameraMoveTimeline,
} from './schema/cameraMoveTimelineKeys';
export type {
  CameraMoveDelta,
  CameraMoveKeyframe,
  CameraMoveKeyframeScale,
  CameraMoveTimelineSampleResult,
} from './schema/cameraMoveTimelineKeys';
export { useMoveTimelineStore } from './store/moveTimelineStore';
export type { MoveTimelineStoreState } from './store/moveTimelineStore';
export {
  MOTION_CAMERA_PREFIX,
  MOTION_FOV_MAX,
  MOTION_FOV_MIN,
  MOTION_FRAMES_MAX,
  MOTION_FRAMES_MIN,
  MOTION_AMPLITUDE_MAX,
  MOTION_AMPLITUDE_MIN,
  applyMotionToShotState,
  buildMotionCameraKeys,
  buildMotionCameraPrompt,
  buildMotionKeyframes,
  buildMotionPreview,
  countMotionCameras,
  describeMotionPlan,
  isMotionlessSpec,
  isProxyMotion,
  motionDeltaPhrases,
  motionJitterSample,
  motionKeysToMoveKeyframes,
  motionProxyNote,
  motionToCameraMoveTimeline,
  resolveMotionSpec,
} from './schema/cameraMoveMotion';
export type {
  BuildMotionKeyframesOptions,
  CameraMoveMotionPlan,
  CameraMoveMotionPreview,
  CameraMoveMotionSpec,
  MotionChannelDelta,
  MotionJitterAmplitude,
  MotionRepresentation,
  ResolveMotionSpecOptions,
} from './schema/cameraMoveMotion';
export { CameraMoveLibraryPanel, groupCameraMovesByFamily, resolveMoveLibraryScope } from './ui/CameraMoveLibraryPanel';
export { listQuadPanes } from './canvas/DirectorCanvas';
export type { StageQuadPane, StageMobileSheet, StageInteractionMode, StageViewportLayout } from './store/directorStore';
export { POSE_PRESETS, BODY_TYPES, lookupPose, lookupBody, mergePose, setJointAxis, POSE_JOINT_SLIDERS } from './presets/characterPresets';
export type { PosePreset, PoseJointKey, PoseJointOverride } from './presets/characterPresets';
export {
  KEY_LIGHT_PRESETS,
  KEY_LIGHT_AZIMUTHS,
  KEY_LIGHT_ELEVATIONS,
  RIM_LIGHT_PRESETS,
  AMBIENT_PRESETS,
  LIGHTING_RIG_PRESETS,
  lookupKeyLightPreset,
  lookupRimLightPreset,
  lookupLightingRigPreset,
  keyLightPresetAt,
  resolveRigLights,
  lightFromPreset,
  lightPosition,
  azimuthLabel,
  describeDirectorLight,
  buildLightingPromptFragment,
  buildSceneLightingPrompt,
  defaultLightingFallback,
} from './presets/lightingPresets';
export type {
  DirectorLightPreset,
  LightingRigPreset,
  LightingRigLightRef,
  LightingPromptOptions,
  SceneLightingSlice,
} from './presets/lightingPresets';
export {
  BUILTIN_ASSETS,
  BUILTIN_ASSET_CATEGORIES,
  builtinAssetsByCategory,
  lookupBuiltinAsset,
  resolvePartArgs,
} from './presets/builtinAssets';
export type {
  BuiltinAssetDef,
  BuiltinAssetPart,
  BuiltinAssetCategory,
  BuiltinPartGeometry,
} from './presets/builtinAssets';
export { BUILTIN_SCENES, applyBuiltinScene, lookupBuiltinScene } from './presets/builtinScenes';
export type { BuiltinSceneDef, BuiltinSceneObjectSpec, ApplyBuiltinSceneOptions } from './presets/builtinScenes';
export { BuiltinPropMesh, BuiltinAssetMesh } from './runtime/BuiltinPropMesh';
export { LightingPanel } from './panels/LightingPanel';
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
export {
  NX9_CHARACTER_BASE_GLB_URL,
  NX9_CHARACTER_BASE_MANIFEST_URL,
  loadCharacterModel,
  validateCharacterAssetManifest,
  type CharacterModelLoadResult,
  type LoadCharacterModelOptions,
  type Nx9CharacterAssetManifest,
} from './sculpt/character-model-loader';
export {
  MATERIAL_DRIVERS,
  MATERIAL_DRIVER_PARAM_IDS,
  applyMaterialDriver,
  collectMaterialChannels,
  hasMaterialChannel,
  type MaterialDriverDef,
} from './sculpt/material-drivers';
export { computeStageBodyScales, type StageBodyScales } from './runtime/stage-body-bridge';
export { applyPoseToArmature } from './runtime/stage-actor-pose';
export { applyFaceRigToObject, readBoneScale, readMorphInfluence } from './sculpt/apply-face-rig';
export { createBareSculptRoot, createProxyCharacter } from './sculpt/procedural-body';
export { createProxyHeadMesh } from './sculpt/procedural-head';
export { createCharacterBaseModel } from './sculpt/procedural-base-model';
export { packMpfbIntoCharacterBase } from './sculpt/pack-mpfb-character-base';
export {
  CANONICAL_FACE_VIEW_WIDTH,
  CANONICAL_FACE_VIEW_HEIGHT,
  SCULPT_CAMERA_PRESETS,
  applyCameraPreset,
  createCanonicalFaceCamera,
  type SculptCameraPresetId,
} from './sculpt/sculpt-cameras';
export {
  SCULPT_HANDLES,
  applyHandleDrag,
  clampFaceRigValue,
  handleDefById,
  handleDefByName,
  type SculptHandleDef,
  type SculptHandleDragAxis,
  type SculptHandleSide,
} from './sculpt/sculpt-handles';
export { createSculptLights } from './sculpt/sculpt-lights';
export { CharacterSculptViewport } from './sculpt/CharacterSculptViewport';
export type { CharacterSculptViewportHandle } from './sculpt/CharacterSculptViewport';
export { CharacterSculptScene } from './sculpt/CharacterSculptScene';
export type { SculptViewState } from './sculpt/CharacterSculptScene';
export type { CharacterModelLoadOutcome } from './sculpt/CharacterSculptScene';
export {
  exportProjectJson,
  importProjectJson,
  exportSceneTemplateJson,
  importSceneTemplateJson,
} from './io/projectIo';

/** @deprecated use DirectorProject */
export type Director3dScene = DirectorProject;
export { emptyDirectorProject as emptyDirector3dScene } from './schema/directorProject';
export { BlockingPresetPanel } from './ui/BlockingPresetPanel';
