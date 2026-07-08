import { create } from 'zustand';
import type { ViewMode } from '@nx9/shared';

export const useViewMode = create<{
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  hydrate: (mode: ViewMode | undefined) => void;
}>((set) => ({
  mode: 'explore',
  setMode: (mode) => set({ mode }),
  hydrate: (mode) => set({ mode: mode ?? 'explore' }),
}));
