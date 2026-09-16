export type ViewMode = 'director' | 'camera';
export type TransformMode = 'translate' | 'rotate' | 'scale';
import type { CharacterFaceRig } from '@nx9/shared';
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

export type DirectorLightRole = 'key' | 'fill' | 'rim' | 'ambient' | 'practical';
export type DirectorLightType = 'directional' | 'spot' | 'point' | 'ambient';

export const DIRECTOR_LIGHT_TYPES: DirectorLightType[] = ['directional', 'spot', 'point', 'ambient'];

/**
 * 导演台场景灯。位置用球坐标表达，保证可序列化、面板可精确回读。
 * azimuth 0° = 主体正前方（默认机位同侧），俯视顺时针；elevation 为仰角；distance 单位米。
 */
export interface DirectorLight {
  id: string;
  name: string;
  role: DirectorLightRole;
  type: DirectorLightType;
  azimuth: number;
  elevation: number;
  distance: number;
  intensity: number;
  /** hex 颜色 */
  color: string;
  /** 聚光灯锥角（度），仅 type='spot' 有效 */
  coneAngle?: number;
  /** 聚光灯边缘羽化 0~1，仅 type='spot' 有效 */
  penumbra?: number;
  castShadow: boolean;
  visible: boolean;
}

export interface SceneSettings {
  backgroundColor: string;
  showGround: boolean;
  groundOpacity: number;
  snapToGrid: boolean;
  showGrid: boolean;
  ruleOfThirds: boolean;
  /** 场景灯光组；为空表示使用默认两灯兜底 */
  lights: DirectorLight[];
  /** 全局环境光基线强度（独立于 lights 内的 ambient 灯） */
  ambientIntensity: number;
  /** 渲染器曝光 */
  exposure: number;
  /** 当前生效的整组布光方案 id；手动改灯后置空 */
  lightingPresetId?: string | null;
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
  /** B4：捏模参数快照；导演台人偶按 faceRig.body 缩放，无需重查素材库。 */
  faceRig?: CharacterFaceRig;
  visible: boolean;
  locked: boolean;
  transform: DirectorTransform;
  color?: string;
  geometryType?: GeometryPrimitiveType;
  bodyType?: CharacterBodyType;
  posePresetId?: string;
  /** Relative joint offsets (deg) on top of posePresetId. */
  poseJoints?: Partial<
    Record<'body' | 'torso' | 'head' | 'armL' | 'armR' | 'legL' | 'legR', [number, number, number]>
  >;
  assetId?: string;
  meshUrl?: string;
  /** 内置程序化模型 id，见 presets/builtinAssets.ts；与 meshUrl 互斥 */
  builtinAssetId?: string;
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
  cameraTarget?: [number, number, number];
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

/**
 * 镜头态里的一帧机位关键帧（一镜多机位 / 多关键帧）。
 *
 * - `id` 与 `DirectorCameraShot.id` 对齐：还原时按它重建 `project.cameras` 并由
 *   `Director3dShotState.activeCameraKeyId` 指认当前激活机位；
 * - `t` 是该机位在机位序列里的**归一化时间位**（0..1，首帧 0、末帧 1，按序列线性均分）。
 *   真实秒数 / 缓动 / 速度曲线属于会话级运镜时间轴（`useMoveTimelineStore`），
 *   不写进镜头态，避免落一份与时间轴不同步的假时间；
 * - `name` 只为还原机位名（如运镜时间轴生成的「缓推」）。
 */
export interface Director3dCameraKey {
  id: string;
  t: number;
  camera: DirectorShotCamera;
  name?: string;
}

export interface Director3dCandidate {
  id: string;
  name?: string;
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
    poseJoints?: DirectorObject['poseJoints'];
  }>;
  prompt: string;
  status: Director3dCandidateStatus;
  error?: string;
  createdAt: string;
  committedAt?: string;
  commitId?: string;
}

export interface Director3dCommittedSceneSnapshot {
  stateVersion: number;
  candidateId: string;
  environment: Director3dShotState['environment'];
  objects: DirectorObject[];
  camera: DirectorShotCamera;
  /** 提交时的机位关键帧序列；旧快照缺省 → 按单机位恢复（与老行为一致）。 */
  cameraKeys?: Director3dCameraKey[];
  activeCameraKeyId?: string | null;
  committedAt: string;
}

