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
  ProjectStatus,
  ScriptPlanPayload,
  SoundAssetProfile,
  SoundLibraryPayload,
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
  emptySoundLibrary,
  emptyStoryboard,
  emptyVoice,
  activeEpisodeShots,
  migrateStoryboardPayload,
  PLAYBOOK_DEFINITIONS,
  resolveNextStep,
  resolveActiveEpisodeId,
  hydrateEpisodePlaybookProgress,
  switchPlaybookEpisode,
  syncCurrentEpisodePlaybookProgress,
  migrateEnvironmentProfile,
  createEpisodeMeta,
  listEpisodeMetas,
  type PlaybookReadinessContext,
  type EpisodeMeta,
} from '@nx9/shared';
import { api } from '../api/client';

interface WorkspaceDocumentState {
  workspaceId: string | null;
  storyboard: StoryboardPayload;
  voice: VoicePayload;
  characters: CharacterLibraryPayload;
  soundLibrary: SoundLibraryPayload;
  backlotCustom: BacklotCustomPayload;
  backlotWorkspace: BacklotWorkspacePayload;
  canvasAppearance: CanvasAppearance;
  timelineDraft: TimelinePayload | null;
  scriptPlan: ScriptPlanPayload | null;
  environments: EnvironmentLibraryPayload | null;
  playbookSession: PlaybookSession | null;
  projectStatus: ProjectStatus;
  hydrated: boolean;
  hydrate: (workspaceId: string, payload: WorkspacePayload) => void;
  reset: () => void;
  setStoryboard: (sb: StoryboardPayload) => void;
  setActiveEpisodeId: (episodeId: string | null) => void;
  /** 制作台：创建/切换/完成剧集 */
  upsertEpisodeMeta: (ep: EpisodeMeta) => void;
  createNextEpisode: (title?: string) => string;
  completeActiveEpisode: (exportUrl?: string | null) => void;
  setGlobalArtDirection: (text: string) => void;
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
  upsertSound: (sound: SoundAssetProfile) => void;
  removeSound: (id: string) => void;
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
  skipStep: (stepId: string) => void;
  markStepFailed: (stepId: string) => void;
  markStepWaiting: (stepId: string) => void;
  setProjectStatus: (status: ProjectStatus) => void;
  dismissPlaybook: () => void;
  jumpPlaybookStep: (stepId: string) => void;
  getSnapshotForSave: () => {
    storyboard: StoryboardPayload;
    voice: VoicePayload;
    characters: CharacterLibraryPayload;
    soundLibrary: SoundLibraryPayload;
    scriptPlan?: ScriptPlanPayload;
    environments?: EnvironmentLibraryPayload;
    backlotCustom: BacklotCustomPayload;
    backlotWorkspace: BacklotWorkspacePayload;
    canvasAppearance: CanvasAppearance;
    playbookSession?: PlaybookSession | null;
  };
}

function syncSessionForStoryboard(
  session: PlaybookSession,
  storyboard: StoryboardPayload,
): PlaybookSession {
  return syncCurrentEpisodePlaybookProgress(session, resolveActiveEpisodeId(storyboard));
}

function switchSessionEpisode(
  session: PlaybookSession,
  currentEpisodeId: string | null,
  targetEpisodeId: string | null,
): PlaybookSession {
  const def = PLAYBOOK_DEFINITIONS.find((playbook) => playbook.id === session.playbookId);
  if (!def) return syncCurrentEpisodePlaybookProgress(session, currentEpisodeId);
  return switchPlaybookEpisode(session, currentEpisodeId, targetEpisodeId, def);
}

