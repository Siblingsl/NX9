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

/** 与文本列表条目对应的稳定分集 id，便于按集覆盖合并 */
export function stableSourceResultEpisodeId(sourceEpisodeId: string): string {
  return `src-ep-${sourceEpisodeId}`;
}

function composeEpisodeSourceText(
  episodes: Array<{ title: string; text: string }>,
): string {
  return episodes
    .map((ep, i) => {
      const title = ep.title.trim() || `第${i + 1}集`;
      const body = ep.text.trim();
      if (!body) return '';
      if (/^第[一二三四五六七八九十百千\d]+集/.test(body)) return body;
      return `${title}\n${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** 将单次 API 返回压成「一集」并绑到指定源分集 id */
function bindPayloadEpisodeToSource(
  payload: ScriptBreakdownPayload,
  source: { id: string; title: string; listIndex: number },
): ScriptBreakdownPayload['episodes'][number] {
  const id = stableSourceResultEpisodeId(source.id);
  const shots = flattenScriptBreakdownShots(payload);
  const base = payload.episodes[0];
  return {
    id,
    index: source.listIndex + 1,
    title: source.title.trim() || base?.title || `第${source.listIndex + 1}集`,
    logline: base?.logline,
    sourceText: base?.sourceText,
    scenes: (payload.episodes ?? []).flatMap((ep, epIndex) =>
      (ep.scenes ?? []).map((scene, sceneIndex) => ({
        ...scene,
        id: `${id}-scene-${epIndex + 1}-${sceneIndex + 1}`,
      })),
    ),
    shots: shots.map((shot, shotIndex) => ({
      ...shot,
      id: `${id}-shot-${shot.index ?? shotIndex + 1}`,
      episodeId: id,
      episodeIndex: source.listIndex + 1,
    })),
  };
}

function mergeCharacterProfiles(
  existing: ScriptBreakdownPayload['characters'] | undefined,
  incoming: ScriptBreakdownPayload['characters'] | undefined,
): ScriptBreakdownPayload['characters'] {
  const map = new Map<string, NonNullable<ScriptBreakdownPayload['characters']>[number]>();
  for (const item of existing ?? []) {
    if (item?.name?.trim()) map.set(item.name.trim(), item);
  }
  for (const item of incoming ?? []) {
    if (item?.name?.trim()) map.set(item.name.trim(), item);
  }
  return [...map.values()];
}

/**
 * 仅对指定源分集跑拆分，结果按稳定 id 合并进已有 scriptBreakdown（不覆盖未选中集）。
 */
export async function runProductionScriptBreakdownForEpisodes(args: {
  blockId: string;
  /** 本次要生成/覆盖的源分集（来自文本列表） */
  episodes: Array<{ id: string; title: string; text: string; listIndex: number }>;
  /** 节点上完整源文本（全部已保存分集拼合），写入 payload 便于回溯 */
  fullSourceText: string;
  /** 当前已有拆分结果，用于按集合并 */
  existingPayload?: ScriptBreakdownPayload;
  config?: Partial<ScriptBreakdownConfig>;
  prompts?: Partial<ScriptBreakdownPromptTemplates>;
}): Promise<ScriptBreakdownPayload> {
  const runtime = useFlowRuntime.getState().runtime;
  if (!args.episodes.length) throw new Error('请至少选择一集再生成');
  const sliceText = composeEpisodeSourceText(args.episodes);
  if (!sliceText.trim()) throw new Error('所选分集没有正文');
  const config = normalizeScriptBreakdownConfig(args.config);
  const prompts = normalizeScriptBreakdownPrompts(args.prompts);
  const titles = args.episodes.map((ep) => ep.title.trim() || `第${ep.listIndex + 1}集`).join('、');

  runtime?.updateNodeData(args.blockId, {
    status: 'running',
    scriptBreakdownConfig: config,
    scriptBreakdownPrompts: prompts,
    breakdownProgress: `正在生成：${titles}…`,
    error: undefined,
  });

  try {
    let existing = args.existingPayload
      ?? (() => {
        const node = runtime?.getNodes?.().find((n) => n.id === args.blockId);
        return node?.data?.scriptBreakdown as ScriptBreakdownPayload | undefined;
      })();

    let batchShotCount = 0;
    // 逐集请求，保证一源集对应一结果集，避免多选时被模型拆乱
    for (let i = 0; i < args.episodes.length; i += 1) {
      const source = args.episodes[i]!;
      const oneText = composeEpisodeSourceText([source]);
      runtime?.updateNodeData(args.blockId, {
        breakdownProgress: `正在生成（${i + 1}/${args.episodes.length}）：${source.title.trim() || `第${source.listIndex + 1}集`}…`,
      });
      const result = await api.productionScriptBreakdown({
        sourceText: oneText,
        config,
        prompts,
      });
      const bound = bindPayloadEpisodeToSource(result.payload, source);
      batchShotCount += bound.shots?.length ?? 0;
      const replaceId = stableSourceResultEpisodeId(source.id);
      const kept = (existing?.episodes ?? []).filter((ep) => ep.id !== replaceId);
      const mergedEpisodes = [...kept, bound].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      existing = {
        version: 1,
        title: existing?.title || result.payload.title || '剧本拆分',
        sourceText: args.fullSourceText.trim() || oneText,
        storyAnalysis: result.payload.storyAnalysis ?? existing?.storyAnalysis,
        characters: mergeCharacterProfiles(existing?.characters, result.payload.characters),
        acts: result.payload.acts?.length ? result.payload.acts : existing?.acts,
        episodes: mergedEpisodes,
        config,
        diagnostics: result.payload.diagnostics,
        promptVersion: result.payload.promptVersion ?? existing?.promptVersion,
        generatedAt: new Date().toISOString(),
      };
    }

    if (!existing) throw new Error('生成结果为空');
    applyScriptBreakdownPayload(args.blockId, existing);
    useActivityLog.getState().append(
      `分集生成完成 · ${args.episodes.length} 集写入 / 本批 ${batchShotCount} 镜 · 全表 ${existing.episodes.length} 集`,
    );
    return existing;
  } catch (error) {
    runtime?.updateNodeData(args.blockId, {
      status: 'error',
      breakdownProgress: null,
      error: String(error),
    });
    useActivityLog.getState().append(`分集生成失败: ${String(error)}`);
    throw error;
  }
}
