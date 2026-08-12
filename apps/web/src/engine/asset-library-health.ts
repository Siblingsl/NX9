/**
 * 素材库健康检查（H-01）与影响分析数据（H-04 / OL-04 / OL-06）。
 * 纯函数：按 Tab 计算真指标，禁止假零。
 */
import type {
  AssetLibraryKind,
  BacklotWorkspaceItem,
  CharacterProfile,
  SoundAssetProfile,
  StylePresetProfile,
} from '@nx9/shared';
import {
  expandUsedAssetIdSet,
  findLegacyBareMentions,
  getCostumeCreative,
  getEmotionCreative,
  getHookCreative,
  getPropCreative,
  getSceneCreative,
  getShotCreative,
  isBuiltinSoundAsset,
  resolveAssetPromptText,
  stripAssetPinRevision,
} from '@nx9/shared';
import type { ImpactNodeAssetRef } from './collect-node-asset-refs';

export type HealthIssueKey =
  | 'duplicate'
  | 'unused'
  | 'missingPrompt'
  | 'unlocked'
  | 'invalidRef'
  | 'missingMedia'
  | 'unbound'
  | 'promptDrift'
  | 'legacyMention'
  | 'pollution';

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

/** OL-05：按 id 的失效引用（服装 / 道具 / 镜头 / 风格） */
export interface ImpactIdRef {
  oldId: string;
  oldLabel?: string;
  shotId?: string;
  shotLabel?: string;
  ownerId?: string;
  ownerLabel?: string;
  context:
    | 'shot-override'
    | 'character-bind'
    | 'shot-prop'
    | 'scene-prop'
    | 'shot-lexicon'
    | 'style-frame'
    | 'sound-character';
}

export interface AssetHealthAnalysis {
  relationCount: number;
  /** OL-04：节点 AssetRef / usedAssetIds 覆盖数 */
  nodeRelationCount: number;
  byTab: Record<AssetLibraryKind, HealthIssueMetric[]>;
  invalidCharacterRefs: ImpactShotRef[];
  invalidSceneRefs: ImpactShotRef[];
  /** OL-05 */
  invalidCostumeRefs: ImpactIdRef[];
  invalidPropRefs: ImpactIdRef[];
  /** OL-05 扩：镜头词典 / 风格帧 */
  invalidShotRefs: ImpactIdRef[];
  invalidStyleRefs: ImpactIdRef[];
  /** OL-19 薄：角色绑了失效声音库 id */
  invalidSoundRefs: ImpactIdRef[];
  characterUsage: Map<string, ImpactShotRef[]>;
  sceneUsage: Map<string, ImpactShotRef[]>;
  costumeBoundCharacters: Map<string, string[]>;
  /** OL-04：节点侧引用（按角色名 / 场景名 / 资产 id 展示） */
  nodeAssetUsages: ImpactNodeAssetRef[];
  /** OL-06：镜表文案中的裸 @名 */
  legacyBareMentions: Array<{ shotId: string; shotLabel: string; labels: string[] }>;
  /** OL-14：本次扫描导出的 usage 快照（可落盘） */
  usageIndex: AssetUsageIndex;
}

/** OL-14：项目级 usage 账本（轻量快照，非实时索引服务） */
export interface AssetUsageIndex {
  version: 1;
  updatedAt: string;
  /** assetId → 引用它的镜 / 节点 */
  entries: Record<string, { shotIds: string[]; nodeIds: string[] }>;
}

export interface RelationShotLike {
  id?: string;
  shotId?: string;
  sceneCode?: string | null;
  sceneName?: string | null;
  characterNames?: string[];
  characterIds?: string[];
  sceneAssetId?: string | null;
  usedAssetIds?: string[];
  characterRevisionPins?: Record<string, number>;
  purpose?: string;
  visual?: string;
  videoDesc?: string | null;
  imagePrompt?: string | null;
  videoPrompt?: string | null;
  notes?: string;
  costumeOverrides?: Array<{
    characterName?: string;
    characterId?: string;
    costumeId: string;
    costumeLabel?: string;
  }>;
  propIds?: string[];
  /** Shot-01 */
  shotAssetId?: string | null;
}

