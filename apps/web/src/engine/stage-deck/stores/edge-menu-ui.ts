import { create } from 'zustand';
import type { FlowEdgeTypeId } from '../../flow-edge-types';

interface EdgeMenuState {
  menu: { x: number; y: number; edgeId: string; edgeType: FlowEdgeTypeId } | null;
  onChangeType?: (edgeId: string, type: FlowEdgeTypeId) => void;
  onDelete?: (edgeId: string) => void;
  setMenu: (menu: EdgeMenuState['menu']) => void;
  bindHandlers: (handlers: {
    onChangeType: (edgeId: string, type: FlowEdgeTypeId) => void;
    onDelete: (edgeId: string) => void;
  }) => void;
}

export const useStageDeckEdgeMenu = create<EdgeMenuState>((set) => ({
  menu: null,
  setMenu: (menu) => set({ menu }),
  bindHandlers: (handlers) => set(handlers),
}));
