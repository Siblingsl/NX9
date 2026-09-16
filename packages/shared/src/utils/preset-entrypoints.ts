/**
 * NX9「休眠预设」接入层。
 *
 * 背景：`packages/shared/src/data/*` 中有一批预设数组已定义并已从 barrel 再导出，
 * 但仓库内（含 `apps/web`、`apps/server`、`packages/*`）没有任何消费方，属于
 * 「有数据、没入口」。本模块把这些数组接成**可注入既有提示词字段**的幂等片段，
 * 供生成工作区 / 提示词编辑处复用。
 *
 * 设计约束（与既有 `withCameraMovePrompt` 同构，便于单测与复用）：
 * 1. **不新增持久化字段名**：注入结果由调用方写回既有提示词字段
 *    （图片/视频工作台走 `useLocalNodePrompt.applyText`）；
 * 2. **幂等**：同一 section 重复套用只保留一行（按前缀识别并替换），不堆叠；
 * 3. **可清除**：传入空 id 列表即移除该 section 行，其余正文原样保留；
 * 4. **顺序稳定**：section 一律按 `PRESET_SECTION_KEYS` 的规范顺序重排，
 *    且同一 section 内片段按**词表顺序**输出，与传入 id 的先后无关；
 * 5. **互不覆盖**：只识别并重写本模块拥有的 4 个前缀；`camera movement:` /
 *    `运镜：`（大师运镜、运镜时间轴、节拍对齐）等既有注入行作为正文原样保留；
 * 6. 预设数组本身**不被修改**，本模块只做只读适配与拼装。
 */
import { PICTURE_GEN_SIZES } from '../data/gen-models';
import { ANIME_TAG_PRESETS, type TagPreset } from '../data/anime-tag-presets';
import { LIGHT_RIG_PRESETS, buildLightRigPrompt, type LightRigPreset } from '../data/light-rig-presets';
import { PORTRAIT_PRESETS, buildPortraitPrompt, type PortraitPreset } from '../data/portrait-presets';
import { CINEMA_PROMPT_PRESETS, type PromptPreset } from '../data/prompt-presets';

// ── section 定义 ──────────────────────────────────────────────

/** 本模块拥有的 section：按此顺序规范重排，保证组合顺序稳定。 */
export const PRESET_SECTION_KEYS = ['cinema', 'lighting', 'portrait', 'anime'] as const;

export type PresetSectionKey = (typeof PRESET_SECTION_KEYS)[number];

/** section → 提示词行前缀（用于成行识别、替换与清除）。 */
export const PRESET_SECTION_PREFIX: Record<PresetSectionKey, string> = {
  cinema: 'cinematic style:',
  lighting: 'lighting:',
  portrait: 'portrait:',
  anime: 'anime style:',
};

/** section → 中文名（UI 标签）。 */
export const PRESET_SECTION_LABELS: Record<PresetSectionKey, string> = {
  cinema: '电影感',
  lighting: '灯光',
  portrait: '人像',
  anime: '动漫标签',
};

/** 不属于本模块、但必须原样保留的既有注入行前缀（大师运镜 / 运镜时间轴 / 节拍）。 */
export const FOREIGN_PROMPT_PREFIXES = ['camera movement:', '运镜：'] as const;

function isOwnedLine(line: string): PresetSectionKey | undefined {
  const t = line.trim().toLowerCase();
  for (const key of PRESET_SECTION_KEYS) {
    if (t.startsWith(PRESET_SECTION_PREFIX[key])) return key;
  }
  return undefined;
}

