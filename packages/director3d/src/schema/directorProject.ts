export type ViewMode = 'director' | 'camera';
export type TransformMode = 'translate' | 'rotate' | 'scale';
export type DirectorObjectKind = 'character' | 'prop' | 'mesh';
export type GeometryPrimitiveType = 'box' | 'sphere' | 'cylinder' | 'cone';
export type ViewportAspectRatio = '16:9' | '9:16' | '1:1';
export type CharacterBodyType =
  | 'neutral'
  | 'slim'
  | 'broad'
  | 'tall'
  | 'compact'
  | 'child'
  | 'hero'
  | 'actor';

export interface DirectorTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface SceneSettings {
  backgroundColor: string;
  showGround: boolean;
  groundOpacity: number;
  snapToGrid: boolean;
  showGrid: boolean;
  ruleOfThirds: boolean;
}

export interface DirectorAsset {
  id: string;
  kind: 'mesh' | 'panorama';
  name: string;
  url: string;
  fileName?: string;
}

export interface PanoramaSettings {
  url: string;
  yaw: number;
  exposure: number;
}

export interface DirectorObject {
  id: string;
  name: string;
  kind: DirectorObjectKind;
  /** 绑定工作区角色，便于按分镜恢复人物摆位。 */
  sourceCharacterId?: string;
  visible: boolean;
  locked: boolean;
  transform: DirectorTransform;
  color?: string;
  geometryType?: GeometryPrimitiveType;
  bodyType?: CharacterBodyType;
  posePresetId?: string;
  assetId?: string;
  meshUrl?: string;
  crowdGroupId?: string;
}

export interface DirectorCameraCapture {
  id: string;
  index: number;
  name: string;
  dataUrl?: string;
  imageUrl?: string;
  cameraPrompt?: string;
  cameraPosition?: [number, number, number];
  cameraRotation?: [number, number, number];
  cameraFov?: number;
  createdAt: number;
}

export interface DirectorCameraShot {
  id: string;
  name: string;
  fov: number;
  transform: DirectorTransform;
  target: [number, number, number];
  captures: DirectorCameraCapture[];
}

export type Director3dCandidateStatus = 'capturing' | 'uploading' | 'ready' | 'failed' | 'committed';

export interface DirectorShotCamera {
  position: [number, number, number];
  target: [number, number, number];
  rotation: [number, number, number];
  fov: number;
  aspectRatio: ViewportAspectRatio;
  move?: string | null;
}

export interface Director3dCandidate {
  id: string;
  shotId: string;
  stateVersion: number;
  imageUrl?: string;
  localDataUrl?: string;
  camera: DirectorShotCamera;
  characterPlacements: Array<{
    objectId?: string;
    characterId?: string;
    name: string;
    position: [number, number, number];
    rotation: [number, number, number];
    scale?: [number, number, number];
    bodyType?: CharacterBodyType;
    posePresetId?: string;
  }>;
  prompt: string;
  status: Director3dCandidateStatus;
  error?: string;
  createdAt: string;
}

export interface Director3dSceneTemplate {
  id: string;
  version: number;
  name: string;
  environment: {
    panoramaUrl?: string;
    backgroundColor: string;
    ground: { visible: boolean; opacity: number };
    lights: Array<{
      id: string;
      type: 'ambient' | 'directional';
      intensity: number;
      position?: [number, number, number];
    }>;
  };
  assets: Array<{ id: string; url: string; name: string; kind: 'mesh' | 'panorama' }>;
  objects: Array<{
    id: string;
    name: string;
    assetId?: string;
    kind: 'prop' | 'mesh';
    transform: DirectorTransform;
    visible: boolean;
    locked: boolean;
  }>;
  updatedAt: string;
}

export interface Director3dShotState {
  version: 2;
  stateVersion: number;
  shotId: string;
  episodeId?: string | null;
  sourceChainDeskId?: string;
  sourceShotRevision?: number;
  sceneTemplateId?: string | null;
  environment: {
    panoramaUrl?: string;
    backgroundColor: string;
    groundVisible: boolean;
    groundOpacity: number;
    lightingPresetId?: string;
  };
  objects: DirectorObject[];
  camera: DirectorShotCamera;
  candidates: Director3dCandidate[];
  selectedCandidateId?: string | null;
  committedCandidateId?: string | null;
  dirty: boolean;
  updatedAt: string;
}

