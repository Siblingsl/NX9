/**
 * C-02：素材库 → Bible 草稿正式回写。
 * 与 syncBibleAssets（Bible→库，不覆盖）对称：库侧深化后可显式推回编剧台 Bible。
 */
import type {
  BacklotWorkspaceItem,
  CharacterProfile,
  ScreenplayCharacterDraft,
  ScreenplayPackage,
  ScreenplaySceneDraft,
  ScriptDeskAgentSession,
} from '@nx9/shared';
import {
  characterDraftFromPartial,
  getSceneCreative,
  sceneDraftFromPartial,
  touchScreenplayPackage,
} from '@nx9/shared';

export type BiblePushMode = 'fill-empty' | 'overwrite';

export type BiblePushAction = 'created' | 'filled' | 'overwritten' | 'unchanged';

function pickNonEmpty(a?: string | null, b?: string | null): string | undefined {
  const left = a?.trim();
  if (left) return left;
  const right = b?.trim();
  return right || undefined;
}

function uniqAliases(...groups: Array<string[] | undefined>): string[] | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of groups) {
    for (const raw of g ?? []) {
      const v = raw.trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
  }
  return out.length ? out : undefined;
}

/** 库角色 → Bible draft（仅叙事文本；不含图/锁定） */
export function characterDraftFromProfile(profile: CharacterProfile): ScreenplayCharacterDraft {
  return characterDraftFromPartial({
    name: profile.name,
    aliases: profile.creative?.aliases,
    identity: profile.bible?.identity ?? profile.creative?.identityRole,
    appearance: profile.bible?.appearance,
    personality: profile.bible?.personality ?? profile.creative?.personalityText,
    relationships: profile.bible?.relationships,
    background: profile.bible?.background ?? profile.creative?.backgroundStory,
    voiceNotes: profile.bible?.voice,
    libraryStatus: 'in_library',
    libraryCharacterId: profile.id,
  });
}

export function sceneDraftFromWorkspaceItem(item: BacklotWorkspaceItem): ScreenplaySceneDraft {
  const ext = getSceneCreative(item);
  return sceneDraftFromPartial({
    name: item.label,
    code: ext.sceneCode,
    summary: ext.description ?? item.promptZh,
    era: ext.worldView,
    location: item.label,
    sensoryNotes: [ext.lighting, ext.colorTone, ext.weather, item.promptEn].filter(Boolean).join('；') || undefined,
    libraryStatus: 'in_library',
    libraryEnvironmentId: ext.environmentId ?? item.id,
  });
}

function mergeDraftFillEmpty(
  existing: ScreenplayCharacterDraft,
  incoming: ScreenplayCharacterDraft,
): ScreenplayCharacterDraft {
  return {
    ...existing,
    aliases: existing.aliases?.length ? existing.aliases : incoming.aliases,
    identity: pickNonEmpty(existing.identity, incoming.identity),
    appearance: pickNonEmpty(existing.appearance, incoming.appearance),
    personality: pickNonEmpty(existing.personality, incoming.personality),
    relationships: pickNonEmpty(existing.relationships, incoming.relationships),
    background: pickNonEmpty(existing.background, incoming.background),
    goal: pickNonEmpty(existing.goal, incoming.goal),
    voiceNotes: pickNonEmpty(existing.voiceNotes, incoming.voiceNotes),
    fixedVisualKeywords: pickNonEmpty(existing.fixedVisualKeywords, incoming.fixedVisualKeywords),
    libraryStatus: 'in_library',
    libraryCharacterId: incoming.libraryCharacterId ?? existing.libraryCharacterId,
  };
}

function mergeSceneDraftFillEmpty(
  existing: ScreenplaySceneDraft,
  incoming: ScreenplaySceneDraft,
): ScreenplaySceneDraft {
  return {
    ...existing,
    code: pickNonEmpty(existing.code, incoming.code),
    summary: pickNonEmpty(existing.summary, incoming.summary),
    era: pickNonEmpty(existing.era, incoming.era),
    location: pickNonEmpty(existing.location, incoming.location),
    dramaticFunction: pickNonEmpty(existing.dramaticFunction, incoming.dramaticFunction),
    sensoryNotes: pickNonEmpty(existing.sensoryNotes, incoming.sensoryNotes),
    libraryStatus: 'in_library',
    libraryEnvironmentId: incoming.libraryEnvironmentId ?? existing.libraryEnvironmentId,
  };
}

