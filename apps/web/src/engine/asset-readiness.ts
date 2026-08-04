/**
 * asset-readiness.ts — 设定就绪 / 分镜预检（F-005）。
 *
 * 从 asset-gate-runner.ts 重命名/整理，保留纯函数，UI 迁入编剧台与分镜台。
 * 删除 asset-gate 节点；能力拆并：
 * - 编剧「设定就绪」+ 分镜预检 + 导演锁参考硬拦
 * - 资产库 = 唯一设定编辑面
 * - 视觉门槛：主角三视图（或完整设定板）硬拦；配角只要定妆/主参考
 */
import type {
  ScreenplayPackage,
  ScreenplayCharacterDraft,
  ScriptBreakdownPayload,
  EnvironmentProfile,
  CharacterProfile,
} from '@nx9/shared';
import {
  buildCharacterBiblePrompt,
  refreshCharacterPrompts,
  splitCharacterDisplayName,
} from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import {
  environmentsFromBreakdown,
  profilesFromBreakdown,
} from './script-breakdown-runner';
import { sceneCandidateToWorkspaceItem } from './script-asset-candidates';

export type CharacterVisualRole = 'main' | 'support';

export interface CharacterVisualGap {
  name: string;
  role: CharacterVisualRole;
  /** 缺定妆/主参考 */
  missingReference: boolean;
  /** 主角缺三视图（正/侧/背）且无完整设定板 */
  missingTurnaround: boolean;
}

export interface AssetReadinessState {
  ready: boolean;
  checkedAt?: string;
  source: 'bible' | 'breakdown';
  requiredCharacters: string[];
  requiredScenes: string[];
  missingCharacters: string[];
  missingScenes: string[];
  missingCostumes?: string[];
  missingProps?: string[];
  /** 已入库但仍缺定妆图的角色（配角与主角共用） */
  missingCharacterRefs?: string[];
  /** 主角缺三视图/设定板 */
  missingCharacterTurnarounds?: string[];
  /** 逐角视觉缺口明细 */
  characterVisualGaps?: CharacterVisualGap[];
  syncedCharacters?: number;
  /** 已有角色补全空文本字段数 */
  filledCharacters?: number;
  syncedScenes?: number;
}

