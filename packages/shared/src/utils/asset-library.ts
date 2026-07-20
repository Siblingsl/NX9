import type { BacklotCustomTemplate, BacklotTemplateKind, BacklotWorkspaceItem } from '../data/backlot-templates';
import { backlotTemplatePrompt } from '../data/backlot-templates';
import type { CharacterProfile } from '../types/character';
import type { SoundAssetProfile } from '../types/sound-library';
import { resolveAssetPromptText } from './creative-asset-prompts';

export type AssetLibraryKind = BacklotTemplateKind | 'sound';
export type AssetScope = 'private' | 'public';

export interface AssetRef {
  id: string;
  kind: AssetLibraryKind;
  scope: AssetScope;
  label: string;
}

export interface AssetLibraryItem {
  id: string;
  kind: AssetLibraryKind;
  scope: AssetScope;
  label: string;
  prompt: string;
  description?: string;
  audioUrl?: string;
  imageUrl?: string;
  hookPhase?: 'opening' | 'ending';
  builtin?: boolean;
}

export const ASSET_LIBRARY_TABS: { key: AssetLibraryKind; label: string; hint: string }[] = [
  { key: 'character', label: '角色', hint: '人设与一致性参考' },
  { key: 'costume', label: '服装', hint: '造型套装、面料与标志物' },
  { key: 'scene', label: '场景', hint: '环境、光线、空间' },
  { key: 'shot', label: '镜头', hint: '运镜、景别、机位' },
  { key: 'emotion', label: '情绪', hint: '表情、氛围、色调' },
  { key: 'hook', label: '钩子', hint: '开场与结尾钩子' },
  { key: 'sound', label: '声音', hint: '参考音频、配音样本' },
];

export const ASSET_KIND_MENTION_PREFIX: Record<AssetLibraryKind, string> = {
  character: '角色',
  costume: '服装',
  scene: '场景',
  shot: '镜头',
  emotion: '情绪',
  hook: '钩子',
  sound: '声音',
};

const PREFIX_TO_KIND = Object.fromEntries(
  Object.entries(ASSET_KIND_MENTION_PREFIX).map(([k, v]) => [v, k]),
) as Record<string, AssetLibraryKind>;

export function formatAssetMention(kind: AssetLibraryKind, label: string): string {
  return `@${ASSET_KIND_MENTION_PREFIX[kind]}:${label}`;
}

export function parseAssetMentions(text: string | undefined): Array<{ kind: AssetLibraryKind; label: string }> {
  if (!text) return [];
  const pattern = /@(角色|服装|场景|镜头|情绪|钩子|声音):(\S+)/g;
  const seen = new Set<string>();
  const result: Array<{ kind: AssetLibraryKind; label: string }> = [];
  for (const m of text.matchAll(pattern)) {
    const kind = PREFIX_TO_KIND[m[1]];
    const label = m[2];
    const key = `${kind}:${label}`;
    if (kind && !seen.has(key)) {
      seen.add(key);
      result.push({ kind, label });
    }
  }
  return result;
}

export function characterToItem(c: CharacterProfile, scope: AssetScope): AssetLibraryItem {
  return {
    id: c.id,
    kind: 'character',
    scope,
    label: c.name,
    prompt: resolveAssetPromptText('character', c),
    description: c.descriptionZh,
    imageUrl: c.creative?.fullSheetUrl ?? c.referenceImageUrl ?? undefined,
    audioUrl: c.referenceAudioUrl ?? undefined,
  };
}

export function workspaceItemToAsset(item: BacklotWorkspaceItem, scope: AssetScope): AssetLibraryItem {
  const kind = item.kind as Exclude<AssetLibraryKind, 'character' | 'sound'>;
  const creative = (item.creative ?? {}) as {
    description?: string;
    sheetUrl?: string | null;
    referenceUrls?: string[];
  };
  return {
    id: item.id,
    kind,
    scope,
    label: item.label,
    prompt: resolveAssetPromptText(kind, item),
    description: creative.description ?? item.promptZh,
    imageUrl: creative.sheetUrl ?? creative.referenceUrls?.[0] ?? undefined,
    hookPhase: item.hookPhase,
  };
}

export function templateToAsset(tpl: BacklotCustomTemplate, scope: AssetScope, builtin = false): AssetLibraryItem {
  return {
    id: tpl.id,
    kind: tpl.kind,
    scope,
    label: tpl.label,
    prompt: backlotTemplatePrompt(tpl),
    description: tpl.description ?? tpl.promptZh,
    hookPhase: tpl.hookPhase,
    builtin,
  };
}

export function soundToItem(s: SoundAssetProfile, scope: AssetScope): AssetLibraryItem {
  return {
    id: s.id,
    kind: 'sound',
    scope,
    label: s.name,
    prompt: resolveAssetPromptText('sound', s),
    description: s.description,
    audioUrl: s.audioUrl,
  };
}

export function resolveAssetRef(
  ref: AssetRef,
  privateItems: AssetLibraryItem[],
  publicItems: AssetLibraryItem[],
): AssetLibraryItem | undefined {
  const pool = ref.scope === 'private' ? privateItems : publicItems;
  return pool.find((i) => i.id === ref.id && i.kind === ref.kind);
}

export function enrichPromptWithAssets(
  basePrompt: string,
  refs: AssetRef[],
  privateItems: AssetLibraryItem[],
  publicItems: AssetLibraryItem[],
): string {
  const parts = refs
    .map((ref) => resolveAssetRef(ref, privateItems, publicItems))
    .filter((item): item is AssetLibraryItem => Boolean(item))
    .map((item) => `[${ASSET_KIND_MENTION_PREFIX[item.kind]} ${item.label}]: ${item.prompt}`)
    .filter(Boolean);
  const trimmed = basePrompt.trim();
  if (parts.length === 0) return trimmed;
  const suffix = `Asset context:\n${parts.join('\n')}`;
  return trimmed ? `${trimmed}\n\n${suffix}` : suffix;
}

/** 按文案中的 @服装:名称 / @场景:名称 等引用，把素材 Prompt 注入生成文本 */
export function enrichPromptWithAssetMentions(
  basePrompt: string,
  privateItems: AssetLibraryItem[],
  publicItems: AssetLibraryItem[] = [],
): string {
  const mentions = parseAssetMentions(basePrompt);
  if (mentions.length === 0) return basePrompt.trim();
  const pool = [...privateItems, ...publicItems];
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const m of mentions) {
    const key = `${m.kind}:${m.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const item = pool.find(
      (i) => i.kind === m.kind && i.label.trim().toLowerCase() === m.label.trim().toLowerCase(),
    );
    if (!item?.prompt?.trim()) continue;
    parts.push(`[${ASSET_KIND_MENTION_PREFIX[item.kind]} ${item.label}]: ${item.prompt.trim()}`);
  }
  const trimmed = basePrompt.trim();
  if (parts.length === 0) return trimmed;
  const suffix = `Asset context:\n${parts.join('\n')}`;
  return trimmed ? `${trimmed}\n\n${suffix}` : suffix;
}
