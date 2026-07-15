import {
  bindStoryboardShotAssets,
  flattenScriptBreakdownShots,
  normalizeScriptBreakdownConfig,
  normalizeScriptBreakdownPrompts,
  storyboardShotsFromScriptBreakdown,
  type CharacterProfile,
  type EnvironmentProfile,
  type ScriptBreakdownConfig,
  type ScriptBreakdownPayload,
  type ScriptBreakdownPromptTemplates,
} from '@nx9/shared';
import { api } from '../api/client';
import { useActivityLog } from '../stores/activity-log';
import { useFlowRuntime } from '../stores/flow-runtime';
import { useWorkspaceDocument } from '../stores/workspace-document';

function stableCharacterId(name: string): string {
  const safe = name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `char-${safe || Math.random().toString(36).slice(2, 8)}`;
}

function characterMatchKeys(character: CharacterProfile): string[] {
  const creative = character.creative;
  return [
    character.name,
    creative?.nickname,
    ...(creative?.aliases ?? []),
  ].map((item) => item?.trim()).filter((item): item is string => Boolean(item));
}

export function profilesFromBreakdown(payload: ScriptBreakdownPayload, existing: CharacterProfile[]): CharacterProfile[] {
  const byName = new Map<string, CharacterProfile>();
  for (const item of existing) {
    for (const key of characterMatchKeys(item)) byName.set(key, item);
  }
  return (payload.characters ?? []).map((item) => {
    const current = byName.get(item.name.trim());
    const appearance = [
      item.appearance,
      item.height ? `身高：${item.height}` : '',
      item.bodyType ? `体型：${item.bodyType}` : '',
      item.hairstyle ? `发型：${item.hairstyle}` : '',
      item.costume ? `服装：${item.costume}` : '',
      item.signatureElements ? `标志性元素：${item.signatureElements}` : '',
    ].filter(Boolean).join('；');
    const descriptionZh = [item.identity, item.personality].filter(Boolean).join('；') || undefined;
    const identity = [item.identity, item.age].filter(Boolean).join('，') || undefined;
    const characterAppearance = appearance || undefined;
    return {
      id: current?.id ?? stableCharacterId(item.name),
      name: current?.name ?? item.name,
      descriptionZh: current?.descriptionZh ?? descriptionZh,
      consistencyPrompt: current?.consistencyPrompt ?? item.fixedVisualKeywords,
      referenceImageUrl: current?.referenceImageUrl ?? null,
      referenceAudioUrl: current?.referenceAudioUrl ?? null,
      voiceProfileId: current?.voiceProfileId ?? null,
      tags: current?.tags ?? ['剧本拆分'],
      bible: {
        ...current?.bible,
        identity: current?.bible?.identity ?? identity,
        appearance: current?.bible?.appearance ?? characterAppearance,
        personality: current?.bible?.personality ?? item.personality,
        relationships: current?.bible?.relationships ?? item.relationships,
      },
      creative: current?.creative,
    } satisfies CharacterProfile;
  }).filter((item) => item.name);
}

function stableEnvironmentId(name: string): string {
  const safe = name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return `env-${safe || Math.random().toString(36).slice(2, 8)}`;
}

export function environmentsFromBreakdown(payload: ScriptBreakdownPayload, existing: EnvironmentProfile[]): EnvironmentProfile[] {
  const byName = new Map(existing.map((item) => [item.name.trim(), item]));
  const bySceneCode = new Map(existing.map((item) => [item.sceneCode ?? '', item]));
  const result = new Map<string, EnvironmentProfile>();
  for (const episode of payload.episodes) {
    for (const scene of episode.scenes ?? []) {
      const name = scene.location || scene.title || scene.code;
      if (!name?.trim()) continue;
      const current = bySceneCode.get(scene.code) ?? byName.get(name.trim());
      const id = current?.id ?? stableEnvironmentId(name);
      result.set(id, {
        id,
        sceneCode: current?.sceneCode ?? scene.code,
        name: current?.name ?? name,
        descriptionZh: current?.descriptionZh ?? [scene.title, scene.summary, scene.timeOfDay, scene.interiorExterior].filter(Boolean).join('；'),
        consistencyPrompt: current?.consistencyPrompt ?? `${name}, ${scene.timeOfDay}, ${scene.interiorExterior}, cinematic consistent environment`,
        era: current?.era ?? payload.storyAnalysis?.background?.era,
        lighting: current?.lighting ?? scene.timeOfDay,
        props: current?.props ?? [],
        referenceImageUrl: current?.referenceImageUrl ?? null,
        referenceUrls: current?.referenceUrls ?? [],
        hdriUrl: current?.hdriUrl ?? null,
        meshUrl: current?.meshUrl ?? null,
      });
    }
  }
  return [...result.values()];
}

