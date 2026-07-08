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
