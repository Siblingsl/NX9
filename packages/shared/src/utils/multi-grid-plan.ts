/**
 * multi-grid-plan.ts — 「多格推演」提示词 / 分镜构造器（纯函数）。
 *
 * 三种语义（对标分镜推演类能力，但实现只依据本仓库规格）：
 * 1. 多机位 9 / 25 宫格关键帧：方位 × 景别矩阵，每格真实机位标签 + 建议机位坐标，
 *    主体一致性措辞逐格复述，保证同一角色 / 服装 / 场景 / 光线。
 * 2. 剧情推演四宫格：起因确立 → 冲突升级 → 转折 → 收束/钩子。
 * 3. 画面推演：N 秒前 / 当前（源图） / M 秒后，前后格互为收尾帧。
 *
 * 约束：
 * - 纯函数、无副作用、输入输出可 JSON 序列化；
 * - 机位坐标 / 焦距 / 高度均为**建议值**，不写死为对源图的实测结论；
 * - 不依赖 packages/shared 的 barrel（index.ts）导出。
 */
import type { GridCellPrompt, GridReversePromptsResult } from '../types/grid-prompts';
import type {
  FramePredictPlanOptions,
  MultiCamPlanOptions,
  MultiGridCell,
  MultiGridMode,
  MultiGridModeDef,
  MultiGridPlan,
  MultiGridPlanOptions,
  StoryBeatInput,
  StoryPredictPlanOptions,
} from '../types/multi-grid';

/** 多格推演默认负面提示词（主体串味 / 换景 / 换装是此类推演的主要失败模式） */
export const MULTI_GRID_DEFAULT_NEGATIVE =
  'extra characters, duplicated subject, changed wardrobe, changed background, distorted anatomy, text, watermark, watermark text, frame border, collage seams';

/** 画面推演单镜时长（秒），用于下游视频生成 */
export const MULTI_GRID_CLIP_SEC = 3;

export const MULTI_GRID_MODES: MultiGridModeDef[] = [
  {
    id: 'multi-cam-9',
    label: '多机位 9 宫格',
    hint: '3 方位 × 3 景别 · 同一主体的九机位关键帧',
    rows: 3,
    cols: 3,
    cellCount: 9,
  },
  {
    id: 'multi-cam-25',
    label: '多机位 25 宫格',
    hint: '5 方位 × 5 景别 · 精细机位矩阵',
    rows: 5,
    cols: 5,
    cellCount: 25,
  },
  {
    id: 'story-predict-4',
    label: '剧情推演四宫格',
    hint: '起因 → 冲突 → 转折 → 收束/钩子',
    rows: 2,
    cols: 2,
    cellCount: 4,
  },
  {
    id: 'frame-predict',
    label: '画面推演',
    hint: '前置 / 当前 / 后续时间推演，前后格互为收尾帧',
    rows: 1,
    cols: 3,
    cellCount: 3,
  },
];

export function isMultiGridMode(value: unknown): value is MultiGridMode {
  return typeof value === 'string' && MULTI_GRID_MODES.some((m) => m.id === value);
}

export function lookupMultiGridModeDef(mode: string | undefined): MultiGridModeDef {
  return MULTI_GRID_MODES.find((m) => m.id === mode) ?? MULTI_GRID_MODES[0]!;
}

/** 从节点 data 读模式（非法值回落多机位 9 宫格） */
export function readMultiGridMode(value: unknown): MultiGridMode {
  return isMultiGridMode(value) ? value : 'multi-cam-9';
}

/* ────────────────────────── 机位 / 景别表 ────────────────────────── */

interface AzimuthDef {
  /** 相对主体正前方的方位角（度）；负值 = 左侧 */
  azimuthDeg: number;
  labelZh: string;
  labelEn: string;
}

const AZIMUTH_3: AzimuthDef[] = [
  { azimuthDeg: -45, labelZh: '左前 45°', labelEn: 'left-front 45 degrees' },
  { azimuthDeg: 0, labelZh: '正前 0°', labelEn: 'front 0 degrees' },
  { azimuthDeg: 45, labelZh: '右前 45°', labelEn: 'right-front 45 degrees' },
];

