import type { AssetLibraryKind, AssetScope } from '@nx9/shared';
import { create } from 'zustand';

export type AssetLibraryView = 'projects' | 'assets';

export interface AssetLibraryNavigateRequest {
  tab: AssetLibraryKind;
  itemId?: string;
  scope?: AssetScope;
  projectId?: string;
  query?: string;
}

export const useAssetLibraryModalUi = create<{
  open: boolean;
  scope: AssetScope;
  tab: AssetLibraryKind;
  view: AssetLibraryView;
  selectedProjectId: string | null;
  navigateRequest: AssetLibraryNavigateRequest | null;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setScope: (scope: AssetScope) => void;
  setTab: (tab: AssetLibraryKind) => void;
  enterProject: (projectId: string) => void;
  backToProjects: () => void;
  openAt: (request: AssetLibraryNavigateRequest) => void;
  openPublic: () => void;
  clearNavigateRequest: () => void;
}>((set) => ({
  open: false,
  scope: 'private',
  tab: 'character',
  view: 'projects',
  selectedProjectId: null,
  navigateRequest: null,
  setOpen: (open) =>
    set(
      open
        ? { open: true, view: 'projects', selectedProjectId: null }
        : { open: false },
    ),
  toggle: () =>
    set((s) =>
      s.open
        ? { open: false }
        : { open: true, view: 'projects', selectedProjectId: null },
    ),
  setScope: (scope) =>
    set({
      scope,
      view: scope === 'public' ? 'assets' : 'projects',
      selectedProjectId: scope === 'public' ? null : null,
      tab: 'character',
    }),
  setTab: (tab) => set({ tab }),
  enterProject: (projectId) =>
    set({ view: 'assets', selectedProjectId: projectId, tab: 'character' }),
  backToProjects: () =>
    set({ view: 'projects', selectedProjectId: null, tab: 'character' }),
  openAt: (request) =>
    set({
      open: true,
      tab: request.tab,
      scope: request.scope ?? 'private',
      view: request.scope === 'public' ? 'assets' : 'assets',
      selectedProjectId:
        request.scope === 'public' ? null : (request.projectId ?? null),
      navigateRequest: request,
    }),
  openPublic: () =>
    set({
      open: true,
      scope: 'public',
      tab: 'character',
      view: 'assets',
      selectedProjectId: null,
      navigateRequest: null,
    }),
  clearNavigateRequest: () => set({ navigateRequest: null }),
}));
