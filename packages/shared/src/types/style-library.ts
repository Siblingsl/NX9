/**
 * 公共风格预设（Sty-01～03）。
 * 轻量：名 + Prompt + 可选参考图；服务分镜帧 stylePreset。
 * 与镜头库边界：风格 = 画面美学；镜头 = 机位运镜。
 * 素材库 Tab：仅「公共」scope 维护；工作区 styleLibrary 仅兼容遗留数据。
 */

/** 美学族：风格库一级筛选（比镜头库浅一层） */
export type StyleAestheticFamily =
  | 'sketch'
  | 'cinematic'
  | 'illustration'
  | 'painterly'
  | 'genre';

export const STYLE_AESTHETIC_FAMILIES: ReadonlyArray<{
  id: StyleAestheticFamily;
  label: string;
  hint: string;
}> = [
  { id: 'sketch', label: '线稿草稿', hint: '分镜草稿、描边、无渲染' },
  { id: 'cinematic', label: '写实电影', hint: '光影、胶片、景深' },
  { id: 'illustration', label: '插画二次元', hint: '赛璐璐、漫画感' },
  { id: 'painterly', label: '绘画材质', hint: '水彩、笔触、纸感' },
  { id: 'genre', label: '类型片', hint: '黑色电影、时代片等类型美学' },
];

export function styleAestheticFamilyLabel(
  id: StyleAestheticFamily | string | undefined | null,
): string {
  if (!id) return '';
  return STYLE_AESTHETIC_FAMILIES.find((f) => f.id === id)?.label ?? String(id);
}

export interface StylePresetProfile {
  id: string;
  name: string;
  /** 注入 Prompt 的英文美学描述 */
  promptEn: string;
  promptZh?: string;
  description?: string;
  tags?: string[];
  /** 美学族（筛选 / 卡面芯片） */
  family?: StyleAestheticFamily;
  /** 可选美学参考图（卡片/帧预览） */
  referenceImageUrl?: string | null;
  /** 内置特殊值：线稿等 */
  builtinKey?: 'line-art' | 'cinematic' | 'anime' | 'watercolor' | 'noir';
  favorite?: boolean;
  /** F-010 软删 */
  deletedAt?: number;
}

export interface StyleLibraryPayload {
  version: 1;
  styles: StylePresetProfile[];
}

export const BUILTIN_STYLE_PRESETS: StylePresetProfile[] = [
  {
    id: 'style-builtin-line-art',
    name: '线稿',
    builtinKey: 'line-art',
    family: 'sketch',
    promptEn: 'clean line art sketch, black ink outlines, no shading, storyboard draft',
    promptZh: '干净线稿，黑色描边，无阴影，分镜草稿',
    description: '分镜草稿与构图确认',
    tags: ['builtin', 'line-art', 'sketch'],
  },
  {
    id: 'style-builtin-cinematic',
    name: '电影感',
    builtinKey: 'cinematic',
    family: 'cinematic',
    promptEn: 'cinematic lighting, shallow depth of field, film grain, anamorphic bokeh',
    promptZh: '电影光影，浅景深，胶片颗粒',
    description: '写实光影与景深',
    tags: ['builtin', 'cinematic'],
  },
  {
    id: 'style-builtin-anime',
    name: '二次元',
    builtinKey: 'anime',
    family: 'illustration',
    promptEn: 'anime illustration style, clean cel shading, expressive eyes',
    promptZh: '二次元插画，赛璐璐上色',
    description: '赛璐璐与漫画表现力',
    tags: ['builtin', 'anime', 'illustration'],
  },
  {
    id: 'style-builtin-watercolor',
    name: '水彩',
    builtinKey: 'watercolor',
    family: 'painterly',
    promptEn: 'watercolor painting, soft washes, paper texture, delicate edges',
    promptZh: '水彩，柔和晕染，纸纹理',
    description: '柔和晕染与纸感',
    tags: ['builtin', 'watercolor', 'painterly'],
  },
  {
    id: 'style-builtin-noir',
    name: '黑色电影',
    builtinKey: 'noir',
    family: 'genre',
    promptEn: 'film noir, high contrast black and white, dramatic shadows, rain-slick streets',
    promptZh: '黑色电影，高反差黑白，戏剧阴影',
    description: '高反差类型片美学',
    tags: ['builtin', 'noir', 'genre'],
  },
];

export function emptyStyleLibrary(): StyleLibraryPayload {
  return { version: 1, styles: [] };
}

export function newStylePreset(partial?: Partial<StylePresetProfile>): StylePresetProfile {
  const name = partial?.name?.trim() || '未命名风格';
  return {
    id: partial?.id ?? `style-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    promptEn: partial?.promptEn?.trim() || '',
    promptZh: partial?.promptZh?.trim() || undefined,
    description: partial?.description?.trim() || undefined,
    tags: partial?.tags,
    family: partial?.family,
    referenceImageUrl: partial?.referenceImageUrl ?? null,
    builtinKey: partial?.builtinKey,
    favorite: partial?.favorite,
  };
}

/** 从内置/他人条目导入可编辑副本（去掉 builtinKey，新 id） */
export function cloneStylePreset(
  source: StylePresetProfile,
  nameSuffix = '·副本',
): StylePresetProfile {
  return newStylePreset({
    name: `${source.name}${nameSuffix}`,
    promptEn: source.promptEn,
    promptZh: source.promptZh,
    description: source.description,
    tags: (source.tags ?? []).filter((t) => t !== 'builtin'),
    family: source.family,
    referenceImageUrl: source.referenceImageUrl,
    favorite: false,
  });
}

/** 合并内置 + 项目自定义（同名时自定义覆盖内置展示） */
export function resolveStylePresets(projectStyles: StylePresetProfile[] = []): StylePresetProfile[] {
  const live = projectStyles.filter((s) => !s.deletedAt);
  const byName = new Map(live.map((s) => [s.name.trim().toLowerCase(), s]));
  const builtins = BUILTIN_STYLE_PRESETS.filter(
    (b) => !byName.has(b.name.trim().toLowerCase()),
  );
  return [...builtins, ...live];
}

export function findStylePresetByName(
  name: string,
  projectStyles: StylePresetProfile[] = [],
): StylePresetProfile | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return resolveStylePresets(projectStyles).find((s) => s.name.trim().toLowerCase() === key);
}

export function isBuiltinStylePreset(style: StylePresetProfile | undefined | null): boolean {
  return Boolean(style?.builtinKey);
}