const AZIMUTH_5: AzimuthDef[] = [
  { azimuthDeg: -90, labelZh: '左侧 90°', labelEn: 'left side 90 degrees' },
  { azimuthDeg: -45, labelZh: '左前 45°', labelEn: 'left-front 45 degrees' },
  { azimuthDeg: 0, labelZh: '正前 0°', labelEn: 'front 0 degrees' },
  { azimuthDeg: 45, labelZh: '右前 45°', labelEn: 'right-front 45 degrees' },
  { azimuthDeg: 90, labelZh: '右侧 90°', labelEn: 'right side 90 degrees' },
];

interface ShotSizeDef {
  id: string;
  labelZh: string;
  labelEn: string;
  /** 建议等效焦距（毫米），随 focalRange 线性映射 */
  focalMm: number;
  distanceM: number;
  heightM: number;
  pitchDeg: number;
}

const SHOT_SIZE_3: ShotSizeDef[] = [
  { id: 'mcu', labelZh: '近景', labelEn: 'medium close-up', focalMm: 85, distanceM: 1.8, heightM: 1.6, pitchDeg: 0 },
  { id: 'ms', labelZh: '中景', labelEn: 'medium shot', focalMm: 50, distanceM: 4, heightM: 1.6, pitchDeg: 0 },
  { id: 'ws', labelZh: '全景', labelEn: 'wide shot', focalMm: 28, distanceM: 8, heightM: 2.2, pitchDeg: -6 },
];

const SHOT_SIZE_5: ShotSizeDef[] = [
  { id: 'cu', labelZh: '特写', labelEn: 'close-up', focalMm: 100, distanceM: 1.2, heightM: 1.6, pitchDeg: 0 },
  { id: 'mcu', labelZh: '近景', labelEn: 'medium close-up', focalMm: 85, distanceM: 1.8, heightM: 1.6, pitchDeg: 0 },
  { id: 'ms', labelZh: '中景', labelEn: 'medium shot', focalMm: 50, distanceM: 4, heightM: 1.6, pitchDeg: 0 },
  { id: 'ws', labelZh: '全景', labelEn: 'wide shot', focalMm: 28, distanceM: 8, heightM: 2.2, pitchDeg: -6 },
  { id: 'ews', labelZh: '大远景', labelEn: 'extreme wide shot', focalMm: 18, distanceM: 16, heightM: 3.2, pitchDeg: -10 },
];

const FOCAL_REF_MIN = 18;
const FOCAL_REF_MAX = 100;

/** 等效焦距 → 全画幅水平视角（度） */
export function focalLengthToHorizontalFov(focalMm: number): number {
  if (!Number.isFinite(focalMm) || focalMm <= 0) return 0;
  const rad = 2 * Math.atan(36 / (2 * focalMm));
  return Math.round(((rad * 180) / Math.PI) * 10) / 10;
}

function clampFocalRange(range: [number, number] | undefined): [number, number] {
  const rawMin = Number(range?.[0]);
  const rawMax = Number(range?.[1]);
  const min = Number.isFinite(rawMin) ? Math.max(8, Math.min(300, rawMin)) : FOCAL_REF_MIN;
  const max = Number.isFinite(rawMax) ? Math.max(8, Math.min(300, rawMax)) : FOCAL_REF_MAX;
  return min <= max ? [min, max] : [max, min];
}

/** 把内置建议焦距线性映射到用户给定焦段 */
function scaleFocal(focalMm: number, range: [number, number]): number {
  const [min, max] = range;
  if (min === max) return Math.round(min);
  const ratio = (focalMm - FOCAL_REF_MIN) / (FOCAL_REF_MAX - FOCAL_REF_MIN);
  return Math.round(min + ratio * (max - min));
}

function pitchLabelZh(pitchDeg: number): string {
  if (pitchDeg <= -8) return '高机位俯拍';
  if (pitchDeg < 0) return '略高机位俯视';
  if (pitchDeg > 0) return '低机位仰拍';
  return '平视';
}