export interface Director3dSceneTemplate {
  id: string;
  version: number;
  name: string;
  environment: {
    panoramaUrl?: string;
    backgroundColor: string;
    ground: { visible: boolean; opacity: number };
    /** 完整灯光组；旧模板的 {id,type,intensity,position} 会在读取时升级 */
    lights: DirectorLight[];
    ambientIntensity?: number;
    exposure?: number;
    lightingPresetId?: string | null;
  };
  assets: Array<{ id: string; url: string; name: string; kind: 'mesh' | 'panorama' }>;
  objects: Array<{
    id: string;
    name: string;
    assetId?: string;
    builtinAssetId?: string;
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
    /** 完整灯光组；缺省时按老数据兜底（环境基线 + 默认主光） */
    lights?: DirectorLight[];
    ambientIntensity?: number;
    exposure?: number;
  };
  objects: DirectorObject[];
  /** 当前 / 激活机位（既有字段，语义不变）。`cameraKeys` 非空时它与其中一帧对应。 */
  camera: DirectorShotCamera;
  /**
   * 一镜多机位关键帧序列（可选，向后兼容）。
   *
   * - 缺省 / 空数组：按单机位处理，行为与老 `version:2` 数据完全一致；
   * - 非空：`projectFromShotState` 按它还原 `project.cameras` 多机位，
   *   `camera` 始终是激活那一帧的权威姿态（`projectFromShotState` 用它覆盖激活帧）。
   */
  cameraKeys?: Director3dCameraKey[];
  /** 激活机位对应的 key id；缺失 / 不在序列内 → 按「与 `camera` 姿态一致 → 首帧」回落。 */
  activeCameraKeyId?: string | null;
  candidates: Director3dCandidate[];
  selectedCandidateId?: string | null;
  committedCandidateId?: string | null;
  committedSnapshot?: Director3dCommittedSceneSnapshot | null;
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

/**
 * 老版本硬编码的两灯（ambient 0.35/0.55 + directional [5,10,4] 强度 0.9）等价换算。
 * 球坐标换算：az = atan2(5, 4) ≈ 51.34°，el = atan2(10, √41) ≈ 57.40°，d = √141 ≈ 11.87。
 */
export const DEFAULT_SCENE_LIGHTS: DirectorLight[] = [
  {
    id: 'default-key',
    name: '主光（默认）',
    role: 'key',
    type: 'directional',
    azimuth: 51.34,
    elevation: 57.4,
    distance: 11.87,
    intensity: 0.9,
    color: '#ffffff',
    castShadow: true,
    visible: true,
  },
];

export const DEFAULT_AMBIENT_INTENSITY = 0.55;
export const DEFAULT_EXPOSURE = 1;
/** 有全景背景时老版本的更低环境基线，用于老数据升级。 */
export const PANORAMA_AMBIENT_INTENSITY = 0.35;

export function createDefaultSceneLights(): DirectorLight[] {
  return DEFAULT_SCENE_LIGHTS.map((light) => ({ ...light }));
}

export const DEFAULT_SCENE: SceneSettings = {
  backgroundColor: '#12141a',
  showGround: true,
  groundOpacity: 0.75,
  snapToGrid: true,
  showGrid: true,
  ruleOfThirds: false,
  lights: createDefaultSceneLights(),
  ambientIntensity: DEFAULT_AMBIENT_INTENSITY,
  exposure: DEFAULT_EXPOSURE,
  lightingPresetId: null,
};

/** 每次返回全新对象，避免多个 project / shot 共享同一组灯引用。 */
export function createDefaultScene(): SceneSettings {
  return { ...DEFAULT_SCENE, lights: createDefaultSceneLights() };
}

function isDirectorLightShape(raw: unknown): raw is Partial<DirectorLight> {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return typeof r.role === 'string' && typeof r.azimuth === 'number' && typeof r.type === 'string';
}

function lightFromLegacyPosition(entry: Record<string, unknown>, index: number): DirectorLight {
  const type = entry.type === 'ambient' ? 'ambient' : 'directional';
  const position = Array.isArray(entry.position) ? (entry.position as number[]) : [5, 10, 4];
  const [x, y, z] = [Number(position[0]) || 0, Number(position[1]) || 0, Number(position[2]) || 0];
  const flat = Math.sqrt(x * x + z * z);
  const distance = Math.max(0.1, Math.sqrt(flat * flat + y * y));
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : `legacy-light-${index}`,
    name: type === 'ambient' ? '环境光（升级）' : '主光（升级）',
    role: type === 'ambient' ? 'ambient' : 'key',
    type,
    azimuth: flat < 1e-6 ? 0 : (Math.atan2(x, z) * 180) / Math.PI,
    elevation: (Math.asin(Math.max(-1, Math.min(1, y / distance))) * 180) / Math.PI,
    distance: type === 'ambient' ? 0 : distance,
    intensity: typeof entry.intensity === 'number' ? entry.intensity : 0.9,
    color: '#ffffff',
    castShadow: type !== 'ambient',
    visible: true,
  };
}

/**
 * 宽容读取灯光数组：支持当前结构、旧模板 {id,type,intensity,position}，非法输入返回 undefined。
 */