function uniq(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function pickNonEmptyText(
  existing?: string | null,
  incoming?: string | null,
): string | undefined {
  const e = existing?.trim();
  if (e) return existing!.trim();
  const i = incoming?.trim();
  return i || undefined;
}

/** 明确主角：identity 标明主角或主视角/leading/main 等等同表达都算 main（但不再用出场集数/兜底抬人） */
const LEAD_IDENTITY_RE =
  /主角|女主|男主|主人公|主视角|protagonist|heroine|leading|\bmain\b|\bhero\b/i;
const SUPPORT_IDENTITY_RE = /配角|supporting|\bsupport\b/i;

export function isExplicitLeadIdentity(identity?: string): boolean {
  return LEAD_IDENTITY_RE.test(identity ?? '');
}

export function isExplicitSupportIdentity(identity?: string): boolean {
  return SUPPORT_IDENTITY_RE.test(identity ?? '');
}

function roleFromIdentity(identity?: string): CharacterVisualRole | null {
  if (isExplicitSupportIdentity(identity)) return 'support';
  if (isExplicitLeadIdentity(identity)) return 'main';
  return null;
}

function roleFromProfile(profile?: CharacterProfile): CharacterVisualRole | null {
  if (!profile) return null;
  const tags = profile.tags ?? [];
  if (tags.includes('配角')) return 'support';
  if (tags.includes('主角')) return 'main';
  return (
    roleFromIdentity(profile.bible?.identity)
    ?? roleFromIdentity(profile.creative?.identityRole)
    ?? null
  );
}

/** identity 是否已标明主角或配角（未标明时默认按配角处理，并在就绪面板提示） */
export function hasExplicitCharacterRoleLabel(identity?: string): boolean {
  return isExplicitLeadIdentity(identity) || isExplicitSupportIdentity(identity);
}

export function tagsFromIdentity(identity?: string): string[] {
  if (!identity?.trim()) return [];
  const tags: string[] = [];
  // 配角优先：同时含主角/配角词时只打「配角」，避免滥标三视图门槛
  if (isExplicitSupportIdentity(identity)) {
    tags.push('配角');
  } else if (isExplicitLeadIdentity(identity)) {
    tags.push('主角');
  }
  if (/反派|antagonist/i.test(identity)) {
    tags.push('反派');
  }
  return tags;
}

/**
 * Bible draft → 素材库角色档案（仅文本字段；不含图片/锁定/服装绑定）。
 * 姓名若含「(化名X)」等括号，会拆到 aliases，canonical name 写入 name。
 */
export function characterProfileFromBibleDraft(
  draft: ScreenplayCharacterDraft,
  id?: string,
): CharacterProfile {
  const appearance = [draft.appearance, draft.fixedVisualKeywords]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join('。') || undefined;
  const split = splitCharacterDisplayName(draft.name);
  const aliasSeen = new Set<string>();
  const aliases: string[] = [];
  for (const a of [...(draft.aliases ?? []), ...split.aliases]) {
    const v = a.trim();
    if (!v || v === split.name || aliasSeen.has(v)) continue;
    aliasSeen.add(v);
    aliases.push(v);
  }
  const tags = tagsFromIdentity(draft.identity);
  const profile: CharacterProfile = {
    id: id ?? `char-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: split.name || draft.name.trim(),
    tags: tags.length ? tags : undefined,
    bible: {
      identity: draft.identity?.trim() || undefined,
      appearance,
      personality: draft.personality?.trim() || undefined,
      background: draft.background?.trim() || undefined,
      voice: draft.voiceNotes?.trim() || undefined,
      relationships: draft.relationships?.trim() || undefined,
    },
    creative: {
      identityRole: draft.identity?.trim() || undefined,
      occupation: draft.identity?.trim() || undefined,
      aliases: aliases.length ? aliases : undefined,
      nickname: aliases[0],
      personalityText: draft.personality?.trim() || undefined,
      backgroundStory: draft.background?.trim() || undefined,
    },
    consistencyPrompt: '',
  };
  profile.consistencyPrompt = buildCharacterBiblePrompt(profile);
  return profile;
}

/**
 * 已有角色只补空文本字段；不覆盖图片 URL / 锁定 / 服装绑定。
 * 若库内姓名仍带「(化名…)」且 incoming 已拆干净，则顺带清洗 name，并把括号别名写入 aliases。
 */
export function mergeCharacterProfileFillEmpty(
  existing: CharacterProfile,
  incoming: CharacterProfile,
): CharacterProfile {
  const ex = existing.creative ?? {};
  const inc = incoming.creative ?? {};
  const existingSplit = splitCharacterDisplayName(existing.name);
  const preferCleanName =
    existingSplit.aliases.length > 0
    && Boolean(incoming.name?.trim())
    && incoming.name.trim() !== existing.name.trim();
  const aliases =
    ex.aliases?.length
      ? ex.aliases
      : (inc.aliases?.length
        ? inc.aliases
        : (existingSplit.aliases.length ? existingSplit.aliases : undefined));
  return {
    ...existing,
    name: preferCleanName ? incoming.name.trim() : existing.name,
    tags: existing.tags?.length ? existing.tags : incoming.tags,
    consistencyPrompt: pickNonEmptyText(existing.consistencyPrompt, incoming.consistencyPrompt)
      ?? existing.consistencyPrompt,
    bible: {
      identity: pickNonEmptyText(existing.bible?.identity, incoming.bible?.identity),
      appearance: pickNonEmptyText(existing.bible?.appearance, incoming.bible?.appearance),
      personality: pickNonEmptyText(existing.bible?.personality, incoming.bible?.personality),
      background: pickNonEmptyText(existing.bible?.background, incoming.bible?.background),
      voice: pickNonEmptyText(existing.bible?.voice, incoming.bible?.voice),
      relationships: pickNonEmptyText(existing.bible?.relationships, incoming.bible?.relationships),
    },
    creative: {
      ...ex,
      identityRole: pickNonEmptyText(ex.identityRole, inc.identityRole),
      occupation: pickNonEmptyText(ex.occupation, inc.occupation),
      nickname: pickNonEmptyText(ex.nickname, inc.nickname ?? aliases?.[0]),
      aliases,
      personalityText: pickNonEmptyText(ex.personalityText, inc.personalityText),
      backgroundStory: pickNonEmptyText(ex.backgroundStory, inc.backgroundStory),
    },
  };
}

function characterKeys(item: CharacterProfile): string[] {
  const split = splitCharacterDisplayName(item.name);
  return [
    item.name,
    split.name,
    item.creative?.nickname,
    ...(item.creative?.aliases ?? []),
    ...split.aliases,
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function libraryCharacterNameSet(): Set<string> {
  const doc = useWorkspaceDocument.getState();
  return new Set(doc.characters.characters.flatMap(characterKeys));
}

function libraryCharacters(): CharacterProfile[] {
  return useWorkspaceDocument.getState().characters.characters;
}

function findLibraryCharacter(
  name: string,
  library: CharacterProfile[],
): CharacterProfile | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  const needleBase = splitCharacterDisplayName(name).name.trim().toLowerCase() || needle;
  return library.find((item) =>
    characterKeys(item).some((key) => {
      const k = key.toLowerCase();
      return k === needle || k === needleBase;
    }),
  );
}

function librarySceneNameSet(): Set<string> {
  const doc = useWorkspaceDocument.getState();
  return new Set([
    ...(doc.environments?.environments ?? []).flatMap((item) => [item.name.trim(), item.sceneCode ?? '']),
    ...doc.backlotWorkspace.items.filter((item) => item.kind === 'scene').map((item) => item.label.trim()),
  ].filter(Boolean));
}

function setTagsRole(
  tags: string[] | undefined,
  role: CharacterVisualRole,
): string[] | undefined {
  const base = (tags ?? []).filter((t) => t !== '主角' && t !== '配角');
  const roleTag = role === 'main' ? '主角' : '配角';
  const next = uniq([...base, roleTag]);
  return next.length ? next : undefined;
}

/**
 * 切换素材库角色标签里的主角/配角。
 * - 只改 tags，不覆盖其它图片/锁定/服装绑定等字段
 * - 返回是否成功（角色在素材库中存在）
 */
export function toggleLibraryCharacterRole(name: string): { ok: boolean; nextRole?: CharacterVisualRole } {
  const doc = useWorkspaceDocument.getState();
  const library = libraryCharacters();
  const existing = findLibraryCharacter(name, library);
  if (!existing) return { ok: false };

  const cur = roleFromProfile(existing) ?? 'support';
  const nextRole: CharacterVisualRole = cur === 'main' ? 'support' : 'main';
  const nextTags = setTagsRole(existing.tags, nextRole);
  doc.upsertCharacter({ ...existing, tags: nextTags });
  return { ok: true, nextRole };
}

/**
 * 显式设置素材库角色标签里的主角/配角。
 * 返回是否成功（角色在素材库中存在）
 */
export function setLibraryCharacterRole(name: string, role: CharacterVisualRole): boolean {
  const doc = useWorkspaceDocument.getState();
  const library = libraryCharacters();
  const existing = findLibraryCharacter(name, library);
  if (!existing) return false;

  const nextTags = setTagsRole(existing.tags, role);
  doc.upsertCharacter({ ...existing, tags: nextTags });
  return true;
}

/** 定妆 / 主参考：reference 或设定板/正面可回填 */
export function hasCharacterReferenceImage(profile: CharacterProfile): boolean {
  return Boolean(
    profile.referenceImageUrl?.trim() ||
      profile.creative?.fullSheetUrl?.trim() ||
      profile.creative?.frontViewUrl?.trim(),
  );
}

/** 三视图齐（正+侧+背），或完整设定板等价过关 */
export function hasCharacterTurnaround(profile: CharacterProfile): boolean {
  const cre = profile.creative;
  if (cre?.fullSheetUrl?.trim()) return true;
  return Boolean(
    cre?.frontViewUrl?.trim() && cre?.sideViewUrl?.trim() && cre?.backViewUrl?.trim(),
  );
}

/**
 * 主角判定（严格）：
 * - 仅当 identity 明确含主角类词 → main
 * - 明确含配角 → 一律 support（配角优先）
 * - 未标明 / 无兜底抬人 / 不看出场集数 → support
 */
export function classifyBibleCharacterRoles(
  pkg: ScreenplayPackage,
): Map<string, CharacterVisualRole> {
  const roles = new Map<string, CharacterVisualRole>();
  const library = libraryCharacters();

  for (const draft of pkg.bible.characters) {
    const name = draft.name.trim();
    if (!name) continue;
    const byDraft = roleFromIdentity(draft.identity);
    const byLibrary = roleFromProfile(findLibraryCharacter(name, library));
    roles.set(name, byLibrary ?? byDraft ?? 'support');
  }
  return roles;
}

function inspectCharacterVisualGaps(
  pkg: ScreenplayPackage,
  library: CharacterProfile[],
): CharacterVisualGap[] {
  const roles = classifyBibleCharacterRoles(pkg);
  const gaps: CharacterVisualGap[] = [];

  for (const draft of pkg.bible.characters) {
    const name = draft.name.trim();
    if (!name) continue;
    const profile = findLibraryCharacter(name, library);
    if (!profile) continue; // 未入库由 missingCharacters 管

    const role = roles.get(name) ?? 'support';
    const missingReference = !hasCharacterReferenceImage(profile);
    const missingTurnaround = role === 'main' && !hasCharacterTurnaround(profile);
    if (missingReference || missingTurnaround) {
      gaps.push({ name, role, missingReference, missingTurnaround });
    }
  }
  return gaps;
}

/** F-051: 从 Bible 中提取服装名 */
function extractCostumeNames(pkg: ScreenplayPackage): string[] {
  const names = new Set<string>();
  for (const char of pkg.bible.characters) {
    const text = [char.appearance, char.personality, char.voiceNotes].filter(Boolean).join(' ');
    const costumeMatch = text.match(/(?:穿着|身穿|着|穿)[：:]?([^。，；]+)/g);
    if (costumeMatch) {
      for (const m of costumeMatch) {
        names.add(m.replace(/(?:穿着|身穿|着|穿)[：:]?/, '').trim());
      }
    }
  }
  return [...names];
}

/** F-051: 从 Bible 中提取道具名 */
function extractPropNames(pkg: ScreenplayPackage): string[] {
  const names = new Set<string>();
  for (const scene of pkg.bible.scenes) {
    const text = [scene.summary, scene.dramaticFunction].filter(Boolean).join(' ');
    const propMatch = text.match(/(?:道具|物品|摆设)[：:]?([^。，；]+)/g);
    if (propMatch) {
      for (const m of propMatch) {
        names.add(m.replace(/(?:道具|物品|摆设)[：:]?/, '').trim());
      }
    }
  }
  return [...names];
}

function buildReadinessState(
  pkg: ScreenplayPackage,
  extras?: Partial<AssetReadinessState>,
): AssetReadinessState {
  const existingCharacters = libraryCharacterNameSet();
  const existingScenes = librarySceneNameSet();
  const library = libraryCharacters();
  const requiredCharacters = uniq(pkg.bible.characters.map((item) => item.name));
  const requiredScenes = uniq(pkg.bible.scenes.map((item) => item.name || item.location || item.code || ''));
  const missingCharacters = requiredCharacters.filter((name) => !existingCharacters.has(name));
  const missingScenes = requiredScenes.filter((name) => !existingScenes.has(name));
  const requiredCostumes = extractCostumeNames(pkg);
  const requiredProps = extractPropNames(pkg);
  const missingCostumes = requiredCostumes.filter(
    (c) => !existingCharacters.has(c) && !libraryCharacterNameSet().has(c),
  );
  const missingProps = requiredProps;
  const characterVisualGaps = inspectCharacterVisualGaps(pkg, library);
  const missingCharacterRefs = characterVisualGaps
    .filter((g) => g.missingReference)
    .map((g) => g.name);
  const missingCharacterTurnarounds = characterVisualGaps
    .filter((g) => g.missingTurnaround)
    .map((g) => g.name);

  const ready =
    missingCharacters.length === 0 &&
    missingScenes.length === 0 &&
    missingCharacterRefs.length === 0 &&
    missingCharacterTurnarounds.length === 0;

  return {
    ready,
    checkedAt: new Date().toISOString(),
    source: 'bible',
    requiredCharacters,
    requiredScenes,
    missingCharacters,
    missingScenes,
    missingCostumes,
    missingProps,
    missingCharacterRefs,
    missingCharacterTurnarounds,
    characterVisualGaps,
    syncedCharacters: 0,
    syncedScenes: 0,
    ...extras,
  };
}

/** 设定检查：读编剧台 Bible draft（默认不自动入库）+ 视觉门槛 */
export function inspectBibleAssets(pkg: ScreenplayPackage): AssetReadinessState {
  return buildReadinessState(pkg);
}

/** 同步圣经角色/场景到库（upsert）；缺失全量写入，已有只补空文本；同步后重检视觉缺口 */
export function syncBibleAssets(pkg: ScreenplayPackage): AssetReadinessState {
  const doc = useWorkspaceDocument.getState();
  const existingScenes = librarySceneNameSet();
  let syncedChars = 0;
  let filledChars = 0;
  let syncedScenes = 0;

  const ensureCharacterDefaultPrompts = (profile: CharacterProfile): CharacterProfile => {
    const ext = profile.creative ?? {};
    const hasNegative = Boolean(ext.consistency?.negativePrompt?.trim() || ext.prompts?.negative?.text?.trim());
    if (hasNegative) return profile;
    // 为了让素材库 UI（Negative / 禁改项）有默认值，需要补全提示词结构
    // refreshCharacterPrompts 不会覆盖 ext.consistency.negativePrompt（若用户已填），只补缺省。
    return refreshCharacterPrompts(profile);
  };

  const roles = classifyBibleCharacterRoles(pkg);

  for (const char of pkg.bible.characters) {
    const name = char.name.trim();
    if (!name) continue;
    const existing = findLibraryCharacter(name, libraryCharacters());
    const fromDraft = characterProfileFromBibleDraft(char, existing?.id);
    // identity 未标明时默认「配角」（与 classify 一致，不抬主角）
    if (!fromDraft.tags?.length) {
      const role = roles.get(name) ?? roles.get(fromDraft.name) ?? 'support';
      fromDraft.tags = [role === 'main' ? '主角' : '配角'];
    }
    if (!existing) {
      doc.upsertCharacter(ensureCharacterDefaultPrompts(fromDraft));
      syncedChars++;
      continue;
    }
    const merged = mergeCharacterProfileFillEmpty(existing, fromDraft);

    const ensured = ensureCharacterDefaultPrompts(merged);
    const changed =
      merged.name !== existing.name
      || merged.consistencyPrompt !== existing.consistencyPrompt
      || JSON.stringify(merged.bible) !== JSON.stringify(existing.bible ?? {})
      || JSON.stringify({
        identityRole: merged.creative?.identityRole,
        occupation: merged.creative?.occupation,
        nickname: merged.creative?.nickname,
        aliases: merged.creative?.aliases,
        personalityText: merged.creative?.personalityText,
        backgroundStory: merged.creative?.backgroundStory,
      }) !== JSON.stringify({
        identityRole: existing.creative?.identityRole,
        occupation: existing.creative?.occupation,
        nickname: existing.creative?.nickname,
        aliases: existing.creative?.aliases,
        personalityText: existing.creative?.personalityText,
        backgroundStory: existing.creative?.backgroundStory,
      })
      || JSON.stringify(merged.tags ?? []) !== JSON.stringify(existing.tags ?? []);

    const negativeChanged =
      ensured.creative?.prompts?.negative?.text !== existing.creative?.prompts?.negative?.text
      || ensured.creative?.consistency?.negativePrompt !== existing.creative?.consistency?.negativePrompt;

    if (changed || negativeChanged) {
      doc.upsertCharacter(ensured);
      filledChars++;
    }
  }
  for (const scene of pkg.bible.scenes) {
    const sceneName = scene.name?.trim() || scene.location?.trim() || scene.code?.trim();
    if (!sceneName) continue;
    if (!existingScenes.has(sceneName)) {
      const envProfile: EnvironmentProfile = {
        id: `scene-${scene.id}`,
        name: scene.name,
        descriptionZh: scene.summary ?? '',
        sceneCode: scene.code,
        consistencyPrompt: scene.sensoryNotes,
      };
      doc.upsertBacklotWorkspace(sceneCandidateToWorkspaceItem(envProfile));
      existingScenes.add(sceneName);
      syncedScenes++;
    }
  }
  return buildReadinessState(pkg, {
    syncedCharacters: syncedChars,
    filledCharacters: filledChars,
    syncedScenes,
  });
}

/** 将 Bible draft 角色/场景写入库（不覆盖已有） */
export function applyBibleDraftsToLibrary(pkg: ScreenplayPackage): AssetReadinessState {
  return syncBibleAssets(pkg);
}

/** 从场景拆分解构出发，批量写入 library（助理模式下） */
export function applyBreakdownToLibrary(breakdown: ScriptBreakdownPayload): AssetReadinessState {
  const doc = useWorkspaceDocument.getState();
  const profiles = profilesFromBreakdown(breakdown, []);
  const envs = environmentsFromBreakdown(breakdown, []);
  for (const profile of profiles) {
    doc.upsertCharacter(profile);
  }
  for (const env of envs) {
    if (!env.name && !env.sceneCode) continue;
    doc.upsertBacklotWorkspace(sceneCandidateToWorkspaceItem(env));
  }
  return {
    ready: true,
    checkedAt: new Date().toISOString(),
    source: 'breakdown',
    requiredCharacters: profiles.map((p) => p.name),
    requiredScenes: envs.map((e) => e.name || e.sceneCode || ''),
    missingCharacters: [],
    missingScenes: [],
    missingCharacterRefs: [],
    missingCharacterTurnarounds: [],
    characterVisualGaps: [],
    syncedCharacters: profiles.length,
    syncedScenes: envs.length,
  };
}

/**
 * F-005: 将编剧台标记为设定就绪。写入 ScriptDesk node.data.assetReadiness = { ready: true }。
 * 当无缺口或用户强制确认时调用。
 */
export function markScriptAssetReady(): AssetReadinessState {
  return {
    ready: true,
    checkedAt: new Date().toISOString(),
    source: 'bible',
    requiredCharacters: [],
    requiredScenes: [],
    missingCharacters: [],
    missingScenes: [],
    missingCharacterRefs: [],
    missingCharacterTurnarounds: [],
    characterVisualGaps: [],
    syncedCharacters: 0,
    syncedScenes: 0,
  };
}

/**
 * F-005: 分镜台预检，返回是否可拆镜。soft 模式有缺口也可继续，hard 模式阻断。
 */
export function runStoryboardPreflight(
  readiness: AssetReadinessState | null,
  mode: 'soft' | 'hard' = 'soft',
): { ok: boolean; blocking: boolean; reason?: string } {
  if (!readiness) {
    return { ok: false, blocking: mode === 'hard', reason: '未检测到上游剧本设定就绪状态' };
  }
  if (readiness.ready) {
    return { ok: true, blocking: false };
  }
  const missing = [
    ...readiness.missingCharacters.map((c) => `角色「${c}」`),
    ...readiness.missingScenes.map((s) => `场景「${s}」`),
    ...(readiness.missingCharacterRefs ?? []).map((c) => `角色定妆「${c}」`),
    ...(readiness.missingCharacterTurnarounds ?? []).map((c) => `主角三视图「${c}」`),
    ...(readiness.missingCostumes ?? []).map((c) => `服装「${c}」`),
    ...(readiness.missingProps ?? []).map((p) => `道具「${p}」`),
  ];
  const reason = `缺少资产：${missing.join('、')}`;
  if (mode === 'hard') {
    return { ok: false, blocking: true, reason };
  }
  return { ok: true, blocking: false, reason: `${reason}（软模式可继续）` };
}

function readinessFromNodeData(data: Record<string, unknown>): AssetReadinessState | null {
  const chainData = data.chainStoryboard as Record<string, unknown> | undefined;
  if (chainData?.assetPreflight) {
    return chainData.assetPreflight as AssetReadinessState;
  }
  const preflight = data.preflight as { lastReport?: AssetReadinessState } | undefined;
  if (preflight?.lastReport) return preflight.lastReport;
  const readiness = data.assetReadiness as AssetReadinessState | undefined;
  if (readiness) return readiness;
  // 兼容旧 asset-gate data
  const gatePassed = data.passed as boolean | undefined;
  if (gatePassed !== undefined) {
    return {
      ready: gatePassed,
      checkedAt: data.checkedAt as string | undefined,
      source: 'bible',
      requiredCharacters: (data.requiredCharacters as string[]) ?? [],
      requiredScenes: (data.requiredScenes as string[]) ?? [],
      missingCharacters: gatePassed ? [] : (data.missingCharacters as string[]) ?? [],
      missingScenes: gatePassed ? [] : (data.missingScenes as string[]) ?? [],
    };
  }
  const assetGate = data.assetGate as { passed?: boolean; releasedAt?: string } | undefined;
  if (assetGate?.passed !== undefined) {
    return {
      ready: Boolean(assetGate.passed),
      checkedAt: assetGate.releasedAt,
      source: 'bible',
      requiredCharacters: [],
      requiredScenes: [],
      missingCharacters: [],
      missingScenes: [],
    };
  }
  return null;
}

/**
 * 检查上游剧本的就绪状态（替代 checkAssetGateInEdges）。
 * 沿入边 BFS 上游，优先读 script-desk.assetReadiness（导演台可隔分镜台读到编剧就绪）。
 */
export function checkAssetReadinessInEdges(
  blockId: string,
  nodes: Array<{ id: string; type?: string; data?: Record<string, unknown> }>,
  edges: Array<{ source: string; target: string }>,
): AssetReadinessState | null {
  const visited = new Set<string>();
  const queue = edges.filter((e) => e.target === blockId).map((e) => e.source);
  let fallback: AssetReadinessState | null = null;

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const source = nodes.find((n) => n.id === id);
    if (!source?.data) continue;

    const found = readinessFromNodeData(source.data);
    if (found) {
      // script-desk 就绪态优先；其它上游节点先作 fallback
      if (
        source.type === 'script-desk' ||
        source.type === 'script' ||
        source.type === 'dialogue-sheet'
      ) {
        return found;
      }
      if (!fallback) fallback = found;
    }

    for (const edge of edges) {
      if (edge.target === id && !visited.has(edge.source)) {
        queue.push(edge.source);
      }
    }
  }
  return fallback;
}
