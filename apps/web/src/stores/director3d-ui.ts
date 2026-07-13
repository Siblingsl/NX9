import { create } from 'zustand';
import type { DirectorProject } from '@nx9/director3d';
import { emptyDirectorProject } from '@nx9/director3d';

interface Director3dUiState {
  open: boolean;
  blockId: string | null;
  linkedShotId: string | null;
  linkedStoryboardPreviewId: string | null;
  linkedStoryboardPreviewFrameId: string | null;
  project: DirectorProject;
  hostBridge: string | null;
  openForBlock: (
    blockId: string,
    project?: DirectorProject,
    linkedShotId?: string,
    storyboardLink?: { previewBlockId: string; frameId: string },
  ) => void;
  openStandalone: () => void;
  close: () => void;
  setProject: (project: DirectorProject) => void;
  setHostBridge: (url: string | null) => void;
}

export const useDirector3dUi = create<Director3dUiState>((set) => ({
  open: false,
  blockId: null,
  linkedShotId: null,
  linkedStoryboardPreviewId: null,
  linkedStoryboardPreviewFrameId: null,
  project: emptyDirectorProject(),
  hostBridge: null,

  openForBlock: (blockId, project, linkedShotId, storyboardLink) =>
    set({
      open: true,
      blockId,
      linkedShotId: linkedShotId ?? null,
      linkedStoryboardPreviewId: storyboardLink?.previewBlockId ?? null,
      linkedStoryboardPreviewFrameId: storyboardLink?.frameId ?? null,
      project: project ?? emptyDirectorProject(),
    }),

  openStandalone: () =>
    set({
      open: true,
      blockId: null,
      linkedShotId: null,
      linkedStoryboardPreviewId: null,
      linkedStoryboardPreviewFrameId: null,
      project: emptyDirectorProject(),
    }),

  close: () =>
    set({
      open: false,
      blockId: null,
      linkedShotId: null,
      linkedStoryboardPreviewId: null,
      linkedStoryboardPreviewFrameId: null,
    }),

  setProject: (project) => set({ project }),

  setHostBridge: (url) => set({ hostBridge: url }),
}));
