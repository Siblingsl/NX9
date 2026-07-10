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
import { buildCameraPrompt } from '../schema/cameraGeometry';
import { loadLocalLibrary, upsertLocalAsset } from '../io/localLibrary';

const CROWD_MAX = 20;
const UNDO_MAX = 40;

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
  selectedObjectId: string | null;
  activeDrawer: StageDrawer;
  project: DirectorProject;
  undoStack: DirectorProject[];
  crowdMax: number;
  setViewMode: (mode: ViewMode) => void;
  setTransformMode: (mode: TransformMode) => void;
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
    patch: { bodyType?: CharacterBodyType; posePresetId?: string; color?: string },
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
}

function pushUndo(get: () => DirectorStoreState, set: (partial: Partial<DirectorStoreState>) => void) {
  const { project, undoStack } = get();
  set({ undoStack: [...undoStack.slice(-(UNDO_MAX - 1)), cloneProject(project)] });
}

export const useDirectorStore = create<DirectorStoreState>((set, get) => ({
  viewMode: 'director',
  transformMode: 'translate',
  selectedObjectId: null,
  activeDrawer: null,
  project: emptyDirectorProject(),
  undoStack: [],
  crowdMax: 20,

  setViewMode: (mode) => set({ viewMode: mode }),
  setTransformMode: (mode) => set({ transformMode: mode }),
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
    const { project } = get();
    const camId = project.activeCameraId;
    if (!camId) return null;
    const camera = project.cameras.find((c) => c.id === camId);
    if (!camera) return null;
    pushUndo(get, set);
    const index = camera.captures.length + 1;
    const capture: DirectorCameraCapture = {
      id: uid('cap'),
      index,
      name: `帧 ${String(index).padStart(2, '0')}`,
      dataUrl,
      imageUrl,
      cameraPrompt: buildCameraPrompt(camera),
      cameraPosition: camera.transform.position,
      cameraRotation: camera.transform.rotation,
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
