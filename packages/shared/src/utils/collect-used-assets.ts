/**

 * P1 / OL：从 Prompt / 镜表绑定收集本镜消费的素材 id；

 * 可选写入 `id@revision` pin，供健康「未使用」与版本追溯。

 */

import type { AssetLibraryItem } from './asset-library';

import { parseAssetMentions } from './asset-library';



function norm(value: string | null | undefined): string {

  return (value ?? '').trim().toLowerCase();

}



/** `id` 或 `id@3` → 纯 id */

export function stripAssetPinRevision(token: string | null | undefined): string {

  const raw = (token ?? '').trim();

  if (!raw) return '';

  const at = raw.lastIndexOf('@');

  if (at <= 0) return raw;

  const rev = raw.slice(at + 1);

  if (!/^\d+$/.test(rev)) return raw;

  return raw.slice(0, at);

}



export function parseAssetPin(token: string | null | undefined): {

  id: string;

  revision?: number;

} {

  const raw = (token ?? '').trim();

  if (!raw) return { id: '' };

  const id = stripAssetPinRevision(raw);

  if (!id || id === raw) return { id: raw };

  const rev = Number(raw.slice(id.length + 1));

  return Number.isFinite(rev) && rev > 0 ? { id, revision: rev } : { id };

}



/** 写入账本：有 revision 时用 `id@rev`，否则纯 id */

export function formatAssetPin(id: string, revision?: number | null): string {

  const clean = id.trim();

  if (!clean) return '';

  const rev = typeof revision === 'number' && revision > 0 ? Math.floor(revision) : 0;

  return rev > 0 ? `${clean}@${rev}` : clean;

}



/** 健康匹配用：把 usedAssetIds（可能含 @rev）压成纯 id 集合 */

export function expandUsedAssetIdSet(tokens: Array<string | null | undefined> | undefined): Set<string> {

  const out = new Set<string>();

  for (const t of tokens ?? []) {

    const id = stripAssetPinRevision(t);

    if (id) out.add(id);

  }

  return out;

}



export function collectUsedAssetIds(input: {

  prompt?: string;

  characterIds?: string[];

  sceneAssetId?: string | null;

  costumeIds?: string[];

  propIds?: string[];

  shotAssetId?: string | null;

  styleAssetId?: string | null;

  libraryItems?: AssetLibraryItem[];

  /** characterId → revision；写入时打成 id@rev */

  characterRevisions?: Record<string, number | undefined | null>;

  /** 若 true，角色 id 一律带 revision（缺省按 1） */

  pinCharacterRevisions?: boolean;

}): string[] {

  const ids = new Set<string>();

  const pinChar = Boolean(input.pinCharacterRevisions || input.characterRevisions);



  const push = (id: string | null | undefined, revision?: number | null) => {

    const clean = (id ?? '').trim();

    if (!clean) return;

    ids.add(formatAssetPin(clean, revision));

  };



  for (const id of input.characterIds ?? []) {

    const rev = input.characterRevisions?.[id.trim()];

    push(id, pinChar ? (rev ?? 1) : rev);

  }

  if (input.sceneAssetId?.trim()) push(input.sceneAssetId);

  for (const id of input.costumeIds ?? []) push(id);

  for (const id of input.propIds ?? []) push(id);

  if (input.shotAssetId?.trim()) push(input.shotAssetId);

  if (input.styleAssetId?.trim()) push(input.styleAssetId);



  const items = input.libraryItems ?? [];

  if (input.prompt?.trim() && items.length) {

    const byKey = new Map<string, string>();

    for (const item of items) {

      byKey.set(`${item.kind}:${norm(item.label)}`, item.id);

    }

    for (const m of parseAssetMentions(input.prompt)) {

      const id = byKey.get(`${m.kind}:${norm(m.label)}`);

      if (!id) continue;

      if (m.kind === 'character' && pinChar) {

        const rev = input.characterRevisions?.[id] ?? 1;

        push(id, rev);

      } else {

        push(id);

      }

    }

  }

  return [...ids];

}



/** 从 usedAssetIds 抽出角色 pin：characterId → revision */

export function characterRevisionPinsFromUsed(

  usedAssetIds: string[] | undefined,

  characterIds?: string[],

): Record<string, number> {

  const out: Record<string, number> = {};

  for (const token of usedAssetIds ?? []) {

    const { id, revision } = parseAssetPin(token);

    if (!id || revision == null) continue;

    if (characterIds?.length && !characterIds.includes(id)) continue;

    out[id] = revision;

  }

  return out;

}


