import type {
  BacklotCustomTemplate,
  CharacterProfile,
  PublicLibraryPayload,
  SoundAssetProfile,
} from '@nx9/shared';
import { emptyPublicLibrary } from '@nx9/shared';
import { create } from 'zustand';
import { api } from '../api/client';

interface PublicAssetLibraryState {
  payload: PublicLibraryPayload;
  loading: boolean;
  hydrated: boolean;
  fetch: () => Promise<void>;
  save: () => Promise<void>;
  upsertCharacter: (profile: CharacterProfile) => void;
  removeCharacter: (id: string) => void;
  upsertTemplate: (item: BacklotCustomTemplate) => void;
  removeTemplate: (id: string) => void;
  upsertSound: (sound: SoundAssetProfile) => void;
  removeSound: (id: string) => void;
}

export const usePublicAssetLibrary = create<PublicAssetLibraryState>((set, get) => ({
  payload: emptyPublicLibrary(),
  loading: false,
  hydrated: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const payload = await api.loadPublicLibrary();
      set({ payload, hydrated: true });
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
        characters: s.payload.characters.filter((c) => c.id !== id),
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
        templates: s.payload.templates.filter((t) => t.id !== id),
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
        sounds: s.payload.sounds.filter((x) => x.id !== id),
      },
    }));
    void get().save();
  },
}));