function draftChanged(a: ScreenplayCharacterDraft, b: ScreenplayCharacterDraft): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function sceneDraftChanged(a: ScreenplaySceneDraft, b: ScreenplaySceneDraft): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export interface BibleFieldDiff {
  field: string;
  label: string;
  before: string;
  after: string;
}

const CHAR_DIFF_FIELDS: Array<{ key: keyof ScreenplayCharacterDraft; label: string }> = [
  { key: 'identity', label: '身份' },
  { key: 'appearance', label: '外貌' },
  { key: 'personality', label: '性格' },
  { key: 'relationships', label: '关系' },
  { key: 'background', label: '背景' },
  { key: 'goal', label: '目标' },
  { key: 'voiceNotes', label: '声音' },
  { key: 'fixedVisualKeywords', label: '视觉关键词' },
];

const SCENE_DIFF_FIELDS: Array<{ key: keyof ScreenplaySceneDraft; label: string }> = [
  { key: 'code', label: '场景码' },
  { key: 'summary', label: '摘要' },
  { key: 'era', label: '时代' },
  { key: 'location', label: '地点' },
  { key: 'dramaticFunction', label: '戏剧功能' },
  { key: 'sensoryNotes', label: '感官备注' },
];

function strField(v: unknown): string {
  if (Array.isArray(v)) return v.join('、');
  return typeof v === 'string' ? v.trim() : '';
}

/** OL-07：库 → Bible 覆盖前的字段级差异（仅展示会变的字段） */
export function diffCharacterBiblePush(
  pkg: ScreenplayPackage,
  profile: CharacterProfile,
): BibleFieldDiff[] {
  const incoming = characterDraftFromProfile(profile);
  const idx = matchCharacterIndex(pkg, profile);
  if (idx < 0) {
    return CHAR_DIFF_FIELDS
      .map(({ key, label }) => ({
        field: String(key),
        label,
        before: '',
        after: strField(incoming[key]),
      }))
      .filter((d) => d.after);
  }
  const existing = pkg.bible.characters[idx];
  const diffs: BibleFieldDiff[] = [];
  for (const { key, label } of CHAR_DIFF_FIELDS) {
    const before = strField(existing[key]);
    const after = strField(incoming[key]);
    if (before === after) continue;
    diffs.push({ field: String(key), label, before, after });
  }
  const beforeAliases = (existing.aliases ?? []).join('、');
  const afterAliases = uniqAliases(incoming.aliases, existing.aliases)?.join('、') ?? '';
  if (beforeAliases !== (incoming.aliases ?? []).join('、')) {
    diffs.push({
      field: 'aliases',
      label: '别名',
      before: beforeAliases,
      after: (incoming.aliases ?? []).join('、') || afterAliases,
    });
  }
  return diffs;
}

export function diffSceneBiblePush(
  pkg: ScreenplayPackage,
  item: BacklotWorkspaceItem,
): BibleFieldDiff[] {
  if (item.kind !== 'scene') return [];
  const incoming = sceneDraftFromWorkspaceItem(item);
  const idx = matchSceneIndex(pkg, item);
  if (idx < 0) {
    return SCENE_DIFF_FIELDS
      .map(({ key, label }) => ({
        field: String(key),
        label,
        before: '',
        after: strField(incoming[key]),
      }))
      .filter((d) => d.after);
  }
  const existing = pkg.bible.scenes[idx];
  const diffs: BibleFieldDiff[] = [];
  for (const { key, label } of SCENE_DIFF_FIELDS) {
    const before = strField(existing[key]);
    const after = strField(incoming[key]);
    if (before === after) continue;
    diffs.push({ field: String(key), label, before, after });
  }
  return diffs;
}