/** 去重 + 去掉空白项，保持传入顺序。 */
function normalizeIds(ids: Array<string | null | undefined> | string | null | undefined): string[] {
  const list = Array.isArray(ids) ? ids : ids == null ? [] : [ids];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (raw == null) continue;
    const key = String(raw).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * 按**词表顺序**筛选 id：过滤未知 id，并对同一 id 去重。
 * 词表顺序（而非传入顺序）让「同一组选择」永远产出同一段文本，组合顺序稳定可断言。
 */
function pickByCatalog<T extends { id: string }>(
  catalog: readonly T[],
  ids: string[],
): T[] {
  const want = new Set(ids);
  return catalog.filter((item) => want.has(item.id));
}

// ── 词表只读适配（不替换既有数组）────────────────────────────────

/** 动漫标签 → 既有 `PromptPreset` 形状（`tags` 映射为 `text`）。 */
export function animeTagToPromptPreset(tag: TagPreset): PromptPreset {
  return { id: tag.id, label: tag.label, text: tag.tags, group: tag.group };
}

/** 灯光预设 → 既有 `PromptPreset` 形状（`prompt` 映射为 `text`）。 */
export function lightRigToPromptPreset(preset: LightRigPreset): PromptPreset {
  return { id: preset.id, label: preset.label, text: preset.prompt, group: '灯光预设' };
}

/** 人像预设 → 既有 `PromptPreset` 形状（`tags` 映射为 `text`）。 */
export function portraitToPromptPreset(preset: PortraitPreset): PromptPreset {
  return { id: preset.id, label: preset.label, text: preset.tags, group: preset.group };
}

/** section → 可喂给通用选择器的 `PromptPreset[]`（全部走适配，不改动原数组）。 */
export const PRESET_SECTION_PRESETS: Record<PresetSectionKey, PromptPreset[]> = {
  cinema: CINEMA_PROMPT_PRESETS,
  lighting: LIGHT_RIG_PRESETS.map(lightRigToPromptPreset),
  portrait: PORTRAIT_PRESETS.map(portraitToPromptPreset),
  anime: ANIME_TAG_PRESETS.map(animeTagToPromptPreset),
};

/** 按 `group` 分组的只读视图（保持词表顺序，空分组不返回）。 */
export function groupPromptPresets(
  presets: PromptPreset[],
): { group: string; items: PromptPreset[] }[] {
  const order: string[] = [];
  const buckets = new Map<string, PromptPreset[]>();
  for (const p of presets) {
    const g = p.group ?? '';
    if (!buckets.has(g)) {
      buckets.set(g, []);
      order.push(g);
    }
    buckets.get(g)!.push(p);
  }
  return order.map((group) => ({ group, items: buckets.get(group)! }));
}

// ── 片段拼装 ─────────────────────────────────────────────────

/** 电影感片段：按词表顺序取 `text`，英文逗号连接；空选择返回空串。 */
export function buildCinemaPresetPrompt(ids: Array<string | null | undefined>): string {
  return pickByCatalog(CINEMA_PROMPT_PRESETS, normalizeIds(ids))
    .map((p) => p.text)
    .join(', ');
}

/**
 * 灯光片段：复用既有的 `buildLightRigPrompt`（单选 + 附加文本语义）逐条取词，
 * 再多选拼接。先按词表校验 id，避免 `buildLightRigPrompt` 内部对未知 id
 * 回退到首条预设造成「选错了却看似成功」。
 */
export function buildLightRigMultiPrompt(ids: Array<string | null | undefined>): string {
  const picked = pickByCatalog(LIGHT_RIG_PRESETS, normalizeIds(ids));
  return picked.map((p) => buildLightRigPrompt(p.id)).join(', ');
}

/** 人像片段：复用既有的 `buildPortraitPrompt`（内含多选 + extra 语义）。 */
export function buildPortraitPresetPrompt(
  ids: Array<string | null | undefined>,
  extra?: string,
): string {
  return buildPortraitPrompt(normalizeIds(ids), extra);
}

/** 动漫标签片段：按词表顺序取 `tags`。 */
export function buildAnimeTagPrompt(ids: Array<string | null | undefined>): string {
  return pickByCatalog(ANIME_TAG_PRESETS, normalizeIds(ids))
    .map((p) => p.tags)
    .join(', ');
}

/** section → 片段构造函数。 */
export function buildSectionPrompt(
  key: PresetSectionKey,
  ids: Array<string | null | undefined>,
): string {
  switch (key) {
    case 'cinema':
      return buildCinemaPresetPrompt(ids);
    case 'lighting':
      return buildLightRigMultiPrompt(ids);
    case 'portrait':
      return buildPortraitPresetPrompt(ids);
    case 'anime':
      return buildAnimeTagPrompt(ids);
  }
}

/** 读取既有文本里已注入的各 section 片段（去前缀）；未出现的 key 不返回。 */
export function readPresetSections(text: string | undefined | null): Partial<
  Record<PresetSectionKey, string>
> {
  const out: Partial<Record<PresetSectionKey, string>> = {};
  for (const line of (text ?? '').split('\n')) {
    const key = isOwnedLine(line);
    if (!key) continue;
    const prefix = PRESET_SECTION_PREFIX[key];
    const body = line.trim().slice(prefix.length).trim();
    // 同 key 多行时后者覆盖前者，收敛为单行
    out[key] = body;
  }
  return out;
}

/**
 * 把若干 section 片段写入既有提示词文本（幂等、可清除、顺序稳定）。
 *
 * - 先剥离既有 4 类 section 行（本模块拥有的），其余正文与 `camera movement:` /
 *   `运镜：` 等外部注入行原样保留；
 * - 再把「合并后非空」的 section 按 `PRESET_SECTION_KEYS` 规范顺序追加到末尾；
 * - `updates[k]` 为空串 / 空白时表示**移除**该 section；
 * - 没有任何 section 需要写入且正文里也没有 section 行时，**原样返回**，不做空行归一化。
 */
export function composePresetSections(
  existing: string | undefined | null,
  updates: Partial<Record<PresetSectionKey, string>>,
): string {
  const text = existing ?? '';
  const current = readPresetSections(text);
  const merged: Partial<Record<PresetSectionKey, string>> = { ...current, ...updates };
  for (const key of PRESET_SECTION_KEYS) {
    if (!(merged[key] ?? '').trim()) delete merged[key];
  }

  // 无写入需求且正文无 section 行：不改动提示词（避免误触空行归一化）
  if (Object.keys(current).length === 0 && Object.keys(merged).length === 0) return text;

  const kept: string[] = [];
  for (const line of text.split('\n')) {
    if (isOwnedLine(line)) continue;
    kept.push(line);
  }
  // 去掉结尾空行，避免反复套用累积空行
  while (kept.length > 0 && !kept[kept.length - 1].trim()) kept.pop();

  for (const key of PRESET_SECTION_KEYS) {
    const fragment = (merged[key] ?? '').trim();
    if (!fragment) continue;
    kept.push(`${PRESET_SECTION_PREFIX[key]} ${fragment}`);
  }
  return kept.join('\n');
}

// ── 幂等注入入口（每个 section 一个）──────────────────────────

/** 电影感注入：`ids` 为空则移除该行。 */
export function withCinemaPrompt(
  existing: string | undefined | null,
  ids: Array<string | null | undefined>,
): string {
  return composePresetSections(existing, { cinema: buildCinemaPresetPrompt(ids) });
}

/** 灯光注入：`ids` 为空则移除该行。 */
export function withLightRigPrompt(
  existing: string | undefined | null,
  ids: Array<string | null | undefined>,
): string {
  return composePresetSections(existing, { lighting: buildLightRigMultiPrompt(ids) });
}

/** 人像注入：`ids` 为空则移除该行（`extra` 为附加文本，缺省不带）。 */
export function withPortraitPrompt(
  existing: string | undefined | null,
  ids: Array<string | null | undefined>,
  extra?: string,
): string {
  return composePresetSections(existing, { portrait: buildPortraitPresetPrompt(ids, extra) });
}

/** 动漫标签注入：`ids` 为空则移除该行。 */
export function withAnimeTagPrompt(
  existing: string | undefined | null,
  ids: Array<string | null | undefined>,
): string {
  return composePresetSections(existing, { anime: buildAnimeTagPrompt(ids) });
}

/** 通用注入入口：按 section 分发（UI 选择器复用一个回调）。 */
export function withSectionPrompt(
  key: PresetSectionKey,
  existing: string | undefined | null,
  ids: Array<string | null | undefined>,
): string {
  switch (key) {
    case 'cinema':
      return withCinemaPrompt(existing, ids);
    case 'lighting':
      return withLightRigPrompt(existing, ids);
    case 'portrait':
      return withPortraitPrompt(existing, ids);
    case 'anime':
      return withAnimeTagPrompt(existing, ids);
  }
}

// ── 出图尺寸预设（映射到既有 aspectRatio / width / height 字段）──

export interface PictureSizeCandidate {
  id: string;
  label: string;
}

/** 出图尺寸预设列表（只读转出 `PICTURE_GEN_SIZES`，不新增字段）。 */
export const PICTURE_SIZE_PRESET_OPTIONS: PictureSizeCandidate[] = PICTURE_GEN_SIZES.map((s) => ({
  id: s.id,
  label: s.label,
}));

export interface PictureSizePatch {
  aspectRatio: 'custom';
  width: number;
  height: number;
}

/** 解析 `1024x1792` 形式的尺寸 id；非法/非正数返回 undefined。 */
export function parsePictureGenSize(sizeId: string | undefined | null): PictureSizePatch | undefined {
  if (!sizeId) return undefined;
  const hit = PICTURE_GEN_SIZES.find((s) => s.id === String(sizeId).trim());
  if (!hit) return undefined;
  const m = /^(\d+)x(\d+)$/.exec(hit.id);
  if (!m) return undefined;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return { aspectRatio: 'custom', width, height };
}

/**
 * 尺寸预设 → 既有字段补丁（`aspectRatio: 'custom'` + `width` / `height`）。
 * `resolveImageRequestSize` 已是同源消费方，因此不新增字段名。
 */
export function pictureSizePresetPatch(
  sizeId: string | undefined | null,
): PictureSizePatch | undefined {
  return parsePictureGenSize(sizeId);
}

/** 由既有 width / height 反查命中的尺寸预设 id；未命中返回 undefined。 */
export function matchPictureGenSize(
  width: number | undefined,
  height: number | undefined,
): string | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined;
  const hit = PICTURE_GEN_SIZES.find((s) => s.id === `${width}x${height}`);
  return hit?.id;
}
