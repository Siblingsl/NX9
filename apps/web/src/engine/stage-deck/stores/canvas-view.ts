import { create } from 'zustand';

export type CanvasView = 'flow' | 'storyboard';

export const useCanvasView = create<{
  view: CanvasView;
  setView: (view: CanvasView) => void;
  autoSwitch: () => void;
}>((set) => ({
  view: 'flow',
  setView: (view) => set({ view }),
  autoSwitch: () => set({ view: 'flow' }),
}));