function pitchLabelEn(pitchDeg: number): string {
  if (pitchDeg <= -8) return 'high-angle looking down';
  if (pitchDeg < 0) return 'slightly high angle';
  if (pitchDeg > 0) return 'low angle looking up';
  return 'eye-level';
}

/** 方位角 + 距离 + 高度 → 建议机位坐标（相对主体，单位米） */
export function resolveCameraPositionHint(
  azimuthDeg: number,
  distanceM: number,
  heightM: number,
): string {
  const rad = (azimuthDeg * Math.PI) / 180;
  const x = Math.round(distanceM * Math.sin(rad) * 100) / 100;
  const z = Math.round(distanceM * Math.cos(rad) * 100) / 100;
  return `相对主体建议机位 x=${x} / y=${heightM} / z=${z}（米，+z 为主体正前，+x 为画面右侧）`;
}

function requireSourceUrl(sourceUrl: string, modeZh: string): string {
  const url = (sourceUrl ?? '').trim();
  if (!url) {
    throw new Error(`${modeZh}需要上游关键帧 / 图片作为参考，缺少源图，禁止空成功`);
  }
  return url;
}

/* ────────────────────────── ① 多机位宫格 ────────────────────────── */

export function buildMultiCamPlan(
  sourceUrl: string,
  options: MultiCamPlanOptions = {},
): MultiGridPlan {
  const url = requireSourceUrl(sourceUrl, '多机位宫格');
  const rows = Math.trunc(Number(options.rows ?? 3));
  const cols = Math.trunc(Number(options.cols ?? 3));
  const gridSize = rows * cols;
  if (rows !== cols || (gridSize !== 9 && gridSize !== 25)) {
    throw new Error(`多机位宫格仅支持 3×3（9 格）或 5×5（25 格），收到 ${rows}×${cols}，禁止空成功`);
  }
  const side = rows === 5 ? 5 : 3;
  const azimuths = side === 5 ? AZIMUTH_5 : AZIMUTH_3;
  const shotSizes = side === 5 ? SHOT_SIZE_5 : SHOT_SIZE_3;
  const focalRange = clampFocalRange(options.focalRange);
  const aspectRatio = (options.aspectRatio ?? '16:9').trim() || '16:9';
  const subjectZh = (options.subjectZh ?? '').trim();
  const subjectEn = (options.subjectEn ?? '').trim();

  const cells: MultiGridCell[] = [];
  for (let row = 0; row < side; row++) {
    const size = shotSizes[row]!;
    for (let col = 0; col < side; col++) {
      const az = azimuths[col]!;
      const focal = scaleFocal(size.focalMm, focalRange);
      const fov = focalLengthToHorizontalFov(focal);
      const role = `${az.labelZh} · ${size.labelZh}`;
      const positionHint = resolveCameraPositionHint(az.azimuthDeg, size.distanceM, size.heightM);
      const pitchZh = pitchLabelZh(size.pitchDeg);
      const pitchEn = pitchLabelEn(size.pitchDeg);

      const subjectClauseZh = subjectZh ? `主体：${subjectZh}；` : '';
      const subjectClauseEn = subjectEn ? `Subject: ${subjectEn}. ` : '';

      cells.push({
        cellIndex: row * side + col,
        row,
        col,
        role,
        imagePromptZh:
          `${subjectClauseZh}以上游关键帧为唯一主体与场景基准，保持同一角色外貌、同一服装、同一场景陈设、同一光线与色调；本格只改变机位与景别。` +
          `机位：${az.labelZh}（方位角 ${az.azimuthDeg}°），${size.labelZh}，${pitchZh}；` +
          `建议机位高度约 ${size.heightM} 米、距主体约 ${size.distanceM} 米，等效焦距 ${focal}mm（水平视角约 ${fov}°）。` +
          `保持人物比例、背景元素与细节一致，不要换人、换装、换景。`,
        imagePrompt:
          `${subjectClauseEn}Use the reference frame as the only basis for subject and location: keep the same character identity, same wardrobe, same set dressing, same lighting and color grading; only the camera position and shot size change. ` +
          `Camera: ${az.labelEn} (azimuth ${az.azimuthDeg} degrees), ${size.labelEn}, ${pitchEn}; ` +
          `suggested camera height about ${size.heightM}m, distance about ${size.distanceM}m, equivalent focal length ${focal}mm (about ${fov} degrees horizontal field of view). ` +
          `Keep body proportions, background elements and details consistent; do not change the person, wardrobe or location.`,
        negativePrompt: MULTI_GRID_DEFAULT_NEGATIVE,
        cameraAngleLabel: az.labelZh,
        shotSizeLabel: size.labelZh,
        cameraPositionHint: positionHint,
        focalLengthMm: focal,
        cameraHeightM: size.heightM,
        reuseSourceImage: false,
        needsEndFrame: false,
        endFramePromptZh: '',
        endFramePrompt: '',
      });
    }
  }

  return {
    mode: side === 5 ? 'multi-cam-25' : 'multi-cam-9',
    rows: side,
    cols: side,
    aspectRatio,
    sourceUrl: url,
    cells,
    notesZh:
      `多机位 ${side}×${side} 关键帧：行为景别（${shotSizes.map((s) => s.labelZh).join(' / ')}），` +
      `列为方位（${azimuths.map((a) => a.labelZh).join(' / ')}）。` +
      `逐格只改机位，主体一致性措辞逐格复述。机位坐标、高度与焦距均为按景别给出的**建议值**，` +
      `不是对源图的测量结果，可按实际场景调整。`,
  };
}