export interface Director3dCommitPayload {
  version: 1;
  commitId: string;
  blockId?: string;
  shotId: string;
  episodeId?: string | null;
  sourceShotRevision?: number;
  candidate: Director3dCandidate;
  sceneState: Director3dShotState;
  committedAt: string;
}

export interface DirectorProject {
  version: 1;
  viewportAspectRatio: ViewportAspectRatio;
  scene: SceneSettings;
  assets: DirectorAsset[];
  panorama: PanoramaSettings | null;
  objects: DirectorObject[];
  cameras: DirectorCameraShot[];
  activeCameraId: string | null;
}

export const DEFAULT_TRANSFORM: DirectorTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};

export const DEFAULT_SCENE: SceneSettings = {
  backgroundColor: '#12141a',
  showGround: true,
  groundOpacity: 0.75,
  snapToGrid: true,
  showGrid: true,
  ruleOfThirds: false,
};

export function emptyDirectorProject(): DirectorProject {
  const camId = `cam-${Date.now()}`;
  return {
    version: 1,
    viewportAspectRatio: '16:9',
    scene: { ...DEFAULT_SCENE },
    assets: [],
    panorama: null,
    objects: [],
    cameras: [
      {
        id: camId,
        name: '主镜头',
        fov: 50,
        transform: { position: [0, 1.6, 5], rotation: [0, 0, 0], scale: [1, 1, 1] },
        target: [0, 1, 0],
        captures: [],
      },
    ],
    activeCameraId: camId,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function shotStateFromProject(
  project: DirectorProject,
  shotId: string,
  options?: Pick<Director3dShotState, 'episodeId' | 'sourceChainDeskId' | 'sourceShotRevision' | 'sceneTemplateId'>,
): Director3dShotState {
  const camera = project.cameras.find((item) => item.id === project.activeCameraId) ?? project.cameras[0];
  const fallback = camera ?? emptyDirectorProject().cameras[0];
  return {
    version: 2,
    stateVersion: 0,
    shotId,
    episodeId: options?.episodeId,
    sourceChainDeskId: options?.sourceChainDeskId,
    sourceShotRevision: options?.sourceShotRevision,
    sceneTemplateId: options?.sceneTemplateId,
    environment: {
      panoramaUrl: project.panorama?.url,
      backgroundColor: project.scene.backgroundColor,
      groundVisible: project.scene.showGround,
      groundOpacity: project.scene.groundOpacity,
    },
    objects: clone(project.objects),
    camera: {
      position: clone(fallback.transform.position),
      target: clone(fallback.target),
      rotation: clone(fallback.transform.rotation),
      fov: fallback.fov,
      aspectRatio: project.viewportAspectRatio,
    },
    candidates: [],
    selectedCandidateId: null,
    committedCandidateId: null,
    dirty: false,
    updatedAt: new Date().toISOString(),
  };
}

export function projectFromShotState(state: Director3dShotState, base?: DirectorProject): DirectorProject {
  const project = clone(base ?? emptyDirectorProject());
  const active = project.cameras.find((item) => item.id === project.activeCameraId) ?? project.cameras[0];
  const camera: DirectorCameraShot = {
    id: active?.id ?? `cam-${state.shotId}`,
    name: active?.name ?? '主镜头',
    fov: state.camera.fov,
    transform: {
      position: clone(state.camera.position),
      rotation: clone(state.camera.rotation),
      scale: [1, 1, 1],
    },
    target: clone(state.camera.target),
    captures: [],
  };
  return {
    ...project,
    version: 1,
    viewportAspectRatio: state.camera.aspectRatio,
    scene: {
      ...project.scene,
      backgroundColor: state.environment.backgroundColor,
      showGround: state.environment.groundVisible,
      groundOpacity: state.environment.groundOpacity,
    },
    panorama: state.environment.panoramaUrl
      ? { url: state.environment.panoramaUrl, yaw: project.panorama?.yaw ?? 0, exposure: project.panorama?.exposure ?? 1 }
      : null,
    objects: clone(state.objects),
    cameras: [camera],
    activeCameraId: camera.id,
  };
}

export function emptyShotState(shotId: string, project?: DirectorProject): Director3dShotState {
  return shotStateFromProject(project ?? emptyDirectorProject(), shotId);
}

export function normalizeShotState(raw: unknown, shotId: string, fallbackProject?: DirectorProject): Director3dShotState {
  if (raw && typeof raw === 'object') {
    const input = raw as Partial<Director3dShotState>;
    if (input.version === 2 && input.shotId === shotId && input.camera && Array.isArray(input.objects)) {
      const fallback = emptyShotState(shotId, fallbackProject);
      return {
        ...fallback,
        ...clone(input as Director3dShotState),
        stateVersion: typeof input.stateVersion === 'number' ? input.stateVersion : fallback.stateVersion,
        environment: { ...fallback.environment, ...(input.environment ?? {}) },
        objects: clone(input.objects),
        candidates: clone(input.candidates ?? []),
      };
    }
  }
  return emptyShotState(shotId, fallbackProject);
}

export function sceneTemplateFromProject(project: DirectorProject, name: string): Director3dSceneTemplate {
  return {
    id: `scene-template-${Date.now().toString(36)}`,
    version: 1,
    name: name.trim() || 'NX9 场景模板',
    environment: {
      panoramaUrl: project.panorama?.url,
      backgroundColor: project.scene.backgroundColor,
      ground: { visible: project.scene.showGround, opacity: project.scene.groundOpacity },
      lights: [
        { id: 'ambient', type: 'ambient', intensity: project.panorama ? 0.35 : 0.55 },
        { id: 'key', type: 'directional', intensity: 0.9, position: [5, 10, 4] },
      ],
    },
    assets: clone(project.assets),
    objects: clone(project.objects)
      .filter((object) => object.kind !== 'character')
      .map((object) => ({
        id: object.id,
        name: object.name,
        assetId: object.assetId,
        kind: object.kind === 'mesh' ? 'mesh' : 'prop',
        transform: clone(object.transform),
        visible: object.visible,
        locked: object.locked,
      })),
    updatedAt: new Date().toISOString(),
  };
}

export function projectFromSceneTemplate(template: Director3dSceneTemplate): DirectorProject {
  const project = emptyDirectorProject();
  return {
    ...project,
    scene: {
      ...project.scene,
      backgroundColor: template.environment.backgroundColor,
      showGround: template.environment.ground.visible,
      groundOpacity: template.environment.ground.opacity,
    },
    panorama: template.environment.panoramaUrl
      ? { url: template.environment.panoramaUrl, yaw: 0, exposure: 1 }
      : null,
    assets: clone(template.assets),
    objects: clone(template.objects).map((object) => ({
      ...object,
      kind: object.kind,
      visible: object.visible,
      locked: object.locked,
    })),
  };
}

export function normalizeDirectorProject(raw: unknown): DirectorProject {
  if (!raw || typeof raw !== 'object') return emptyDirectorProject();
  const r = raw as Record<string, unknown>;
  if (r.version === 1 && Array.isArray(r.cameras)) {
    const p = r as unknown as DirectorProject;
    return {
      ...emptyDirectorProject(),
      ...p,
      assets: p.assets ?? [],
      panorama: p.panorama ?? null,
      scene: { ...DEFAULT_SCENE, ...p.scene },
    };
  }
  if (r.version === 1 && Array.isArray(r.objects) && !r.cameras) {
    const base = emptyDirectorProject();
    return {
      ...base,
      viewportAspectRatio: (r.aspectRatio as ViewportAspectRatio) ?? '16:9',
      objects: (r.objects as Array<{ kind?: string } & Omit<DirectorObject, 'kind'>>)
        .filter((o) => o.kind !== 'camera')
        .map((o) => ({ ...o, kind: (o.kind ?? 'prop') as DirectorObject['kind'] })),
    };
  }
  return emptyDirectorProject();
}
