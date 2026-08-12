import type { BacklotCustomTemplate, BacklotTemplateKind, BacklotWorkspaceItem } from '../data/backlot-templates';
import { backlotTemplatePrompt } from '../data/backlot-templates';
import type { CharacterProfile } from '../types/character';
import type { SoundAssetProfile } from '../types/sound-library';
import { resolveAssetPromptText } from './creative-asset-prompts';

export type AssetLibraryKind = BacklotTemplateKind | 'sound' | 'style';
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
  tags?: string[];
  audioUrl?: string;
  imageUrl?: string;
  hookPhase?: 'opening' | 'ending';
  builtin?: boolean;
  /**
   * P-25：公共库自定义条目与内置同名，resolve 时覆盖内置展示。
   * UI 应标「覆盖中」，避免误以为内置丢失。
   */
  overridesBuiltin?: boolean;
  /** F-010: 软删除时间戳 */
  deletedAt?: number;
}

/** Tab 分组：实体 / 词典 / 声音
 * 情绪、钩子/爆点已退出主导航（情绪→镜头标签；爆点 SSOT=编剧 brief.hooks）。
 * 镜头 / 风格仅出现在「公共」scope（见 assetLibraryTabGroupsForScope）。
 */
export const ASSET_LIBRARY_TAB_GROUPS: {
  id: 'entity' | 'lexicon' | 'media';
  label: string;
  keys: AssetLibraryKind[];
}[] = [
  { id: 'entity', label: '上镜实体', keys: ['character', 'costume', 'scene', 'prop'] },
  { id: 'lexicon', label: '语言词典', keys: ['shot', 'style'] },
  { id: 'media', label: '声音', keys: ['sound'] },
];

/** 仅公共库顶栏展示的词典 kind */
export const ASSET_LIBRARY_PUBLIC_ONLY_KINDS: readonly AssetLibraryKind[] = ['shot', 'style'];

export const ASSET_LIBRARY_TABS: { key: AssetLibraryKind; label: string; hint: string }[] = [
  { key: 'character', label: '角色', hint: '人设与一致性参考' },
  { key: 'costume', label: '服装', hint: '造型套装、面料与标志物' },
  { key: 'scene', label: '场景', hint: '环境、光线、空间' },
  { key: 'prop', label: '道具', hint: '标志性物品、连续性锚点' },
  { key: 'shot', label: '镜头', hint: '运镜词典（仅公共库）' },
  { key: 'emotion', label: '情绪', hint: '已降级：请用镜头推荐情绪 / 角色表情格（兼容旧条目）' },
  { key: 'hook', label: '爆点', hint: '已退出主导航：请在编剧台维护 brief.hooks（兼容旧条目）' },
  { key: 'style', label: '风格', hint: '名 + Prompt + 可选参考图（仅公共库）' },
  { key: 'sound', label: '声音', hint: '配音 / 音效 / BGM（可选音频）' },
];

/** 主导航可见的 kind（情绪 / 爆点不进顶栏；不含 scope 过滤） */
export function isAssetLibraryNavKind(kind: AssetLibraryKind): boolean {
  return ASSET_LIBRARY_TAB_GROUPS.some((g) => g.keys.includes(kind));
}

export function isAssetLibraryPublicOnlyKind(kind: AssetLibraryKind): boolean {
  return (ASSET_LIBRARY_PUBLIC_ONLY_KINDS as readonly string[]).includes(kind);
}

/** 按 scope 过滤顶栏分组（私有不展示镜头 / 风格） */
export function assetLibraryTabGroupsForScope(scope: AssetScope): typeof ASSET_LIBRARY_TAB_GROUPS {
  if (scope === 'public') return ASSET_LIBRARY_TAB_GROUPS;
  return ASSET_LIBRARY_TAB_GROUPS
    .map((g) => ({
      ...g,
      keys: g.keys.filter((k) => !isAssetLibraryPublicOnlyKind(k)),
    }))
    .filter((g) => g.keys.length > 0);
}

export function isAssetLibraryNavKindForScope(kind: AssetLibraryKind, scope: AssetScope): boolean {
  return assetLibraryTabGroupsForScope(scope).some((g) => g.keys.includes(kind));
}

export const ASSET_KIND_MENTION_PREFIX: Record<AssetLibraryKind, string> = {
  character: '角色',
  costume: '服装',
  scene: '场景',
  prop: '道具',
  shot: '镜头',
  emotion: '情绪',
  hook: '钩子',
  style: '风格',
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
  const pattern = /@(角色|服装|场景|道具|镜头|情绪|钩子|风格|声音):(\S+)/g;
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

/**
 * C-01：检测裸 `@名`（无类型前缀）。兼容层仍可能被旧文案使用，新产品路径应升级为 `@角色:名`。
 */
export function findLegacyBareMentions(text: string | undefined): string[] {
  if (!text) return [];
  const typed = new Set(
    parseAssetMentions(text).map((m) => m.label.trim().toLowerCase()),
  );
  const bare: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/(^|[\s，,、；;（(])@([^\s:@：]+)/g)) {
    const label = m[2]?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (typed.has(key) || seen.has(key)) continue;
    // 跳过已是「类型:名」被截断的情况
    if (Object.values(ASSET_KIND_MENTION_PREFIX).some((p) => label === p || label.startsWith(`${p}:`))) {
      continue;
    }
    seen.add(key);
    bare.push(label);
  }
  return bare;
}