export function coerceDirectorLights(raw: unknown): DirectorLight[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  if (raw.length === 0) return [];
  return raw.map((entry, index) => {
    if (isDirectorLightShape(entry)) {
      const light = entry as DirectorLight;
      return {
        id: typeof light.id === 'string' && light.id ? light.id : `light-${index}`,
        name: typeof light.name === 'string' && light.name ? light.name : `灯光 ${index + 1}`,
        role: light.role,
        type: light.type,
        azimuth: Number.isFinite(light.azimuth) ? light.azimuth : 0,
        elevation: Number.isFinite(light.elevation) ? light.elevation : 0,
        distance: Number.isFinite(light.distance) ? light.distance : 3,
        intensity: Number.isFinite(light.intensity) ? light.intensity : 1,
        color: typeof light.color === 'string' && light.color ? light.color : '#ffffff',
        ...(Number.isFinite(light.coneAngle) ? { coneAngle: light.coneAngle } : {}),
        ...(Number.isFinite(light.penumbra) ? { penumbra: light.penumbra } : {}),
        castShadow: light.castShadow !== false,
        visible: light.visible !== false,
      };
    }
    return lightFromLegacyPosition((entry ?? {}) as Record<string, unknown>, index);
  });
}

/** 读取环境光基线：老数据缺字段时按「有无全景」复现旧视觉。 */
export function resolveAmbientIntensity(raw: unknown, panoramaUrl?: string): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return panoramaUrl ? PANORAMA_AMBIENT_INTENSITY : DEFAULT_AMBIENT_INTENSITY;
}

