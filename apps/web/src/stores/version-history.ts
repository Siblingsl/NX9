import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import { useFlowGraphMirror } from './flow-graph-mirror';

export interface StorySnapshot {
  version: number;
  label: string;
  nodes: Node[];
  edges: Edge[];
  createdAt: string;
}

interface VersionState {
  snapshots: StorySnapshot[];
  currentVersion: number;
  takeSnapshot: (label: string, nodes: Node[], edges: Edge[]) => void;
  restore: (version: number) => StorySnapshot | null;
  clear: () => void;
}

/** SE-RESUME: 快照落盘上限（完整 nodes/edges 较大，超出裁掉最旧的） */
const MAX_PERSISTED_SNAPSHOTS = 10;

function historyStorageKey(wsId: string): string {
  return `nx9-version-history:${wsId}`;
}

function persistHistory(snapshots: StorySnapshot[], currentVersion: number): void {
  try {
    const wsId = useFlowGraphMirror.getState().workspaceId;
    if (!wsId) return;
    const trimmed = snapshots.slice(-MAX_PERSISTED_SNAPSHOTS);
    localStorage.setItem(
      historyStorageKey(wsId),
      JSON.stringify({ snapshots: trimmed, currentVersion }),
    );
  } catch {
    /* localStorage 超限/不可用时静默：内存快照仍可用 */
  }
}

/** SE-RESUME: 工作区加载时恢复历史版本（刷新不再丢快照；切换工作区时重置内存） */
export function hydrateVersionHistory(workspaceId: string): void {
  try {
    const raw = localStorage.getItem(historyStorageKey(workspaceId));
    if (!raw) {
      useVersionHistory.setState({ snapshots: [], currentVersion: 0 });
      return;
    }
    const parsed = JSON.parse(raw) as { snapshots?: StorySnapshot[]; currentVersion?: number };
    if (!Array.isArray(parsed.snapshots) || parsed.snapshots.length === 0) {
      useVersionHistory.setState({ snapshots: [], currentVersion: 0 });
      return;
    }
    useVersionHistory.setState({
      snapshots: parsed.snapshots,
      currentVersion: parsed.currentVersion ?? parsed.snapshots.length,
    });
  } catch {
    /* 损坏快照按无快照处理 */
    useVersionHistory.setState({ snapshots: [], currentVersion: 0 });
  }
}

export const useVersionHistory = create<VersionState>((set, get) => ({
  snapshots: [],
  currentVersion: 0,

  takeSnapshot: (label, nodes, edges) => {
    const nextVersion = get().currentVersion + 1;
    const next = [
      ...get().snapshots,
      { version: nextVersion, label, nodes: structuredClone(nodes), edges: structuredClone(edges), createdAt: new Date().toISOString() },
    ];
    set({ snapshots: next, currentVersion: nextVersion });
    persistHistory(next, nextVersion);
  },

  restore: (version) => {
    const snap = get().snapshots.find((s) => s.version === version);
    return snap ?? null;
  },

  clear: () => {
    set({ snapshots: [], currentVersion: 0 });
    try {
      const wsId = useFlowGraphMirror.getState().workspaceId;
      if (wsId) localStorage.removeItem(historyStorageKey(wsId));
    } catch {
      /* ignore */
    }
  },
}));
