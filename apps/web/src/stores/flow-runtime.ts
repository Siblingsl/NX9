import { create } from 'zustand';
import type { Edge, Node, Viewport } from '@xyflow/react';

export interface FlowRuntimeApi {
  getNodes: () => Node[];
  getEdges: () => Edge[];
  getViewport: () => Viewport;
  setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  intensive: boolean;
  runBatch: () => Promise<void>;
  runSelected: (ids: string[]) => void | Promise<void>;
  rerunSelected: (ids: string[]) => void | Promise<void>;
  runCascade?: (blockId: string) => void | Promise<void>;
  stopRun: () => void;
  deleteNodes: (ids: string[]) => void;
  focusBlock: (blockId: string) => void;
  fitViewToNodes: (nodeIds: string[]) => void;
  highlightNodes: (nodeIds: string[], opts?: { durationMs?: number }) => void;
  spawnBlockForShot: (shotId: string, kind: string, extraData?: Record<string, unknown>) => void;
  loadWorkflowTemplate: (templateId: string, mode?: 'merge' | 'replace') => void | Promise<void>;
  importWorkflowZip: (file: File, mode?: 'merge' | 'replace') => Promise<void>;
  selectedBlockId: string | null;
}

interface FlowRuntimeState {
  runtime: FlowRuntimeApi | null;
  selectedBlockId: string | null;
  register: (api: FlowRuntimeApi) => void;
  unregister: () => void;
  setSelectedBlockId: (id: string | null) => void;
}

export const useFlowRuntime = create<FlowRuntimeState>((set) => ({
  runtime: null,
  selectedBlockId: null,
  register: (api) => set({ runtime: api }),
  unregister: () => set({ runtime: null, selectedBlockId: null }),
  setSelectedBlockId: (selectedBlockId) => set({ selectedBlockId }),
}));

export const useStoryboardUi = create<{
  open: boolean;
  view: 'list' | 'grid' | 'timeline';
  selectedShotId: string | null;
  tab: 'shots' | 'voice';
  scrollToShotId: string | null;
  toggle: () => void;
  setOpen: (v: boolean) => void;
  setView: (v: 'list' | 'grid' | 'timeline') => void;
  selectShot: (id: string | null) => void;
  setTab: (t: 'shots' | 'voice') => void;
  requestScrollToShot: (id: string | null) => void;
}>((set) => ({
  open: false,
  view: 'list',
  selectedShotId: null,
  tab: 'shots',
  scrollToShotId: null,
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),
  setView: (view) => set({ view }),
  selectShot: (selectedShotId) => set({ selectedShotId }),
  setTab: (tab) => set({ tab }),
  requestScrollToShot: (scrollToShotId) => set({ scrollToShotId }),
}));

export const useRemotionUi = create<{
  open: boolean;
  setOpen: (v: boolean) => void;
  requestOpen: () => void;
}>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  requestOpen: () => set({ open: true }),
}));
