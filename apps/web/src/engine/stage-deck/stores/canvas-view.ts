import { create } from 'zustand';
import { useWorkspaceDocument } from '../../../stores/workspace-document';

export type CanvasView = 'flow' | 'storyboard';

export const useCanvasView = create<{
  view: CanvasView;
  setView: (view: CanvasView) => void;
  autoSwitch: () => void;
}>((set, get) => ({
  view: 'flow',
  setView: (view) => set({ view }),
  autoSwitch: () => {
    const session = useWorkspaceDocument.getState().playbookSession;
    const hasActivePlaybook = session && !session.dismissed && session.playbookId !== 'pb-blank-advanced';
    set({ view: hasActivePlaybook ? 'storyboard' : 'flow' });
  },
}));