export function emptyDirectorProject(): DirectorProject {
  const camId = `cam-${Date.now()}`;
  return {
    version: 1,
    viewportAspectRatio: '16:9',
    scene: createDefaultScene(),
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

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function isAspectRatio(value: unknown): value is ViewportAspectRatio {
  return value === '16:9' || value === '9:16' || value === '1:1';
}

function isFiniteTriple(raw: unknown): raw is [number, number, number] {
  return (
    Array.isArray(raw)
    && raw.length === 3
    && raw.every((value) => typeof value === 'number' && Number.isFinite(value))
  );
}

function tripleEquals(a: unknown, b: unknown, epsilon: number): boolean {
  if (!isFiniteTriple(a) || !isFiniteTriple(b)) return false;
  return a.every((value, index) => Math.abs(value - b[index]!) <= epsilon);
}

/** 两份机位姿态是否等价（位置 / 朝向 / 视线目标 / 视野）。 */
export function shotCameraEquals(a: unknown, b: unknown, epsilon = 1e-6): boolean {
  if (!a || typeof a !== 'object' || !b || typeof b !== 'object') return false;
  const left = a as DirectorShotCamera;
  const right = b as DirectorShotCamera;
  return (
    tripleEquals(left.position, right.position, epsilon)
    && tripleEquals(left.target, right.target, epsilon)
    && tripleEquals(left.rotation, right.rotation, epsilon)
    && typeof left.fov === 'number'
    && typeof right.fov === 'number'
    && Math.abs(left.fov - right.fov) <= epsilon
  );
}

/**
 * 宽容读取一份 `DirectorShotCamera`：
 * `position` / `target` / `fov` 非法视为整体非法（返回 undefined，由调用方丢弃该帧）；
 * `rotation` 缺省补零、`aspectRatio` 缺省用兜底（都不影响机位是否可用）。
 */
function coerceShotCamera(
  raw: unknown,
  fallbackAspectRatio: ViewportAspectRatio,
): DirectorShotCamera | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  if (!isFiniteTriple(record.position) || !isFiniteTriple(record.target)) return undefined;
  if (typeof record.fov !== 'number' || !Number.isFinite(record.fov)) return undefined;
  return {
    position: clone(record.position),
    target: clone(record.target),
    rotation: isFiniteTriple(record.rotation) ? clone(record.rotation) : [0, 0, 0],
    fov: record.fov,
    aspectRatio: isAspectRatio(record.aspectRatio) ? record.aspectRatio : fallbackAspectRatio,
    ...(typeof record.move === 'string' || record.move === null
      ? { move: record.move as string | null }
      : {}),
  };
}

/** 机位姿态 → `DirectorCameraShot` 的几何部分（不含 id / name / captures）。 */
function poseFromShotCamera(camera: DirectorShotCamera) {
  return {
    fov: camera.fov,
    transform: {
      position: clone(camera.position),
      rotation: clone(camera.rotation),
      scale: [1, 1, 1] as [number, number, number],
    },
    target: clone(camera.target),
  };
}

/**
 * 机位序列 → 关键帧序列。`t` 为序列内的归一化时间位（首 0、末 1、线性均分）。
 * 真实秒数属会话级运镜时间轴，不写入镜头态（见 `Director3dCameraKey` 注释）。
 */
export function cameraKeysFromCameras(
  cameras: DirectorCameraShot[],
  aspectRatio: ViewportAspectRatio,
): Director3dCameraKey[] {
  const list = Array.isArray(cameras) ? cameras : [];
  const last = Math.max(1, list.length - 1);
  return list.map((camera, index) => ({
    id: typeof camera.id === 'string' && camera.id ? camera.id : `camkey-${index + 1}`,
    t: list.length <= 1 ? 0 : index / last,
    camera: {
      position: clone(camera.transform.position),
      target: clone(camera.target),
      rotation: clone(camera.transform.rotation),
      fov: camera.fov,
      aspectRatio,
    },
    name: camera.name,
  }));
}

/**
 * `project.cameras` → 关键帧序列。
 * 只有一个机位时返回空数组：单机位沿用既有的 `camera` 字段，落盘形状与老数据一致。
 */
export function cameraKeysFromProject(project: DirectorProject): Director3dCameraKey[] {
  const cameras = Array.isArray(project.cameras) ? project.cameras : [];
  if (cameras.length <= 1) return [];
  return cameraKeysFromCameras(cameras, project.viewportAspectRatio);
}

/** 关键帧序列 → `project.cameras`（captures 不入镜头态，按既有口径置空）。 */
export function directorCamerasFromCameraKeys(keys: Director3dCameraKey[]): DirectorCameraShot[] {
  return keys.map((key, index) => ({
    id: key.id,
    name: key.name?.trim() ? key.name : `关键帧机位 ${index + 1}`,
    ...poseFromShotCamera(key.camera),
    captures: [],
  }));
}

/**
 * 宽容读取关键帧数组（与 `coerceDirectorLights` 同一口径）：
 * - 整体不是数组 → undefined（调用方按缺省处理）；
 * - 条目缺合法机位 → 丢弃该帧（非法裁剪）；
 * - `t` 非有限 → 按序补位、越界 → 裁到 [0,1]；按 `t` 升序后重排为均分位，
 *   保证「`t` = 序列内归一化索引」这一不变式，读写往返稳定；
 * - `id` 缺失 / 重复 → 重编，避免还原出同 id 机位。
 */
export function coerceCameraKeys(
  raw: unknown,
  fallbackAspectRatio: ViewportAspectRatio = '16:9',
): Director3dCameraKey[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  if (raw.length === 0) return [];
  const staged: Array<{ key: Director3dCameraKey; rawT: number }> = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const record = entry as Record<string, unknown>;
    const camera = coerceShotCamera(record.camera, fallbackAspectRatio);
    if (!camera) return;
    const rawT = typeof record.t === 'number' && Number.isFinite(record.t)
      ? clamp01(record.t)
      : index / Math.max(1, raw.length - 1);
    const name = typeof record.name === 'string' && record.name.trim() ? record.name : undefined;
    staged.push({
      key: {
        id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `camkey-${index + 1}`,
        t: rawT,
        camera,
        ...(name ? { name } : {}),
      },
      rawT,
    });
  });
  if (staged.length === 0) return [];
  staged.sort((a, b) => a.rawT - b.rawT);
  const seen = new Set<string>();
  const last = Math.max(1, staged.length - 1);
  return staged.map((item, index) => {
    let id = item.key.id;
    if (seen.has(id)) {
      let suffix = 2;
      while (seen.has(`${item.key.id}-${suffix}`)) suffix += 1;
      id = `${item.key.id}-${suffix}`;
    }
    seen.add(id);
    return { ...item.key, id, t: staged.length <= 1 ? 0 : index / last };
  });
}

/** 单机位口径（老行为）：机位 id / name 沿用基准项目的激活机位。 */
function buildSingleShotCamera(
  state: Director3dShotState,
  baseId?: string,
  baseName?: string,
): DirectorCameraShot {
  return {
    id: baseId ?? `cam-${state.shotId}`,
    name: baseName ?? '主镜头',
    ...poseFromShotCamera(state.camera),
    captures: [],
  };
}

/**
 * `cameraKeys` 非空时按它还原多机位与激活机位；为空 / 无有效帧时返回 null（走老单机位口径）。
 *
 * 激活机位判定顺序：`activeCameraKeyId` → 与 `camera` 姿态一致的那一帧 → 首帧。
 * 激活帧的姿态一律以 `camera` 为准（`camera` 是既有字段，始终代表当前 / 激活机位），
 * 于是「只改 `camera` 的写入方」（如 Agent 摆位）不会与机位序列打架，也不会凭空多出一台机位。
 */
