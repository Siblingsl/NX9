import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';

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

export const useVersionHistory = create<VersionState>((set, get) => ({
  snapshots: [],
  currentVersion: 0,

  takeSnapshot: (label, nodes, edges) =>
    set((s) => ({
      snapshots: [...s.snapshots, { version: s.currentVersion + 1, label, nodes: structuredClone(nodes), edges: structuredClone(edges), createdAt: new Date().toISOString() }],
      currentVersion: s.currentVersion + 1,
    })),

  restore: (version) => {
    const snap = get().snapshots.find((s) => s.version === version);
    return snap ?? null;
  },

  clear: () => set({ snapshots: [], currentVersion: 0 }),
}));
