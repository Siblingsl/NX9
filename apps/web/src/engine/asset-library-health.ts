/**
 * 素材库健康检查（H-01）与影响分析数据（H-04）。
 * 纯函数：按 Tab 计算真指标，禁止假零。
 */
import type {
  AssetLibraryKind,
  BacklotWorkspaceItem,
  CharacterProfile,
  SoundAssetProfile,
} from '@nx9/shared';
import {
  getCostumeCreative,
  getEmotionCreative,
  getHookCreative,
  getPropCreative,
  getSceneCreative,
  getShotCreative,
  resolveAssetPromptText,
} from '@nx9/shared';

export type HealthIssueKey =
  | 'duplicate'
  | 'unused'
  | 'missingPrompt'
  | 'unlocked'
  | 'invalidRef'
  | 'missingMedia'
  | 'unbound'
  | 'promptDrift';

export interface HealthIssueMetric {
  key: HealthIssueKey;
  label: string;
  count: number;
  /** 命中该问题的条目 id（用于列表过滤 / 打开修复） */
  itemIds: string[];
}

export interface ImpactShotRef {
  shotId: string;
  shotLabel: string;
  names: string[];
}

export interface AssetHealthAnalysis {
  relationCount: number;
  byTab: Record<AssetLibraryKind, HealthIssueMetric[]>;
  invalidCharacterRefs: ImpactShotRef[];
  invalidSceneRefs: ImpactShotRef[];
  characterUsage: Map<string, ImpactShotRef[]>;
  sceneUsage: Map<string, ImpactShotRef[]>;
  costumeBoundCharacters: Map<string, string[]>;
}

