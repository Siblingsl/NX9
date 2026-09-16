import { create } from 'zustand';
import type {
  CharacterBodyType,
  DirectorAsset,
  DirectorCameraCapture,
  DirectorCameraShot,
  DirectorLight,
  DirectorLightRole,
  DirectorLightType,
  DirectorObject,
  DirectorProject,
  DirectorTransform,
  GeometryPrimitiveType,
  PanoramaSettings,
  SceneSettings,
  TransformMode,
  ViewMode,
  ViewportAspectRatio,
} from '../schema/directorProject';
import { emptyDirectorProject } from '../schema/directorProject';
import {
  applyOrbitToCamera,
  DEFAULT_PROMPT_DETAILS,
  type CameraMoveId,
  type CameraOrbit,
  type PromptDetailFlags,
} from '../schema/cameraGeometry';
import { buildMotionCameraPrompt, MOTION_CAMERA_PREFIX } from '../schema/cameraMoveMotion';
import { lookupCameraMove } from '../../../shared/src/data/camera-move-library';
import type { PromptPlatformId } from '../schema/promptSkin';
import { skinCameraPrompt } from '../schema/promptSkin';
import { MOVE_TIMELINE_CAMERA_PREFIX } from '../schema/cameraMoveTimelineKeys';
import { loadLocalLibrary, upsertLocalAsset } from '../io/localLibrary';
import {
  buildSceneLightingPrompt,
  lightFromPreset,
  lookupKeyLightPreset,
  lookupLightingRigPreset,
  lookupRimLightPreset,
  resolveRigLights,
} from '../presets/lightingPresets';

const CROWD_MAX = 20;
const UNDO_MAX = 40;

export type StageInteractionMode = 'navigate' | 'subject' | 'camera';
export type StageViewportLayout = 'single' | 'quad';
export type StageQuadPane = 'camera' | 'top' | 'left' | 'right';
export type StageMobileSheet = 'shots' | 'rig' | 'layers' | 'add' | 'env' | 'light' | 'move' | 'film' | null;

/** 抽屉与移动端 sheet 同名，便于统一开关。 */
const DRAWER_SHEETS: readonly StageDrawer[] = ['layers', 'add', 'env', 'light', 'move'];

export interface DollyKeySnapshot {
  camera: DirectorCameraShot;
  capturedAt: number;
}

let idSeq = 0;
function uid(prefix: string) {
  idSeq += 1;
  return `${prefix}-${Date.now()}-${idSeq}`;
}

function cloneProject(p: DirectorProject): DirectorProject {
  return structuredClone(p);
}

function mergeLocalAssets(project: DirectorProject): DirectorProject {
  const local = loadLocalLibrary();
  if (local.length === 0) return project;
  const assets = [...project.assets];
  for (const a of local) {
    if (!assets.some((x) => x.id === a.id)) assets.push(a);
  }
  return { ...project, assets };
}

export type StageDrawer = 'layers' | 'add' | 'env' | 'light' | 'move' | null;

