import type {
  BacklotCustomTemplate,
  CharacterProfile,
  PublicLibraryPayload,
  SoundAssetProfile,
} from '@nx9/shared';
import {
  emptyPublicLibrary,
  purgeAssetById,
  purgeExpiredAssets,
  restoreAssetById,
  softDeleteAssetById,
} from '@nx9/shared';
import { create } from 'zustand';
import { api } from '../api/client';

interface PublicAssetLibraryState {
  payload: PublicLibraryPayload;
  loading: boolean;
  hydrated: boolean;
  fetch: () => Promise<void>;
  save: () => Promise<void>;
  upsertCharacter: (profile: CharacterProfile) => void;
  /** F-010: 软删除 → 回收站 */
  removeCharacter: (id: string) => void;
  restoreCharacter: (id: string) => { restoredId: string; conflictRenamed: boolean };
  purgeCharacter: (id: string) => void;
  upsertTemplate: (item: BacklotCustomTemplate) => void;
  /** F-010: 软删除 → 回收站 */
  removeTemplate: (id: string) => void;
  restoreTemplate: (id: string) => { restoredId: string; conflictRenamed: boolean };
  purgeTemplate: (id: string) => void;
  upsertSound: (sound: SoundAssetProfile) => void;
  /** F-010: 软删除 → 回收站 */
  removeSound: (id: string) => void;
  restoreSound: (id: string) => { restoredId: string; conflictRenamed: boolean };
  purgeSound: (id: string) => void;
  /** F-010: 清理过期资产（≥30天） */
  purgeExpiredTrashedAssets: () => number;
}

export const usePublicAssetLibrary = create<PublicAssetLibraryState>((set, get) => ({
  payload: emptyPublicLibrary(),
  loading: false,
  hydrated: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const payload = await api.loadPublicLibrary();
      const chars = purgeExpiredAssets(payload.characters ?? []);
      const sounds = purgeExpiredAssets(payload.sounds ?? []);
      const templates = purgeExpiredAssets(payload.templates ?? []);
      const next: PublicLibraryPayload = {
        ...payload,
        characters: chars.items,
        sounds: sounds.items,
        templates: templates.items,
      };
      set({ payload: next, hydrated: true });
      if (chars.purgedCount + sounds.purgedCount + templates.purgedCount > 0) {
        void api.savePublicLibrary(next);
      }
    } finally {
      set({ loading: false });
    }
  },

  save: async () => {
    const payload = await api.savePublicLibrary(get().payload);
    set({ payload, hydrated: true });
  },

  upsertCharacter: (profile) => {
    set((s) => ({
      payload: {
        ...s.payload,
        characters: [...s.payload.characters.filter((c) => c.id !== profile.id), profile],
      },
    }));
    void get().save();
  },

  removeCharacter: (id) => {
    set((s) => ({
      payload: {
        ...s.payload,
        characters: softDeleteAssetById(s.payload.characters, id),
      },
    }));
    void get().save();
  },

  restoreCharacter: (id) => {
    let result = { restoredId: id, conflictRenamed: false };
    set((s) => {
      const next = restoreAssetById(s.payload.characters, id, () =>
        `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      );
      result = { restoredId: next.restoredId, conflictRenamed: next.conflictRenamed };
      return { payload: { ...s.payload, characters: next.items } };
    });
    void get().save();
    return result;
  },

  purgeCharacter: (id) => {
    set((s) => ({
      payload: {
        ...s.payload,
        characters: purgeAssetById(s.payload.characters, id),
      },
    }));
    void get().save();
  },

  upsertTemplate: (item) => {
    set((s) => ({
      payload: {
        ...s.payload,
        templates: [...s.payload.templates.filter((t) => t.id !== item.id), item],
      },
    }));
    void get().save();
  },

  removeTemplate: (id) => {
    set((s) => ({
      payload: {
        ...s.payload,
        templates: softDeleteAssetById(s.payload.templates, id),
      },
    }));
    void get().save();
  },

  restoreTemplate: (id) => {
    let result = { restoredId: id, conflictRenamed: false };
    set((s) => {
      const next = restoreAssetById(s.payload.templates, id, () =>
        `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      );
      result = { restoredId: next.restoredId, conflictRenamed: next.conflictRenamed };
      return { payload: { ...s.payload, templates: next.items } };
    });
    void get().save();
    return result;
  },

  purgeTemplate: (id) => {
    set((s) => ({
      payload: {
        ...s.payload,
        templates: purgeAssetById(s.payload.templates, id),
      },
    }));
    void get().save();
  },

  upsertSound: (sound) => {
    set((s) => ({
      payload: {
        ...s.payload,
        sounds: [...s.payload.sounds.filter((x) => x.id !== sound.id), sound],
      },
    }));
    void get().save();
  },

  removeSound: (id) => {
    set((s) => ({
      payload: {
        ...s.payload,
        sounds: softDeleteAssetById(s.payload.sounds, id),
      },
    }));
    void get().save();
  },

  restoreSound: (id) => {
    let result = { restoredId: id, conflictRenamed: false };
    set((s) => {
      const next = restoreAssetById(s.payload.sounds, id, () =>
        `sound-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      );
      result = { restoredId: next.restoredId, conflictRenamed: next.conflictRenamed };
      return { payload: { ...s.payload, sounds: next.items } };
    });
    void get().save();
    return result;
  },

  purgeSound: (id) => {
    set((s) => ({
      payload: {
        ...s.payload,
        sounds: purgeAssetById(s.payload.sounds, id),
      },
    }));
    void get().save();
  },

  purgeExpiredTrashedAssets: () => {
    let total = 0;
    set((s) => {
      const chars = purgeExpiredAssets(s.payload.characters);
      const sounds = purgeExpiredAssets(s.payload.sounds);
      const templates = purgeExpiredAssets(s.payload.templates);
      total = chars.purgedCount + sounds.purgedCount + templates.purgedCount;
      return {
        payload: {
          ...s.payload,
          characters: chars.items,
          sounds: sounds.items,
          templates: templates.items,
        },
      };
    });
    if (total > 0) void get().save();
    return total;
  },
}));
