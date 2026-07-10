import { create } from 'zustand';
import type { DirectorProject } from '@nx9/director3d';
import { emptyDirectorProject } from '@nx9/director3d';

interface Director3dUiState {
  open: boolean;
  blockId: string | null;
  linkedShotId: string | null;
  project: DirectorProject;
  hostBridge: string | null;
  openForBlock: (blockId: string, project?: DirectorProject, linkedShotId?: string) => void;
  openStandalone: () => void;
  close: () => void;
  setProject: (project: DirectorProject) => void;
  setHostBridge: (url: string | null) => void;
}

export const useDirector3dUi = create<Director3dUiState>((set) => ({
  open: false,
  blockId: null,
  linkedShotId: null,
  project: emptyDirectorProject(),
  hostBridge: null,

  openForBlock: (blockId, project, linkedShotId) =>
    set({
      open: true,
      blockId,
      linkedShotId: linkedShotId ?? null,
      project: project ?? emptyDirectorProject(),
    }),

  openStandalone: () =>
    set({
      open: true,
      blockId: null,
      linkedShotId: null,
      project: emptyDirectorProject(),
    }),

  close: () => set({ open: false, blockId: null, linkedShotId: null }),

  setProject: (project) => set({ project }),

  setHostBridge: (url) => set({ hostBridge: url }),
}));
