import { create } from 'zustand';
import type { WorkspaceSummary } from '@nx9/shared';
import { api } from '../api/client';

interface WorkspaceCatalogState {
  items: WorkspaceSummary[];
  activeId: string | null;
  loading: boolean;
  fetchAll: () => Promise<void>;
  setActive: (id: string | null) => void;
  create: (title?: string) => Promise<WorkspaceSummary>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useWorkspaceCatalog = create<WorkspaceCatalogState>((set, get) => ({
  items: [],
  activeId: null,
  loading: false,

  fetchAll: async () => {
    set({ loading: true });
    try {
      const { useUserSession } = await import('./user-session');
      const ownerId = useUserSession.getState().userId ?? undefined;
      const items = await api.listWorkspaces(ownerId);
      set({ items });
      if (!get().activeId && items.length > 0) {
        set({ activeId: items[0].id });
      }
    } finally {
      set({ loading: false });
    }
  },

  setActive: (id) => set({ activeId: id }),

  create: async (title) => {
    const { useUserSession } = await import('./user-session');
    const ownerId = useUserSession.getState().userId ?? undefined;
    const item = await api.createWorkspace(title, ownerId);
    set({ items: [...get().items, item], activeId: item.id });
    return item;
  },

  rename: async (id, title) => {
    const updated = await api.renameWorkspace(id, title);
    set({ items: get().items.map((w) => (w.id === id ? updated : w)) });
  },

  remove: async (id) => {
    await api.deleteWorkspace(id);
    const items = get().items.filter((w) => w.id !== id);
    const activeId = get().activeId === id ? items[0]?.id ?? null : get().activeId;
    set({ items, activeId });
  },
}));
