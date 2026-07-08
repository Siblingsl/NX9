import { create } from 'zustand';
import type { AppSettings } from '@nx9/shared';
import { api } from '../api/client';

interface CredentialVaultState {
  settings: AppSettings | null;
  settingsOpen: boolean;
  load: () => Promise<void>;
  save: (partial: AppSettings) => Promise<void>;
  toggleSettings: (open?: boolean) => void;
}

export const useCredentialVault = create<CredentialVaultState>((set) => ({
  settings: null,
  settingsOpen: false,

  load: async () => {
    const settings = await api.getSettings();
    set({ settings });
  },

  save: async (partial) => {
    const settings = await api.saveSettings(partial);
    set({ settings });
  },

  toggleSettings: (open) =>
    set((s) => ({ settingsOpen: open ?? !s.settingsOpen })),
}));
