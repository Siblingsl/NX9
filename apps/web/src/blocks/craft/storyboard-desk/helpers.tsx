import { useMemo } from 'react';
import { useEdges, useNodes } from '@xyflow/react';
import {
  type AssetLibraryKind,
  type BacklotWorkspaceItem,
  type CharacterProfile,
  type EnvironmentProfile,
  type ScriptBreakdownPayload,
  type ScriptBreakdownShot,
} from '@nx9/shared';

export type StudioTab = 'breakdown' | 'grid' | 'compose' | 'handoff';

export function compact(text: string, max = 68) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function useUpstreamBreakdown(blockId: string): ScriptBreakdownPayload | undefined {
  const nodes = useNodes();
  const edges = useEdges();
  return useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const incoming = edges.filter((e) => e.target === blockId);
    for (const edge of incoming) {
      const data = byId.get(edge.source)?.data as Record<string, unknown> | undefined;
      const payload = (
        data?.scriptBreakdown
        ?? data?.legacyScriptBreakdown
      ) as ScriptBreakdownPayload | undefined;
      if (payload?.version === 1) return payload;
    }
    return undefined;
  }, [blockId, edges, nodes]);
}

export function useUpstreamScreenplay(blockId: string): import('@nx9/shared').ScreenplayPackage | undefined {
  const nodes = useNodes();
  const edges = useEdges();
  return useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const incoming = edges.filter((e) => e.target === blockId);
    for (const edge of incoming) {
      const data = byId.get(edge.source)?.data as Record<string, unknown> | undefined;
      const pkg = data?.package;
      if (
        pkg
        && typeof pkg === 'object'
        && (pkg as { schema?: string }).schema === 'nx9-screenplay-package'
        && (pkg as { version?: number }).version === 1
      ) {
        return pkg as import('@nx9/shared').ScreenplayPackage;
      }
    }
    return undefined;
  }, [blockId, edges, nodes]);
}

/** 沿入边找连到本分镜台的编剧台节点 id（优先带合法 package 的 script-desk） */
export function findUpstreamScriptDeskId(
  blockId: string,
  nodes: Array<{ id: string; type?: string; data?: unknown }>,
  edges: Array<{ source: string; target: string }>,
): string | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = edges.filter((e) => e.target === blockId);
  let fallback: string | undefined;
  for (const edge of incoming) {
    const source = byId.get(edge.source);
    if (source?.type !== 'script-desk' && source?.type !== 'script') continue;
    const data = source.data as Record<string, unknown> | undefined;
    const pkg = data?.package as { schema?: string; version?: number } | undefined;
    if (pkg?.schema === 'nx9-screenplay-package' && pkg.version === 1) return source.id;
    fallback ??= source.id;
  }
  return fallback;
}

export function clonePayload(payload: ScriptBreakdownPayload): ScriptBreakdownPayload {
  return JSON.parse(JSON.stringify(payload)) as ScriptBreakdownPayload;
}

export function namesToText(names: string[]): string {
  return names.join('、');
}

export function textToNames(value: string): string[] {
  return value
    .split(/[、,，\s]+/)
    .map((item) => item.trim().replace(/^@角色:/, ''))
    .filter(Boolean)
    .slice(0, 20);
}

export function stripMentionToken(value: string): string {
  return value.trim().replace(/^@(角色|场景|镜头|情绪|钩子|声音):/, '');
}

export function scenePresetName(item: EnvironmentProfile | BacklotWorkspaceItem): string {
  if ('name' in item) return item.name;
  return item.label;
}

export function characterMeta(character: CharacterProfile): string {
  return [character.bible?.identity, character.descriptionZh, character.creative?.nickname]
    .filter(Boolean)
    .join(' · ');
}

export const GLOBAL_MENTION_KINDS: AssetLibraryKind[] = ['character', 'scene', 'shot', 'emotion', 'hook', 'sound'];
export const CHARACTER_MENTION_KINDS: AssetLibraryKind[] = ['character'];
export const SCENE_MENTION_KINDS: AssetLibraryKind[] = ['scene'];

export function patchShotInPayload(
  payload: ScriptBreakdownPayload,
  shotId: string,
  patch: Partial<ScriptBreakdownShot>,
): ScriptBreakdownPayload {
  const next = clonePayload(payload);
  for (const episode of next.episodes) {
    episode.shots = episode.shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot));
    episode.scenes = episode.scenes?.map((scene) => ({
      ...scene,
      shots: scene.shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)),
    }));
  }
  return next;
}

export type ShotEditDraft = Pick<
  ScriptBreakdownShot,
  | 'title'
  | 'durationSec'
  | 'scene'
  | 'characters'
  | 'purpose'
  | 'scriptText'
  | 'imagePrompt'
  | 'videoPrompt'
  | 'sketchPrompt'
  | 'shotSize'
  | 'cameraMove'
  | 'cameraAngle'
  | 'cameraLens'
  | 'visual'
  | 'action'
  | 'narration'
  | 'sound'
  | 'audiovisualLanguage'
  | 'negativePrompt'
  | 'continuityNotes'
  | 'compositionTemplateId'
> & {
  dialogueText: string;
  dialogueSpeaker: string;
};

export function createShotEditDraft(shot: ScriptBreakdownShot): ShotEditDraft {
  return {
    title: shot.title,
    durationSec: shot.durationSec,
    scene: shot.scene,
    characters: [...(shot.characters ?? [])],
    purpose: shot.purpose,
    scriptText: shot.scriptText,
    imagePrompt: shot.imagePrompt,
    videoPrompt: shot.videoPrompt,
    sketchPrompt: shot.sketchPrompt ?? '',
    shotSize: shot.shotSize,
    cameraMove: shot.cameraMove,
    cameraAngle: shot.cameraAngle,
    cameraLens: shot.cameraLens,
    visual: shot.visual,
    action: shot.action,
    narration: shot.narration,
    sound: shot.sound,
    audiovisualLanguage: shot.audiovisualLanguage,
    negativePrompt: shot.negativePrompt,
    continuityNotes: shot.continuityNotes ? [...shot.continuityNotes] : [],
    compositionTemplateId: shot.compositionTemplateId ?? null,
    dialogueText: shot.dialogue?.[0]?.text ?? '',
    dialogueSpeaker: shot.dialogue?.[0]?.speaker ?? '',
  };
}

export function shotDialogueLine(shot: ScriptBreakdownShot): string {
  return (
    shot.dialogue?.[0]?.text
    || shot.scriptText
    || shot.action
    || shot.visual
    || shot.title
    || '—'
  );
}

export const SHOT_SIZES = ['ECU', 'CU', 'MS', 'FS', 'WS', 'OTS'] as const;
export const CAMERA_MOVES = ['固定', '推', '拉', '摇', '移', '跟', '手持'] as const;