export const useWorkspaceDocument = create<WorkspaceDocumentState>((set, get) => ({
  workspaceId: null,
  storyboard: emptyStoryboard(),
  voice: emptyVoice(),
  characters: emptyCharacterLibrary(),
  soundLibrary: emptySoundLibrary(),
  backlotCustom: emptyBacklotCustom(),
  backlotWorkspace: emptyBacklotWorkspace(),
  canvasAppearance: DEFAULT_CANVAS_APPEARANCE,
  timelineDraft: null,
  scriptPlan: null,
  environments: null,
  playbookSession: null,
  projectStatus: 'draft' as ProjectStatus,
  hydrated: false,

  hydrate: (workspaceId, payload) => {
    const storyboard = payload.storyboard
      ? migrateStoryboardPayload(payload.storyboard)
      : emptyStoryboard();
    const rawSession = (payload as any).playbookSession as PlaybookSession | null | undefined;
    const playbookSession = rawSession
      ? hydrateEpisodePlaybookProgress(rawSession, resolveActiveEpisodeId(storyboard))
      : null;
    set({
      workspaceId,
      storyboard,
      voice: payload.voice ?? emptyVoice(),
      characters: payload.characters ?? emptyCharacterLibrary(),
      soundLibrary: payload.soundLibrary ?? emptySoundLibrary(),
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
      playbookSession,
      projectStatus: (payload as any).projectStatus ?? ('draft' as ProjectStatus),
      hydrated: true,
    });
  },

  reset: () =>
    set({
      workspaceId: null,
      storyboard: emptyStoryboard(),
      voice: emptyVoice(),
      characters: emptyCharacterLibrary(),
      soundLibrary: emptySoundLibrary(),
      backlotCustom: emptyBacklotCustom(),
      backlotWorkspace: emptyBacklotWorkspace(),
      scriptPlan: null,
      environments: null,
      playbookSession: null,
      projectStatus: 'draft' as ProjectStatus,
      hydrated: false,
    }),

  setStoryboard: (sb) =>
    set((state) => {
      if (!state.playbookSession) return { storyboard: sb };
      return {
        storyboard: sb,
        playbookSession: switchSessionEpisode(
          state.playbookSession,
          resolveActiveEpisodeId(state.storyboard),
          resolveActiveEpisodeId(sb),
        ),
      };
    }),

  setActiveEpisodeId: (activeEpisodeId) =>
    set((state) => {
      const storyboard = { ...state.storyboard, activeEpisodeId };
      if (!state.playbookSession) return { storyboard };
      return {
        storyboard,
        playbookSession: switchSessionEpisode(
          state.playbookSession,
          resolveActiveEpisodeId(state.storyboard),
          resolveActiveEpisodeId(storyboard),
        ),
      };
    }),

  upsertEpisodeMeta: (ep) =>
    set((s) => {
      const list = [...(s.storyboard.episodes ?? [])];
      const i = list.findIndex((x) => x.id === ep.id);
      if (i >= 0) list[i] = { ...list[i], ...ep };
      else list.push(ep);
      return { storyboard: { ...s.storyboard, episodes: list.sort((a, b) => a.index - b.index) } };
    }),

  createNextEpisode: (title) => {
    const state = get();
    const existing = listEpisodeMetas(state.storyboard);
    const nextIndex = existing.reduce((m, e) => Math.max(m, e.index), 0) + 1;
    const ep = createEpisodeMeta(nextIndex, title);
    set({
      storyboard: {
        ...state.storyboard,
        episodes: [...(state.storyboard.episodes ?? []).filter((e) => e.id !== ep.id), ep],
        activeEpisodeId: ep.id,
      },
      projectStatus: 'draft',
    });
    return ep.id;
  },

  completeActiveEpisode: (exportUrl) =>
    set((s) => {
      const id = resolveActiveEpisodeId(s.storyboard);
      if (!id) return {};
      const list = [...(s.storyboard.episodes ?? [])];
      const i = list.findIndex((e) => e.id === id);
      const base =
        i >= 0
          ? list[i]
          : {
              id,
              index: 1,
              title: s.storyboard.title || '本集',
              status: 'in_progress' as const,
            };
      const updated = {
        ...base,
        status: 'completed' as const,
        completedAt: new Date().toISOString(),
        lastExportUrl: exportUrl ?? base.lastExportUrl ?? null,
      };
      if (i >= 0) list[i] = updated;
      else list.push(updated);
      const history = exportUrl
        ? [
            {
              id: `exp-${Date.now()}`,
              episodeId: id,
              episodeTitle: updated.title,
              url: exportUrl,
              fileName: `${updated.title || 'episode'}.mp4`,
              mode: 'ffmpeg-episode' as const,
              shotCount: s.storyboard.shots.filter((sh) => sh.episodeId === id || !sh.episodeId).length,
              durationSec: s.storyboard.shots
                .filter((sh) => sh.episodeId === id || !sh.episodeId)
                .reduce((sum, sh) => sum + (sh.durationSec || 0), 0),
              createdAt: new Date().toISOString(),
            },
            ...(s.storyboard.exportHistory ?? []),
          ].slice(0, 30)
        : s.storyboard.exportHistory;
      return {
        storyboard: { ...s.storyboard, episodes: list, exportHistory: history },
        projectStatus: 'completed' as const,
      };
    }),

  setGlobalArtDirection: (globalArtDirection) =>
    set((s) => ({ storyboard: { ...s.storyboard, globalArtDirection } })),

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
      const scopedShots = activeEpisodeShots(state.storyboard);
      const allApproved = scopedShots.length > 0 &&
        scopedShots.every((sh) => sh.status === 'approved');
      if (allApproved) {
        const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === state.playbookSession!.playbookId);
        if (!def) return;
        const currentIdx = def.steps.findIndex((st) => st.id === state.playbookSession!.currentStepId);
        if (currentIdx === -1) return;
        const completed = [...new Set([...state.playbookSession!.completedStepIds, state.playbookSession!.currentStepId])];
        const nextIdx = currentIdx + 1;
        const nextSession = nextIdx >= def.steps.length
          ? { ...state.playbookSession!, completedStepIds: completed }
          : {
              ...state.playbookSession!,
              currentStepId: def.steps[nextIdx].id,
              completedStepIds: completed,
            };
        set({ playbookSession: syncSessionForStoryboard(nextSession, state.storyboard) });
      }
    }
  },

  addShots: (shots, mode) =>
    set((s) => {
      const activeEp = resolveActiveEpisodeId(s.storyboard);
      const stamp = (sh: (typeof shots)[0]) => ({
        ...sh,
        episodeId: sh.episodeId ?? activeEp,
        episodeIndex:
          sh.episodeIndex ??
          (s.storyboard.episodes ?? []).find((e) => e.id === (sh.episodeId ?? activeEp))?.index,
        episodeTitle:
          sh.episodeTitle ??
          (s.storyboard.episodes ?? []).find((e) => e.id === (sh.episodeId ?? activeEp))?.title,
      });
      if (mode === 'replace') {
        // 仅替换当前集镜头，其它集保留
        const others = activeEp
          ? s.storyboard.shots.filter((sh) => sh.episodeId && sh.episodeId !== activeEp)
          : [];
        const stamped = shots.map(stamp);
        return {
          storyboard: {
            ...s.storyboard,
            shots: [...others, ...stamped].sort((a, b) => a.index - b.index),
          },
        };
      }
      const sourceIds = new Set(
        shots.map((sh) => sh.linkedBlockId).filter((id): id is string => Boolean(id)),
      );
      const base = sourceIds.size
        ? s.storyboard.shots.filter((sh) => !sh.linkedBlockId || sourceIds.has(sh.linkedBlockId))
        : s.storyboard.shots;
      const scoped = activeEp ? base.filter((sh) => !sh.episodeId || sh.episodeId === activeEp) : base;
      const maxIdx = scoped.reduce((m, sh) => Math.max(m, sh.index), 0);
      const normalized = shots.map((sh, i) => ({
        ...stamp(sh),
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

  upsertSound: (sound) =>
    set((s) => ({
      soundLibrary: {
        ...s.soundLibrary,
        sounds: [...s.soundLibrary.sounds.filter((x) => x.id !== sound.id), sound],
      },
    })),

  removeSound: (id) =>
    set((s) => ({
      soundLibrary: {
        ...s.soundLibrary,
        sounds: s.soundLibrary.sounds.filter((x) => x.id !== id),
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
      const session: PlaybookSession = {
        playbookId,
        startedAt: new Date().toISOString(),
        currentStepId: def.steps[0].id,
        completedStepIds: [],
        skippedStepIds: [],
        failedStepIds: [],
        waitingStepIds: [],
        workflowStatus: 'idle',
        dismissed: false,
      };
      return {
        playbookSession: syncSessionForStoryboard(session, s.storyboard),
      };
    }),

  skipStep: (stepId: string) =>
    set((s) => {
      const session = s.playbookSession;
      if (!session) return {};
      const skipped = new Set(session.skippedStepIds ?? []);
      skipped.add(stepId);
      const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
      if (!def) return {};
      const idx = def.steps.findIndex((st) => st.id === stepId);
      const nextIdx = idx + 1;
      const nextStepId = nextIdx < def.steps.length ? def.steps[nextIdx].id : session.currentStepId;
      const nextSession: PlaybookSession = {
          ...session,
          currentStepId: nextStepId,
          skippedStepIds: [...skipped],
          completedStepIds: [...new Set([...session.completedStepIds, stepId])],
      };
      return { playbookSession: syncSessionForStoryboard(nextSession, s.storyboard) };
    }),

  markStepFailed: (stepId: string) =>
    set((s) => {
      const session = s.playbookSession;
      if (!session) return {};
      const nextSession: PlaybookSession = {
          ...session,
          failedStepIds: [...new Set([...(session.failedStepIds ?? []), stepId])],
          workflowStatus: 'error',
      };
      return { playbookSession: syncSessionForStoryboard(nextSession, s.storyboard) };
    }),

  markStepWaiting: (stepId: string) =>
    set((s) => {
      const session = s.playbookSession;
      if (!session) return {};
      const nextSession: PlaybookSession = {
          ...session,
          waitingStepIds: [...new Set([...(session.waitingStepIds ?? []), stepId])],
          workflowStatus: 'blocked',
      };
      return { playbookSession: syncSessionForStoryboard(nextSession, s.storyboard) };
    }),

  setProjectStatus: (status) => set({ projectStatus: status }),

  advancePlaybookStep: (ctxOverride?: PlaybookReadinessContext) =>
    set((s) => {
      const session = s.playbookSession;
      if (!session) return {};
      const def = PLAYBOOK_DEFINITIONS.find((p) => p.id === session.playbookId);
      if (!def) return {};
      const ctx: PlaybookReadinessContext = ctxOverride ?? {
        storyboard: { title: s.storyboard.title, activeEpisodeId: s.storyboard.activeEpisodeId, shots: s.storyboard.shots.map((sh) => ({ id: sh.id, episodeId: sh.episodeId, status: sh.status as string, firstFrameAssetId: sh.firstFrameAssetId ?? undefined, videoAssetId: sh.videoAssetId ?? undefined, keyframeStatus: sh.keyframeStatus, videoStatus: sh.videoStatus, linkedBlockId: sh.linkedBlockId ?? undefined })) },
        voice: s.voice,
        nodes: [],
        scriptPlan: s.scriptPlan ?? undefined,
        environments: s.environments?.environments ?? undefined,
        characters: s.characters.characters.map((c) => ({ name: c.name, appearance: c.bible?.appearance, consistencyPrompt: c.consistencyPrompt, referenceImageUrl: c.referenceImageUrl ?? undefined })),
        playbookSession: session,
      };
      const nextStep = resolveNextStep(def, session, ctx);
      if (nextStep.allDone) {
        const isExport = def.steps[def.steps.length - 1]?.readinessKey === 'export_ready';
        const nextSession: PlaybookSession = { ...session, workflowStatus: 'done' };
        return {
          projectStatus: isExport ? 'exported' : 'completed',
          playbookSession: syncSessionForStoryboard(nextSession, s.storyboard),
        };
      }
      const completed = [...new Set([...session.completedStepIds, session.currentStepId])];
      if (nextStep.step.id === session.currentStepId) {
        const nextSession: PlaybookSession = { ...session, completedStepIds: completed };
        return { playbookSession: syncSessionForStoryboard(nextSession, s.storyboard) };
      }
      const nextSession: PlaybookSession = {
        ...session,
        currentStepId: nextStep.step.id,
        completedStepIds: completed,
      };
      return {
        playbookSession: syncSessionForStoryboard(nextSession, s.storyboard),
      };
    }),

  dismissPlaybook: () =>
    set((s) => {
      if (!s.playbookSession) return {};
      return { playbookSession: { ...s.playbookSession, dismissed: true } };
    }),

  jumpPlaybookStep: (stepId) =>
    set((s) => {
      const session = s.playbookSession;
      if (!session) return {};
      const nextSession: PlaybookSession = { ...session, currentStepId: stepId };
      return { playbookSession: syncSessionForStoryboard(nextSession, s.storyboard) };
    }),

  getSnapshotForSave: () => {
    const { storyboard, voice, characters, soundLibrary, scriptPlan, environments, backlotCustom, backlotWorkspace, canvasAppearance, playbookSession, projectStatus } = get();
    return {
      storyboard, voice, characters, soundLibrary,
      scriptPlan: scriptPlan ?? undefined,
      environments: environments ?? undefined,
      backlotCustom, backlotWorkspace, canvasAppearance,
      playbookSession: playbookSession
        ? syncSessionForStoryboard(playbookSession, storyboard)
        : undefined,
      projectStatus,
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
