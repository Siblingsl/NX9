import type { CharacterProfile } from '../types/character';
import type { BacklotWorkspaceItem } from '../data/backlot-templates';
import { getCostumeCreative, getPropCreative } from './creative-asset-prompts';
import { enrichPromptWithCharacters } from './character-prompt';

export interface ShotCostumeOverrideLike {
  characterName?: string;
  characterId?: string;
  costumeId: string;
  costumeLabel?: string;
}

export interface ShotAssetEnrichInput {
  characters?: string[];
  characterNames?: string[];
  costumeOverrides?: ShotCostumeOverrideLike[];
  propIds?: string[];
}

export interface CostumePromptSource {
  id: string;
  label: string;
  prompt: string;
}

export interface PropPromptSource {
  id: string;
  label: string;
  prompt: string;
}

export function costumeSourcesFromWorkspace(items: BacklotWorkspaceItem[]): CostumePromptSource[] {
  return items
    .filter((i) => i.kind === 'costume')
    .map((i) => {
      const ext = getCostumeCreative(i);
      return {
        id: i.id,
        label: i.label,
        prompt: i.promptEn?.trim() || ext.prompts?.image?.text?.trim() || ext.description?.trim() || i.label,
      };
    });
}

export function propSourcesFromWorkspace(items: BacklotWorkspaceItem[]): PropPromptSource[] {
  return items
    .filter((i) => i.kind === 'prop')
    .map((i) => {
      const ext = getPropCreative(i);
      return {
        id: i.id,
        label: i.label,
        prompt:
          i.promptEn?.trim()
          || ext.prompts?.image?.text?.trim()
          || ext.landmarks?.trim()
          || ext.description?.trim()
          || i.label,
      };
    });
}

/** Cos-06：把镜级换装叠到角色 creative，供 enrichPromptWithCharacters 使用 */
export function applyShotCostumeOverridesToCharacters(
  characters: CharacterProfile[],
  overrides: ShotCostumeOverrideLike[] | undefined,
  costumes: CostumePromptSource[],
): CharacterProfile[] {
  if (!overrides?.length || characters.length === 0) return characters;
  const byId = new Map(costumes.map((c) => [c.id, c]));
  const byName = new Map(
    overrides
      .filter((o) => o.characterName?.trim())
      .map((o) => [o.characterName!.trim().toLowerCase(), o]),
  );
  const byCharId = new Map(
    overrides
      .filter((o) => o.characterId?.trim())
      .map((o) => [o.characterId!.trim(), o]),
  );

  return characters.map((c) => {
    const hit = byName.get(c.name.trim().toLowerCase()) || byCharId.get(c.id);
    if (!hit) return c;
    const src = byId.get(hit.costumeId);
    const label = hit.costumeLabel || src?.label || hit.costumeId;
    const prompt = src?.prompt || label;
    return {
      ...c,
      creative: {
        ...c.creative,
        costumeId: hit.costumeId,
        costumeLabel: label,
        costumePrompt: prompt,
      },
    };
  });
}

export function buildShotPropPromptSuffix(
  propIds: string[] | undefined,
  props: PropPromptSource[],
): string {
  if (!propIds?.length) return '';
  const byId = new Map(props.map((p) => [p.id, p]));
  const parts = propIds
    .map((id) => byId.get(id))
    .filter((p): p is PropPromptSource => Boolean(p))
    .map((p) => `[Prop ${p.label}]: ${p.prompt}`);
  if (parts.length === 0) return '';
  return `Shot prop continuity (landmark lock):\n${parts.join('\n')}\nRules: keep prop silhouette, materials and signature details identical; no prop teleport.`;
}

/**
 * 镜级服装覆盖 + 本镜道具 → 追加到生成 Prompt。
 * 服装通过改写角色 costume 字段进入 character enrich；道具单独后缀。
 */
export function enrichPromptWithShotAssets(
  basePrompt: string,
  shot: ShotAssetEnrichInput,
  characters: CharacterProfile[],
  costumes: CostumePromptSource[],
  props: PropPromptSource[],
): string {
  const patched = applyShotCostumeOverridesToCharacters(characters, shot.costumeOverrides, costumes);
  let next = enrichPromptWithCharacters(basePrompt, patched);
  const propSuffix = buildShotPropPromptSuffix(shot.propIds, props);
  if (propSuffix) {
    next = next.trim() ? `${next.trim()}\n\n${propSuffix}` : propSuffix;
  }
  return next;
}