export interface RelationShotLike {
  id?: string;
  shotId?: string;
  sceneCode?: string | null;
  sceneName?: string | null;
  characterNames?: string[];
  purpose?: string;
  visual?: string;
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function shotLabel(shot: RelationShotLike, index: number): string {
  return shot.sceneCode?.trim()
    || shot.purpose?.trim()?.slice(0, 24)
    || shot.id
    || shot.shotId
    || `镜 ${index + 1}`;
}

function groupByLabel<T extends { id: string }>(
  items: T[],
  labelOf: (item: T) => string,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = normalizeName(labelOf(item));
    if (!key) continue;
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}

function metric(
  key: HealthIssueKey,
  label: string,
  itemIds: string[],
): HealthIssueMetric {
  return { key, label, count: itemIds.length, itemIds: [...new Set(itemIds)] };
}

function workspacePromptMissing(item: BacklotWorkspaceItem): boolean {
  const text = resolveAssetPromptText(
    item.kind as 'scene' | 'shot' | 'emotion' | 'hook' | 'costume' | 'prop',
    item,
  );
  return !text?.trim() && !item.promptEn?.trim() && !item.promptZh?.trim();
}

function workspaceLocked(item: BacklotWorkspaceItem): boolean {
  if (item.kind === 'costume') return Boolean(getCostumeCreative(item).locked);
  if (item.kind === 'prop') return Boolean(getPropCreative(item).locked);
  if (item.kind === 'scene') return Boolean(getSceneCreative(item).locked);
  if (item.kind === 'shot') return Boolean(getShotCreative(item).locked);
  if (item.kind === 'emotion') return Boolean(getEmotionCreative(item).locked);
  if (item.kind === 'hook') return Boolean(getHookCreative(item).locked);
  return false;
}

function workspacePromptText(item: BacklotWorkspaceItem): string {
  return (
    resolveAssetPromptText(
      item.kind as 'scene' | 'shot' | 'emotion' | 'hook' | 'costume' | 'prop',
      item,
    )?.trim()
    || item.promptEn?.trim()
    || item.promptZh?.trim()
    || ''
  );
}

/** H-03：已锁定且当前 Prompt 与快照不一致 */
function workspacePromptDrifted(item: BacklotWorkspaceItem): boolean {
  if (item.kind === 'shot') {
    const ext = getShotCreative(item);
    if (!ext.locked || !ext.lockedPromptSnapshot?.trim()) return false;
    return workspacePromptText(item) !== ext.lockedPromptSnapshot.trim();
  }
  if (item.kind === 'emotion') {
    const ext = getEmotionCreative(item);
    if (!ext.locked || !ext.lockedPromptSnapshot?.trim()) return false;
    return workspacePromptText(item) !== ext.lockedPromptSnapshot.trim();
  }
  if (item.kind === 'hook') {
    const ext = getHookCreative(item);
    if (!ext.locked || !ext.lockedPromptSnapshot?.trim()) return false;
    return workspacePromptText(item) !== ext.lockedPromptSnapshot.trim();
  }
  if (item.kind === 'scene') {
    const ext = getSceneCreative(item);
    const snap = (ext as { lockedPromptSnapshot?: string }).lockedPromptSnapshot;
    if (!ext.locked || !snap?.trim()) return false;
    return workspacePromptText(item) !== snap.trim();
  }
  if (item.kind === 'costume') {
    const ext = getCostumeCreative(item);
    const snap = (ext as { lockedPromptSnapshot?: string }).lockedPromptSnapshot;
    if (!ext.locked || !snap?.trim()) return false;
    return workspacePromptText(item) !== snap.trim();
  }
  if (item.kind === 'prop') {
    const ext = getPropCreative(item);
    const snap = (ext as { lockedPromptSnapshot?: string }).lockedPromptSnapshot;
    if (!ext.locked || !snap?.trim()) return false;
    return workspacePromptText(item) !== snap.trim();
  }
  return false;
}

function characterPromptDrifted(c: CharacterProfile): boolean {
  const meta = c.creative?.consistency;
  if (!meta?.locked || !meta.lockedPromptSnapshot?.trim()) return false;
  const current = c.consistencyPrompt?.trim() || '';
  return current !== meta.lockedPromptSnapshot.trim();
}

function workspaceHasMedia(item: BacklotWorkspaceItem): boolean {
  if (item.kind === 'costume') {
    const c = getCostumeCreative(item);
    return Boolean(c.sheetUrl?.trim() || c.referenceUrls?.[0]?.trim());
  }
  if (item.kind === 'prop') {
    const p = getPropCreative(item);
    return Boolean(p.sheetUrl?.trim() || p.referenceUrls?.[0]?.trim());
  }
  if (item.kind === 'scene') {
    const s = getSceneCreative(item);
    return Boolean(s.sheetUrl?.trim() || s.referenceUrls?.[0]?.trim());
  }
  if (item.kind === 'shot') {
    const s = getShotCreative(item);
    return Boolean(s.gifUrl?.trim() || s.exampleImageUrl?.trim());
  }
  if (item.kind === 'emotion') {
    return Boolean((item.creative as { imageUrl?: string | null })?.imageUrl?.trim());
  }
  return true;
}

export function analyzeAssetLibraryHealth(input: {
  characters: CharacterProfile[];
  workspaceItems: BacklotWorkspaceItem[];
  sounds: SoundAssetProfile[];
  relationShots: RelationShotLike[];
}): AssetHealthAnalysis {
  const { characters, workspaceItems, sounds, relationShots } = input;

  const characterNames = groupByLabel(characters, (c) => c.name);
  const sceneItems = workspaceItems.filter((i) => i.kind === 'scene');
  const costumeItems = workspaceItems.filter((i) => i.kind === 'costume');
  const propItems = workspaceItems.filter((i) => i.kind === 'prop');
  const shotItems = workspaceItems.filter((i) => i.kind === 'shot');
  const emotionItems = workspaceItems.filter((i) => i.kind === 'emotion');
  const hookItems = workspaceItems.filter((i) => i.kind === 'hook');

  const sceneNames = groupByLabel(sceneItems, (i) => i.label);
  const costumeNames = groupByLabel(costumeItems, (i) => i.label);
  const propNames = groupByLabel(propItems, (i) => i.label);
  const shotNames = groupByLabel(shotItems, (i) => i.label);
  const emotionNames = groupByLabel(emotionItems, (i) => i.label);
  const hookNames = groupByLabel(hookItems, (i) => i.label);
  const soundNames = groupByLabel(sounds, (s) => s.name);

  const usedCharacterNames = new Set(
    relationShots.flatMap((shot) => shot.characterNames ?? []).map(normalizeName).filter(Boolean),
  );
  const usedSceneNames = new Set(
    relationShots.map((shot) => normalizeName(shot.sceneName)).filter(Boolean),
  );

  const characterUsage = new Map<string, ImpactShotRef[]>();
  const sceneUsage = new Map<string, ImpactShotRef[]>();
  const invalidCharacterRefs: ImpactShotRef[] = [];
  const invalidSceneRefs: ImpactShotRef[] = [];

  relationShots.forEach((shot, index) => {
    const label = shotLabel(shot, index);
    const shotId = shot.id || shot.shotId || `idx-${index}`;
    for (const raw of shot.characterNames ?? []) {
      const key = normalizeName(raw);
      if (!key) continue;
      const ref: ImpactShotRef = { shotId, shotLabel: label, names: [raw] };
      const list = characterUsage.get(key) ?? [];
      list.push(ref);
      characterUsage.set(key, list);
      if (!characterNames.has(key)) {
        invalidCharacterRefs.push(ref);
      }
    }
    const sceneKey = normalizeName(shot.sceneName);
    if (sceneKey) {
      const ref: ImpactShotRef = {
        shotId,
        shotLabel: label,
        names: [shot.sceneName!.trim()],
      };
      const list = sceneUsage.get(sceneKey) ?? [];
      list.push(ref);
      sceneUsage.set(sceneKey, list);
      if (!sceneNames.has(sceneKey)) {
        invalidSceneRefs.push(ref);
      }
    }
  });

  const costumeBoundCharacters = new Map<string, string[]>();
  for (const c of characters) {
    const costumeId = c.creative?.costumeId?.trim();
    if (!costumeId) continue;
    costumeBoundCharacters.set(
      costumeId,
      [...(costumeBoundCharacters.get(costumeId) ?? []), c.name],
    );
  }

  const boundCostumeIds = new Set(costumeBoundCharacters.keys());
  const scenePropIds = new Set(
    sceneItems.flatMap((s) => getSceneCreative(s).propIds ?? []).filter(Boolean),
  );

  const characterMetrics: HealthIssueMetric[] = [
    metric(
      'duplicate',
      '重复',
      [...characterNames.values()].filter((xs) => xs.length > 1).flatMap((xs) => xs.map((x) => x.id)),
    ),
    metric(
      'unused',
      '未使用',
      characters.filter((c) => !usedCharacterNames.has(normalizeName(c.name))).map((c) => c.id),
    ),
    metric(
      'missingPrompt',
      '缺 Prompt',
      characters.filter((c) => !c.consistencyPrompt?.trim()).map((c) => c.id),
    ),
    metric(
      'unlocked',
      '未锁定',
      characters
        .filter((c) => !(c.creative as { consistency?: { locked?: boolean } })?.consistency?.locked)
        .map((c) => c.id),
    ),
    metric(
      'invalidRef',
      '失效引用',
      invalidCharacterRefs.map((r) => `invalid:${r.names[0]}:${r.shotId}`),
    ),
    metric(
      'promptDrift',
      'Prompt 漂移',
      characters.filter((c) => characterPromptDrifted(c)).map((c) => c.id),
    ),
  ];

  const sceneMetrics: HealthIssueMetric[] = [
    metric(
      'duplicate',
      '重复',
      [...sceneNames.values()].filter((xs) => xs.length > 1).flatMap((xs) => xs.map((x) => x.id)),
    ),
    metric(
      'unused',
      '未使用',
      sceneItems.filter((s) => !usedSceneNames.has(normalizeName(s.label))).map((s) => s.id),
    ),
    metric(
      'missingPrompt',
      '缺 Prompt',
      sceneItems.filter((s) => workspacePromptMissing(s)).map((s) => s.id),
    ),
    metric(
      'missingMedia',
      '缺主媒体',
      sceneItems.filter((s) => !workspaceHasMedia(s)).map((s) => s.id),
    ),
    metric(
      'unlocked',
      '未锁定',
      sceneItems.filter((s) => !workspaceLocked(s)).map((s) => s.id),
    ),
    metric(
      'unbound',
      '道具未实体化',
      sceneItems
        .filter((s) => {
          const ext = getSceneCreative(s);
          return (ext.props?.length ?? 0) > 0 && (ext.propIds?.length ?? 0) === 0;
        })
        .map((s) => s.id),
    ),
    metric(
      'invalidRef',
      '失效引用',
      invalidSceneRefs.map((r) => `invalid:${r.names[0]}:${r.shotId}`),
    ),
  ];

  const costumeMetrics: HealthIssueMetric[] = [
    metric(
      'duplicate',
      '重复',
      [...costumeNames.values()].filter((xs) => xs.length > 1).flatMap((xs) => xs.map((x) => x.id)),
    ),
    metric(
      'unbound',
      '未绑定角色',
      costumeItems.filter((c) => !boundCostumeIds.has(c.id)).map((c) => c.id),
    ),
    metric(
      'missingPrompt',
      '缺 Prompt',
      costumeItems.filter((c) => workspacePromptMissing(c)).map((c) => c.id),
    ),
    metric(
      'missingMedia',
      '缺设定板',
      costumeItems.filter((c) => !workspaceHasMedia(c)).map((c) => c.id),
    ),
    metric(
      'unlocked',
      '未锁定',
      costumeItems.filter((c) => !workspaceLocked(c)).map((c) => c.id),
    ),
  ];

  const propMetrics: HealthIssueMetric[] = [
    metric(
      'duplicate',
      '重复',
      [...propNames.values()].filter((xs) => xs.length > 1).flatMap((xs) => xs.map((x) => x.id)),
    ),
    metric(
      'unused',
      '未使用',
      propItems.filter((p) => !scenePropIds.has(p.id)).map((p) => p.id),
    ),
    metric(
      'missingPrompt',
      '缺 Prompt',
      propItems.filter((p) => workspacePromptMissing(p)).map((p) => p.id),
    ),
    metric(
      'missingMedia',
      '缺图',
      propItems.filter((p) => !workspaceHasMedia(p)).map((p) => p.id),
    ),
    metric(
      'unbound',
      '缺标志细节',
      propItems.filter((p) => !getPropCreative(p).landmarks?.trim()).map((p) => p.id),
    ),
    metric(
      'unlocked',
      '未锁定',
      propItems.filter((p) => !workspaceLocked(p)).map((p) => p.id),
    ),
  ];

  const dictMetrics = (
    items: BacklotWorkspaceItem[],
    names: Map<string, BacklotWorkspaceItem[]>,
  ): HealthIssueMetric[] => [
    metric(
      'duplicate',
      '重复',
      [...names.values()].filter((xs) => xs.length > 1).flatMap((xs) => xs.map((x) => x.id)),
    ),
    metric(
      'missingPrompt',
      '缺 Prompt',
      items.filter((i) => workspacePromptMissing(i)).map((i) => i.id),
    ),
    metric(
      'missingMedia',
      '缺参考',
      items.filter((i) => !workspaceHasMedia(i)).map((i) => i.id),
    ),
    metric(
      'unlocked',
      '未锁定',
      items.filter((i) => !workspaceLocked(i)).map((i) => i.id),
    ),
    metric(
      'promptDrift',
      'Prompt 漂移',
      items.filter((i) => workspacePromptDrifted(i)).map((i) => i.id),
    ),
  ];

  const hasOpening = hookItems.some((h) => h.hookPhase === 'opening');
  const hasEnding = hookItems.some((h) => h.hookPhase === 'ending');
  const hookCoverage: HealthIssueMetric[] = [];
  if (hookItems.length > 0 && !hasOpening) {
    hookCoverage.push(metric('unbound', '缺开场钩', hookItems.map((h) => h.id)));
  }
  if (hookItems.length > 0 && !hasEnding) {
    hookCoverage.push(metric('unused', '缺结尾钩', hookItems.map((h) => h.id)));
  }

  const soundMetrics: HealthIssueMetric[] = [
    metric(
      'duplicate',
      '重复',
      [...soundNames.values()].filter((xs) => xs.length > 1).flatMap((xs) => xs.map((x) => x.id)),
    ),
    metric(
      'missingMedia',
      '缺音频',
      sounds.filter((s) => !s.audioUrl?.trim()).map((s) => s.id),
    ),
    metric(
      'missingPrompt',
      '缺 Prompt',
      sounds.filter((s) => !resolveAssetPromptText('sound', s)?.trim()).map((s) => s.id),
    ),
  ];

  return {
    relationCount: relationShots.length,
    byTab: {
      character: characterMetrics,
      scene: sceneMetrics,
      costume: costumeMetrics,
      prop: propMetrics,
      shot: dictMetrics(shotItems, shotNames),
      emotion: dictMetrics(emotionItems, emotionNames),
      hook: [...dictMetrics(hookItems, hookNames), ...hookCoverage],
      style: [],
      sound: soundMetrics,
    },
    invalidCharacterRefs,
    invalidSceneRefs,
    characterUsage,
    sceneUsage,
    costumeBoundCharacters,
  };
}

export function healthFilterItemIds(
  analysis: AssetHealthAnalysis,
  tab: AssetLibraryKind,
  key: HealthIssueKey | null,
): Set<string> | null {
  if (!key) return null;
  const row = analysis.byTab[tab]?.find((m) => m.key === key);
  if (!row) return null;
  return new Set(row.itemIds.filter((id) => !id.startsWith('invalid:')));
}