export interface DirectorStoreState {
  viewMode: ViewMode;
  transformMode: TransformMode;
  interactionMode: StageInteractionMode;
  viewportLayout: StageViewportLayout;
  activeQuadPane: StageQuadPane;
  mobileSheet: StageMobileSheet;
  cameraMove: CameraMoveId;
  /**
   * 已套用的「大师运镜库」运镜 id（会话级，**不落盘**）。
   *
   * 只用于把运镜短语并入下一次截帧 / 提交的 `cameraPrompt`（既有字段，无新增持久化字段名）：
   * 关键帧机位本身由 `project.cameras` 里的 `cammv-*` 机位承载，随镜头一起保存。
   */
  cameraMoveLibraryId: string | null;
  promptPlatform: PromptPlatformId;
  promptDetails: PromptDetailFlags;
  dollyA: DollyKeySnapshot | null;
  dollyB: DollyKeySnapshot | null;
  dollyT: number;
  timelineT: number;
  timelinePlaying: boolean;
  selectedObjectId: string | null;
  activeDrawer: StageDrawer;
  project: DirectorProject;
  undoStack: DirectorProject[];
  crowdMax: number;
  setViewMode: (mode: ViewMode) => void;
  setTransformMode: (mode: TransformMode) => void;
  setInteractionMode: (mode: StageInteractionMode) => void;
  setViewportLayout: (layout: StageViewportLayout) => void;
  setActiveQuadPane: (pane: StageQuadPane) => void;
  setMobileSheet: (sheet: StageMobileSheet) => void;
  setCameraMove: (move: CameraMoveId) => void;
  setPromptPlatform: (platform: PromptPlatformId) => void;
  setPromptDetail: (key: keyof PromptDetailFlags, on: boolean) => void;
  setPromptDetails: (patch: Partial<PromptDetailFlags>) => void;
  setDollyKey: (slot: 'A' | 'B') => void;
  setDollyT: (t: number) => void;
  clearDolly: () => void;
  setTimelineT: (t: number) => void;
  setTimelinePlaying: (playing: boolean) => void;
  /**
   * 运镜时间轴交接：把适配器生成的关键帧机位追加进 project.cameras
   * （先清掉上一次同源机位），并把预览游标复位。会入 undo 栈。
   */
  applyMoveTimelineKeys: (cameras: DirectorCameraShot[]) => void;
  /** 清除由运镜时间轴生成的关键帧机位（按 id 前缀识别）。会入 undo 栈。 */
  clearMoveTimelineKeys: () => void;
  /**
   * 套用「大师运镜库」的一条运镜：把 `cameraMoveMotion` 生成的 `cammv-*` 关键帧机位
   * 追加进 `project.cameras`（先清掉上一次同源机位），并把运镜 id 记进
   * `cameraMoveLibraryId`（下一次截帧 / 提交时并入 `cameraPrompt`）。会入 undo 栈。
   */
  applyCameraMoveMotion: (cameras: DirectorCameraShot[], moveId: string | null) => void;
  /** 移除 `cammv-*` 关键帧机位并清空运镜 id。会入 undo 栈（仅在有改动时）。 */
  clearCameraMoveMotion: () => void;
  /** 只改「已套用运镜」标记（例如只写提示词、不写关键帧）；未命中词库时按空处理。 */
  setCameraMoveLibraryId: (moveId: string | null) => void;
  applyActiveOrbit: (orbit: Partial<CameraOrbit> & { fov?: number; roll?: number }) => void;
  setViewportAspectRatio: (ratio: ViewportAspectRatio) => void;
  setActiveDrawer: (drawer: StageDrawer) => void;
  toggleSceneFlag: (key: 'showGround' | 'showGrid' | 'ruleOfThirds' | 'snapToGrid') => void;
  selectObject: (id: string | null) => void;
  replaceProject: (project: DirectorProject) => void;
  getProject: () => DirectorProject;
  canUndo: () => boolean;
  undo: () => void;
  updateObjectTransform: (id: string, patch: Partial<DirectorTransform>) => void;
  updateObjectName: (id: string, name: string) => void;
  updateCamera: (id: string, patch: Partial<DirectorCameraShot>) => void;
  updateCharacter: (
    id: string,
    patch: {
      bodyType?: CharacterBodyType;
      posePresetId?: string;
      color?: string;
      poseJoints?: DirectorObject['poseJoints'];
    },
  ) => void;
  toggleObjectVisible: (id: string) => void;
  toggleObjectLocked: (id: string) => void;
  deleteSelected: () => void;
  addCharacter: (bodyType?: CharacterBodyType) => void;
  addGeometry: (type: GeometryPrimitiveType) => void;
  addCamera: () => void;
  addCrowd: (rows: number, cols: number) => void;
  setCrowdMax: (max: number) => void;
  setActiveCamera: (id: string) => void;
  setPanorama: (settings: PanoramaSettings | null) => void;
  updatePanorama: (patch: Partial<PanoramaSettings>) => void;
  registerAsset: (asset: DirectorAsset) => void;
  addMeshFromAsset: (assetId: string) => void;
  /** 放置内置程序化模型（无需外部文件） */
  addBuiltinObject: (builtinAssetId: string, label?: string) => void;
  /** 场景灯光：新增 / 调整 / 删除 / 应用预置 */
  addLight: (type?: DirectorLightType, role?: DirectorLightRole) => void;
  updateLight: (id: string, patch: Partial<DirectorLight>) => void;
  removeLight: (id: string) => void;
  /** 24 主光位：改写当前主光（无则新建） */
  applyKeyLightPreset: (presetId: string) => void;
  /** 9 轮廓光：改写当前轮廓光（无则新建） */
  applyRimLightPreset: (presetId: string) => void;
  /** 整组布光方案：替换全部灯光 + 环境基线 + 曝光 */
  applyLightingRigPreset: (rigId: string) => void;
  /** 环境光强度 / 曝光微调 */
  setSceneLighting: (patch: Partial<Pick<SceneSettings, 'ambientIntensity' | 'exposure'>>) => void;
  addCapture: (dataUrl: string, imageUrl?: string) => DirectorCameraCapture | null;
  frameSelection: () => void;
  /** 运镜 scrub：不入 undo 栈 */
  previewActiveCamera: (patch: Partial<DirectorCameraShot>) => void;
}

