import { create } from 'zustand';
import type {
  BacklotCustomPayload,
  BacklotCustomTemplate,
  BacklotWorkspaceItem,
  BacklotWorkspacePayload,
  CanvasAppearance,
  CharacterLibraryPayload,
  CharacterProfile,
  EnvironmentLibraryPayload,
  EnvironmentProfile,
  PlaybookId,
  PlaybookSession,
  ScriptPlanPayload,
  StoryboardPayload,
  StoryboardShot,
  TimelinePayload,
  VoiceLine,
  VoicePayload,
  VoiceProfile,
  WorkspacePayload,
  WorkspacePreferences,
} from '@nx9/shared';
import {
  DEFAULT_CANVAS_APPEARANCE,
  emptyBacklotCustom,
  emptyBacklotWorkspace,
  emptyCharacterLibrary,
  emptyStoryboard,
  emptyVoice,
  PLAYBOOK_DEFINITIONS,
  resolveNextStep,
  migrateEnvironmentProfile,
  type PlaybookReadinessContext,
} from '@nx9/shared';
import { api } from '../api/client';

interface WorkspaceDocumentState {
  workspaceId: string | null;
  storyboard: StoryboardPayload;
  voice: VoicePayload;
  characters: CharacterLibraryPayload;
  backlotCustom: BacklotCustomPayload;
  backlotWorkspace: BacklotWorkspacePayload;
  canvasAppearance: CanvasAppearance;
  timelineDraft: TimelinePayload | null;
  scriptPlan: ScriptPlanPayload | null;
  environments: EnvironmentLibraryPayload | null;
  playbookSession: PlaybookSession | null;
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
  setCanvasAppearance: (appearance: CanvasAppearance) => void;
  setTimelineDraft: (draft: TimelinePayload | null) => void;
  setScriptPlan: (plan: ScriptPlanPayload) => void;
  setEnvironments: (envs: EnvironmentLibraryPayload) => void;
  startPlaybook: (playbookId: PlaybookId) => void;
  advancePlaybookStep: (ctxOverride?: PlaybookReadinessContext) => void;
  dismissPlaybook: () => void;
  getSnapshotForSave: () => {
    storyboard: StoryboardPayload;
    voice: VoicePayload;
    characters: CharacterLibraryPayload;
    scriptPlan?: ScriptPlanPayload;
    environments?: EnvironmentLibraryPayload;
    backlotCustom: BacklotCustomPayload;
    backlotWorkspace: BacklotWorkspacePayload;
    canvasAppearance: CanvasAppearance;
    playbookSession?: PlaybookSession | null;
  };
}

