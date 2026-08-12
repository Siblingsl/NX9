/**
 * P0：失效引用库内一键重绑 + 删除前引用计数。
 * 同步写回 storyboard-desk 的 chainStoryboard 与 scriptBreakdown。
 */
import type {
  CharacterProfile,
  ScriptBreakdownPayload,
  ScriptBreakdownShot,
  StoryboardShot,
} from '@nx9/shared';
import {
  buildChainStoryboardPayload,
  patchChainShot,
  readChainStoryboard,
} from '@nx9/shared';
import type { AssetHealthAnalysis } from './asset-library-health';

export type RebindKind = 'character' | 'scene';

export interface RebindRequest {
  kind: RebindKind;
  /** 失效的旧名（镜表上的字符串） */
  oldName: string;
  /** 目标库条目 */
  newId: string;
  newName: string;
  /** 仅修这一镜；省略则修所有含 oldName 的镜 */
  shotId?: string;
}

export interface IdRebindRequest {
  kind: 'costume' | 'prop' | 'shot' | 'style';
  oldId: string;
  newId: string;
  newLabel: string;
  /** 限制到某一镜；省略则全局替换该 oldId */
  shotId?: string;
  /** 角色绑定：仅修该角色 */
  ownerId?: string;
}

export interface FlowNodeLike {
  id: string;
  type?: string | null;
  data?: Record<string, unknown>;
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function stripMention(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^@(?:角色|场景):(.+)$/);
  return (m?.[1] ?? t).trim();
}

function patchBreakdownShotCharacters(
  shot: ScriptBreakdownShot,
  oldName: string,
  newName: string,
): ScriptBreakdownShot {
  const old = norm(oldName);
  const characters = (shot.characters ?? []).map((c) =>
    norm(stripMention(c)) === old ? newName : c,
  );
  const costumeOverrides = (shot.costumeOverrides ?? []).map((o) =>
    norm(o.characterName) === old ? { ...o, characterName: newName } : o,
  );
  return { ...shot, characters, costumeOverrides };
}

function patchBreakdownShotScene(
  shot: ScriptBreakdownShot,
  oldName: string,
  newName: string,
): ScriptBreakdownShot {
  if (norm(stripMention(shot.scene)) !== norm(oldName)) return shot;
  return { ...shot, scene: newName };
}

function patchChainCharacter(
  shot: StoryboardShot,
  oldName: string,
  newId: string,
  newName: string,
): Partial<StoryboardShot> | null {
  const old = norm(oldName);
  const names = shot.characterNames ?? [];
  if (!names.some((n) => norm(n) === old)) return null;
  const characterNames = names.map((n) => (norm(n) === old ? newName : n));
  const prevIds = shot.characterIds ?? [];
  // 按名位对齐 id：能对应则替换，否则按新 names 长度截断后补 newId
  const characterIds = characterNames.map((name, idx) => {
    if (norm(name) === norm(newName)) return newId;
    return prevIds[idx] ?? prevIds.find(Boolean) ?? '';
  }).filter(Boolean);
  // 去重保序
  const seen = new Set<string>();
  const uniqueIds: string[] = [];
  for (const id of characterIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    uniqueIds.push(id);
  }
  const costumeOverrides = (shot.costumeOverrides ?? []).map((o) =>
    norm(o.characterName) === old ? { ...o, characterName: newName } : o,
  );
  return { characterNames, characterIds: uniqueIds, costumeOverrides };
}

function patchChainScene(
  shot: StoryboardShot,
  oldName: string,
  newId: string,
  newName: string,
): Partial<StoryboardShot> | null {
  if (norm(shot.sceneName) !== norm(oldName)) return null;
  return { sceneName: newName, sceneAssetId: newId };
}