/* ────────────────────────── ② 剧情推演四宫格 ────────────────────────── */

interface StoryBeatDef {
  roleZh: string;
  roleEn: string;
  beatZh: string;
  beatEn: string;
}

const STORY_BEATS: StoryBeatDef[] = [
  {
    roleZh: '起因确立',
    roleEn: 'setup',
    beatZh: '交代时间、地点与人物关系，确立人物当下的处境与目标',
    beatEn: 'establish time, place and relationships; define the character goal and current situation',
  },
  {
    roleZh: '冲突升级',
    roleEn: 'escalation',
    beatZh: '外部压力或对手介入，矛盾加剧，人物被迫做出选择',
    beatEn: 'external pressure or an opposing force raises the stakes and forces a choice',
  },
  {
    roleZh: '转折',
    roleEn: 'turn',
    beatZh: '意外信息或关键动作出现，局面反转，人物立场改变',
    beatEn: 'unexpected information or a key action reverses the situation and shifts the character stance',
  },
  {
    roleZh: '收束 · 钩子',
    roleEn: 'resolution and hook',
    beatZh: '阶段结果落地，留下未解决的悬念作为下一步钩子',
    beatEn: 'land the outcome of this beat and leave an unresolved hook for the next one',
  },
];

function normalizeBeat(input: StoryBeatInput | undefined, fallback: StoryBeatDef) {
  if (typeof input === 'string') {
    const zh = input.trim();
    if (!zh) return { zh: fallback.beatZh, en: fallback.beatEn, enFromBeat: false };
    return { zh, en: fallback.beatEn, enFromBeat: true };
  }
  if (input && typeof input === 'object') {
    const zh = String(input.zh ?? '').trim() || fallback.beatZh;
    const en = String(input.en ?? '').trim();
    return en
      ? { zh, en, enFromBeat: false }
      : { zh, en: fallback.beatEn, enFromBeat: true };
  }
  return { zh: fallback.beatZh, en: fallback.beatEn, enFromBeat: false };
}