export function applyScriptBreakdownPayload(
  blockId: string,
  payload: ScriptBreakdownPayload,
  options: { syncAssets?: boolean } = {},
): void {
  const runtime = useFlowRuntime.getState().runtime;
  const doc = useWorkspaceDocument.getState();
  let importedCharacters: CharacterProfile[] = [];
  let importedEnvironments: EnvironmentProfile[] = [];
  if (options.syncAssets) {
    importedCharacters = profilesFromBreakdown(payload, doc.characters.characters);
    for (const profile of importedCharacters) doc.upsertCharacter(profile);
    importedEnvironments = environmentsFromBreakdown(payload, doc.environments?.environments ?? []);
  }
  const characterLibrary = options.syncAssets && importedCharacters.length
    ? useWorkspaceDocument.getState().characters.characters
    : doc.characters.characters;
  if (options.syncAssets && importedEnvironments.length) {
    const current = useWorkspaceDocument.getState().environments?.environments ?? [];
    const merged = new Map(current.map((item) => [item.id, item]));
    for (const env of importedEnvironments) merged.set(env.id, env);
    doc.setEnvironments({ version: 1, environments: [...merged.values()] });
  }
  const environmentLibrary = options.syncAssets && importedEnvironments.length
    ? useWorkspaceDocument.getState().environments?.environments ?? []
    : doc.environments?.environments ?? [];
  const previousById = new Map(doc.storyboard.shots.map((shot) => [shot.id, shot]));
  const rawShots = storyboardShotsFromScriptBreakdown(payload).map((base) => ({
    ...base,
    ...(previousById.get(base.id) ?? {}),
    episodeId: base.episodeId,
    episodeIndex: base.episodeIndex,
    episodeTitle: base.episodeTitle,
    index: base.index,
    durationSec: base.durationSec,
    shotType: base.shotType,
    descriptionZh: base.descriptionZh,
    promptEn: base.promptEn,
    videoPromptEn: base.videoPromptEn,
    characterNames: base.characterNames,
    sceneName: base.sceneName,
    sceneId: base.sceneId,
    sceneCode: base.sceneCode,
  }));
  const shots = bindStoryboardShotAssets(
    rawShots,
    characterLibrary,
    environmentLibrary,
  );
  const episodeIds = new Set(shots.map((shot) => shot.episodeId).filter(Boolean));
  const activeEpisodeId = doc.storyboard.activeEpisodeId && episodeIds.has(doc.storyboard.activeEpisodeId)
    ? doc.storyboard.activeEpisodeId
    : payload.episodes[0]?.id ?? null;
  doc.setStoryboard({
    ...doc.storyboard,
    version: 3,
    title: payload.title,
    activeEpisodeId,
    shots,
  });
  const flat = flattenScriptBreakdownShots(payload);
  runtime?.updateNodeData(blockId, {
    status: 'success',
    sourceText: payload.sourceText,
    scriptBreakdown: payload,
    scriptBreakdownConfig: payload.config,
    breakdownProgress: null,
    lines: flat.flatMap((shot) => shot.dialogue),
    content: `${payload.title} · ${payload.episodes.length} 集 · ${flat.length} 个分镜`,
    output: flat.map((shot) => shot.imagePrompt).join('\n\n'),
    meta: {
      episodeCount: payload.episodes.length,
      sceneCount: payload.episodes.reduce((sum, episode) => sum + (episode.scenes?.length ?? 0), 0),
      shotCount: flat.length,
      characterCount: payload.characters?.length ?? 0,
      environmentCount: importedEnvironments.length,
      actCount: payload.acts?.length ?? 0,
      warningCount: payload.diagnostics?.filter((item) => item.level === 'warning').length ?? 0,
      generatedAt: payload.generatedAt,
      promptVersion: payload.promptVersion,
    },
  });
}

export async function runProductionScriptBreakdown(args: {
  blockId: string;
  sourceText: string;
  config?: Partial<ScriptBreakdownConfig>;
  prompts?: Partial<ScriptBreakdownPromptTemplates>;
}): Promise<ScriptBreakdownPayload> {
  const runtime = useFlowRuntime.getState().runtime;
  const sourceText = args.sourceText.trim();
  if (!sourceText) throw new Error('请先输入剧本原文');
  const config = normalizeScriptBreakdownConfig(args.config);
  const prompts = normalizeScriptBreakdownPrompts(args.prompts);
  runtime?.updateNodeData(args.blockId, {
    status: 'running',
    sourceText,
    scriptBreakdownConfig: config,
    scriptBreakdownPrompts: prompts,
    breakdownProgress: '正在规划分集，再逐集拆分场景和镜头…',
    error: undefined,
  });
  try {
    const result = await api.productionScriptBreakdown({ sourceText, config, prompts });
    applyScriptBreakdownPayload(args.blockId, result.payload);
    useActivityLog.getState().append(
      `生产级剧本拆分完成 · ${result.stats.episodeCount} 集 / ${result.stats.sceneCount} 场 / ${result.stats.shotCount} 镜`,
    );
    return result.payload;
  } catch (error) {
    runtime?.updateNodeData(args.blockId, {
      status: 'error',
      breakdownProgress: null,
      error: String(error),
    });
    useActivityLog.getState().append(`生产级剧本拆分失败: ${String(error)}`);
    throw error;
  }
}