/** 在所有 storyboard-desk 上执行重绑，返回修复镜次数（跨 desk 去重按 shotId） */
export function rebindInvalidShotRefs(
  nodes: FlowNodeLike[],
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  req: RebindRequest,
): number {
  const patchedShotIds = new Set<string>();
  const old = norm(req.oldName);
  if (!old || !req.newId.trim() || !req.newName.trim()) return 0;

  for (const node of nodes) {
    if (node.type !== 'storyboard-desk') continue;
    const data = node.data ?? {};
    const chain = readChainStoryboard(data);
    const breakdown = data.scriptBreakdown as ScriptBreakdownPayload | undefined;
    let chainChanged = false;
    let nextChain = chain;
    let nextBreakdown = breakdown;

    if (chain) {
      let shots = chain.shots;
      for (const shot of chain.shots) {
        if (req.shotId && shot.id !== req.shotId) continue;
        const patch =
          req.kind === 'character'
            ? patchChainCharacter(shot, req.oldName, req.newId, req.newName)
            : patchChainScene(shot, req.oldName, req.newId, req.newName);
        if (!patch) continue;
        shots = patchChainShot({ ...chain, shots }, shot.id, patch);
        patchedShotIds.add(shot.id);
        chainChanged = true;
      }
      if (chainChanged) {
        nextChain = buildChainStoryboardPayload(chain, { shots });
      }
    }

    if (breakdown) {
      let bdChanged = false;
      const episodes = breakdown.episodes.map((ep) => ({
        ...ep,
        shots: ep.shots.map((shot) => {
          if (req.shotId && shot.id !== req.shotId) return shot;
          if (req.kind === 'character') {
            if (!(shot.characters ?? []).some((c) => norm(stripMention(c)) === old)) return shot;
            bdChanged = true;
            patchedShotIds.add(shot.id);
            return patchBreakdownShotCharacters(shot, req.oldName, req.newName);
          }
          if (norm(stripMention(shot.scene)) !== old) return shot;
          bdChanged = true;
          patchedShotIds.add(shot.id);
          return patchBreakdownShotScene(shot, req.oldName, req.newName);
        }),
        scenes: ep.scenes?.map((scene) => ({
          ...scene,
          shots: scene.shots.map((shot) => {
            if (req.shotId && shot.id !== req.shotId) return shot;
            if (req.kind === 'character') {
              if (!(shot.characters ?? []).some((c) => norm(stripMention(c)) === old)) return shot;
              bdChanged = true;
              patchedShotIds.add(shot.id);
              return patchBreakdownShotCharacters(shot, req.oldName, req.newName);
            }
            if (norm(stripMention(shot.scene)) !== old) return shot;
            bdChanged = true;
            patchedShotIds.add(shot.id);
            return patchBreakdownShotScene(shot, req.oldName, req.newName);
          }),
        })),
      }));
      if (bdChanged) {
        nextBreakdown = { ...breakdown, episodes };
      }
    }

    if (!chainChanged && nextBreakdown === breakdown) continue;
    updateNodeData(node.id, {
      ...(nextChain ? { chainStoryboard: nextChain } : {}),
      ...(nextBreakdown ? { scriptBreakdown: nextBreakdown } : {}),
    });
  }

  return patchedShotIds.size;
}

export interface AssetUsageSummary {
  shotCount: number;
  characterBindCount: number;
  labels: string[];
}

/** 删除前：统计素材被镜表/角色绑定引用次数 */
export function summarizeAssetUsageForDelete(
  analysis: AssetHealthAnalysis,
  opts: {
    kind: string;
    id: string;
    label: string;
    characters?: CharacterProfile[];
  },
): AssetUsageSummary {
  const key = norm(opts.label);
  const labels: string[] = [];
  let shotCount = 0;
  let characterBindCount = 0;

  if (opts.kind === 'character') {
    const refs = analysis.characterUsage.get(key) ?? [];
    shotCount = refs.length;
    if (shotCount) labels.push(`${shotCount} 个分镜引用`);
  } else if (opts.kind === 'scene') {
    const refs = analysis.sceneUsage.get(key) ?? [];
    shotCount = refs.length;
    if (shotCount) labels.push(`${shotCount} 个分镜引用`);
  } else if (opts.kind === 'costume') {
    const bound = analysis.costumeBoundCharacters.get(opts.id) ?? [];
    characterBindCount = bound.length;
    if (characterBindCount) labels.push(`被 ${characterBindCount} 个角色绑定：${bound.slice(0, 5).join('、')}`);
    const shotOverrides = analysis.invalidCostumeRefs.filter(
      (r) => r.context === 'shot-override' && r.oldId === opts.id,
    ).length;
    // 有效覆盖也算引用：从 characterUsage 不够，用 relation 粗估
    if (shotOverrides) labels.push(`${shotOverrides} 处镜级换装失效待修`);
  } else if (opts.kind === 'prop') {
    const propHits = analysis.invalidPropRefs.filter((r) => r.oldId === opts.id).length;
    if (propHits) labels.push(`${propHits} 处道具引用失效待修`);
  }

  return { shotCount, characterBindCount, labels };
}