export function buildStoryPredictPlan(
  sourceUrl: string,
  options: StoryPredictPlanOptions = {},
): MultiGridPlan {
  const url = requireSourceUrl(sourceUrl, '剧情推演四宫格');
  const aspectRatio = (options.aspectRatio ?? '16:9').trim() || '16:9';
  const direction = (options.direction ?? '').trim();
  const directionEn = (options.directionEn ?? '').trim();
  const userBeats = Array.isArray(options.beats) ? options.beats.slice(0, 4) : [];

  const cells: MultiGridCell[] = STORY_BEATS.map((fallback, index) => {
    const beat = normalizeBeat(userBeats[index], fallback);
    const directionClauseZh = direction ? `；剧情方向：${direction}` : '';
    const directionClauseEn = directionEn ? `; story direction: ${directionEn}` : '';
    return {
      cellIndex: index,
      row: Math.floor(index / 2),
      col: index % 2,
      role: fallback.roleZh,
      imagePromptZh:
        `第 ${index + 1} 格 · ${fallback.roleZh}：${beat.zh}${directionClauseZh}。` +
        `以上游关键帧为同一主体与同一场景基准，延续角色外貌、服装、场景陈设与光线色调；` +
        `本格只推进剧情与人物动作，不改变人物身份与场景。`,
      imagePrompt:
        `Storyboard cell ${index + 1} of 4 — ${fallback.roleEn}: ${beat.en}${directionClauseEn}. ` +
        `Same character identity, same wardrobe, same location and same lighting as the reference frame; ` +
        `this cell advances the story and character action only` +
        (beat.enFromBeat ? `; story beat (Chinese, keep the meaning): ${beat.zh}` : '') +
        '.',
      negativePrompt: MULTI_GRID_DEFAULT_NEGATIVE,
      reuseSourceImage: false,
      needsEndFrame: false,
      endFramePromptZh: '',
      endFramePrompt: '',
    };
  });

  return {
    mode: 'story-predict-4',
    rows: 2,
    cols: 2,
    aspectRatio,
    sourceUrl: url,
    cells,
    notesZh:
      '剧情推演四宫格：起因确立 → 冲突升级 → 转折 → 收束/钩子。' +
      (direction ? `本计划沿用给定剧情方向「${direction}」。` : '未给定剧情方向时按通用四幕节拍展开。') +
      '四格共用同一主体与场景基准，只推进剧情动作；节拍为创作建议，不构成对源图的推断结论。',
  };
}

/* ────────────────────────── ③ 画面推演 ────────────────────────── */

