import { create } from 'zustand';
import type {
  BacklotCustomPayload,
  BacklotCustomTemplate,
  BacklotWorkspaceItem,
  BacklotWorkspacePayload,
  CharacterLibraryPayload,
  CharacterProfile,
  StoryboardPayload,
  StoryboardShot,
  VoiceLine,
  VoicePayload,
  VoiceProfile,
  WorkspacePayload,
} from '@nx9/shared';
import { emptyBacklotCustom, emptyBacklotWorkspace, emptyCharacterLibrary, emptyStoryboard, emptyVoice } from '@nx9/shared';
import { api } from '../api/client';

interface WorkspaceDocumentState {
  workspaceId: string | null;
  storyboard: StoryboardPayload;
  voice: VoicePayload;
  characters: CharacterLibraryPayload;
  backlotCustom: BacklotCustomPayload;
  backlotWorkspace: BacklotWorkspacePayload;
  hydrated: boolean;
  hydrate: (workspaceId: string, payload: WorkspacePayload) => void;
  reset: () => void;
  setStoryboard: (sb: StoryboardPayload) => void;
  setVoice: (v: VoicePayload) => void;
  setReviewMode: (mode: 'manual' | 'auto') => void;
  updateShot: (id: string, patch: Partial<StoryboardShot>) => void;
  addShots: (shots: StoryboardShot[], mode: 'append' | 'replace') => void;
  removeShot: (id: string) => void;
  addVoiceProfile: (profile: VoiceProfile) => void;
  updateVoiceLine: (id: string, patch: Partial<VoiceLine>) => void;
  addVoiceLines: (lines: VoiceLine[]) => void;
  upsertCharacter: (profile: CharacterProfile) => void;
  removeCharacter: (id: string) => void;
  addBacklotCustom: (item: BacklotCustomTemplate) => void;
  removeBacklotCustom: (id: string) => void;
  upsertBacklotWorkspace: (item: BacklotWorkspaceItem) => void;
  removeBacklotWorkspace: (id: string) => void;
  getSnapshotForSave: () => Pick<
    WorkspacePayload,
    'storyboard' | 'voice' | 'characters' | 'backlotCustom' | 'backlotWorkspace'
  >;
}

export const useWorkspaceDocument = create<WorkspaceDocumentState>((set, get) => ({
  workspaceId: null,
  storyboard: emptyStoryboard(),
  voice: emptyVoice(),
  characters: emptyCharacterLibrary(),
  backlotCustom: emptyBacklotCustom(),
  backlotWorkspace: emptyBacklotWorkspace(),
  hydrated: false,

  hydrate: (workspaceId, payload) =>
    set({
      workspaceId,
      storyboard: payload.storyboard ?? emptyStoryboard(),
      voice: payload.voice ?? emptyVoice(),
      characters: payload.characters ?? emptyCharacterLibrary(),
      backlotCustom: payload.backlotCustom ?? emptyBacklotCustom(),
      backlotWorkspace: payload.backlotWorkspace ?? emptyBacklotWorkspace(),
      hydrated: true,
    }),

  reset: () =>
    set({
      workspaceId: null,
      storyboard: emptyStoryboard(),
      voice: emptyVoice(),
      characters: emptyCharacterLibrary(),
      backlotCustom: emptyBacklotCustom(),
      backlotWorkspace: emptyBacklotWorkspace(),
      hydrated: false,
    }),

  setStoryboard: (sb) => set({ storyboard: sb }),

  setVoice: (v) => set({ voice: v }),

  setReviewMode: (reviewMode) =>
    set((s) => ({ storyboard: { ...s.storyboard, reviewMode } })),

  updateShot: (id, patch) =>
    set((s) => ({
      storyboard: {
        ...s.storyboard,
        shots: s.storyboard.shots.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot)),
      },
    })),

  addShots: (shots, mode) =>
    set((s) => {
      if (mode === 'replace') {
        return { storyboard: { ...s.storyboard, shots } };
      }
      const maxIdx = s.storyboard.shots.reduce((m, sh) => Math.max(m, sh.index), 0);
      const normalized = shots.map((sh, i) => ({
        ...sh,
        index: sh.index || maxIdx + i + 1,
      }));
      return {
        storyboard: {
          ...s.storyboard,
          shots: [...s.storyboard.shots, ...normalized].sort((a, b) => a.index - b.index),
        },
      };
    }),

  removeShot: (id) =>
    set((s) => ({
      storyboard: {
        ...s.storyboard,
        shots: s.storyboard.shots.filter((sh) => sh.id !== id),
      },
    })),

  addVoiceProfile: (profile) =>
    set((s) => ({
      voice: {
        ...s.voice,
        profiles: [...s.voice.profiles.filter((p) => p.id !== profile.id), profile],
      },
    })),

  updateVoiceLine: (id, patch) =>
    set((s) => ({
      voice: {
        ...s.voice,
        lines: s.voice.lines.map((ln) => (ln.id === id ? { ...ln, ...patch } : ln)),
      },
    })),

  addVoiceLines: (lines) =>
    set((s) => ({
      voice: {
        ...s.voice,
        lines: [...s.voice.lines, ...lines],
      },
    })),

  upsertCharacter: (profile) =>
    set((s) => ({
      characters: {
        ...s.characters,
        characters: [
          ...s.characters.characters.filter((c) => c.id !== profile.id),
          profile,
        ],
      },
    })),

  removeCharacter: (id) =>
    set((s) => ({
      characters: {
        ...s.characters,
        characters: s.characters.characters.filter((c) => c.id !== id),
      },
    })),

  addBacklotCustom: (item) =>
    set((s) => ({
      backlotCustom: {
        version: 1,
        items: [...s.backlotCustom.items.filter((x: BacklotCustomTemplate) => x.id !== item.id), item],
      },
    })),

  removeBacklotCustom: (id) =>
    set((s) => ({
      backlotCustom: {
        ...s.backlotCustom,
        items: s.backlotCustom.items.filter((x: BacklotCustomTemplate) => x.id !== id),
      },
    })),

  upsertBacklotWorkspace: (item) =>
    set((s) => ({
      backlotWorkspace: {
        version: 1,
        items: [
          ...s.backlotWorkspace.items.filter((x) => x.id !== item.id),
          item,
        ],
      },
    })),

  removeBacklotWorkspace: (id) =>
    set((s) => ({
      backlotWorkspace: {
        ...s.backlotWorkspace,
        items: s.backlotWorkspace.items.filter((x) => x.id !== id),
      },
    })),

  getSnapshotForSave: () => {
    const { storyboard, voice, characters, backlotCustom, backlotWorkspace } = get();
    return { storyboard, voice, characters, backlotCustom, backlotWorkspace };
  },
}));

/** Batch-generate TTS for pending voice lines. */
export async function generateVoiceLinesBatch(
  workspaceId: string,
  lineIds?: string[],
): Promise<{ ok: number; failed: number }> {
  return api.generateVoiceLines(workspaceId, lineIds);
}