/**
 * OL-05：按 id 重绑服装 / 道具（镜级覆盖、角色默认服装、场景/镜表 propIds）。
 * 角色侧服装绑定通过 onPatchCharacter 回写。
 */
export function rebindInvalidIdRefs(
  nodes: FlowNodeLike[],
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  req: IdRebindRequest,
  onPatchCharacter?: (characterId: string, patch: Partial<CharacterProfile>) => void,
  characters?: CharacterProfile[],
): number {
  const oldId = req.oldId.trim();
  const newId = req.newId.trim();
  if (!oldId || !newId) return 0;
  let patched = 0;

  if (req.kind === 'costume' && onPatchCharacter && characters) {
    for (const c of characters) {
      if (req.ownerId && c.id !== req.ownerId) continue;
      if (c.creative?.costumeId?.trim() !== oldId) continue;
      onPatchCharacter(c.id, {
        ...c,
        creative: {
          ...c.creative,
          costumeId: newId,
          costumeLabel: req.newLabel,
        },
      });
      patched += 1;
    }
  }

  for (const node of nodes) {
    if (node.type !== 'storyboard-desk') continue;
    const data = node.data ?? {};
    const chain = readChainStoryboard(data);
    const breakdown = data.scriptBreakdown as ScriptBreakdownPayload | undefined;
    let chainChanged = false;
    let nextChain = chain;
    let nextBreakdown = breakdown;
    let previewChanged = false;
    let nextPreview = data.storyboardPreview as
      | { frames?: Array<{ id: string; sourceShotId?: string; styleAssetId?: string | null; stylePreset?: string | null }> }
      | undefined;

    if (chain && (req.kind === 'costume' || req.kind === 'prop' || req.kind === 'shot')) {
      let shots = chain.shots;
      for (const shot of chain.shots) {
        if (req.shotId && shot.id !== req.shotId) continue;
        if (req.kind === 'costume') {
          const overrides = shot.costumeOverrides ?? [];
          if (!overrides.some((o) => o.costumeId === oldId)) continue;
          const costumeOverrides = overrides.map((o) =>
            o.costumeId === oldId
              ? { ...o, costumeId: newId, costumeLabel: req.newLabel }
              : o,
          );
          shots = patchChainShot({ ...chain, shots }, shot.id, { costumeOverrides });
          patched += 1;
          chainChanged = true;
        } else if (req.kind === 'prop') {
          const propIds = shot.propIds ?? [];
          if (!propIds.includes(oldId)) continue;
          shots = patchChainShot(
            { ...chain, shots },
            shot.id,
            { propIds: propIds.map((id) => (id === oldId ? newId : id)) },
          );
          patched += 1;
          chainChanged = true;
        } else if (req.kind === 'shot') {
          if ((shot.shotAssetId ?? '').trim() !== oldId) continue;
          shots = patchChainShot({ ...chain, shots }, shot.id, { shotAssetId: newId });
          patched += 1;
          chainChanged = true;
        }
      }
      if (chainChanged) {
        nextChain = buildChainStoryboardPayload(chain, { shots });
      }
    }

    if (breakdown && req.kind === 'costume') {
      let bdChanged = false;
      const mapShot = (shot: ScriptBreakdownShot): ScriptBreakdownShot => {
        if (req.shotId && shot.id !== req.shotId) return shot;
        const overrides = shot.costumeOverrides ?? [];
        if (!overrides.some((o) => o.costumeId === oldId)) return shot;
        bdChanged = true;
        patched += 1;
        return {
          ...shot,
          costumeOverrides: overrides.map((o) =>
            o.costumeId === oldId
              ? { ...o, costumeId: newId, costumeLabel: req.newLabel }
              : o,
          ),
        };
      };
      const episodes = breakdown.episodes.map((ep) => ({
        ...ep,
        shots: ep.shots.map(mapShot),
        scenes: ep.scenes?.map((scene) => ({
          ...scene,
          shots: scene.shots.map(mapShot),
        })),
      }));
      if (bdChanged) nextBreakdown = { ...breakdown, episodes };
    }

    if (breakdown && req.kind === 'shot') {
      let bdChanged = false;
      const mapShot = (shot: ScriptBreakdownShot): ScriptBreakdownShot => {
        if (req.shotId && shot.id !== req.shotId) return shot;
        if ((shot.shotAssetId ?? '').trim() !== oldId) return shot;
        bdChanged = true;
        patched += 1;
        return { ...shot, shotAssetId: newId };
      };
      const episodes = breakdown.episodes.map((ep) => ({
        ...ep,
        shots: ep.shots.map(mapShot),
        scenes: ep.scenes?.map((scene) => ({
          ...scene,
          shots: scene.shots.map(mapShot),
        })),
      }));
      if (bdChanged) nextBreakdown = { ...breakdown, episodes };
    }

    if (req.kind === 'style' && nextPreview?.frames?.length) {
      const frames = nextPreview.frames.map((f) => {
        if (req.shotId && f.id !== req.shotId && f.sourceShotId !== req.shotId) return f;
        if ((f.styleAssetId ?? '').trim() !== oldId) return f;
        patched += 1;
        previewChanged = true;
        return { ...f, styleAssetId: newId, stylePreset: req.newLabel };
      });
      if (previewChanged) nextPreview = { ...nextPreview, frames };
    }

    if (!chainChanged && nextBreakdown === breakdown && !previewChanged) continue;
    updateNodeData(node.id, {
      ...(nextChain ? { chainStoryboard: nextChain } : {}),
      ...(nextBreakdown ? { scriptBreakdown: nextBreakdown } : {}),
      ...(previewChanged && nextPreview ? { storyboardPreview: nextPreview } : {}),
    });
  }

  // 场景 propIds：挂在 workspace，由调用方处理；此处仅镜表
  return patched;
}