export function buildFramePredictPlan(
  sourceUrl: string,
  options: FramePredictPlanOptions = {},
): MultiGridPlan {
  const url = requireSourceUrl(sourceUrl, '画面推演');
  const beforeSec = Math.trunc(Number(options.beforeSec ?? 5));
  const afterSec = Math.trunc(Number(options.afterSec ?? 3));
  if (!Number.isFinite(beforeSec) || beforeSec <= 0 || beforeSec > 120) {
    throw new Error(`画面推演「N 秒前」需为 1–120 的整数秒，收到 ${options.beforeSec}，禁止空成功`);
  }
  if (!Number.isFinite(afterSec) || afterSec <= 0 || afterSec > 120) {
    throw new Error(`画面推演「M 秒后」需为 1–120 的整数秒，收到 ${options.afterSec}，禁止空成功`);
  }
  const aspectRatio = (options.aspectRatio ?? '16:9').trim() || '16:9';
  const motionZh = (options.motionZh ?? '人物动作与镜头连续推进，光影方向不变').trim();
  const motionEn = (
    options.motionEn ?? 'continuous character action and camera motion, lighting direction unchanged'
  ).trim();

  const nowRole = '当前（源图）';
  const beforeRole = `${beforeSec} 秒前`;
  const afterRole = `${afterSec} 秒后`;

  const beforeCell: MultiGridCell = {
    cellIndex: 0,
    row: 0,
    col: 0,
    role: beforeRole,
    imagePromptZh:
      `时间倒推 ${beforeSec} 秒：以源图为「当前」基准，还原同一角色、同一服装、同一场景、同一光线在 ${beforeSec} 秒前的状态。` +
      `${motionZh}；动作与姿态应早于源图瞬间一步，人物位置与构图与源图保持可衔接。`,
    imagePrompt:
      `Step back ${beforeSec} seconds in time: starting from the reference frame as "now", reconstruct the same character, wardrobe, location and lighting ${beforeSec} seconds earlier. ` +
      `${motionEn}; the pose and action are one beat earlier than the reference frame, and the framing stays continuous with it.`,
    negativePrompt: MULTI_GRID_DEFAULT_NEGATIVE,
    timeOffsetSec: -beforeSec,
    reuseSourceImage: false,
    needsEndFrame: true,
    endFramePromptZh: `收尾于「当前（源图）」：回到上游源图的构图、动作与光线状态。`,
    endFramePrompt:
      'End on the current reference frame: return to its exact composition, action and lighting state.',
  };

  const nowCell: MultiGridCell = {
    cellIndex: 1,
    row: 0,
    col: 1,
    role: nowRole,
    imagePromptZh: `当前帧直接引用上游源图，不重新出图；作为时间轴基准保持画面不变。`,
    imagePrompt: 'The current frame is the upstream reference frame itself; no re-render, kept as the timeline baseline.',
    negativePrompt: MULTI_GRID_DEFAULT_NEGATIVE,
    timeOffsetSec: 0,
    reuseSourceImage: true,
    needsEndFrame: true,
    endFramePromptZh: `推进到「${afterRole}」：${motionZh}。`,
    endFramePrompt: `Advance to "${afterRole}": ${motionEn}.`,
  };

  const afterCell: MultiGridCell = {
    cellIndex: 2,
    row: 0,
    col: 2,
    role: afterRole,
    imagePromptZh:
      `时间推进 ${afterSec} 秒：以源图为「当前」基准，推演同一角色、同一服装、同一场景、同一光线在 ${afterSec} 秒后的状态。` +
      `${motionZh}；动作应接着源图瞬间继续，人物位置与构图保持可衔接。`,
    imagePrompt:
      `Advance ${afterSec} seconds in time: starting from the reference frame as "now", predict the same character, wardrobe, location and lighting ${afterSec} seconds later. ` +
      `${motionEn}; the action continues from the reference frame and the framing stays continuous with it.`,
    negativePrompt: MULTI_GRID_DEFAULT_NEGATIVE,
    timeOffsetSec: afterSec,
    reuseSourceImage: false,
    needsEndFrame: false,
    endFramePromptZh: '',
    endFramePrompt: '',
  };

  return {
    mode: 'frame-predict',
    rows: 1,
    cols: 3,
    aspectRatio,
    sourceUrl: url,
    cells: [beforeCell, nowCell, afterCell],
    notesZh:
      `画面推演：${beforeSec} 秒前 / 当前（源图） / ${afterSec} 秒后。` +
      '「当前」格直接复用源图不重新出图；前格尾帧指向当前，当前格尾帧指向后格，可直接用于首尾帧视频生成。' +
      '前 / 后格为依据时间偏移的推演结果，不写死为源图之外的既有素材。',
  };
}

/* ────────────────────────── 统一入口 ────────────────────────── */

export function buildMultiGridPlanForMode(
  mode: MultiGridMode,
  sourceUrl: string,
  options: MultiGridPlanOptions = {},
): MultiGridPlan {
  switch (mode) {
    case 'multi-cam-25':
      return buildMultiCamPlan(sourceUrl, { rows: 5, cols: 5, ...options });
    case 'multi-cam-9':
      return buildMultiCamPlan(sourceUrl, { rows: 3, cols: 3, ...options });
    case 'story-predict-4':
      return buildStoryPredictPlan(sourceUrl, options);
    case 'frame-predict':
      return buildFramePredictPlan(sourceUrl, options);
    default: {
      const exhaustive: never = mode;
      throw new Error(`未知多格推演模式：${String(exhaustive)}，禁止空成功`);
    }
  }
}

/* ────────────────────────── 下游兼容转换 ────────────────────────── */

