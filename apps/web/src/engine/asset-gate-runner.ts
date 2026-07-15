import type { ScriptBreakdownPayload } from '@nx9/shared';
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

export function inspectBreakdownAssets(payload: ScriptBreakdownPayload): AssetGateReport {
  const doc = useWorkspaceDocument.getState();
  const existingCharacters = new Set(doc.characters.characters.flatMap(characterKeys));
  const existingScenes = new Set([
    ...(doc.environments?.environments ?? []).flatMap((item) => [item.name.trim(), item.sceneCode ?? '']),
    ...doc.backlotWorkspace.items.filter((item) => item.kind === 'scene').map((item) => item.label.trim()),
  ].filter(Boolean));
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
  };
}
