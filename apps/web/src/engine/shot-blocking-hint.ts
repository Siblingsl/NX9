/**
 * shot-blocking-hint.ts — 分镜「机位建议」幂等注入（R2 新增）。
 *
 * 背景：`engine/director-desk-runner.ts` 的 `suggestCameraPosition` 早已实现
 * （由景别 / 运镜 / 角度 / 镜头库绑定推导 3D 摆位文本建议），但全仓无任何生产
 * 调用方 —— 典型的「有实现、没入口」。本模块把它接成**可注入既有 `videoPrompt`
 * 字段**的幂等片段，供分镜台镜头编辑弹窗复用。
 *
 * 依赖形态：本模块是**纯函数 + 依赖注入**，不 import `director-desk-runner`。
 * 原因：`director-desk-runner` 会拉入 `@nx9/shared` barrel，而该 barrel 当前含
 * 8 个缺失模块（已知硬缺陷，禁止本批次修复）；若在此静态 import，本模块的单测
 * 将被迫依赖 barrel，无法独立运行。真实建议函数由调用方（分镜弹窗）传入。
 *
 * 设计约束（与 `packages/shared/src/utils/preset-entrypoints.ts` 的
 * `composePresetSections` 同构）：
 * 1. **不新增持久化字段名**：注入结果由调用方写回既有 `videoPrompt`
 *    （分镜台走 `setEditDraft({ ...editDraft, videoPrompt })`）；
 * 2. **幂等**：同一镜头反复套用只保留一行（按前缀 `机位建议：` 整行识别并替换）；
 * 3. **可清除**：传入 `null` / 无可推导信息的镜头即移除该行，其余正文原样保留；
 * 4. **互不覆盖**：只识别并重写本模块拥有的前缀；`camera movement:` / `运镜：`
 *    （大师运镜、运镜时间轴）以及预设段落行（`cinematic style:` / `lighting:` /
 *    `portrait:` / `anime style:`）一律作为正文原样保留；
 * 5. **无信号不注入**：镜头既无文字描述也无景别 / 运镜 / 角度 / 镜头库绑定时返回
 *    空片段，避免把 `suggestCameraPosition` 的兜底默认值当成「建议」写进提示词。
 */

/** 本模块拥有的提示词行前缀（用于成行识别、替换与清除）。 */
export const SHOT_BLOCKING_PREFIX = '机位建议：';

/** 参与推导的镜头字段（`suggestCameraPosition` 入参子集）。 */
export interface ShotBlockingHintSource {
  index?: number;
  descriptionZh?: string;
  promptEn?: string;
  shotSize?: string;
  cameraMove?: string;
  cameraAngle?: string;
  scene?: string;
  characters?: string[];
  /** OL-18：若绑定镜头库，优先用库条景别/运镜 */
  shotAssetId?: string | null;
  shotLexiconSize?: string | null;
  shotLexiconMove?: string | null;
}

/** `suggestCameraPosition` 的返回值结构子集（本模块只消费这三项 + notes）。 */
export interface ShotBlockingSuggestion {
  suggestedCamera: string;
  suggestedAngle: string;
  suggestedDistance: string;
  notes?: string;
}

/** 建议函数签名 —— 由调用方注入真实实现（分镜弹窗传 `suggestCameraPosition`）。 */
export type ShotBlockingSuggester = (shot: {
  index?: number;
  descriptionZh?: string;
  promptEn?: string;
  shotSize?: string;
  cameraMove?: string;
  cameraAngle?: string;
  scene?: string;
  characters?: string[];
  shotAssetId?: string | null;
  shotLexiconSize?: string | null;
  shotLexiconMove?: string | null;
}) => ShotBlockingSuggestion;

function nonEmpty(value: string | undefined | null): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

/** 成行识别：返回该行是否为本模块拥有的注入行。 */
function isOwnedLine(line: string): boolean {
  return line.trim().toLowerCase().startsWith(SHOT_BLOCKING_PREFIX);
}

