import { create } from 'zustand';

interface EdgeMenuState {
  onDelete?: (edgeId: string) => void;
  bindHandlers: (handlers: { onDelete: (edgeId: string) => void }) => void;
}

export const useStageDeckEdgeMenu = create<EdgeMenuState>((set) => ({
  bindHandlers: (handlers) => set(handlers),
}));
