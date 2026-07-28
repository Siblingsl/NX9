import { create } from 'zustand';
import type { AppSettings } from '@nx9/shared';
import { api } from '../api/client';

interface CredentialVaultState {
  settings: AppSettings | null;
  settingsOpen: boolean;
  load: () => Promise<void>;
  save: (partial: AppSettings) => Promise<void>;
  toggleSettings: (open?: boolean) => void;
  openSettingsTo: (section: string) => void;
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
  /** 打开设置并跳转到指定 Tab */
  openSettingsTo: (section: string) => {
    set({ settingsOpen: true });
    // 通过 window 自定事件传递 section
    window.dispatchEvent(new CustomEvent('nx9:openSettingsSection', { detail: { section } }));
  },
}));
