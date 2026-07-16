import { create } from 'zustand';
import type { ViewMode } from '@nx9/shared';

/** 默认制作模式：产品心智为「做剧」，探索/编排为专家面 */
const DEFAULT_VIEW_MODE: ViewMode = 'produce';

export const useViewMode = create<{
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  hydrate: (mode: ViewMode | undefined) => void;
}>((set) => ({
  mode: DEFAULT_VIEW_MODE,
  setMode: (mode) => set({ mode }),
  hydrate: (mode) => set({ mode: mode ?? DEFAULT_VIEW_MODE }),
}));