function camerasFromCameraKeys(
  state: Director3dShotState,
): { cameras: DirectorCameraShot[]; active: DirectorCameraShot } | null {
  const keys = coerceCameraKeys(
    state.cameraKeys,
    isAspectRatio(state.camera?.aspectRatio) ? state.camera.aspectRatio : '16:9',
  ) ?? [];
  if (keys.length === 0) return null;
  const cameras = directorCamerasFromCameraKeys(keys);
  const requested = typeof state.activeCameraKeyId === 'string' && state.activeCameraKeyId
    ? keys.findIndex((key) => key.id === state.activeCameraKeyId)
    : -1;
  const byPose = requested < 0 ? keys.findIndex((key) => shotCameraEquals(key.camera, state.camera)) : -1;
  const index = requested >= 0 ? requested : byPose >= 0 ? byPose : 0;
  const refreshed = coerceShotCamera(state.camera, keys[index]!.camera.aspectRatio);
  const active: DirectorCameraShot = {
    ...cameras[index]!,
    ...(refreshed ? poseFromShotCamera(refreshed) : {}),
  };
  cameras[index] = active;
  return { cameras, active };
}

export function shotStateFromProject(
  project: DirectorProject,
  shotId: string,
  options?: Pick<Director3dShotState, 'episodeId' | 'sourceChainDeskId' | 'sourceShotRevision' | 'sceneTemplateId'>,
): Director3dShotState {
  const camera = project.cameras.find((item) => item.id === project.activeCameraId) ?? project.cameras[0];
  const fallback = camera ?? emptyDirectorProject().cameras[0];
  // 多机位才落 keys：单机位沿用 camera 字段，落盘形状与老数据一致（向后兼容 + 最小体积）。
  const cameraKeys = cameraKeysFromProject(project);
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
      lightingPresetId: project.scene.lightingPresetId ?? undefined,
      lights: clone(project.scene.lights),
      ambientIntensity: project.scene.ambientIntensity,
      exposure: project.scene.exposure,
    },
    objects: clone(project.objects),
    camera: {
      position: clone(fallback.transform.position),
      target: clone(fallback.target),
      rotation: clone(fallback.transform.rotation),
      fov: fallback.fov,
      aspectRatio: project.viewportAspectRatio,
    },
    cameraKeys,
    activeCameraKeyId: cameraKeys.length === 0
      ? null
      : cameraKeys.some((key) => key.id === fallback.id)
        ? fallback.id
        : cameraKeys[0]!.id,
    candidates: [],
    selectedCandidateId: null,
    committedCandidateId: null,
    committedSnapshot: null,
    dirty: false,
    updatedAt: new Date().toISOString(),
  };
}

export function projectFromShotState(state: Director3dShotState, base?: DirectorProject): DirectorProject {
  const project = clone(base ?? emptyDirectorProject());
  const baseActive = project.cameras.find((item) => item.id === project.activeCameraId) ?? project.cameras[0];
  const restored = camerasFromCameraKeys(state);
  const camera = restored?.active ?? buildSingleShotCamera(state, baseActive?.id, baseActive?.name);
  // 画幅：合法值原样透传（行为不变）；镜头态 / 基准工程带脏值时回落，避免把非法画幅写进工程。
  const baseAspectRatio = isAspectRatio(project.viewportAspectRatio) ? project.viewportAspectRatio : '16:9';
  const viewportAspectRatio = isAspectRatio(state.camera.aspectRatio)
    ? state.camera.aspectRatio
    : baseAspectRatio;
  return {
    ...project,
    version: 1,
    viewportAspectRatio,
    scene: {
      ...project.scene,
      backgroundColor: state.environment.backgroundColor,
      showGround: state.environment.groundVisible,
      groundOpacity: state.environment.groundOpacity,
      lights: coerceDirectorLights(state.environment.lights) ?? createDefaultSceneLights(),
      ambientIntensity: resolveAmbientIntensity(state.environment.ambientIntensity, state.environment.panoramaUrl),
      exposure:
        typeof state.environment.exposure === 'number' && Number.isFinite(state.environment.exposure)
          ? state.environment.exposure
          : DEFAULT_EXPOSURE,
      lightingPresetId: state.environment.lightingPresetId ?? null,
    },
    panorama: state.environment.panoramaUrl
      ? { url: state.environment.panoramaUrl, yaw: project.panorama?.yaw ?? 0, exposure: project.panorama?.exposure ?? 1 }
      : null,
    objects: clone(state.objects),
    cameras: restored?.cameras ?? [camera],
    activeCameraId: camera.id,
  };
}

export function emptyShotState(shotId: string, project?: DirectorProject): Director3dShotState {
  return shotStateFromProject(project ?? emptyDirectorProject(), shotId);
}

