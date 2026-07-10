import { create } from 'zustand';

export type ContextRailTab = 'inspector' | 'storyboard' | 'script' | 'library' | 'inspect' | 'tasks';

export type LibrarySubTab = 'templates' | 'history' | 'workflow';

export interface ContextRailUiState {
  requestedTab: ContextRailTab | null;
  librarySub: LibrarySubTab;
  banner: { kind: 'review' | 'blocked'; shotIds: string[] } | null;
  requestTab: (tab: ContextRailTab, opts?: { librarySub?: LibrarySubTab }) => void;
  clearRequest: () => void;
  setBanner: (b: { kind: 'review' | 'blocked'; shotIds: string[] } | null) => void;
  setLibrarySub: (sub: LibrarySubTab) => void;
}

export const useContextRailUi = create<ContextRailUiState>((set) => ({
  requestedTab: null,
  librarySub: 'templates',
  banner: null,
  requestTab: (tab, opts) =>
    set({
      requestedTab: tab,
      librarySub: opts?.librarySub ?? 'templates',
    }),
  clearRequest: () => set({ requestedTab: null }),
  setBanner: (banner) => set({ banner }),
  setLibrarySub: (librarySub) => set({ librarySub }),
}));