function matchCharacterIndex(pkg: ScreenplayPackage, profile: CharacterProfile): number {
  const keys = new Set(
    [profile.name, ...(profile.creative?.aliases ?? [])]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return pkg.bible.characters.findIndex((c) => {
    if (c.libraryCharacterId && c.libraryCharacterId === profile.id) return true;
    const names = [c.name, ...(c.aliases ?? [])].map((s) => s.trim().toLowerCase());
    return names.some((n) => keys.has(n));
  });
}

function matchSceneIndex(pkg: ScreenplayPackage, item: BacklotWorkspaceItem): number {
  const ext = getSceneCreative(item);
  const keys = new Set(
    [item.label, ext.sceneCode, ext.environmentId]
      .map((s) => s?.trim().toLowerCase())
      .filter((s): s is string => Boolean(s)),
  );
  return pkg.bible.scenes.findIndex((s) => {
    if (s.libraryEnvironmentId && (s.libraryEnvironmentId === item.id || s.libraryEnvironmentId === ext.environmentId)) {
      return true;
    }
    return [s.name, s.location, s.code]
      .map((v) => v?.trim().toLowerCase())
      .some((v) => v && keys.has(v));
  });
}

export function pushCharacterToBiblePackage(
  pkg: ScreenplayPackage,
  profile: CharacterProfile,
  mode: BiblePushMode = 'fill-empty',
): { package: ScreenplayPackage; action: BiblePushAction } {
  const incoming = characterDraftFromProfile(profile);
  const idx = matchCharacterIndex(pkg, profile);
  if (idx < 0) {
    const next = touchScreenplayPackage(pkg, {
      bible: {
        ...pkg.bible,
        characters: [...pkg.bible.characters, incoming],
      },
    });
    return { package: next, action: 'created' };
  }
  const existing = pkg.bible.characters[idx];
  const merged =
    mode === 'overwrite'
      ? {
          ...incoming,
          id: existing.id,
          aliases: uniqAliases(incoming.aliases, existing.aliases),
        }
      : mergeDraftFillEmpty(existing, { ...incoming, id: existing.id });
  if (!draftChanged(existing, merged)) {
    return { package: pkg, action: 'unchanged' };
  }
  const characters = [...pkg.bible.characters];
  characters[idx] = merged;
  return {
    package: touchScreenplayPackage(pkg, { bible: { ...pkg.bible, characters } }),
    action: mode === 'overwrite' ? 'overwritten' : 'filled',
  };
}

export function pushSceneToBiblePackage(
  pkg: ScreenplayPackage,
  item: BacklotWorkspaceItem,
  mode: BiblePushMode = 'fill-empty',
): { package: ScreenplayPackage; action: BiblePushAction } {
  if (item.kind !== 'scene') {
    return { package: pkg, action: 'unchanged' };
  }
  const incoming = sceneDraftFromWorkspaceItem(item);
  const idx = matchSceneIndex(pkg, item);
  if (idx < 0) {
    const next = touchScreenplayPackage(pkg, {
      bible: {
        ...pkg.bible,
        scenes: [...pkg.bible.scenes, incoming],
      },
    });
    return { package: next, action: 'created' };
  }
  const existing = pkg.bible.scenes[idx];
  const merged =
    mode === 'overwrite'
      ? { ...incoming, id: existing.id }
      : mergeSceneDraftFillEmpty(existing, { ...incoming, id: existing.id });
  if (!sceneDraftChanged(existing, merged)) {
    return { package: pkg, action: 'unchanged' };
  }
  const scenes = [...pkg.bible.scenes];
  scenes[idx] = merged;
  return {
    package: touchScreenplayPackage(pkg, { bible: { ...pkg.bible, scenes } }),
    action: mode === 'overwrite' ? 'overwritten' : 'filled',
  };
}

/** Hook-01：把钩子库条目文案推入 brief.hooks（去重） */
export function pushHookTextToBrief(
  pkg: ScreenplayPackage,
  text: string,
): { package: ScreenplayPackage; action: BiblePushAction } {
  const line = text.trim();
  if (!line) return { package: pkg, action: 'unchanged' };
  const hooks = [...(pkg.brief.hooks ?? [])];
  if (hooks.some((h) => h.trim() === line)) {
    return { package: pkg, action: 'unchanged' };
  }
  return {
    package: touchScreenplayPackage(pkg, {
      brief: { ...pkg.brief, hooks: [...hooks, line] },
    }),
    action: 'created',
  };
}

/** Hook-01：从 brief.hooks 导入为钩子库建议标签 */
export function hookLabelsFromBrief(pkg: ScreenplayPackage): string[] {
  return (pkg.brief.hooks ?? []).map((h) => h.trim()).filter(Boolean);
}

function normName(value: string): string {
  return value.trim().toLowerCase();
}

/** 按 libraryCharacterId / 姓名 / 别名匹配库内角色（改名同步用） */
export function findLibraryCharacterForRename(
  characters: CharacterProfile[],
  opts: { oldName: string; libraryCharacterId?: string },
): CharacterProfile | undefined {
  const id = opts.libraryCharacterId?.trim();
  if (id) {
    const byId = characters.find((c) => !c.deletedAt && c.id === id);
    if (byId) return byId;
  }
  const key = normName(opts.oldName);
  if (!key) return undefined;
  return characters.find((c) => {
    if (c.deletedAt) return false;
    if (normName(c.name) === key) return true;
    return (c.creative?.aliases ?? []).some((alias) => normName(alias) === key);
  });
}

export function libraryCharacterRenameConflict(
  characters: CharacterProfile[],
  profileId: string,
  newName: string,
): CharacterProfile | undefined {
  const key = normName(newName);
  if (!key) return undefined;
  return characters.find((c) => !c.deletedAt && c.id !== profileId && normName(c.name) === key);
}

/** 改库侧档案名，旧名写入 aliases，供失效重绑与 Mention 兜底 */
export function renameLibraryCharacterProfile(
  profile: CharacterProfile,
  oldName: string,
  newName: string,
): CharacterProfile {
  const nextName = newName.trim();
  const prevName = oldName.trim();
  const aliases = [...(profile.creative?.aliases ?? [])];
  if (
    prevName
    && normName(prevName) !== normName(nextName)
    && !aliases.some((alias) => normName(alias) === normName(prevName))
  ) {
    aliases.push(prevName);
  }
  return {
    ...profile,
    name: nextName,
    creative: {
      ...profile.creative,
      aliases,
    },
  };
}


/** 3.2: 全局改名同步未应用 pendingPatch，避免 Apply 后旧名写回 */
export function renameCharacterInPendingPatch(
  patch: Partial<ScreenplayPackage> | Record<string, unknown> | undefined,
  oldName: string,
  newName: string,
): Partial<ScreenplayPackage> | Record<string, unknown> | undefined {
  if (!patch || typeof patch !== 'object') return patch;
  const old = oldName.trim();
  const nw = newName.trim();
  if (!old || !nw || old === nw) return patch;
  const escaped = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'g');
  const p = patch as Record<string, unknown>;
  const screenplay = p.screenplay as Record<string, unknown> | undefined;
  const episodes = Array.isArray(screenplay?.episodes)
    ? (screenplay.episodes as Array<Record<string, unknown>>).map((ep) => ({
        ...ep,
        bodyMd: String(ep.bodyMd ?? '').replace(re, nw),
        title: String(ep.title ?? '').replace(re, nw),
      }))
    : screenplay?.episodes;
  const bible = p.bible as Record<string, unknown> | undefined;
  const characters = Array.isArray(bible?.characters)
    ? (bible.characters as Array<Record<string, unknown>>).map((c) => ({
        ...c,
        name: String(c.name ?? '').replace(re, nw),
        identity: typeof c.identity === 'string' ? c.identity.replace(re, nw) : c.identity,
        personality: typeof c.personality === 'string' ? c.personality.replace(re, nw) : c.personality,
        appearance: typeof c.appearance === 'string' ? c.appearance.replace(re, nw) : c.appearance,
        relationships: typeof c.relationships === 'string' ? c.relationships.replace(re, nw) : c.relationships,
      }))
    : bible?.characters;
  const next: Record<string, unknown> = { ...p };
  if (screenplay) {
    next.screenplay = { ...screenplay, episodes };
  }
  if (bible) {
    next.bible = { ...bible, characters };
  }
  return JSON.stringify(next) === JSON.stringify(p) ? patch : next;
}

export function renameCharacterInPendingSession(
  session: ScriptDeskAgentSession,
  oldName: string,
  newName: string,
): ScriptDeskAgentSession | null {
  let changed = false;
  const messages = session.messages.map((m) => {
    if (!m.pendingPatch || m.applied || m.discarded) return m;
    const nextPatch = renameCharacterInPendingPatch(m.pendingPatch, oldName, newName);
    if (nextPatch === m.pendingPatch) return m;
    changed = true;
    return { ...m, pendingPatch: nextPatch };
  });
  if (!changed) return null;
  return { ...session, messages, updatedAt: new Date().toISOString() };
}
