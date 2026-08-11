import type { AssetLibraryKind, AssetScope } from '@nx9/shared';
import { isAssetLibraryPublicOnlyKind } from '@nx9/shared';
import { create } from 'zustand';
import { useWorkspaceCatalog } from './workspace-catalog';

export interface AssetLibraryNavigateRequest {
  tab: AssetLibraryKind;
  itemId?: string;
  scope?: AssetScope;
  projectId?: string;
  query?: string;
  /** 建议建档：预填名称，由 Modal 显式确认后新建（Prop-08 / R-04 / UX-02） */
  suggestCreateLabel?: string;
  /** 语境条，如「来自设定就绪」（UX-01 / UX-03） */
  returnHint?: string;
}

export const useAssetLibraryModalUi = create<{
  open: boolean;
  scope: AssetScope;
  tab: AssetLibraryKind;
  navigateRequest: AssetLibraryNavigateRequest | null;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setScope: (scope: AssetScope) => void;
  setTab: (tab: AssetLibraryKind) => void;
  openAt: (request: AssetLibraryNavigateRequest) => void;
  openPublic: () => void;
  clearNavigateRequest: () => void;
}>((set) => ({
  open: false,
  scope: 'private',
  tab: 'character',
  navigateRequest: null,
  setOpen: (open) =>
    set(open ? { open: true, scope: 'private', tab: 'character' } : { open: false }),
  toggle: () =>
    set((s) =>
      s.open
        ? { open: false }
        : { open: true, scope: 'private', tab: 'character' },
    ),
  setScope: (scope) => set({ scope, tab: 'character' }),
  setTab: (tab) => set({ tab }),
  openAt: (request) => {
    const scope = isAssetLibraryPublicOnlyKind(request.tab)
      ? 'public'
      : (request.scope ?? 'private');
    if (scope === 'private' && request.projectId) {
      const activeId = useWorkspaceCatalog.getState().activeId;
      if (request.projectId !== activeId) {
        void useWorkspaceCatalog.getState().selectWorkspace(request.projectId);
      }
    }
    set({
      open: true,
      tab: request.tab,
      scope,
      navigateRequest: { ...request, scope },
    });
  },
  openPublic: () =>
    set({
      open: true,
      scope: 'public',
      tab: 'character',
      navigateRequest: null,
    }),
  clearNavigateRequest: () => set({ navigateRequest: null }),
}));
