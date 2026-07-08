import type { BacklotTemplateKind } from '@nx9/shared';
import { create } from 'zustand';

export interface BacklotWorkspaceNavigateRequest {
  tab: BacklotTemplateKind;
  itemId: string;
  expandSave?: boolean;
}

export const useBacklotLibraryUi = create<{
  open: boolean;
  navigateRequest: BacklotWorkspaceNavigateRequest | null;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  openWorkspace: (request: BacklotWorkspaceNavigateRequest) => void;
  clearNavigateRequest: () => void;
}>((set) => ({
  open: false,
  navigateRequest: null,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  openWorkspace: (request) => set({ open: true, navigateRequest: request }),
  clearNavigateRequest: () => set({ navigateRequest: null }),
}));
