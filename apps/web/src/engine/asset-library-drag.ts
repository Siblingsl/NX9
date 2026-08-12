/**
 * OL-16：素材库卡片 → 分镜 / @Mention 的薄拖拽协议。
 */
import type { AssetLibraryKind, AssetScope, ScriptBreakdownShot } from '@nx9/shared';
import { formatAssetMention } from '@nx9/shared';

export const NX9_ASSET_DRAG_MIME = 'application/x-nx9-asset';

export interface Nx9AssetDragPayload {
  id: string;
  kind: AssetLibraryKind;
  scope: AssetScope;
  label: string;
}

export function setNx9AssetDragData(
  dt: DataTransfer,
  payload: Nx9AssetDragPayload,
): void {
  const json = JSON.stringify(payload);
  dt.setData(NX9_ASSET_DRAG_MIME, json);
  dt.setData('text/plain', formatAssetMention(payload.kind, payload.label));
  dt.effectAllowed = 'copy';
}

export function readNx9AssetDragData(dt: DataTransfer): Nx9AssetDragPayload | null {
  const raw = dt.getData(NX9_ASSET_DRAG_MIME)?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Nx9AssetDragPayload>;
    if (!parsed?.id || !parsed.kind || !parsed.label) return null;
    return {
      id: String(parsed.id),
      kind: parsed.kind as AssetLibraryKind,
      scope: (parsed.scope as AssetScope) || 'private',
      label: String(parsed.label),
    };
  } catch {
    return null;
  }
}

export function hasNx9AssetDrag(dt: DataTransfer): boolean {
  return Array.from(dt.types).includes(NX9_ASSET_DRAG_MIME);
}

export interface ApplyAssetDragResult {
  shot: ScriptBreakdownShot;
  message: string;
}

/** 把库卡拖到镜格：按 kind 写入镜表字段（薄绑定） */
export function applyAssetDragToShot(
  shot: ScriptBreakdownShot,
  asset: Nx9AssetDragPayload,
): ApplyAssetDragResult | null {
  const label = asset.label.trim();
  if (!label) return null;

  if (asset.kind === 'character') {
    const names = shot.characters ?? [];
    if (names.some((n) => n.trim().toLowerCase() === label.toLowerCase())) {
      return null;
    }
    return {
      shot: { ...shot, characters: [...names, label] },
      message: `已绑定角色「${label}」`,
    };
  }

  if (asset.kind === 'scene') {
    if ((shot.scene ?? '').trim() === label) return null;
    return {
      shot: { ...shot, scene: label },
      message: `已绑定场景「${label}」`,
    };
  }

  if (asset.kind === 'prop') {
    const ids = shot.propIds ?? [];
    if (ids.includes(asset.id)) return null;
    return {
      shot: { ...shot, propIds: [...ids, asset.id] },
      message: `已绑定道具「${label}」`,
    };
  }

  if (asset.kind === 'costume') {
    const chars = shot.characters ?? [];
    if (chars.length === 0) return null;
    const characterName = chars[0];
    const rest = (shot.costumeOverrides ?? []).filter(
      (o) => o.characterName.trim().toLowerCase() !== characterName.trim().toLowerCase(),
    );
    return {
      shot: {
        ...shot,
        costumeOverrides: [
          ...rest,
          { characterName, costumeId: asset.id, costumeLabel: label },
        ],
      },
      message: `已为「${characterName}」绑定换装「${label}」`,
    };
  }

  if (asset.kind === 'shot') {
    if (shot.shotAssetId === asset.id) return null;
    return {
      shot: { ...shot, shotAssetId: asset.id },
      message: `已绑定镜头词典「${label}」`,
    };
  }

  return null;
}