export const useWorkspaceDocument = create<WorkspaceDocumentState>((set, get) => ({
  workspaceId: null,
  storyboard: emptyStoryboard(),
  voice: emptyVoice(),
  characters: emptyCharacterLibrary(),
  backlotCustom: emptyBacklotCustom(),
  backlotWorkspace: emptyBacklotWorkspace(),
  canvasAppearance: DEFAULT_CANVAS_APPEARANCE,
  timelineDraft: null,
  scriptPlan: null,
  environments: null,
  playbookSession: null,
  hydrated: false,

  hydrate: (workspaceId, payload) =>
    set({
      workspaceId,
      storyboard: payload.storyboard ?? emptyStoryboard(),
      voice: payload.voice ?? emptyVoice(),
      characters: payload.characters ?? emptyCharacterLibrary(),
      backlotCustom: payload.backlotCustom ?? emptyBacklotCustom(),
      backlotWorkspace: payload.backlotWorkspace ?? emptyBacklotWorkspace(),
      canvasAppearance: (payload as any).canvasAppearance ?? DEFAULT_CANVAS_APPEARANCE,
      scriptPlan: (payload as any).scriptPlan ?? null,
      environments: (payload as any).environments
        ? {
            ...(payload as any).environments,
            environments: ((payload as any).environments.environments as EnvironmentProfile[] ?? []).map(migrateEnvironmentProfile),
          }
        : null,
      playbookSession: (payload as any).playbookSession ?? null,
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
      scriptPlan: null,
      environments: null,
      playbookSession: null,
      hydrated: false,
    }),

  setStoryboard: (sb) => set({ storyboard: sb }),

  setVoice: (v) => set({ voice: v }),

  setReviewMode: (reviewMode) =>
    set((s) => ({ storyboard: { ...s.storyboard, reviewMode } })),

  updateShot: (id, patch) => {
    set((s) => ({
      storyboard: {
        ...s.storyboard,
        shots: s.storyboard.shots.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot)),
      },
    }));
    const state = get();
    if (patch.status === 'approved' && state.playbookSession && !state.playbookSession.dismissed) {
      const allApproved = state.storyboard.shots.length > 0 &&
        state.storyboard.shots.every((sh) => sh.status === 'approved');
      if (allApproved) {
        const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === state.playbookSession!.playbookId);
        if (!def) return;
        const currentIdx = def.steps.findIndex((st) => st.id === state.playbookSession!.currentStepId);
        if (currentIdx === -1) return;
        const completed = [...new Set([...state.playbookSession!.completedStepIds, state.playbookSession!.currentStepId])];
        const nextIdx = currentIdx + 1;
        if (nextIdx >= def.steps.length) {
          set({ playbookSession: { ...state.playbookSession!, completedStepIds: completed } });
        } else {
          set({
            playbookSession: {
              ...state.playbookSession!,
              currentStepId: def.steps[nextIdx].id,
              completedStepIds: completed,
            },
          });
        }
      }
    }
  },

  addShots: (shots, mode) =>
    set((s) => {
      if (mode === 'replace') {
        return { storyboard: { ...s.storyboard, shots } };
      }
      const sourceIds = new Set(
        shots.map((sh) => sh.linkedBlockId).filter((id): id is string => Boolean(id)),
      );
      const base = sourceIds.size
        ? s.storyboard.shots.filter((sh) => !sh.linkedBlockId || sourceIds.has(sh.linkedBlockId))
        : s.storyboard.shots;
      const maxIdx = base.reduce((m, sh) => Math.max(m, sh.index), 0);
      const normalized = shots.map((sh, i) => ({
        ...sh,
        index: sh.index || maxIdx + i + 1,
      }));
      return {
        storyboard: {
          ...s.storyboard,
          shots: [...base, ...normalized].sort((a, b) => a.index - b.index),
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

  setCanvasAppearance: (appearance) => set({ canvasAppearance: appearance }),

  setTimelineDraft: (draft) => set({ timelineDraft: draft }),

  setScriptPlan: (plan) => set({ scriptPlan: plan }),

  setEnvironments: (envs) => set({ environments: envs }),

  startPlaybook: (playbookId) =>
    set((s) => {
      const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === playbookId);
      if (!def || def.steps.length === 0) return {};
      return {
        playbookSession: {
          playbookId,
          startedAt: new Date().toISOString(),
          currentStepId: def.steps[0].id,
          completedStepIds: [],
          dismissed: false,
        },
      };
    }),

  advancePlaybookStep: (ctxOverride?: PlaybookReadinessContext) =>
    set((s) => {
      const session = s.playbookSession;
      if (!session) return {};
      const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
      if (!def) return {};
      const ctx: PlaybookReadinessContext = ctxOverride ?? {
        storyboard: { title: s.storyboard.title, shots: s.storyboard.shots.map((sh) => ({ id: sh.id, status: sh.status as string, firstFrameAssetId: sh.firstFrameAssetId ?? undefined, keyframeStatus: sh.keyframeStatus, videoStatus: sh.videoStatus, linkedBlockId: sh.linkedBlockId ?? undefined })) },
        voice: s.voice,
        nodes: [],
        scriptPlan: s.scriptPlan ?? undefined,
        environments: s.environments?.environments ?? undefined,
        characters: s.characters.characters.map((c) => ({ name: c.name, appearance: c.bible?.appearance, consistencyPrompt: c.consistencyPrompt, referenceImageUrl: c.referenceImageUrl ?? undefined })),
        playbookSession: session,
      };
      const nextStep = resolveNextStep(def, session, ctx);
      if (nextStep.allDone) return {};
      const completed = [...new Set([...session.completedStepIds, session.currentStepId])];
      if (nextStep.step.id === session.currentStepId) {
        return { playbookSession: { ...session, completedStepIds: completed } };
      }
      return {
        playbookSession: {
          ...session,
          currentStepId: nextStep.step.id,
          completedStepIds: completed,
        },
      };
    }),

  dismissPlaybook: () =>
    set((s) => {
      if (!s.playbookSession) return {};
      return { playbookSession: { ...s.playbookSession, dismissed: true } };
    }),

  getSnapshotForSave: () => {
    const { storyboard, voice, characters, scriptPlan, environments, backlotCustom, backlotWorkspace, canvasAppearance, playbookSession } = get();
    return {
      storyboard, voice, characters,
      scriptPlan: scriptPlan ?? undefined,
      environments: environments ?? undefined,
      backlotCustom, backlotWorkspace, canvasAppearance,
      playbookSession: playbookSession ?? undefined,
    } as any;
  },
}));

/** Batch-generate TTS for pending voice lines. */
export async function generateVoiceLinesBatch(
  workspaceId: string,
  lineIds?: string[],
): Promise<{ ok: number; failed: number }> {
  return api.generateVoiceLines(workspaceId, lineIds);
}
