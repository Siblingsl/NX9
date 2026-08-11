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