/** 镜头是否存在可供推导的真实信号（全空则不注入，见文件头约束 5）。 */
export function hasShotBlockingSignal(shot: ShotBlockingHintSource | null | undefined): boolean {
  if (!shot) return false;
  return Boolean(
    nonEmpty(shot.descriptionZh) ||
      nonEmpty(shot.promptEn) ||
      nonEmpty(shot.shotSize) ||
      nonEmpty(shot.cameraMove) ||
      nonEmpty(shot.cameraAngle) ||
      nonEmpty(shot.shotAssetId) ||
      nonEmpty(shot.shotLexiconSize) ||
      nonEmpty(shot.shotLexiconMove),
  );
}

/** 镜头 → `suggestCameraPosition` 入参（空白字段归一为 `undefined`）。 */
export function toShotBlockingSuggestionInput(shot: ShotBlockingHintSource | null | undefined) {
  return {
    index: shot?.index,
    descriptionZh: nonEmpty(shot?.descriptionZh),
    promptEn: nonEmpty(shot?.promptEn),
    shotSize: nonEmpty(shot?.shotSize),
    cameraMove: nonEmpty(shot?.cameraMove),
    cameraAngle: nonEmpty(shot?.cameraAngle),
    scene: nonEmpty(shot?.scene),
    characters: shot?.characters,
    shotAssetId: shot?.shotAssetId ?? null,
    shotLexiconSize: shot?.shotLexiconSize ?? null,
    shotLexiconMove: shot?.shotLexiconMove ?? null,
  };
}

/**
 * 镜头 → 机位建议片段正文（不含前缀）。无信号或推导结果为空时返回空串。
 * 输出形如：`客厅 · 推机位，焦段 2m · eye-level · 2m`
 */
export function buildShotBlockingHint(
  shot: ShotBlockingHintSource | null | undefined,
  suggest: ShotBlockingSuggester,
): string {
  if (!hasShotBlockingSignal(shot)) return '';
  const suggestion = suggest(toShotBlockingSuggestionInput(shot));
  const parts = [
    suggestion?.suggestedCamera,
    suggestion?.suggestedAngle,
    suggestion?.suggestedDistance,
  ]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  // 去重（`suggestCameraPosition` 的 distance 可能与大类重复），保持首次出现顺序
  const seen = new Set<string>();
  const unique = parts.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
  return unique.join(' · ');
}

/** 读取既有文本里已注入的机位建议（去前缀）；未出现返回 undefined。 */
export function readShotBlockingHint(text: string | undefined | null): string | undefined {
  let found: string | undefined;
  for (const line of (text ?? '').split('\n')) {
    if (!isOwnedLine(line)) continue;
    // 同前缀多行时后者覆盖前者，收敛为单行
    found = line.trim().slice(SHOT_BLOCKING_PREFIX.length).trim();
  }
  return found && found.length > 0 ? found : undefined;
}

/**
 * 把机位建议写入既有提示词文本（幂等、可清除、不动外部注入行）。
 *
 * - 先剥离既有的 `机位建议：` 行（本模块拥有的），其余正文与 `camera movement:` /
 *   `运镜：` / 预设段落行原样保留；
 * - `shot` 为 `null` 或片段为空时表示**移除**该行；
 * - 既无可移除行、又无需写入时**原样返回**，不做空行归一化。
 */
export function withShotBlockingHint(
  existing: string | undefined | null,
  shot: ShotBlockingHintSource | null | undefined,
  suggest: ShotBlockingSuggester,
): string {
  const text = existing ?? '';
  const hadOwned = text.split('\n').some((line) => isOwnedLine(line));
  const fragment = buildShotBlockingHint(shot, suggest).trim();

  if (!hadOwned && !fragment) return text;

  const kept: string[] = [];
  for (const line of text.split('\n')) {
    if (isOwnedLine(line)) continue;
    kept.push(line);
  }
  // 去掉结尾空行，避免反复套用累积空行
  while (kept.length > 0 && !kept[kept.length - 1].trim()) kept.pop();

  if (fragment) kept.push(`${SHOT_BLOCKING_PREFIX} ${fragment}`);
  return kept.join('\n');
}

/** 显式清除机位建议行（等价于 `withShotBlockingHint(existing, null, suggest)`）。 */
export function clearShotBlockingHint(
  existing: string | undefined | null,
  suggest: ShotBlockingSuggester,
): string {
  return withShotBlockingHint(existing, null, suggest);
}
