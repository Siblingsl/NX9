/**
 * asset-readiness.ts — 设定就绪 / 分镜预检（F-005）。
 *
 * 从 asset-gate-runner.ts 重命名/整理，保留纯函数，UI 迁入编剧台与分镜台。
 * 删除 asset-gate 节点；能力拆并：
 * - 编剧「设定就绪」+ 分镜预检 + 导演锁参考硬拦
 * - 资产库 = 唯一设定编辑面
 */
import type { ScreenplayPackage, AssetLibraryItem, ScriptBreakdownPayload, EnvironmentProfile } from '@nx9/shared';
import { useWorkspaceDocument } from '../stores/workspace-document';
import {
  environmentsFromBreakdown,
  profilesFromBreakdown,
  applyScriptBreakdownPayload,
} from './script-breakdown-runner';
import { sceneCandidateToWorkspaceItem } from './script-asset-candidates';

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
  syncedCharacters?: number;
  syncedScenes?: number;
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

/** F-051: 从 Bible 中提取服装名 */
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

/** 设定检查：读编剧台 Bible draft（默认不自动入库） */
export function inspectBibleAssets(pkg: ScreenplayPackage): AssetReadinessState {
  const existingCharacters = libraryCharacterNameSet();
  const existingScenes = librarySceneNameSet();
  const requiredCharacters = uniq(pkg.bible.characters.map((item) => item.name));
  const requiredScenes = uniq(pkg.bible.scenes.map((item) => item.name || item.location || item.code || ''));
  const missingCharacters = requiredCharacters.filter((name) => !existingCharacters.has(name));
  const missingScenes = requiredScenes.filter((name) => !existingScenes.has(name));
  // F-051: 检查服装/道具
  const requiredCostumes = extractCostumeNames(pkg);
  const requiredProps = extractPropNames(pkg);
  // 服装/道具预检（从库中已有的角色名粗略匹配）
  const missingCostumes = requiredCostumes.filter(
    (c) => !existingCharacters.has(c) && !libraryCharacterNameSet().has(c),
  );
  const missingProps = requiredProps;
  return {
    ready: missingCharacters.length === 0 && missingScenes.length === 0,
    checkedAt: new Date().toISOString(),
    source: 'bible',
    requiredCharacters,
    requiredScenes,
    missingCharacters,
    missingScenes,
    missingCostumes,
    missingProps,
    syncedCharacters: 0,
    syncedScenes: 0,
  };
}

/** 同步圣经角色/场景到库（upsert） */
export function syncBibleAssets(pkg: ScreenplayPackage): AssetReadinessState {
  const doc = useWorkspaceDocument.getState();
  const existingChars = new Set(doc.characters.characters.flatMap(characterKeys));
  const existingScenes = librarySceneNameSet();
  const requiredCharacters = uniq(pkg.bible.characters.map((item) => item.name));
  const requiredScenes = uniq(pkg.bible.scenes.map((item) => item.name || item.location || item.code || ''));
  let syncedChars = 0;
  let syncedScenes = 0;
  for (const char of pkg.bible.characters) {
    if (!existingChars.has(char.name.trim())) {
      doc.upsertCharacter({
        id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: char.name,
        bible: {
          appearance: char.appearance,
          personality: char.personality,
          voice: char.voiceNotes,
        },
        consistencyPrompt: '',
        creative: undefined,
      });
      syncedChars++;
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
      syncedScenes++;
    }
  }
  return {
    ready: true,
    checkedAt: new Date().toISOString(),
    source: 'bible',
    requiredCharacters,
    requiredScenes,
    missingCharacters: [],
    missingScenes: [],
    syncedCharacters: syncedChars,
    syncedScenes,
  };
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
      if (source.type === 'script-desk' || source.type === 'script') return found;
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
