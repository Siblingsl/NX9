import { create } from 'zustand';
import type { SkillSummary } from '@nx9/shared';
import { api } from '../api/client';

interface SkillVaultState {
  items: SkillSummary[];
  loading: boolean;
  drawerOpen: boolean;
  selectedId: string | null;
  fetchAll: () => Promise<void>;
  create: (input: { id: string; name?: string; description?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setSelected: (id: string | null) => void;
  toggleDrawer: (open?: boolean) => void;
}

export const useSkillVault = create<SkillVaultState>((set, get) => ({
  items: [],
  loading: false,
  drawerOpen: false,
  selectedId: null,

  fetchAll: async () => {
    set({ loading: true });
    try {
      const items = await api.listSkills();
      set({ items });
    } finally {
      set({ loading: false });
    }
  },

  create: async (input) => {
    const item = await api.createSkill(input);
    set({ items: [...get().items, item], selectedId: item.id });
  },

  remove: async (id) => {
    await api.deleteSkill(id);
    const items = get().items.filter((s) => s.id !== id);
    set({
      items,
      selectedId: get().selectedId === id ? null : get().selectedId,
    });
  },

  setSelected: (id) => set({ selectedId: id }),
  toggleDrawer: (open) => set((s) => ({ drawerOpen: open ?? !s.drawerOpen })),
}));