/**
 * OL-20：软删前断开引用（角色名从镜表移除 / 清 costumeId / 清 propIds / 清 scene 绑定）。
 * 返回断开处次数。
 */
export function disconnectAssetRefsOnDelete(
  nodes: FlowNodeLike[],
  updateNodeData: (id: string, data: Record<string, unknown>) => void,
  opts: {
    kind: string;
    id: string;
    label: string;
  },
  onPatchCharacter?: (characterId: string, patch: Partial<CharacterProfile>) => void,
  characters?: CharacterProfile[],
): number {
  let n = 0;
  const key = norm(opts.label);

  if (opts.kind === 'costume' && onPatchCharacter && characters) {
    for (const c of characters) {
      if (c.creative?.costumeId?.trim() !== opts.id) continue;
      onPatchCharacter(c.id, {
        ...c,
        creative: {
          ...c.creative,
          costumeId: undefined,
          costumeLabel: undefined,
          costumePrompt: undefined,
        },
      });
      n += 1;
    }
  }

  for (const node of nodes) {
    if (node.type !== 'storyboard-desk') continue;
    const data = node.data ?? {};
    const chain = readChainStoryboard(data);
    if (!chain) continue;
    let shots = chain.shots;
    let changed = false;

    for (const shot of chain.shots) {
      let patch: Partial<StoryboardShot> | null = null;
      if (opts.kind === 'character') {
        const names = shot.characterNames ?? [];
        if (!names.some((nm) => norm(nm) === key)) continue;
        const characterNames = names.filter((nm) => norm(nm) !== key);
        const characterIds = (shot.characterIds ?? []).filter((id) => id !== opts.id);
        const pins = { ...(shot.characterRevisionPins ?? {}) };
        delete pins[opts.id];
        patch = {
          characterNames,
          characterIds,
          characterRevisionPins: pins,
          costumeOverrides: (shot.costumeOverrides ?? []).filter(
            (o) => norm(o.characterName) !== key && o.characterId !== opts.id,
          ),
        };
      } else if (opts.kind === 'scene') {
        if (norm(shot.sceneName) !== key && shot.sceneAssetId !== opts.id) continue;
        patch = { sceneName: null, sceneAssetId: null };
      } else if (opts.kind === 'costume') {
        const overrides = shot.costumeOverrides ?? [];
        if (!overrides.some((o) => o.costumeId === opts.id)) continue;
        patch = {
          costumeOverrides: overrides.filter((o) => o.costumeId !== opts.id),
        };
      } else if (opts.kind === 'prop') {
        const propIds = shot.propIds ?? [];
        if (!propIds.includes(opts.id)) continue;
        patch = { propIds: propIds.filter((id) => id !== opts.id) };
      }
      if (!patch) continue;
      shots = patchChainShot({ ...chain, shots }, shot.id, patch);
      changed = true;
      n += 1;
    }

    if (changed) {
      updateNodeData(node.id, {
        chainStoryboard: buildChainStoryboardPayload(chain, { shots }),
      });
    }
  }

  return n;
}
