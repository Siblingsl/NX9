import type { CharacterProfile } from '../types/character';
import type { CharacterCreativeExtension, CreativeVariantEntry } from '../types/creative-asset-center';
import {
  CHARACTER_SHEET_PANEL_LAYOUT,
  type CharacterSheetPanelLayout,
} from './character-sheet-master';
import { getCharacterCreative } from './creative-asset-prompts';

export interface ApplyCroppedPanelsOptions {
  /** panelId -> image url */
  panelUrls: Record<string, string>;
  /** 若某字段已有图是否覆盖，默认 true */
  overwrite?: boolean;
  /** 完整设定板 URL，写入 fullSheetUrl */
  fullSheetUrl?: string;
}

function upsertVariant(
  list: CreativeVariantEntry[] | undefined,
  id: string,
  label: string,
  imageUrl: string,
  overwrite: boolean,
): CreativeVariantEntry[] {
  const base = [...(list ?? [])];
  const idx = base.findIndex((v) => v.id === id);
  if (idx >= 0) {
    if (!overwrite && base[idx].imageUrl) return base;
    base[idx] = { ...base[idx], label, imageUrl };
    return base;
  }
  return [...base, { id, label, imageUrl }];
}

/** 把裁切后的面板图写回角色 creative 扩展字段 / variants（纯数据，可在 server/web 共用） */
export function applyCroppedPanelsToCharacter(
  character: CharacterProfile,
  opts: ApplyCroppedPanelsOptions,
): CharacterProfile {
  const overwrite = opts.overwrite ?? true;
  const ext = getCharacterCreative(character);
  let next: CharacterCreativeExtension = { ...ext };

  if (opts.fullSheetUrl) {
    next.fullSheetUrl = opts.fullSheetUrl;
  }

  for (const panel of CHARACTER_SHEET_PANEL_LAYOUT) {
    const url = opts.panelUrls[panel.id];
    if (!url) continue;
    if (panel.fill.kind === 'field') {
      const key = panel.fill.field as keyof CharacterCreativeExtension;
      const current = next[key];
      if (!overwrite && typeof current === 'string' && current.trim()) continue;
      (next as Record<string, unknown>)[panel.fill.field] = url;
    } else {
      const { group, id, label } = panel.fill;
      if (group === 'expressions') {
        next.expressions = upsertVariant(next.expressions, id, label, url, overwrite);
      } else if (group === 'poses') {
        next.poses = upsertVariant(next.poses, id, label, url, overwrite);
      } else if (group === 'angles') {
        next.angles = upsertVariant(next.angles, id, label, url, overwrite);
      } else if (group === 'microExpressions') {
        next.microExpressions = upsertVariant(next.microExpressions, id, label, url, overwrite);
      } else if (group === 'costumeDetails') {
        next.costumeDetails = upsertVariant(next.costumeDetails, id, label, url, overwrite);
      } else if (group === 'handRefs') {
        next.handRefs = upsertVariant(next.handRefs, id, label, url, overwrite);
      }
    }
  }

  const referenceImageUrl =
    next.fullSheetUrl
    || next.frontViewUrl
    || character.referenceImageUrl
    || null;

  return {
    ...character,
    referenceImageUrl,
    creative: next,
  };
}

export function listCharacterSheetPanels(): CharacterSheetPanelLayout[] {
  return CHARACTER_SHEET_PANEL_LAYOUT;
}
