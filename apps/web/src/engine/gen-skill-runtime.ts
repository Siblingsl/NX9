/**
 * Gen Skill 拼装包运行时缓存。
 * 生成前 ensureGenPacks()；改 Skill 库保存后 invalidateGenPacks()。
 */
import {
  BUILTIN_GEN_SKILL_IDS,
  type GenPromptPack,
  type StudioPromptPackOverrides,
} from '@nx9/shared';
import { api } from '../api/client';

let cache: Map<string, GenPromptPack> | null = null;
let inflight: Promise<Map<string, GenPromptPack>> | null = null;

export function invalidateGenPacks(): void {
  cache = null;
  inflight = null;
}

export async function ensureGenPacks(): Promise<Map<string, GenPromptPack>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const packs = await api.listGenPacks([...BUILTIN_GEN_SKILL_IDS]);
      const map = new Map<string, GenPromptPack>();
      for (const p of packs) map.set(p.skillId, p);
      cache = map;
      return map;
    } catch {
      const map = new Map<string, GenPromptPack>();
      for (const id of BUILTIN_GEN_SKILL_IDS) map.set(id, { skillId: id });
      cache = map;
      return map;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function getGenPackSync(skillId: string): GenPromptPack | null {
  return cache?.get(skillId) ?? null;
}

export async function getGenPack(skillId: string): Promise<GenPromptPack | null> {
  const map = await ensureGenPacks();
  return map.get(skillId) ?? null;
}

export async function getStudioPackOverrides(): Promise<StudioPromptPackOverrides> {
  const map = await ensureGenPacks();
  return {
    image: map.get('gen-studio-image') ?? null,
    video: map.get('gen-studio-video') ?? null,
    sketch: map.get('gen-studio-sketch') ?? null,
  };
}