/**
 * 把导演台工程「当前状态」同步进镜头态 —— 落盘前的唯一映射（脏标记由调用方补，`updatedAt` 由本函数刷新）。
 *
 * 与 `shotStateFromProject` 的区别：只覆盖场景 / 物体 / 机位部分，保留 `candidates` 等既有字段。
 * 落盘口径：
 * - `camera` = 「当前（激活）机位」，即 `project.activeCameraId` 指向的机位（缺失时取首个）；
 *   与 `handleCapture` 取候选帧机位的口径一致，因此提交载荷里 `candidate.camera` 与 `sceneState.camera` 同源；
 * - `cameraKeys` = 完整机位序列（多机位才写，单机位保持老形状），联动镜模式下由此跨会话保留一镜多机位；
 * - `activeCameraKeyId` = 激活机位对应的 key id；
 * - 机位自身 `move` 等既有字段按 `{...state.camera, ...}` 语义保留。
 */
export function syncShotStateWithProject(
  state: Director3dShotState,
  project: DirectorProject,
): Director3dShotState {
  const active = project.cameras.find((item) => item.id === project.activeCameraId) ?? project.cameras[0];
  const cameraKeys = cameraKeysFromProject(project);
  return {
    ...state,
    environment: {
      ...state.environment,
      panoramaUrl: project.panorama?.url,
      backgroundColor: project.scene.backgroundColor,
      groundVisible: project.scene.showGround,
      groundOpacity: project.scene.groundOpacity,
      lights: clone(project.scene.lights),
      ambientIntensity: project.scene.ambientIntensity,
      exposure: project.scene.exposure,
      lightingPresetId: project.scene.lightingPresetId ?? undefined,
    },
    objects: clone(project.objects),
    camera: active
      ? {
        ...state.camera,
        position: clone(active.transform.position),
        rotation: clone(active.transform.rotation),
        target: clone(active.target),
        fov: active.fov,
        aspectRatio: project.viewportAspectRatio,
      }
      : state.camera,
    cameraKeys,
    activeCameraKeyId: cameraKeys.length === 0 || !active
      ? null
      : cameraKeys.some((key) => key.id === active.id)
        ? active.id
        : cameraKeys[0]!.id,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 宽容读取镜头态。
 *
 * 向后兼容：老 `version:2` 数据（只有 `camera`、没有 `cameraKeys`）会补上 `cameraKeys: []` 与
 * `activeCameraKeyId: null`，其余字段（objects / environment / candidates / committedSnapshot）
 * 原样保留，不丢不损。`cameraKeys` 非法时按 `coerceCameraKeys` 裁剪，绝不影响场景数据。
 */
export function normalizeShotState(raw: unknown, shotId: string, fallbackProject?: DirectorProject): Director3dShotState {
  if (raw && typeof raw === 'object') {
    const input = raw as Partial<Director3dShotState>;
    if (input.version === 2 && input.shotId === shotId && input.camera && Array.isArray(input.objects)) {
      const fallback = emptyShotState(shotId, fallbackProject);
      const env: Partial<Director3dShotState['environment']> = input.environment ?? {};
      const cameraKeys = coerceCameraKeys(
        input.cameraKeys,
        isAspectRatio(input.camera.aspectRatio) ? input.camera.aspectRatio : fallback.camera.aspectRatio,
      ) ?? [];
      const requestedKeyId = typeof input.activeCameraKeyId === 'string' && input.activeCameraKeyId
        ? input.activeCameraKeyId
        : null;
      const activeCameraKeyId = cameraKeys.length === 0
        ? null
        : cameraKeys.some((key) => key.id === requestedKeyId)
          ? requestedKeyId
          : (cameraKeys.find((key) => shotCameraEquals(key.camera, input.camera))?.id ?? cameraKeys[0]!.id);
      return {
        ...fallback,
        ...clone(input as Director3dShotState),
        cameraKeys,
        activeCameraKeyId,
        stateVersion: typeof input.stateVersion === 'number' ? input.stateVersion : fallback.stateVersion,
        environment: {
          ...fallback.environment,
          ...env,
          lights: coerceDirectorLights(env.lights) ?? clone(fallback.environment.lights ?? createDefaultSceneLights()),
          ambientIntensity: resolveAmbientIntensity(env.ambientIntensity, env.panoramaUrl ?? fallback.environment.panoramaUrl),
          exposure:
            typeof env.exposure === 'number' && Number.isFinite(env.exposure)
              ? env.exposure
              : fallback.environment.exposure ?? DEFAULT_EXPOSURE,
          lightingPresetId: typeof env.lightingPresetId === 'string' ? env.lightingPresetId : fallback.environment.lightingPresetId,
        },
        objects: clone(input.objects),
        candidates: clone(input.candidates ?? []),
      };
    }
  }
  return emptyShotState(shotId, fallbackProject);
}

/**
 * 抽出场景模板：只包含环境 / 布光 / 资产 / 非角色道具。
 *
 * 机位与关键帧序列**不进模板**（最小必要）：模板描述的是「场地」，机位是每个镜头自己的取景；
 * 若模板带机位，套模板就会覆盖当前镜头的关键帧序列。`Director3dSceneTemplate` 因此不变。
 */
export function sceneTemplateFromProject(project: DirectorProject, name: string): Director3dSceneTemplate {
  return {
    id: `scene-template-${Date.now().toString(36)}`,
    version: 1,
    name: name.trim() || 'NX9 场景模板',
    environment: {
      panoramaUrl: project.panorama?.url,
      backgroundColor: project.scene.backgroundColor,
      ground: { visible: project.scene.showGround, opacity: project.scene.groundOpacity },
      lights: clone(project.scene.lights),
      ambientIntensity: project.scene.ambientIntensity,
      exposure: project.scene.exposure,
      lightingPresetId: project.scene.lightingPresetId ?? null,
    },
    assets: clone(project.assets),
    objects: clone(project.objects)
      .filter((object) => object.kind !== 'character')
      .map((object) => ({
        id: object.id,
        name: object.name,
        assetId: object.assetId,
        builtinAssetId: object.builtinAssetId,
        kind: object.kind === 'mesh' ? 'mesh' : 'prop',
        transform: clone(object.transform),
        visible: object.visible,
        locked: object.locked,
      })),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 把场景模板深拷贝到当前镜头：替换环境与非角色物体，保留角色以便后续重绑定。
 *
 * 机位不属模板语义（模板只描述环境 / 布光 / 道具），因此 `camera` 与 `cameraKeys`
 * 原样保留 —— 套模板不会打乱一镜多机位的关键帧序列。
 */
export function applySceneTemplateToShotState(
  state: Director3dShotState,
  template: Director3dSceneTemplate,
): Director3dShotState {
  const templated = projectFromSceneTemplate(template);
  const characters = state.objects.filter((object) => object.kind === 'character');
  const sceneObjects = templated.objects.filter((object) => object.kind !== 'character');
  return {
    ...state,
    sceneTemplateId: template.id,
    environment: {
      ...state.environment,
      panoramaUrl: template.environment.panoramaUrl,
      backgroundColor: template.environment.backgroundColor,
      groundVisible: template.environment.ground.visible,
      groundOpacity: template.environment.ground.opacity,
      lights: coerceDirectorLights(template.environment.lights) ?? createDefaultSceneLights(),
      ambientIntensity: resolveAmbientIntensity(
        template.environment.ambientIntensity,
        template.environment.panoramaUrl,
      ),
      exposure:
        typeof template.environment.exposure === 'number' && Number.isFinite(template.environment.exposure)
          ? template.environment.exposure
          : DEFAULT_EXPOSURE,
      lightingPresetId: template.environment.lightingPresetId ?? undefined,
    },
    objects: [...clone(sceneObjects), ...clone(characters)],
    dirty: true,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 候选帧上传结果写回。切镜后 shotId 对不上则忽略，避免长时间会话把过期上传写进新镜。
 */
export function applyCandidateUploadResult(
  state: Director3dShotState,
  input: {
    candidateId: string;
    expectedShotId: string;
    imageUrl?: string;
    error?: string;
    /** 无上传通道时允许本地 ready（仍不能 commit Data URL） */
    allowReadyWithoutUrl?: boolean;
  },
): Director3dShotState {
  if (state.shotId !== input.expectedShotId) return state;
  if (!state.candidates.some((item) => item.id === input.candidateId)) return state;
  return {
    ...state,
    candidates: state.candidates.map((item) => {
      if (item.id !== input.candidateId) return item;
      if (input.error) return { ...item, status: 'failed' as const, error: input.error };
      if (input.imageUrl) {
        return { ...item, imageUrl: input.imageUrl, status: 'ready' as const, error: undefined };
      }
      if (input.allowReadyWithoutUrl) {
        return { ...item, status: 'ready' as const, error: undefined };
      }
      return { ...item, status: 'failed' as const, error: '候选帧未获得持久化图片 URL' };
    }),
    updatedAt: new Date().toISOString(),
  };
}

function isDataMediaUrl(url: string | null | undefined): boolean {
  return Boolean(url?.trim().toLowerCase().startsWith('data:'));
}

/**
 * 把 3D 节点草稿里误当作持久 URL 的 Data URL 降回本地草稿，禁止继续提交。
 */
export function quarantineDirector3dShotStates(
  states: Record<string, Director3dShotState>,
): { states: Record<string, Director3dShotState>; quarantinedCount: number } {
  let quarantinedCount = 0;
  const next: Record<string, Director3dShotState> = {};
  for (const [shotId, state] of Object.entries(states)) {
    let shotChanged = false;
    const candidates = state.candidates.map((candidate) => {
      if (!isDataMediaUrl(candidate.imageUrl)) return candidate;
      quarantinedCount += 1;
      shotChanged = true;
      const keepStatus =
        candidate.status === 'failed'
        || candidate.status === 'capturing'
        || candidate.status === 'uploading';
      return {
        ...candidate,
        localDataUrl: candidate.localDataUrl || candidate.imageUrl,
        imageUrl: undefined,
        status: keepStatus ? candidate.status : 'failed' as const,
        error: candidate.error || '截图仍是本地草稿，请重新上传后再提交',
      };
    });
    next[shotId] = shotChanged ? { ...state, candidates } : state;
  }
  return {
    states: quarantinedCount > 0 ? next : states,
    quarantinedCount,
  };
}

/**
 * 把当前镜头场景恢复到最近一次提交快照；无快照时返回 null。
 *
 * 机位序列一并回滚（提交时的 `cameraKeys` / `activeCameraKeyId` 一起写进快照），
 * 否则会出现「环境 / 物体回滚了、机位还停在提交后」的半截状态。
 * 旧快照没有 `cameraKeys`（提交时还是单机位结构）→ 按单机位恢复，与老行为一致。
 */
export function restoreCommittedSnapshot(
  state: Director3dShotState,
): Director3dShotState | null {
  const snapshot = state.committedSnapshot;
  if (!snapshot) return null;
  const restoredKeys = coerceCameraKeys(
    snapshot.cameraKeys,
    isAspectRatio(snapshot.camera?.aspectRatio) ? snapshot.camera.aspectRatio : state.camera.aspectRatio,
  ) ?? [];
  const restoredKeyId = restoredKeys.length === 0
    ? null
    : typeof snapshot.activeCameraKeyId === 'string'
      && restoredKeys.some((key) => key.id === snapshot.activeCameraKeyId)
      ? snapshot.activeCameraKeyId
      : (restoredKeys.find((key) => shotCameraEquals(key.camera, snapshot.camera))?.id ?? restoredKeys[0]!.id);
  return {
    ...state,
    environment: clone(snapshot.environment),
    objects: clone(snapshot.objects),
    camera: clone(snapshot.camera),
    cameraKeys: restoredKeys,
    activeCameraKeyId: restoredKeyId,
    selectedCandidateId: snapshot.candidateId,
    dirty: false,
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
      lights: coerceDirectorLights(template.environment.lights) ?? createDefaultSceneLights(),
      ambientIntensity: resolveAmbientIntensity(
        template.environment.ambientIntensity,
        template.environment.panoramaUrl,
      ),
      exposure:
        typeof template.environment.exposure === 'number' && Number.isFinite(template.environment.exposure)
          ? template.environment.exposure
          : DEFAULT_EXPOSURE,
      lightingPresetId: template.environment.lightingPresetId ?? null,
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

/**
 * 宽容读取导演台工程（导出 / 再导入走同一入口）。
 *
 * 多机位（含运镜时间轴生成的 `movetl-*` 关键帧机位）原样保留；
 * `activeCameraId` 失效（指向不存在的机位 / 缺失）时回落首个机位，
 * 保证导出 → 再导入的激活机位与机位列表始终自洽、幂等。
 */
export function normalizeDirectorProject(raw: unknown): DirectorProject {
  if (!raw || typeof raw !== 'object') return emptyDirectorProject();
  const r = raw as Record<string, unknown>;
  if (r.version === 1 && Array.isArray(r.cameras)) {
    const p = r as unknown as DirectorProject;
    const rawScene = (p.scene ?? {}) as Partial<SceneSettings>;
    const hasActive = typeof p.activeCameraId === 'string'
      && p.cameras.some((camera) => camera?.id === p.activeCameraId);
    return {
      ...emptyDirectorProject(),
      ...p,
      assets: p.assets ?? [],
      panorama: p.panorama ?? null,
      activeCameraId: hasActive ? p.activeCameraId : (p.cameras[0]?.id ?? null),
      scene: {
        ...DEFAULT_SCENE,
        ...rawScene,
        lights: coerceDirectorLights(rawScene.lights) ?? createDefaultSceneLights(),
        ambientIntensity: resolveAmbientIntensity(rawScene.ambientIntensity, p.panorama?.url),
        exposure:
          typeof rawScene.exposure === 'number' && Number.isFinite(rawScene.exposure)
            ? rawScene.exposure
            : DEFAULT_EXPOSURE,
        lightingPresetId: rawScene.lightingPresetId ?? null,
      },
    };
  }
  if (r.version === 1 && Array.isArray(r.objects) && !r.cameras) {
    const base = emptyDirectorProject();
    return {
      ...base,
      viewportAspectRatio: (r.aspectRatio as ViewportAspectRatio) ?? '16:9',
      scene: createDefaultScene(),
      objects: (r.objects as Array<{ kind?: string } & Omit<DirectorObject, 'kind'>>)
        .filter((o) => o.kind !== 'camera')
        .map((o) => ({ ...o, kind: (o.kind ?? 'prop') as DirectorObject['kind'] })),
    };
  }
  return emptyDirectorProject();
}