export function characterToItem(c: CharacterProfile, scope: AssetScope): AssetLibraryItem {
  return {
    id: c.id,
    kind: 'character',
    scope,
    label: c.name,
    prompt: resolveAssetPromptText('character', c),
    description: c.descriptionZh,
    imageUrl:
      c.creative?.frontViewUrl
      ?? c.referenceImageUrl
      ?? c.creative?.fullSheetUrl
      ?? undefined,
    audioUrl: c.referenceAudioUrl ?? undefined,
    deletedAt: c.deletedAt,
  };
}

export function workspaceItemToAsset(item: BacklotWorkspaceItem, scope: AssetScope): AssetLibraryItem {
  const kind = item.kind as Exclude<AssetLibraryKind, 'character' | 'sound' | 'style'>;
  const creative = (item.creative ?? {}) as {
    description?: string;
    sheetUrl?: string | null;
    frontFlatUrl?: string | null;
    coverUrl?: string | null;
    referenceUrls?: string[];
    gifUrl?: string | null;
    exampleImageUrl?: string | null;
    purpose?: string;
  };
  return {
    id: item.id,
    kind,
    scope,
    label: item.label,
    prompt: resolveAssetPromptText(kind, item),
    description: creative.purpose ?? creative.description ?? item.promptZh,
    imageUrl:
      creative.gifUrl
      ?? creative.exampleImageUrl
      ?? creative.coverUrl
      ?? creative.frontFlatUrl
      ?? creative.sheetUrl
      ?? creative.referenceUrls?.[0]
      ?? undefined,
    hookPhase: item.hookPhase,
    deletedAt: item.deletedAt,
  };
}

export function templateToAsset(tpl: BacklotCustomTemplate, scope: AssetScope, builtin = false): AssetLibraryItem {
  const creative = (tpl.creative ?? {}) as {
    gifUrl?: string | null;
    exampleImageUrl?: string | null;
    purpose?: string;
  };
  return {
    id: tpl.id,
    kind: tpl.kind,
    scope,
    label: tpl.label,
    prompt: backlotTemplatePrompt(tpl),
    description: creative.purpose ?? tpl.description ?? tpl.promptZh,
    imageUrl: creative.gifUrl?.trim() || creative.exampleImageUrl?.trim() || undefined,
    tags: tpl.tags,
    hookPhase: tpl.hookPhase,
    builtin,
    deletedAt: tpl.deletedAt,
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
    tags: s.tags,
    builtin: Boolean(s.builtinKey) || s.id.startsWith('builtin-sound-'),
    deletedAt: s.deletedAt,
  };
}

export function styleToItem(
  s: import('../types/style-library').StylePresetProfile,
  scope: AssetScope,
): AssetLibraryItem {
  return {
    id: s.id,
    kind: 'style',
    scope,
    label: s.name,
    prompt: s.promptEn?.trim() || s.promptZh?.trim() || '',
    description: s.description ?? s.promptZh,
    imageUrl: s.referenceImageUrl?.trim() || undefined,
    builtin: Boolean(s.builtinKey),
    tags: s.tags,
    deletedAt: s.deletedAt,
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

/**
 * OL-22：按 kind+label 解析时优先私有；若公私同名则标明冲突。
 */
export function preferPrivateAssetByLabel(
  kind: AssetLibraryKind,
  label: string,
  privateItems: AssetLibraryItem[],
  publicItems: AssetLibraryItem[],
): {
  item: AssetLibraryItem | undefined;
  scope: AssetScope | null;
  nameConflict: boolean;
} {
  const key = (label ?? '').trim().toLowerCase();
  if (!key) return { item: undefined, scope: null, nameConflict: false };
  const match = (pool: AssetLibraryItem[]) =>
    pool.find((i) => i.kind === kind && i.label.trim().toLowerCase() === key);
  const priv = match(privateItems);
  const pub = match(publicItems);
  if (priv) {
    return { item: priv, scope: 'private', nameConflict: Boolean(pub) };
  }
  if (pub) {
    return { item: pub, scope: 'public', nameConflict: false };
  }
  return { item: undefined, scope: null, nameConflict: false };
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
    if (!item) continue;
    const ctx = item.prompt?.trim()
      ? item.description?.trim()
        ? `${item.prompt.trim()}\n锁定描述：${item.description.trim()}`
        : item.prompt.trim()
      : item.description?.trim()
        ? `锁定描述：${item.description.trim()}`
        : '';
    if (!ctx) continue;
    parts.push(`[${ASSET_KIND_MENTION_PREFIX[item.kind]} ${item.label}]: ${ctx}`);
  }
  const trimmed = basePrompt.trim();
  if (parts.length === 0) return trimmed;
  const suffix = `Asset context:\n${parts.join('\n')}`;
  return trimmed ? `${trimmed}\n\n${suffix}` : suffix;
}
