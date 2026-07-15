import { useMemo } from 'react';
import type { PlaybookReadinessContext } from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import { useFlowRuntime } from '../stores/flow-runtime';

export function usePlaybookReadinessCtx(): PlaybookReadinessContext {
  const storyboard = useWorkspaceDocument((s) => s.storyboard);
  const voice = useWorkspaceDocument((s) => s.voice);
  const scriptPlan = useWorkspaceDocument((s) => s.scriptPlan);
  const environments = useWorkspaceDocument((s) => s.environments);
  const characters = useWorkspaceDocument((s) => s.characters);
  const session = useWorkspaceDocument((s) => s.playbookSession);
  const runtime = useFlowRuntime((s) => s.runtime);

  return useMemo(() => ({
    storyboard: {
      title: storyboard.title,
      activeEpisodeId: storyboard.activeEpisodeId,
      shots: storyboard.shots.map((sh) => ({
        id: sh.id,
        episodeId: sh.episodeId,
        status: sh.status as string,
        firstFrameAssetId: sh.firstFrameAssetId ?? undefined,
        videoAssetId: sh.videoAssetId ?? undefined,
        keyframeStatus: sh.keyframeStatus,
        videoStatus: sh.videoStatus,
        linkedBlockId: sh.linkedBlockId ?? undefined,
      })),
    },
    voice,
    nodes: (runtime?.getNodes() ?? []).map((n) => ({
      id: n.id,
      type: n.type ?? 'unknown',
      data: (n.data ?? {}) as Record<string, unknown>,
    })),
    scriptPlan: scriptPlan ?? undefined,
    environments: environments?.environments ?? undefined,
    characters: characters.characters.map((c) => ({
      name: c.name,
      appearance: (c as any).bible?.appearance,
      consistencyPrompt: c.consistencyPrompt,
      referenceImageUrl: c.referenceImageUrl ?? undefined,
    })),
    playbookSession: session ?? undefined,
  }), [storyboard, voice, scriptPlan, environments, characters, runtime, session]);
}