/** 单格视频提示词（下游 clip-gen 直接消费；与图提示词分离） */
export function buildMultiGridCellVideoPrompt(cell: MultiGridCell, mode: MultiGridMode): {
  videoPromptZh: string;
  videoPrompt: string;
} {
  if (mode === 'frame-predict') {
    const dirZh = (cell.timeOffsetSec ?? 0) < 0 ? '回溯' : (cell.timeOffsetSec ?? 0) > 0 ? '推进' : '保持';
    const dirEn =
      (cell.timeOffsetSec ?? 0) < 0 ? 'reverse' : (cell.timeOffsetSec ?? 0) > 0 ? 'advance' : 'hold';
    const span = Math.abs(cell.timeOffsetSec ?? MULTI_GRID_CLIP_SEC) || MULTI_GRID_CLIP_SEC;
    return {
      videoPromptZh: `时间${dirZh} ${span} 秒：${cell.role}。动作与光影连续、无跳变，镜头保持同一机位。`,
      videoPrompt: `${dirEn} ${span} seconds in time: ${cell.role}. Continuous action and lighting, no jump cuts, same camera position.`,
    };
  }
  if (mode === 'story-predict-4') {
    return {
      videoPromptZh: `剧情推演 · ${cell.role}：按该格画面推进剧情动作，${MULTI_GRID_CLIP_SEC} 秒，结束停在该格构图上，主体与场景与源图一致。`,
      videoPrompt: `Story beat cell "${cell.role}": advance the story action on this frame, ${MULTI_GRID_CLIP_SEC} seconds, end on this composition, subject and location consistent with the reference frame.`,
    };
  }
  const angle = cell.cameraAngleLabel ?? cell.role;
  const size = cell.shotSizeLabel ?? '';
  return {
    videoPromptZh: `多机位单镜 · ${angle}${size ? ` · ${size}` : ''}：镜头小幅稳定运动（微推或固定），${MULTI_GRID_CLIP_SEC} 秒；主体、服装、场景与光线与源图一致，只体现该机位视角。`,
    videoPrompt: `Multi-camera single shot, ${angle}${size ? `, ${size}` : ''}: subtle stable camera move (slight push-in or locked-off), ${MULTI_GRID_CLIP_SEC} seconds; subject, wardrobe, location and lighting match the reference frame.`,
  };
}

function cellImageUrlFor(
  cell: MultiGridCell,
  plan: MultiGridPlan,
  imageUrls: (string | undefined)[],
): string {
  if (cell.reuseSourceImage) return plan.sourceUrl;
  return (imageUrls[cell.cellIndex] ?? '').trim();
}

/** 计划 → GridCellPrompt[]（复用既有宫格数据契约，供下游消费） */
export function planCellsToGridCellPrompts(
  plan: MultiGridPlan,
  imageUrls: (string | undefined)[] = [],
): GridCellPrompt[] {
  return plan.cells.map((cell) => {
    const video = buildMultiGridCellVideoPrompt(cell, plan.mode);
    return {
      index: cell.cellIndex,
      row: cell.row,
      col: cell.col,
      cellImageUrl: cellImageUrlFor(cell, plan, imageUrls),
      imagePrompt: cell.imagePrompt,
      imagePromptZh: cell.imagePromptZh,
      needsEndFrame: cell.needsEndFrame,
      endFramePrompt: cell.endFramePrompt,
      endFramePromptZh: cell.endFramePromptZh,
      endFrameReason: cell.needsEndFrame ? `${cell.role} · 首尾帧衔接` : undefined,
      videoPrompt: video.videoPrompt,
      videoPromptZh: video.videoPromptZh,
    };
  });
}

/**
 * 计划 + 每格出图 URL → 宫格结果。
 * 结构与 GridReversePromptsResult 兼容，`ok` 反映是否拿到可用图。
 */
export function planToGridReverseResult(
  plan: MultiGridPlan,
  imageUrls: (string | undefined)[] = [],
  message?: string,
): GridReversePromptsResult {
  const cells = planCellsToGridCellPrompts(plan, imageUrls);
  const splitUrls = plan.cells
    .map((cell, i) => cellImageUrlFor(cell, plan, imageUrls) || imageUrls[i] || '')
    .filter((url) => url.trim().length > 0);
  return {
    ok: splitUrls.length > 0,
    rows: plan.rows,
    cols: plan.cols,
    sourceUrl: plan.sourceUrl,
    splitUrls,
    cells,
    message,
  };
}