function pushUndo(get: () => DirectorStoreState, set: (partial: Partial<DirectorStoreState>) => void) {
  const { project, undoStack } = get();
  set({ undoStack: [...undoStack.slice(-(UNDO_MAX - 1)), cloneProject(project)] });
}

export const useDirectorStore = create<DirectorStoreState>((set, get) => ({
  viewMode: 'director',
  transformMode: 'translate',
  interactionMode: 'navigate',
  viewportLayout: 'single',
  activeQuadPane: 'camera',
  mobileSheet: null,
  cameraMove: 'static',
  cameraMoveLibraryId: null,
  promptPlatform: 'nx9',
  promptDetails: { ...DEFAULT_PROMPT_DETAILS },
  dollyA: null,
  dollyB: null,
  dollyT: 0,
  timelineT: 0,
  timelinePlaying: false,
  selectedObjectId: null,
  activeDrawer: null,
  project: emptyDirectorProject(),
  undoStack: [],
  crowdMax: 20,

  setViewMode: (mode) => set({ viewMode: mode }),
  setTransformMode: (mode) => set({ transformMode: mode }),
  setInteractionMode: (mode) => {
    set({
      interactionMode: mode,
      transformMode: mode === 'subject' ? 'translate' : get().transformMode,
      viewMode: mode === 'camera' ? 'camera' : mode === 'navigate' ? 'director' : get().viewMode,
      timelinePlaying: false,
    });
  },
  setViewportLayout: (layout) => set({ viewportLayout: layout, mobileSheet: null }),
  setActiveQuadPane: (pane) => set({ activeQuadPane: pane }),
  setMobileSheet: (sheet) =>
    set({
      mobileSheet: sheet,
      activeDrawer: DRAWER_SHEETS.includes(sheet as StageDrawer) ? (sheet as StageDrawer) : get().activeDrawer,
    }),
  setCameraMove: (move) => set({ cameraMove: move }),
  setPromptPlatform: (platform) => set({ promptPlatform: platform }),
  setPromptDetail: (key, on) =>
    set((s) => ({ promptDetails: { ...s.promptDetails, [key]: on } })),
  setPromptDetails: (patch) =>
    set((s) => ({ promptDetails: { ...s.promptDetails, ...patch } })),
  setDollyKey: (slot) => {
    const { project } = get();
    const cam = project.cameras.find((c) => c.id === project.activeCameraId) ?? project.cameras[0];
    if (!cam) return;
    const snap: DollyKeySnapshot = { camera: structuredClone(cam), capturedAt: Date.now() };
    set(slot === 'A' ? { dollyA: snap, dollyT: 0 } : { dollyB: snap, dollyT: 1 });
  },
  setDollyT: (t) => set({ dollyT: Math.min(1, Math.max(0, t)) }),
  clearDolly: () => set({ dollyA: null, dollyB: null, dollyT: 0 }),
  setTimelineT: (t) => set({ timelineT: Math.min(1, Math.max(0, t)) }),
  setTimelinePlaying: (playing) => set({ timelinePlaying: playing }),
  applyMoveTimelineKeys: (cameras) => {
    if (!Array.isArray(cameras) || cameras.length === 0) return;
    const { project } = get();
    pushUndo(get, set);
    const kept = project.cameras.filter((c) => !c.id.startsWith(MOVE_TIMELINE_CAMERA_PREFIX));
    const activeKept = project.activeCameraId && kept.some((c) => c.id === project.activeCameraId)
      ? project.activeCameraId
      : (kept[0]?.id ?? null);
    set({
      project: {
        ...project,
        cameras: [...kept, ...structuredClone(cameras)],
        // 保持原有激活机位；只有在没有任何机位时才切到第一帧
        activeCameraId: activeKept ?? cameras[0].id,
      },
      timelineT: 0,
      timelinePlaying: false,
    });
  },

  clearMoveTimelineKeys: () => {
    const { project } = get();
    const hasKeys = project.cameras.some((c) => c.id.startsWith(MOVE_TIMELINE_CAMERA_PREFIX));
    if (!hasKeys) return;
    pushUndo(get, set);
    const cameras = project.cameras.filter((c) => !c.id.startsWith(MOVE_TIMELINE_CAMERA_PREFIX));
    const stillActive = cameras.some((c) => c.id === project.activeCameraId);
    set({
      project: {
        ...project,
        cameras,
        activeCameraId: stillActive ? project.activeCameraId : (cameras[0]?.id ?? null),
      },
      timelineT: 0,
      timelinePlaying: false,
    });
  },

  /**
   * 大师运镜库 → 关键帧机位（增量新增）。
   *
   * 与「运镜时间轴」同构但彼此独立：本动作只替换 `cammv-*`，`movetl-*` 原样保留，
   * 反之亦然。激活机位沿用原有选择（只改机位列表），因此套用运镜不会把取景切走；
   * 首个 `cammv-*` 帧的姿态本身就是套用前的当前机位（见 `buildMotionKeyframes`）。
   */
  applyCameraMoveMotion: (cameras, moveId) => {
    if (!Array.isArray(cameras) || cameras.length === 0) return;
    const { project } = get();
    const def = lookupCameraMove(moveId);
    pushUndo(get, set);
    const kept = project.cameras.filter((c) => !c.id.startsWith(MOTION_CAMERA_PREFIX));
    const activeKept = project.activeCameraId && kept.some((c) => c.id === project.activeCameraId)
      ? project.activeCameraId
      : (kept[0]?.id ?? null);
    set({
      project: {
        ...project,
        cameras: [...kept, ...structuredClone(cameras)],
        activeCameraId: activeKept ?? cameras[0].id,
      },
      cameraMoveLibraryId: def?.id ?? null,
    });
  },

  clearCameraMoveMotion: () => {
    const { project, cameraMoveLibraryId } = get();
    const hasKeys = project.cameras.some((c) => c.id.startsWith(MOTION_CAMERA_PREFIX));
    if (!hasKeys && !cameraMoveLibraryId) return;
    if (hasKeys) pushUndo(get, set);
    const cameras = hasKeys
      ? project.cameras.filter((c) => !c.id.startsWith(MOTION_CAMERA_PREFIX))
      : project.cameras;
    const stillActive = cameras.some((c) => c.id === project.activeCameraId);
    set({
      project: {
        ...project,
        cameras,
        activeCameraId: stillActive ? project.activeCameraId : (cameras[0]?.id ?? null),
      },
      cameraMoveLibraryId: null,
    });
  },

  setCameraMoveLibraryId: (moveId) => {
    set({ cameraMoveLibraryId: lookupCameraMove(moveId)?.id ?? null });
  },
  applyActiveOrbit: (orbit) => {
    const { project } = get();
    const id = project.activeCameraId ?? project.cameras[0]?.id;
    if (!id) return;
    const cam = project.cameras.find((c) => c.id === id);
    if (!cam) return;
    pushUndo(get, set);
    let next = applyOrbitToCamera(cam, orbit);
    if (typeof orbit.roll === 'number') {
      next = {
        ...next,
        transform: {
          ...next.transform,
          rotation: [next.transform.rotation[0], next.transform.rotation[1], orbit.roll],
        },
      };
    }
    set((s) => ({
      project: {
        ...s.project,
        cameras: s.project.cameras.map((c) => (c.id === id ? next : c)),
      },
    }));
  },
  frameSelection: () => {
    const { project, selectedObjectId } = get();
    const obj = project.objects.find((o) => o.id === selectedObjectId);
    const camId = project.activeCameraId ?? project.cameras[0]?.id;
    if (!obj || !camId) return;
    const cam = project.cameras.find((c) => c.id === camId);
    if (!cam) return;
    pushUndo(get, set);
    const target: [number, number, number] = [
      obj.transform.position[0],
      obj.transform.position[1] + 1.0,
      obj.transform.position[2],
    ];
    const withTarget = { ...cam, target };
    const next = applyOrbitToCamera(withTarget, { dist: 3.2, el: 8 });
    set((s) => ({
      project: {
        ...s.project,
        cameras: s.project.cameras.map((c) => (c.id === camId ? next : c)),
      },
      viewMode: 'camera',
      interactionMode: 'camera',
    }));
  },
  previewActiveCamera: (patch) => {
    const { project } = get();
    const id = project.activeCameraId ?? project.cameras[0]?.id;
    if (!id) return;
    set((s) => ({
      project: {
        ...s.project,
        cameras: s.project.cameras.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    }));
  },
  setActiveDrawer: (drawer) => set({ activeDrawer: drawer }),

  setViewportAspectRatio: (ratio) => {
    pushUndo(get, set);
    set((s) => ({ project: { ...s.project, viewportAspectRatio: ratio } }));
  },

  toggleSceneFlag: (key) => {
    pushUndo(get, set);
    set((s) => ({
      project: { ...s.project, scene: { ...s.project.scene, [key]: !s.project.scene[key] } },
    }));
  },

  selectObject: (id) => set({ selectedObjectId: id }),

  replaceProject: (project) =>
    set({
      project: mergeLocalAssets(project),
      selectedObjectId: null,
      activeDrawer: null,
      undoStack: [],
    }),

  getProject: () => get().project,

  canUndo: () => get().undoStack.length > 0,

  undo: () => {
    const { undoStack } = get();
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1]!;
    set({
      project: prev,
      undoStack: undoStack.slice(0, -1),
      selectedObjectId: null,
    });
  },

  updateObjectTransform: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        objects: s.project.objects.map((o) =>
          o.id === id ? { ...o, transform: { ...o.transform, ...patch } } : o,
        ),
        cameras: s.project.cameras.map((c) =>
          c.id === id ? { ...c, transform: { ...c.transform, ...patch } } : c,
        ),
      },
    })),

  updateObjectName: (id, name) => {
    pushUndo(get, set);
    set((s) => ({
      project: {
        ...s.project,
        objects: s.project.objects.map((o) => (o.id === id ? { ...o, name } : o)),
        cameras: s.project.cameras.map((c) => (c.id === id ? { ...c, name } : c)),
      },
    }));
  },

  updateCamera: (id, patch) => {
    pushUndo(get, set);
    set((s) => ({
      project: {
        ...s.project,
        cameras: s.project.cameras.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    }));
  },

  updateCharacter: (id, patch) => {
    pushUndo(get, set);
    set((s) => ({
      project: {
        ...s.project,
        objects: s.project.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      },
    }));
  },

  toggleObjectVisible: (id) => {
    pushUndo(get, set);
    set((s) => ({
      project: {
        ...s.project,
        objects: s.project.objects.map((o) =>
          o.id === id ? { ...o, visible: !o.visible } : o,
        ),
      },
    }));
  },

  toggleObjectLocked: (id) => {
    pushUndo(get, set);
    set((s) => ({
      project: {
        ...s.project,
        objects: s.project.objects.map((o) =>
          o.id === id ? { ...o, locked: !o.locked } : o,
        ),
      },
    }));
  },

  deleteSelected: () => {
    const { selectedObjectId, project } = get();
    if (!selectedObjectId) return;
    const isCamera = project.cameras.some((c) => c.id === selectedObjectId);
    if (isCamera && project.cameras.length <= 1) return;
    pushUndo(get, set);
    set({
      selectedObjectId: null,
      project: {
        ...project,
        objects: project.objects.filter((o) => o.id !== selectedObjectId),
        cameras: project.cameras.filter((c) => c.id !== selectedObjectId),
        activeCameraId:
          project.activeCameraId === selectedObjectId
            ? project.cameras.find((c) => c.id !== selectedObjectId)?.id ?? null
            : project.activeCameraId,
      },
    });
  },

  addCharacter: (bodyType = 'neutral') => {
    pushUndo(get, set);
    const id = uid('char');
    const n = get().project.objects.filter((o) => o.kind === 'character').length + 1;
    const obj: DirectorObject = {
      id,
      name: `演员 ${n}`,
      kind: 'character',
      visible: true,
      locked: false,
      color: '#5E4D8A',
      bodyType,
      posePresetId: 'stand',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    set((s) => ({
      selectedObjectId: id,
      activeDrawer: null,
      project: { ...s.project, objects: [...s.project.objects, obj] },
    }));
  },

  addGeometry: (geometryType) => {
    pushUndo(get, set);
    const id = uid('prop');
    const labels: Record<GeometryPrimitiveType, string> = {
      box: '方块',
      sphere: '球体',
      cylinder: '柱体',
      cone: '锥体',
    };
    const n = get().project.objects.filter((o) => o.kind === 'prop').length + 1;
    const obj: DirectorObject = {
      id,
      name: `${labels[geometryType]} ${n}`,
      kind: 'prop',
      visible: true,
      locked: false,
      geometryType,
      color: '#94a3b8',
      transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    set((s) => ({
      selectedObjectId: id,
      activeDrawer: null,
      project: { ...s.project, objects: [...s.project.objects, obj] },
    }));
  },

  addCamera: () => {
    pushUndo(get, set);
    const id = uid('cam');
    const n = get().project.cameras.length + 1;
    const cam: DirectorCameraShot = {
      id,
      name: `镜头 ${n}`,
      fov: 50,
      transform: { position: [2, 1.6, 4], rotation: [0, 0, 0], scale: [1, 1, 1] },
      target: [0, 1, 0],
      captures: [],
    };
    set((s) => ({
      selectedObjectId: id,
      activeDrawer: null,
      project: {
        ...s.project,
        cameras: [...s.project.cameras, cam],
        activeCameraId: id,
      },
    }));
  },

  addCrowd: (rows, cols) => {
    const { project, crowdMax } = get();
    const existing = project.objects.filter((o) => o.kind === 'character').length;
    const count = Math.min(rows * cols, crowdMax - existing);
    if (count <= 0) return;
    pushUndo(get, set);
    const groupId = uid('crowd');
    const spacing = 0.85;
    const newObjects: DirectorObject[] = [];
    let placed = 0;
    for (let r = 0; r < rows && placed < count; r++) {
      for (let c = 0; c < cols && placed < count; c++) {
        placed += 1;
        newObjects.push({
          id: uid('char'),
          name: `群演 ${placed}`,
          kind: 'character',
          visible: true,
          locked: false,
          color: '#64748b',
          bodyType: 'neutral',
          posePresetId: 'stand',
          crowdGroupId: groupId,
          transform: {
            position: [(c - cols / 2) * spacing, 0, (r - rows / 2) * spacing],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
        });
      }
    }
    set((s) => ({
      activeDrawer: null,
      project: { ...s.project, objects: [...s.project.objects, ...newObjects] },
    }));
  },

  setCrowdMax: (max) => set({ crowdMax: Math.max(1, Math.min(max, 1000)) }),

  setActiveCamera: (id) =>
    set((s) => ({
      project: { ...s.project, activeCameraId: id },
      selectedObjectId: id,
    })),

  setPanorama: (settings) => {
    pushUndo(get, set);
    set((s) => ({ project: { ...s.project, panorama: settings } }));
  },

  updatePanorama: (patch) => {
    pushUndo(get, set);
    set((s) => ({
      project: {
        ...s.project,
        panorama: s.project.panorama ? { ...s.project.panorama, ...patch } : null,
      },
    }));
  },

  registerAsset: (asset) => {
    pushUndo(get, set);
    if (asset.kind === 'mesh') upsertLocalAsset(asset);
    set((s) => ({
      project: {
        ...s.project,
        assets: [...s.project.assets.filter((a) => a.id !== asset.id), asset],
      },
    }));
  },

  addMeshFromAsset: (assetId) => {
    const asset = get().project.assets.find((a) => a.id === assetId && a.kind === 'mesh');
    if (!asset) return;
    pushUndo(get, set);
    const id = uid('mesh');
    const obj: DirectorObject = {
      id,
      name: asset.name,
      kind: 'mesh',
      visible: true,
      locked: false,
      assetId,
      meshUrl: asset.url,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    set((s) => ({
      selectedObjectId: id,
      activeDrawer: null,
      project: { ...s.project, objects: [...s.project.objects, obj] },
    }));
  },

  addBuiltinObject: (builtinAssetId, label) => {
    pushUndo(get, set);
    const id = uid('builtin');
    const n = get().project.objects.filter((o) => o.kind === 'prop').length + 1;
    const obj: DirectorObject = {
      id,
      name: label ?? `内置模型 ${n}`,
      kind: 'prop',
      visible: true,
      locked: false,
      builtinAssetId,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    };
    set((s) => ({
      selectedObjectId: id,
      activeDrawer: null,
      project: { ...s.project, objects: [...s.project.objects, obj] },
    }));
  },

  addLight: (type = 'directional', role = 'key') => {
    pushUndo(get, set);
    const id = uid('light');
    const n = get().project.scene.lights.length + 1;
    const light: DirectorLight = {
      id,
      name: `${role === 'key' ? '主光' : role === 'fill' ? '补光' : role === 'rim' ? '轮廓光' : role === 'ambient' ? '环境灯' : '实用光'} ${n}`,
      role,
      type,
      azimuth: role === 'rim' ? 180 : 45,
      elevation: type === 'ambient' ? 0 : role === 'rim' ? 40 : 30,
      distance: type === 'ambient' ? 0 : 3.2,
      intensity: type === 'ambient' ? 0.5 : role === 'rim' ? 1.2 : 1,
      color: role === 'rim' ? '#cfe4ff' : '#fff5ea',
      castShadow: type !== 'ambient' && role === 'key',
      visible: true,
    };
    if (type === 'spot') {
      light.coneAngle = 45;
      light.penumbra = 0.4;
    }
    set((s) => ({
      project: {
        ...s.project,
        scene: { ...s.project.scene, lights: [...s.project.scene.lights, light], lightingPresetId: null },
      },
    }));
  },

  updateLight: (id, patch) => {
    const { project } = get();
    if (!project.scene.lights.some((light) => light.id === id)) return;
    pushUndo(get, set);
    set((s) => ({
      project: {
        ...s.project,
        scene: {
          ...s.project.scene,
          lights: s.project.scene.lights.map((light) => (light.id === id ? { ...light, ...patch } : light)),
          lightingPresetId: null,
        },
      },
    }));
  },

  removeLight: (id) => {
    const { project } = get();
    if (!project.scene.lights.some((light) => light.id === id)) return;
    pushUndo(get, set);
    set((s) => ({
      project: {
        ...s.project,
        scene: {
          ...s.project.scene,
          lights: s.project.scene.lights.filter((light) => light.id !== id),
          lightingPresetId: null,
        },
      },
    }));
  },

  applyKeyLightPreset: (presetId) => {
    const preset = lookupKeyLightPreset(presetId);
    if (!preset) return;
    pushUndo(get, set);
    set((s) => {
      const lights = s.project.scene.lights;
      const target = lights.find((light) => light.role === 'key');
      const next = target
        ? lights.map((light) =>
            light.id === target.id
              ? { ...lightFromPreset(preset, target.id, target.name), visible: target.visible }
              : light,
          )
        : [...lights, lightFromPreset(preset, uid('light'))];
      return {
        project: {
          ...s.project,
          scene: { ...s.project.scene, lights: next, lightingPresetId: null },
        },
      };
    });
  },

  applyRimLightPreset: (presetId) => {
    const preset = lookupRimLightPreset(presetId);
    if (!preset) return;
    pushUndo(get, set);
    set((s) => {
      const lights = s.project.scene.lights;
      const target = lights.find((light) => light.role === 'rim');
      const next = target
        ? lights.map((light) =>
            light.id === target.id
              ? { ...lightFromPreset(preset, target.id, target.name), visible: target.visible }
              : light,
          )
        : [...lights, lightFromPreset(preset, uid('light'))];
      return {
        project: {
          ...s.project,
          scene: { ...s.project.scene, lights: next, lightingPresetId: null },
        },
      };
    });
  },

  applyLightingRigPreset: (rigId) => {
    const rig = lookupLightingRigPreset(rigId);
    if (!rig) return;
    pushUndo(get, set);
    const lights = resolveRigLights(rig).map((preset) => lightFromPreset(preset, uid('light')));
    set((s) => ({
      project: {
        ...s.project,
        scene: {
          ...s.project.scene,
          lights,
          ambientIntensity: rig.ambientIntensity,
          exposure: rig.exposure,
          lightingPresetId: rig.id,
        },
      },
    }));
  },

  setSceneLighting: (patch) => {
    pushUndo(get, set);
    set((s) => ({
      project: { ...s.project, scene: { ...s.project.scene, ...patch } },
    }));
  },

  addCapture: (dataUrl, imageUrl) => {
    const { project, cameraMove, cameraMoveLibraryId, promptPlatform, promptDetails } = get();
    const camId = project.activeCameraId;
    if (!camId) return null;
    const camera = project.cameras.find((c) => c.id === camId);
    if (!camera) return null;
    const subject = project.objects.find((o) => o.kind === 'character' && o.visible);
    pushUndo(get, set);
    const index = camera.captures.length + 1;
    // 已套用大师运镜时，短语并入同一 `camera movement:` 槽位（复用既有 withCameraMovePrompt）；
    // 未套用时输出与改动前逐字符一致（fallbackMove = 既有 CameraMoveId）。
    const basePrompt = buildMotionCameraPrompt(camera, {
      roll: camera.transform.rotation[2],
      subjectYawDeg: subject?.transform.rotation[1] ?? 0,
      moveId: cameraMoveLibraryId,
      fallbackMove: cameraMove,
      details: promptDetails,
      lightingPrompt: buildSceneLightingPrompt(project.scene),
    });
    const capture: DirectorCameraCapture = {
      id: uid('cap'),
      index,
      name: `帧 ${String(index).padStart(2, '0')}`,
      dataUrl,
      imageUrl,
      cameraPrompt: skinCameraPrompt(basePrompt, promptPlatform, cameraMove),
      cameraPosition: [...camera.transform.position] as [number, number, number],
      cameraTarget: [...camera.target] as [number, number, number],
      cameraRotation: [...camera.transform.rotation] as [number, number, number],
      cameraFov: camera.fov,
      createdAt: Date.now(),
    };
    set((s) => ({
      project: {
        ...s.project,
        cameras: s.project.cameras.map((c) =>
          c.id === camId ? { ...c, captures: [...c.captures, capture] } : c,
        ),
      },
    }));
    return capture;
  },
}));
