import { create } from 'zustand';

export type ContextRailTab =
  | 'props'
  | 'storyboard'
  | 'backlot'
  | 'history'
  | 'workflow'
  | 'agent';

export const useContextRailUi = create<{
  requestedTab: ContextRailTab | null;
  requestTab: (tab: ContextRailTab) => void;
  clearRequest: () => void;
}>((set) => ({
  requestedTab: null,
  requestTab: (requestedTab) => set({ requestedTab }),
  clearRequest: () => set({ requestedTab: null }),
}));
