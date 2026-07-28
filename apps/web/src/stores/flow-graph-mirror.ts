/**
 * flow-graph-mirror — 画布图镜像（F-002 / F-003）。
 *
 * 画布卸载后 React Flow 不可用；制作台通过本 store 读写同一份 nodes/edges，
 * 保证与画布 chainStoryboard SSOT 对等。
 */
import { create } from 'zustand';
import type { Edge, Node } from '@xyflow/react';

interface FlowGraphMirrorState {
  workspaceId: string | null;
  nodes: Node[];
  edges: Edge[];
  lastFocusedStoryboardDeskId: string | null;
  revision: number;
  /** FlowSurface 同步全量图 */
  syncGraph: (workspaceId: string | null, nodes: Node[], edges: Edge[]) => void;
  setLastFocusedStoryboardDeskId: (id: string | null) => void;
  /** 制作台/批出写回：就地更新节点 data */
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  getNodes: () => Node[];
  getEdges: () => Edge[];
  clear: () => void;
}

export const useFlowGraphMirror = create<FlowGraphMirrorState>((set, get) => ({
  workspaceId: null,
  nodes: [],
  edges: [],
  lastFocusedStoryboardDeskId: null,
  revision: 0,

  syncGraph: (workspaceId, nodes, edges) => {
    set({
      workspaceId,
      nodes: nodes.map((n) => ({ ...n, data: { ...(n.data ?? {}) } })),
      edges: edges.map((e) => ({ ...e })),
      revision: get().revision + 1,
    });
  },

  setLastFocusedStoryboardDeskId: (id) => {
    set({ lastFocusedStoryboardDeskId: id });
  },

  updateNodeData: (id, patch) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...(n.data ?? {}), ...patch } } : n,
      ),
      revision: s.revision + 1,
    }));
  },

  getNodes: () => get().nodes,
  getEdges: () => get().edges,

  clear: () =>
    set({
      workspaceId: null,
      nodes: [],
      edges: [],
      lastFocusedStoryboardDeskId: null,
      revision: 0,
    }),
}));

/** 非 hook：批出/Playbook 等在 React 外读取 */
export function getMirroredFlowGraph() {
  const s = useFlowGraphMirror.getState();
  return { nodes: s.nodes, edges: s.edges, workspaceId: s.workspaceId };
}
