import { create } from 'zustand';
import type {
  CharacterBodyType,
  DirectorAsset,
  DirectorCameraCapture,
  DirectorCameraShot,
  DirectorObject,
  DirectorProject,
  DirectorTransform,
  GeometryPrimitiveType,
  PanoramaSettings,
  TransformMode,
  ViewMode,
  ViewportAspectRatio,
} from '../schema/directorProject';
import { emptyDirectorProject } from '../schema/directorProject';
import {
  applyOrbitToCamera,
  buildCameraPrompt,
  DEFAULT_PROMPT_DETAILS,
  type CameraMoveId,
  type CameraOrbit,
  type PromptDetailFlags,
} from '../schema/cameraGeometry';
import type { PromptPlatformId } from '../schema/promptSkin';
import { skinCameraPrompt } from '../schema/promptSkin';
import { loadLocalLibrary, upsertLocalAsset } from '../io/localLibrary';

const CROWD_MAX = 20;
const UNDO_MAX = 40;

export type StageInteractionMode = 'navigate' | 'subject' | 'camera';
export type StageViewportLayout = 'single' | 'quad';
export type StageQuadPane = 'camera' | 'top' | 'left' | 'right';
export type StageMobileSheet = 'shots' | 'rig' | 'layers' | 'add' | 'env' | 'film' | null;

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

export type StageDrawer = 'layers' | 'add' | 'env' | null;

export interface DirectorStoreState {
  viewMode: ViewMode;
  transformMode: TransformMode;
  interactionMode: StageInteractionMode;
  viewportLayout: StageViewportLayout;
  activeQuadPane: StageQuadPane;
  mobileSheet: StageMobileSheet;
  cameraMove: CameraMoveId;
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
      activeDrawer: sheet === 'layers' || sheet === 'add' || sheet === 'env' ? sheet : get().activeDrawer,
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

  addCapture: (dataUrl, imageUrl) => {
    const { project, cameraMove, promptPlatform, promptDetails } = get();
    const camId = project.activeCameraId;
    if (!camId) return null;
    const camera = project.cameras.find((c) => c.id === camId);
    if (!camera) return null;
    const subject = project.objects.find((o) => o.kind === 'character' && o.visible);
    pushUndo(get, set);
    const index = camera.captures.length + 1;
    const basePrompt = buildCameraPrompt(camera, {
      roll: camera.transform.rotation[2],
      subjectYawDeg: subject?.transform.rotation[1] ?? 0,
      move: cameraMove,
      details: promptDetails,
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
