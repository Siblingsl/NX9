import type { ScreenplayPackage, ScriptBreakdownPayload, AssetLibraryItem } from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import {
  environmentsFromBreakdown,
  profilesFromBreakdown,
  applyScriptBreakdownPayload,
} from './script-breakdown-runner';
import { sceneCandidateToWorkspaceItem } from './script-asset-candidates';

export interface AssetGateReport {
  requiredCharacters: string[];
  requiredScenes: string[];
  missingCharacters: string[];
  missingScenes: string[];
  syncedCharacters: number;
  syncedScenes: number;
  passed: boolean;
  source?: 'bible' | 'breakdown';
}

function uniq(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function characterKeys(item: import('@nx9/shared').CharacterProfile): string[] {
  return [
    item.name,
    item.creative?.nickname,
    ...(item.creative?.aliases ?? []),
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function libraryCharacterNameSet(): Set<string> {
  const doc = useWorkspaceDocument.getState();
  return new Set(doc.characters.characters.flatMap(characterKeys));
}

function librarySceneNameSet(): Set<string> {
  const doc = useWorkspaceDocument.getState();
  return new Set([
    ...(doc.environments?.environments ?? []).flatMap((item) => [item.name.trim(), item.sceneCode ?? '']),
    ...doc.backlotWorkspace.items.filter((item) => item.kind === 'scene').map((item) => item.label.trim()),
  ].filter(Boolean));
}

/** 设定检查：读编剧台 Bible draft（默认不自动入库） */
export function inspectBibleAssets(pkg: ScreenplayPackage): AssetGateReport {
  const existingCharacters = libraryCharacterNameSet();
  const existingScenes = librarySceneNameSet();
  const requiredCharacters = uniq(pkg.bible.characters.map((item) => item.name));
  const requiredScenes = uniq(pkg.bible.scenes.map((item) => item.name || item.location || item.code || ''));
  const missingCharacters = requiredCharacters.filter((name) => !existingCharacters.has(name));
  const missingScenes = requiredScenes.filter((name) => !existingScenes.has(name));
  return {
    requiredCharacters,
    requiredScenes,
    missingCharacters,
    missingScenes,
    syncedCharacters: 0,
    syncedScenes: 0,
    passed: missingCharacters.length === 0 && missingScenes.length === 0,
    source: 'bible',
  };
}

/**
 * Bible 对照检查。
 * autoIngest 默认 false：仅报告缺口，不自动 upsert 库（与功能 3/5 一致）。
 */
export function syncBibleAssets(
  _blockId: string,
  pkg: ScreenplayPackage,
  opts?: { autoIngest?: boolean },
): AssetGateReport {
  const before = inspectBibleAssets(pkg);
  if (!opts?.autoIngest) {
    return {
      ...before,
      syncedCharacters: 0,
      syncedScenes: 0,
      // 检查完成即成功返回报告；是否放行看 passed
      passed: before.passed,
    };
  }
  // 显式同步时才写入库（门禁一键入库路径）
  const doc = useWorkspaceDocument.getState();
  let syncedCharacters = 0;
  let syncedScenes = 0;
  for (const draft of pkg.bible.characters) {
    if (!before.missingCharacters.includes(draft.name)) continue;
    doc.upsertCharacter({
      id: `char-gate-${draft.id}`,
      name: draft.name,
      descriptionZh: [draft.identity, draft.appearance, draft.personality].filter(Boolean).join('；'),
      bible: {
        identity: draft.identity,
        appearance: draft.appearance,
        personality: draft.personality,
        relationships: draft.relationships,
        voice: draft.voiceNotes,
      },
    });
    syncedCharacters += 1;
  }
  for (const draft of pkg.bible.scenes) {
    const name = draft.name || draft.location || '';
    if (!name || (!before.missingScenes.includes(name) && !(draft.code && before.missingScenes.includes(draft.code)))) {
      continue;
    }
    const envId = `env-gate-${draft.id}`;
    const existingEnvs = doc.environments?.environments ?? [];
    const env: import('@nx9/shared').EnvironmentProfile = {
      id: envId,
      name,
      sceneCode: draft.code,
      descriptionZh: draft.summary ?? '',
    };
    doc.setEnvironments({
      version: 1,
      environments: [...existingEnvs.filter((e) => e.name !== name), env],
    });
    const existing = doc.backlotWorkspace.items.find(
      (item) => item.kind === 'scene' && (item.id === `scene-${envId}` || item.label === name),
    );
    doc.upsertBacklotWorkspace(sceneCandidateToWorkspaceItem(env, existing));
    syncedScenes += 1;
  }
  const after = inspectBibleAssets(pkg);
  return {
    ...after,
    missingCharacters: before.missingCharacters,
    missingScenes: before.missingScenes,
    syncedCharacters,
    syncedScenes,
    passed: true,
    source: 'bible',
  };
}

/** AG-P1-01 健康度：检查已有库条目的参考图 / 锁定提示词 */
export function checkAssetHealth(pkg: ScreenplayPackage): {
  characterNames: string[];
  unhealthyCharacterNames: string[];
  sceneNames: string[];
  unhealthySceneNames: string[];
} {
  const doc = useWorkspaceDocument.getState();
  const chars = doc.characters.characters;
  const charNameSet = new Set(chars.map((c) => c.name.trim()));
  const unhealthyChars = chars
    .filter((c) => !c.descriptionZh?.trim() && !c.consistencyPrompt?.trim() && !c.referenceImageUrl?.trim())
    .map((c) => c.name);
  const envs = doc.environments?.environments ?? [];
  const unhealthyScenes = [
    ...envs.filter((e) => !e.descriptionZh.trim() && !e.consistencyPrompt?.trim()).map((e) => e.name),
    ...doc.backlotWorkspace.items
      .filter((i) => i.kind === 'scene')
      .filter((i) => !i.label.trim())
      .map((i) => i.label),
  ];
  const bibleCharNames = new Set(pkg.bible.characters.map((c) => c.name.trim()));
  const bibleSceneNames = new Set(pkg.bible.scenes.map((s) => s.name.trim()));
  return {
    characterNames: pkg.bible.characters.map((c) => c.name),
    unhealthyCharacterNames: unhealthyChars.filter((n) => bibleCharNames.has(n)),
    sceneNames: pkg.bible.scenes.map((s) => s.name),
    unhealthySceneNames: unhealthyScenes.filter((n) => bibleSceneNames.has(n)),
  };
}

/** AG-P1-02 批量采用 Bible draft 字段到已有库条目 */
export function applyBibleDraftsToLibrary(pkg: ScreenplayPackage): { updatedCharacters: number; updatedScenes: number } {
  const doc = useWorkspaceDocument.getState();
  let updatedCharacters = 0;
  let updatedScenes = 0;
  for (const draft of pkg.bible.characters) {
    const existing = doc.characters.characters.find((c) => c.name === draft.name);
    if (!existing) continue;
    const patch: Partial<import('@nx9/shared').CharacterProfile> = {};
    if (!existing.descriptionZh?.trim() && draft.identity) patch.descriptionZh = draft.identity;
    if (!existing.bible?.identity?.trim() && draft.identity) patch.bible = { ...existing.bible, identity: draft.identity };
    if (!existing.bible?.appearance?.trim() && draft.appearance) patch.bible = { ...(patch.bible ?? existing.bible), appearance: draft.appearance };
    if (!existing.bible?.personality?.trim() && draft.personality) patch.bible = { ...(patch.bible ?? existing.bible), personality: draft.personality };
    if (!existing.bible?.relationships?.trim() && draft.relationships) patch.bible = { ...(patch.bible ?? existing.bible), relationships: draft.relationships };
    if (patch.descriptionZh || patch.bible) {
      doc.upsertCharacter({ ...existing, ...patch });
      updatedCharacters += 1;
    }
  }
  for (const draft of pkg.bible.scenes) {
    const name = draft.name || draft.location || '';
    const existingEnv = (doc.environments?.environments ?? []).find((e) => e.name === name);
    if (!existingEnv) continue;
    if (!existingEnv.descriptionZh.trim() && draft.summary?.trim()) {
      doc.setEnvironments({
        version: 1,
        environments: (doc.environments?.environments ?? []).map((e) =>
          e.id === existingEnv.id ? { ...e, descriptionZh: draft.summary! } : e,
        ),
      });
      updatedScenes += 1;
    }
  }
  return { updatedCharacters, updatedScenes };
}

/** AG-P1-03 检查上游设定检查是否已放行（接收 nodes/edges 参数） */
export function checkAssetGateInEdges(
  blockId: string,
  nodes: Array<{ id: string; data?: Record<string, unknown> }>,
  edges: Array<{ source: string; target: string }>,
): { passed: boolean; gateNodeId?: string } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    if (edge.target !== blockId && edge.source !== blockId) continue;
    const data = edge.target === blockId ? byId.get(edge.source)?.data : byId.get(edge.target)?.data;
    if (!data) continue;
    const gate = data.assetGate as { passed?: boolean } | undefined;
    if (gate?.passed) return { passed: true, gateNodeId: edge.source === blockId ? edge.target : edge.source };
  }
  return { passed: false };
}

export function inspectBreakdownAssets(payload: ScriptBreakdownPayload): AssetGateReport {
  const existingCharacters = libraryCharacterNameSet();
  const existingScenes = librarySceneNameSet();
  const requiredCharacters = uniq([
    ...(payload.characters ?? []).map((item) => item.name),
    ...payload.episodes.flatMap((episode) => episode.shots.flatMap((shot) => shot.characters)),
  ]);
  const requiredScenes = uniq([
    ...payload.episodes.flatMap((episode) => (episode.scenes ?? []).flatMap((scene) => [scene.location, scene.code])),
    ...payload.episodes.flatMap((episode) => episode.shots.map((shot) => shot.scene)),
  ]);
  const missingCharacters = requiredCharacters.filter((name) => !existingCharacters.has(name));
  const missingScenes = requiredScenes.filter((name) => !existingScenes.has(name));
  return {
    requiredCharacters,
    requiredScenes,
    missingCharacters,
    missingScenes,
    syncedCharacters: 0,
    syncedScenes: 0,
    passed: missingCharacters.length === 0 && missingScenes.length === 0,
    source: 'breakdown',
  };
}

export function syncBreakdownAssets(blockId: string, payload: ScriptBreakdownPayload): AssetGateReport {
  const before = inspectBreakdownAssets(payload);
  const doc = useWorkspaceDocument.getState();
  const newCharacters = profilesFromBreakdown(payload, doc.characters.characters)
    .filter((profile) => before.missingCharacters.includes(profile.name));
  const newScenes = environmentsFromBreakdown(payload, doc.environments?.environments ?? [])
    .filter((scene) => before.missingScenes.includes(scene.name) || (scene.sceneCode && before.missingScenes.includes(scene.sceneCode)));
  applyScriptBreakdownPayload(blockId, payload, { syncAssets: true });
  const state = useWorkspaceDocument.getState();
  for (const scene of newScenes) {
    const existing = state.backlotWorkspace.items.find(
      (item) => item.kind === 'scene' && (item.id === `scene-${scene.id}` || item.label === scene.name),
    );
    state.upsertBacklotWorkspace(sceneCandidateToWorkspaceItem(scene, existing));
  }
  return {
    ...inspectBreakdownAssets(payload),
    missingCharacters: before.missingCharacters,
    missingScenes: before.missingScenes,
    syncedCharacters: newCharacters.length,
    syncedScenes: newScenes.length,
    passed: true,
    source: 'breakdown',
  };
}