export interface PreviewStyleRefLike {
  frameId: string;
  shotId?: string;
  styleAssetId: string;
  label?: string;
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function characterMediaUrls(c: CharacterProfile): string[] {
  return [
    c.referenceImageUrl,
    c.creative?.frontViewUrl,
    c.creative?.fullSheetUrl,
    c.creative?.sideViewUrl,
    c.creative?.backViewUrl,
  ]
    .map((u) => u?.trim())
    .filter((u): u is string => Boolean(u));
}

function workspaceMediaUrls(item: BacklotWorkspaceItem): string[] {
  if (item.kind === 'costume') {
    const e = getCostumeCreative(item);
    return [e.frontFlatUrl, e.sheetUrl, ...(e.referenceUrls ?? [])]
      .map((u) => u?.trim())
      .filter((u): u is string => Boolean(u));
  }
  if (item.kind === 'scene') {
    const e = getSceneCreative(item);
    return [e.coverUrl, e.sheetUrl, ...(e.referenceUrls ?? [])]
      .map((u) => u?.trim())
      .filter((u): u is string => Boolean(u));
  }
  if (item.kind === 'prop') {
    const e = getPropCreative(item);
    return [e.coverUrl, e.sheetUrl, ...(e.referenceUrls ?? [])]
      .map((u) => u?.trim())
      .filter((u): u is string => Boolean(u));
  }
  return [];
}

/** OL-15：同一媒体 URL 被 ≥2 条资产共用 → 污染 */
function pollutionIdsBySharedMedia(
  entries: Array<{ id: string; urls: string[] }>,
): string[] {
  const urlOwners = new Map<string, Set<string>>();
  for (const e of entries) {
    for (const url of e.urls) {
      const set = urlOwners.get(url) ?? new Set<string>();
      set.add(e.id);
      urlOwners.set(url, set);
    }
  }
  const polluted = new Set<string>();
  for (const owners of urlOwners.values()) {
    if (owners.size < 2) continue;
    for (const id of owners) polluted.add(id);
  }
  return [...polluted];
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
    if (!ext.locked || !ext.lockedPromptSnapshot?.trim()) return false;
    return workspacePromptText(item) !== ext.lockedPromptSnapshot.trim();
  }
  if (item.kind === 'costume') {
    const ext = getCostumeCreative(item);
    if (!ext.locked || !ext.lockedPromptSnapshot?.trim()) return false;
    return workspacePromptText(item) !== ext.lockedPromptSnapshot.trim();
  }
  if (item.kind === 'prop') {
    const ext = getPropCreative(item);
    if (!ext.locked || !ext.lockedPromptSnapshot?.trim()) return false;
    return workspacePromptText(item) !== ext.lockedPromptSnapshot.trim();
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
  styles?: StylePresetProfile[];
  /** OL-04：画布节点 AssetRef / usedAssetIds */
  nodeUsages?: ImpactNodeAssetRef[];
  /** OL-05：预览帧 styleAssetId */
  previewStyleRefs?: PreviewStyleRefLike[];
  /** OL-19 加深：成片时间轴 clip.soundAssetId */
  timelineSoundIds?: string[];
}): AssetHealthAnalysis {
  const { characters, workspaceItems, sounds, relationShots } = input;
  const styles = (input.styles ?? []).filter((s) => !s.deletedAt);
  const nodeUsages = input.nodeUsages ?? [];
  const previewStyleRefs = input.previewStyleRefs ?? [];
  const timelineSoundIds = input.timelineSoundIds ?? [];

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
  const usedCharacterIds = expandUsedAssetIdSet(
    relationShots.flatMap((shot) => [
      ...(shot.characterIds ?? []),
      ...(shot.usedAssetIds ?? []),
      ...Object.keys(shot.characterRevisionPins ?? {}),
    ]),
  );
  const usedSceneNames = new Set(
    relationShots.map((shot) => normalizeName(shot.sceneName)).filter(Boolean),
  );
  const usedSceneIds = expandUsedAssetIdSet(
    relationShots.flatMap((shot) => [shot.sceneAssetId, ...(shot.usedAssetIds ?? [])]),
  );
  for (const u of nodeUsages) {
    if (u.kind === 'character' && u.assetId) usedCharacterIds.add(stripAssetPinRevision(u.assetId));
    if (u.kind === 'character' && u.label) usedCharacterNames.add(normalizeName(u.label));
    if (u.kind === 'scene' && u.assetId) usedSceneIds.add(stripAssetPinRevision(u.assetId));
    if (u.kind === 'scene' && u.label) usedSceneNames.add(normalizeName(u.label));
  }

  const characterUsage = new Map<string, ImpactShotRef[]>();
  const sceneUsage = new Map<string, ImpactShotRef[]>();
  const invalidCharacterRefs: ImpactShotRef[] = [];
  const invalidSceneRefs: ImpactShotRef[] = [];
  const legacyBareMentions: AssetHealthAnalysis['legacyBareMentions'] = [];

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

    const promptBlob = [
      shot.purpose,
      shot.visual,
      shot.videoDesc,
      shot.imagePrompt,
      shot.videoPrompt,
      shot.notes,
    ]
      .filter(Boolean)
      .join('\n');
    const bare = findLegacyBareMentions(promptBlob);
    if (bare.length) {
      legacyBareMentions.push({ shotId, shotLabel: label, labels: bare });
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
  const liveCostumeIds = new Set(costumeItems.map((c) => c.id));
  const livePropIds = new Set(propItems.map((p) => p.id));

  const invalidCostumeRefs: ImpactIdRef[] = [];
  const invalidPropRefs: ImpactIdRef[] = [];
  const invalidShotRefs: ImpactIdRef[] = [];
  const invalidStyleRefs: ImpactIdRef[] = [];
  const invalidSoundRefs: ImpactIdRef[] = [];

  const liveShotIds = new Set(shotItems.map((s) => s.id));
  const liveStyleIds = new Set(styles.map((s) => s.id));
  const liveSoundIds = new Set(sounds.map((s) => s.id));
  const usedShotLexIds = new Set<string>();
  const usedStyleIds = new Set<string>();
  const usedSoundIds = new Set<string>();

  for (const shot of relationShots) {
    const sid = shot.shotAssetId?.trim();
    if (sid) usedShotLexIds.add(sid);
    for (const id of expandUsedAssetIdSet(shot.usedAssetIds)) {
      if (liveShotIds.has(id)) usedShotLexIds.add(id);
      if (liveStyleIds.has(id)) usedStyleIds.add(id);
      if (liveSoundIds.has(id)) usedSoundIds.add(id);
    }
  }
  for (const ref of previewStyleRefs) {
    const id = ref.styleAssetId.trim();
    if (id) usedStyleIds.add(id);
  }
  for (const u of nodeUsages) {
    const id = stripAssetPinRevision(u.assetId);
    if (!id) continue;
    if (u.kind === 'shot') usedShotLexIds.add(id);
    if (u.kind === 'style') usedStyleIds.add(id);
    if (u.kind === 'sound') usedSoundIds.add(id);
  }
  for (const c of characters) {
    const sid = c.soundAssetId?.trim();
    if (sid) usedSoundIds.add(sid);
  }
  for (const sid of timelineSoundIds) {
    const id = sid.trim();
    if (id && liveSoundIds.has(id)) usedSoundIds.add(id);
  }

  for (const c of characters) {
    const costumeId = c.creative?.costumeId?.trim();
    if (!costumeId) continue;
    if (!liveCostumeIds.has(costumeId)) {
      invalidCostumeRefs.push({
        oldId: costumeId,
        oldLabel: c.creative?.costumeLabel ?? undefined,
        ownerId: c.id,
        ownerLabel: c.name,
        context: 'character-bind',
      });
    }
  }

  for (const c of characters) {
    const sid = c.soundAssetId?.trim();
    if (!sid) continue;
    if (!liveSoundIds.has(sid)) {
      invalidSoundRefs.push({
        oldId: sid,
        ownerId: c.id,
        ownerLabel: c.name,
        context: 'sound-character',
      });
    }
  }

  relationShots.forEach((shot, index) => {
    const label = shotLabel(shot, index);
    const shotId = shot.id || shot.shotId || `idx-${index}`;
    for (const o of shot.costumeOverrides ?? []) {
      const cid = o.costumeId?.trim();
      if (!cid) continue;
      if (!liveCostumeIds.has(cid)) {
        invalidCostumeRefs.push({
          oldId: cid,
          oldLabel: o.costumeLabel,
          shotId,
          shotLabel: label,
          ownerLabel: o.characterName,
          context: 'shot-override',
        });
      }
    }
    for (const pid of shot.propIds ?? []) {
      const id = pid.trim();
      if (!id) continue;
      if (!livePropIds.has(id)) {
        invalidPropRefs.push({
          oldId: id,
          shotId,
          shotLabel: label,
          context: 'shot-prop',
        });
      }
    }
    const shotLexId = shot.shotAssetId?.trim();
    if (shotLexId && !liveShotIds.has(shotLexId)) {
      invalidShotRefs.push({
        oldId: shotLexId,
        shotId,
        shotLabel: label,
        context: 'shot-lexicon',
      });
    }
  });

  for (const ref of previewStyleRefs) {
    const id = ref.styleAssetId.trim();
    if (!id || liveStyleIds.has(id)) continue;
    invalidStyleRefs.push({
      oldId: id,
      oldLabel: ref.label,
      shotId: ref.shotId || ref.frameId,
      shotLabel: ref.label || ref.frameId,
      context: 'style-frame',
    });
  }

  for (const s of sceneItems) {
    for (const pid of getSceneCreative(s).propIds ?? []) {
      const id = pid.trim();
      if (!id) continue;
      if (!livePropIds.has(id)) {
        invalidPropRefs.push({
          oldId: id,
          ownerId: s.id,
          ownerLabel: s.label,
          context: 'scene-prop',
        });
      }
    }
  }

  const scenePropIds = new Set(
    sceneItems.flatMap((s) => getSceneCreative(s).propIds ?? []).filter(Boolean),
  );
  for (const shot of relationShots) {
    for (const id of expandUsedAssetIdSet(shot.usedAssetIds)) {
      scenePropIds.add(id);
    }
    for (const id of shot.propIds ?? []) {
      if (id.trim()) scenePropIds.add(id.trim());
    }
  }
  for (const u of nodeUsages) {
    if (u.kind === 'prop' && u.assetId) scenePropIds.add(stripAssetPinRevision(u.assetId));
  }

  const legacyMentionIds = legacyBareMentions.flatMap((row) =>
    row.labels.map((name) => {
      const hit = characters.find((c) => normalizeName(c.name) === normalizeName(name));
      return hit?.id ?? `bare:${name}`;
    }),
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
      characters
        .filter(
          (c) =>
            !usedCharacterNames.has(normalizeName(c.name))
            && !usedCharacterIds.has(c.id),
        )
        .map((c) => c.id),
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
    metric('legacyMention', '裸@待升级', legacyMentionIds),
    metric(
      'pollution',
      '同图污染',
      pollutionIdsBySharedMedia(
        characters.map((c) => ({ id: c.id, urls: characterMediaUrls(c) })),
      ),
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
      sceneItems
        .filter(
          (s) =>
            !usedSceneNames.has(normalizeName(s.label))
            && !usedSceneIds.has(s.id),
        )
        .map((s) => s.id),
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
    metric(
      'pollution',
      '同图污染',
      pollutionIdsBySharedMedia(
        sceneItems.map((s) => ({ id: s.id, urls: workspaceMediaUrls(s) })),
      ),
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
    metric(
      'invalidRef',
      '失效引用',
      invalidCostumeRefs.map(
        (r) => `invalid:${r.oldId}:${r.shotId ?? r.ownerId ?? r.context}`,
      ),
    ),
    metric(
      'pollution',
      '同图污染',
      pollutionIdsBySharedMedia(
        costumeItems.map((c) => ({ id: c.id, urls: workspaceMediaUrls(c) })),
      ),
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
    metric(
      'invalidRef',
      '失效引用',
      invalidPropRefs.map(
        (r) => `invalid:${r.oldId}:${r.shotId ?? r.ownerId ?? r.context}`,
      ),
    ),
    metric(
      'pollution',
      '同图污染',
      pollutionIdsBySharedMedia(
        propItems.map((p) => ({ id: p.id, urls: workspaceMediaUrls(p) })),
      ),
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
      'unused',
      '未使用',
      sounds
        .filter((s) => !isBuiltinSoundAsset(s) && !usedSoundIds.has(s.id))
        .map((s) => s.id),
    ),
    metric(
      'missingMedia',
      '缺音频',
      // 内置可为 Prompt-only；用户条目无音频才计缺陷
      sounds
        .filter((s) => !isBuiltinSoundAsset(s) && !s.audioUrl?.trim())
        .map((s) => s.id),
    ),
    metric(
      'missingPrompt',
      '缺 Prompt',
      sounds.filter((s) => !resolveAssetPromptText('sound', s)?.trim()).map((s) => s.id),
    ),
    metric(
      'invalidRef',
      '失效引用',
      invalidSoundRefs.map((r) => `invalid:${r.oldId}:${r.ownerId ?? ''}`),
    ),
  ];

  const styleNames = groupByLabel(styles, (s) => s.name);
  const styleMetrics: HealthIssueMetric[] = [
    metric(
      'duplicate',
      '重复',
      [...styleNames.values()].filter((xs) => xs.length > 1).flatMap((xs) => xs.map((x) => x.id)),
    ),
    metric(
      'unused',
      '未使用',
      styles.filter((s) => !s.builtinKey && !usedStyleIds.has(s.id)).map((s) => s.id),
    ),
    metric(
      'missingPrompt',
      '缺 Prompt',
      styles
        .filter((s) => !s.promptEn?.trim() && !s.promptZh?.trim())
        .map((s) => s.id),
    ),
    metric(
      'invalidRef',
      '失效引用',
      invalidStyleRefs.map((r) => `invalid:${r.oldId}:${r.shotId ?? ''}`),
    ),
  ];

  const shotMetrics: HealthIssueMetric[] = [
    ...dictMetrics(shotItems, shotNames),
    metric(
      'unused',
      '未使用',
      shotItems.filter((s) => !usedShotLexIds.has(s.id)).map((s) => s.id),
    ),
    metric(
      'invalidRef',
      '失效引用',
      invalidShotRefs.map((r) => `invalid:${r.oldId}:${r.shotId ?? ''}`),
    ),
  ];

  const usageIndex = buildAssetUsageIndex(relationShots, nodeUsages);

  return {
    relationCount: relationShots.length,
    nodeRelationCount: nodeUsages.length,
    byTab: {
      character: characterMetrics,
      scene: sceneMetrics,
      costume: costumeMetrics,
      prop: propMetrics,
      shot: shotMetrics,
      emotion: dictMetrics(emotionItems, emotionNames),
      hook: [...dictMetrics(hookItems, hookNames), ...hookCoverage],
      style: styleMetrics,
      sound: soundMetrics,
    },
    invalidCharacterRefs,
    invalidSceneRefs,
    invalidCostumeRefs,
    invalidPropRefs,
    invalidShotRefs,
    invalidStyleRefs,
    invalidSoundRefs,
    characterUsage,
    sceneUsage,
    costumeBoundCharacters,
    nodeAssetUsages: nodeUsages,
    legacyBareMentions,
    usageIndex,
  };
}

/** OL-14：从镜表 + 节点引用汇总轻量 usage 快照 */
export function buildAssetUsageIndex(
  relationShots: RelationShotLike[],
  nodeUsages: ImpactNodeAssetRef[],
): AssetUsageIndex {
  const entries: AssetUsageIndex['entries'] = {};
  const touch = (assetId: string | null | undefined, shotId?: string, nodeId?: string) => {
    const id = stripAssetPinRevision(assetId);
    if (!id) return;
    const cur = entries[id] ?? { shotIds: [], nodeIds: [] };
    if (shotId && !cur.shotIds.includes(shotId)) cur.shotIds.push(shotId);
    if (nodeId && !cur.nodeIds.includes(nodeId)) cur.nodeIds.push(nodeId);
    entries[id] = cur;
  };

  relationShots.forEach((shot, index) => {
    const shotId = shot.id || shot.shotId || `idx-${index}`;
    for (const id of shot.characterIds ?? []) touch(id, shotId);
    touch(shot.sceneAssetId, shotId);
    touch(shot.shotAssetId, shotId);
    for (const id of shot.propIds ?? []) touch(id, shotId);
    for (const o of shot.costumeOverrides ?? []) touch(o.costumeId, shotId);
    for (const id of expandUsedAssetIdSet(shot.usedAssetIds)) touch(id, shotId);
  });

  for (const u of nodeUsages) {
    touch(u.assetId, undefined, u.nodeId);
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries,
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
  return new Set(row.itemIds.filter((id) => !id.startsWith('invalid:') && !id.startsWith('bare:')));
}

/** 全库阻塞：会阻碍出片一致性的硬问题（不含未使用/未锁定等软信号） */
export const LIBRARY_BLOCKING_KEYS: HealthIssueKey[] = [
  'invalidRef',
  'missingMedia',
  'missingPrompt',
  'promptDrift',
  'legacyMention',
  'pollution',
];

export interface LibraryBlockingTabSummary {
  tab: AssetLibraryKind;
  label: string;
  count: number;
  /** 该 Tab 内计数最高的阻塞 key，便于一键跳转过滤 */
  primaryKey: HealthIssueKey | null;
}

export interface LibraryBlockingSummary {
  total: number;
  byTab: LibraryBlockingTabSummary[];
  invalidRefCount: number;
}

const TAB_LABEL: Partial<Record<AssetLibraryKind, string>> = {
  character: '角色',
  costume: '服装',
  scene: '场景',
  prop: '道具',
  shot: '镜头',
  style: '风格',
  sound: '声音',
  emotion: '情绪',
  hook: '钩子',
};

export function summarizeLibraryBlocking(
  analysis: AssetHealthAnalysis,
  opts?: { tabs?: AssetLibraryKind[] },
): LibraryBlockingSummary {
  const tabs = opts?.tabs ?? (Object.keys(analysis.byTab) as AssetLibraryKind[]);
  const byTab: LibraryBlockingTabSummary[] = [];
  let total = 0;
  const invalidRefCount =
    analysis.invalidCharacterRefs.length + analysis.invalidSceneRefs.length;

  for (const tab of tabs) {
    const metrics = analysis.byTab[tab] ?? [];
    let count = 0;
    let primaryKey: HealthIssueKey | null = null;
    let primaryCount = 0;
    for (const row of metrics) {
      if (!LIBRARY_BLOCKING_KEYS.includes(row.key)) continue;
      if (row.count <= 0) continue;
      count += row.count;
      if (row.count > primaryCount) {
        primaryCount = row.count;
        primaryKey = row.key;
      }
    }
    // 失效引用挂在角/场 Tab 指标上；若指标未单独计入，用 impact 列表补底
    if (tab === 'character' && analysis.invalidCharacterRefs.length > 0) {
      const hasInvalidMetric = metrics.some((m) => m.key === 'invalidRef' && m.count > 0);
      if (!hasInvalidMetric) {
        count += analysis.invalidCharacterRefs.length;
        if (!primaryKey) primaryKey = 'invalidRef';
      }
    }
    if (tab === 'scene' && analysis.invalidSceneRefs.length > 0) {
      const hasInvalidMetric = metrics.some((m) => m.key === 'invalidRef' && m.count > 0);
      if (!hasInvalidMetric) {
        count += analysis.invalidSceneRefs.length;
        if (!primaryKey) primaryKey = 'invalidRef';
      }
    }
    if (count <= 0) continue;
    total += count;
    byTab.push({
      tab,
      label: TAB_LABEL[tab] ?? tab,
      count,
      primaryKey,
    });
  }

  byTab.sort((a, b) => b.count - a.count);
  return { total, byTab, invalidRefCount };
}
