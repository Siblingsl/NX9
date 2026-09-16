/**
 * character-sheet-plan.ts — 「角色设定表 / 三视图」提示词 / 版面构造器（纯函数）。
 *
 * 四种版面：
 * 1. 三视图：正面 / 3-4 侧 / 侧面 / 背面四视角（角度取自既有 ANGLE_PRESETS）；
 * 2. 表情表：角色设定表情预设（既有 CHARACTER_EXPRESSION_PRESETS，10 项）；
 * 3. 动作表：角色设定动作预设（既有 CHARACTER_SHEET_POSE_PRESETS，5 项）；
 * 4. 全套设定表：三视图 + 表情 + 动作 的整套版面（行列自算）。
 *
 * 一致性口径：角色设定（名称 / 外观 / 服装 / 画风 / 参考图描述）压成一段
 * **一致性锁定短语**，逐格原样复述 —— 换角度、换表情、换动作，不换人。
 *
 * 约束：
 * - 纯函数、无副作用、输入输出可 JSON 序列化；
 * - **不抛异常**：参数非法 / 角色信息缺失一律回落为明确告警，不编造设定、不静默；
 * - 不新增词汇表：表情、动作、角度全部取自既有预设；
 * - 不依赖 packages/shared 的 barrel（index.ts）导出。
 */
import { ANGLE_PRESETS } from '../data/anime-tag-presets';
import {
  CHARACTER_EXPRESSION_PRESETS,
  CHARACTER_SHEET_POSE_PRESETS,
} from '../data/character-sheet-presets';
import type { CharacterBible, CharacterProfile } from '../types/character';
import type { GridCellPrompt, GridReversePromptsResult } from '../types/grid-prompts';
import type {
  CharacterSheetCell,
  CharacterSheetConsistencyLevel,
  CharacterSheetKind,
  CharacterSheetKindDef,
  CharacterSheetPlan,
  CharacterSheetPlanOptions,
  CharacterSheetSectionId,
  CharacterSheetSubject,
} from '../types/character-sheet';
import { buildCharacterConsistencyPrompt } from './character-sheet-prompt';
import { MULTI_GRID_DEFAULT_NEGATIVE } from './multi-grid-plan';

/** 角色设定表单格时长（秒），供下游立绘微动视频使用 */
export const CHARACTER_SHEET_CLIP_SEC = 3;

/** 设定表默认负面提示词：主体串味 / 换人 / 换装是此类版面的主要失败模式 */
export const CHARACTER_SHEET_DEFAULT_NEGATIVE = [
  MULTI_GRID_DEFAULT_NEGATIVE,
  'different character, identity drift, face swap, inconsistent hairstyle, inconsistent outfit colors, extra limbs',
].join(', ');

/* ────────────────────────── 版面目录 ────────────────────────── */

export const CHARACTER_SHEET_KINDS: CharacterSheetKindDef[] = [
  {
    id: 'turnaround',
    label: '三视图',
    hint: '正面 / 3-4 侧 / 侧面 / 背面 四视角，同一角色同一服装',
    rows: 1,
    cols: 4,
    cellCount: 4,
  },
  {
    id: 'expression',
    label: '表情表',
    hint: '10 种表情，同一角色同一服装',
    rows: 2,
    cols: 5,
    cellCount: 10,
  },
  {
    id: 'pose',
    label: '动作表',
    hint: '5 种动作，全身入画，同一角色同一服装',
    rows: 1,
    cols: 5,
    cellCount: 5,
  },
  {
    id: 'full',
    label: '全套设定表',
    hint: '三视图 + 表情 + 动作 整套版面',
    rows: 4,
    cols: 5,
    cellCount: 19,
  },
];

export const CHARACTER_SHEET_SECTION_LABELS: Record<CharacterSheetSectionId, string> = {
  turnaround: '三视图',
  expression: '表情',
  pose: '动作',
};

export function isCharacterSheetKind(value: unknown): value is CharacterSheetKind {
  return typeof value === 'string' && CHARACTER_SHEET_KINDS.some((k) => k.id === value);
}

/** 从节点 data 读版面类型（非法值回落三视图） */
export function readCharacterSheetKind(value: unknown): CharacterSheetKind {
  return isCharacterSheetKind(value) ? value : 'turnaround';
}

export function lookupCharacterSheetKindDef(kind: string | undefined): CharacterSheetKindDef {
  return CHARACTER_SHEET_KINDS.find((k) => k.id === kind) ?? CHARACTER_SHEET_KINDS[0]!;
}

/* ────────────────────────── 一致性强度 ────────────────────────── */

export interface CharacterSheetConsistencyDef {
  id: CharacterSheetConsistencyLevel;
  label: string;
  hint: string;
  /** 图生图强度：越低越贴参考图（0–1） */
  strength: number;
  zhClause: string;
  enClause: string;
}

export const CHARACTER_SHEET_CONSISTENCY_LEVELS: CharacterSheetConsistencyDef[] = [
  {
    id: 'loose',
    label: '宽松',
    hint: '允许角度 / 表情 / 姿态自然变化，外观可能有轻微漂移',
    strength: 0.82,
    zhClause: '允许姿态与表情自然调整，但角色身份、发色与服装主色不得改变',
    enClause:
      'pose and expression may vary naturally, but the character identity, hair color and main outfit colors must not change',
  },
  {
    id: 'standard',
    label: '标准',
    hint: '默认：同一角色，允许本格指定的表情与动作变化',
    strength: 0.72,
    zhClause:
      '角色身份、发型、服装与画风逐格保持一致，仅本格指定的视角 / 表情 / 动作发生变化',
    enClause:
      "keep character identity, hairstyle, wardrobe and art style identical in every cell; only this cell's specified view, expression or action changes",
  },
  {
    id: 'strict',
    label: '严格',
    hint: '最贴参考图：外观与服装几乎不变，只改视角与表情',
    strength: 0.58,
    zhClause:
      '严格复刻参考图的角色设计，外观、服装与配色不得有任何改动，仅本格指定的视角 / 表情 / 动作发生变化',
    enClause:
      "strictly replicate the character design of the reference image; no change to appearance, wardrobe or palette at all; only this cell's specified view, expression or action changes",
  },
];

export function isCharacterSheetConsistencyLevel(
  value: unknown,
): value is CharacterSheetConsistencyLevel {
  return (
    typeof value === 'string' && CHARACTER_SHEET_CONSISTENCY_LEVELS.some((l) => l.id === value)
  );
}

/** 从节点 data 读一致性档位（非法值回落标准档） */
export function readCharacterSheetConsistency(value: unknown): CharacterSheetConsistencyLevel {
  return isCharacterSheetConsistencyLevel(value) ? value : 'standard';
}

export function lookupCharacterSheetConsistency(
  level: string | undefined,
): CharacterSheetConsistencyDef {
  return (
    CHARACTER_SHEET_CONSISTENCY_LEVELS.find((l) => l.id === level) ??
    CHARACTER_SHEET_CONSISTENCY_LEVELS[1]!
  );
}

/* ────────────────────────── 一致性锁定短语 ────────────────────────── */

function joinZh(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join('；');
}

/**
 * 角色设定 → 一致性锁定短语（英文，逐格复述）。
 *
 * 复用既有 buildCharacterConsistencyPrompt（Character Bible 六层 + 角色档案 + 固定美术方向），
 * 再叠加本节点特有的服装 / 画风 / 参考图描述层；未给出的项不编造。
 *
 * 命名说明：barrel（index.ts）已导出同名能力的 buildCharacterConsistencyPrompt，
 * 为不改动既有导出，本函数取后缀名 buildCharacterSheet*ConsistencyPrompt。
 */
export function buildCharacterSheetConsistencyPrompt(subject: CharacterSheetSubject = {}): string {
  const base = buildCharacterConsistencyPrompt({
    characterName: subject.name,
    profile: {
      distinctiveFeatures: subject.appearanceZh,
      occupation: subject.occupationZh,
      personality: subject.personalityZh,
    },
    palette: subject.paletteZh,
    forbiddenTraits: subject.forbiddenTraits,
    bible: subject.bible,
  });
  const extra: string[] = [];
  if (subject.outfitZh?.trim()) extra.push(`locked wardrobe: ${subject.outfitZh.trim()}`);
  if (subject.styleZh?.trim()) extra.push(`locked art style: ${subject.styleZh.trim()}`);
  if (subject.referenceNoteZh?.trim()) {
    extra.push(`match the reference description: ${subject.referenceNoteZh.trim()}`);
  }
  return [base, ...extra].join(', ');
}

/** 一致性锁定摘要（中文，逐格复述 + 面板展示）；缺项如实标注，不编造 */
export function buildCharacterSheetConsistencySummaryZh(
  subject: CharacterSheetSubject = {},
): string {
  const name = subject.name?.trim() || '未具名角色';
  const detail = joinZh([
    subject.appearanceZh ? `外观 ${subject.appearanceZh.trim()}` : '',
    subject.outfitZh ? `服装 ${subject.outfitZh.trim()}` : '',
    subject.styleZh ? `画风 ${subject.styleZh.trim()}` : '',
    subject.paletteZh ? `配色 ${subject.paletteZh.trim()}` : '',
  ]);
  const reference = subject.referenceNoteZh?.trim()
    ? `参考图描述 ${subject.referenceNoteZh.trim()}`
    : '';
  const tail = joinZh([detail, reference]);
  return tail ? `${name}（${tail}）` : `${name}（未提供外观 / 服装 / 画风描述）`;
}

/** 角色信息缺失 / 无从锁定的一致性告警（不编造，也不静默） */
export function collectCharacterSheetSubjectWarnings(
  subject: CharacterSheetSubject = {},
  sourceRef = '',
): string[] {
  const warnings: string[] = [];
  if (!subject.name?.trim()) {
    warnings.push('未指定角色名：一致性锁定短语将使用通用称呼「角色」，建议先在素材库完善角色名。');
  }
  const hasAppearance = Boolean(subject.appearanceZh?.trim() || subject.referenceNoteZh?.trim());
  if (!hasAppearance) {
    warnings.push(
      '缺少角色外观描述：各格之间的角色一致性只由通用短语保证，建议补齐外观 / 识别特征后再出图。',
    );
  }
  if (!subject.outfitZh?.trim()) {
    warnings.push('未提供服装 / 造型描述：逐格的服装一致性无法锁定。');
  }
  if (!(sourceRef || subject.referenceImageUrl)?.trim()) {
    warnings.push(
      '未提供参考图：本次为纯文字设定表，图生图参考不可用，一致性仅由文字锁定短语约束。',
    );
  }
  return warnings;
}

/* ────────────────────────── 角色 → 设定表输入 ────────────────────────── */

function summarizeAppearanceDetails(profile: CharacterProfile): string {
  const details = profile.creative?.appearanceDetails;
  if (!details) return '';
  return joinZh([
    details.skinTone ? `肤色 ${details.skinTone}` : '',
    details.hairColor ? `发色 ${details.hairColor}` : '',
    details.eyeColor ? `瞳色 ${details.eyeColor}` : '',
    details.specialMarks ? `特殊标记 ${details.specialMarks}` : '',
    details.tattoos ? `纹身 ${details.tattoos}` : '',
    details.scars ? `疤痕 ${details.scars}` : '',
    details.accessories ? `配饰 ${details.accessories}` : '',
  ]);
}

/** 素材库角色档案 → 设定表输入（复用既有 CharacterProfile / CharacterBible 存量） */
export function characterSheetSubjectFromProfile(
  profile: CharacterProfile,
): CharacterSheetSubject {
  const bible: CharacterBible | undefined = profile.bible;
  const creative = profile.creative;
  const appearanceZh = joinZh([
    bible?.appearance,
    profile.descriptionZh,
    summarizeAppearanceDetails(profile),
    creative?.bodyType,
  ]);
  const outfitZh = joinZh([creative?.costumeLabel, creative?.costumePrompt]);
  const referenceImageUrl =
    profile.referenceImageUrl?.trim() ||
    creative?.fullSheetUrl?.trim() ||
    creative?.frontViewUrl?.trim() ||
    creative?.referenceUrls?.find((u) => u.trim())?.trim() ||
    '';
  return {
    characterId: profile.id,
    name: profile.name,
    appearanceZh,
    outfitZh,
    styleZh: creative?.styleKeywords?.trim() || '',
    occupationZh: creative?.occupation?.trim() || bible?.identity,
    personalityZh: creative?.personalityText?.trim() || bible?.personality,
    bible,
    referenceImageUrl,
  };
}

/* ────────────────────────── 分区格规格 ────────────────────────── */

interface SectionCellSpec {
  section: CharacterSheetSectionId;
  role: string;
  angleId?: string;
  angleLabel?: string;
  expressionId?: string;
  expressionLabel?: string;
  poseId?: string;
  poseLabel?: string;
  viewZh: string;
  viewEn: string;
}

/** 三视图四视角：id 取自既有角度预设（正 / 3-4 侧 / 侧 / 背） */
export const TURNAROUND_ANGLE_IDS = ['front', 'three-quarter', 'side', 'back'] as const;

interface SectionBuildResult {
  specs: SectionCellSpec[];
  warningsZh: string[];
}

export function buildTurnaroundSpecs(): SectionBuildResult {
  const warningsZh: string[] = [];
  const specs: SectionCellSpec[] = [];
  for (const id of TURNAROUND_ANGLE_IDS) {
    const preset = ANGLE_PRESETS.find((p) => p.id === id);
    if (!preset) {
      warningsZh.push(`既有角度预设缺少「${id}」：三视图视角数不足，已按可用角度出表。`);
      continue;
    }
    specs.push({
      section: 'turnaround',
      role: `${CHARACTER_SHEET_SECTION_LABELS.turnaround} · ${preset.label}`,
      angleId: preset.id,
      angleLabel: preset.label,
      viewZh:
        `视角：${preset.label}（${preset.prompt}）。保持同一角色、同一服装、同一光照与同一素色背景，` +
        '本格只把视角转到该角度；全身入画，身高与头身比例与相邻视角一致，便于逐视角对照。',
      viewEn:
        `${preset.prompt}; full body in frame, identical lighting and plain background; ` +
        'keep the same height and body proportions across all views so the cells can be compared side by side.',
    });
  }
  if (specs.length === 0) {
    warningsZh.push('既有角度预设全部缺失：三视图没有可用的视角，版面为空。');
  }
  return { specs, warningsZh };
}

export function buildExpressionSpecs(): SectionBuildResult {
  const specs: SectionCellSpec[] = CHARACTER_EXPRESSION_PRESETS.map((preset) => ({
    section: 'expression' as const,
    role: `${CHARACTER_SHEET_SECTION_LABELS.expression} · ${preset.label}`,
    expressionId: preset.id,
    expressionLabel: preset.label,
    viewZh:
      `表情：${preset.label}（${preset.tags}）。保持角色外观与服装不变，只改面部表情；` +
      '胸部以上景别、正面平视，同一光照与背景。',
    viewEn:
      `facial expression: ${preset.tags}; chest-up framing, front eye-level view, identical lighting and background; ` +
      'keep the character design and wardrobe unchanged.',
  }));
  const warningsZh =
    specs.length === 0 ? ['既有角色表情预设为空：表情表没有可用的表情，版面为空。'] : [];
  return { specs, warningsZh };
}

export function buildPoseSpecs(): SectionBuildResult {
  const specs: SectionCellSpec[] = CHARACTER_SHEET_POSE_PRESETS.map((preset) => ({
    section: 'pose' as const,
    role: `${CHARACTER_SHEET_SECTION_LABELS.pose} · ${preset.label}`,
    poseId: preset.id,
    poseLabel: preset.label,
    viewZh:
      `动作：${preset.label}（${preset.tags}）。保持角色外观与服装不变，只改整体动作；` +
      '全身入画，同一光照与背景。',
    viewEn:
      `full-body action: ${preset.tags}; full body in frame, identical lighting and background; ` +
      'keep the character design and wardrobe unchanged.',
  }));
  const warningsZh =
    specs.length === 0 ? ['既有角色设定动作预设为空：动作表没有可用的动作，版面为空。'] : [];
  return { specs, warningsZh };
}

function specsForKind(kind: CharacterSheetKind): SectionBuildResult {
  switch (kind) {
    case 'turnaround':
      return buildTurnaroundSpecs();
    case 'expression':
      return buildExpressionSpecs();
    case 'pose':
      return buildPoseSpecs();
    case 'full': {
      const parts = [buildTurnaroundSpecs(), buildExpressionSpecs(), buildPoseSpecs()];
      return {
        specs: parts.flatMap((p) => p.specs),
        warningsZh: parts.flatMap((p) => p.warningsZh),
      };
    }
    default:
      return { specs: [], warningsZh: [`未知角色设定表版面：${String(kind)}，版面为空。`] };
  }
}

/* ────────────────────────── 计划构造 ────────────────────────── */

const DEFAULT_ASPECT: Record<CharacterSheetKind, string> = {
  turnaround: '3:4',
  expression: '1:1',
  pose: '3:4',
  full: '3:4',
};

function readPositiveInt(value: unknown): number | undefined {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}

function describeSectionOrder(specs: SectionCellSpec[]): string {
  const counts = new Map<CharacterSheetSectionId, number>();
  for (const spec of specs) counts.set(spec.section, (counts.get(spec.section) ?? 0) + 1);
  return [...counts.entries()]
    .map(([section, count]) => `${CHARACTER_SHEET_SECTION_LABELS[section]} ${count} 格`)
    .join(' → ');
}

/**
 * 构造角色设定表计划。
 *
 * - 全部单元格按「三视图 → 表情 → 动作」顺序行优先铺入 rows × cols；
 * - 行列给定时必须容得下全部格，否则忽略覆盖并写入告警（不抛异常）；
 * - 角色信息缺失时写入告警，仍然产出可编辑的版面（不编造角色设定）。
 */
export function buildCharacterSheetPlan(
  kind: CharacterSheetKind,
  options: CharacterSheetPlanOptions = {},
): CharacterSheetPlan {
  const def = lookupCharacterSheetKindDef(kind);
  const subject = options.subject ?? {};
  const warningsZh: string[] = [];

  if (def.id !== kind) {
    warningsZh.push(`未知角色设定表版面「${String(kind)}」：已回落为${def.label}。`);
  }

  const { specs, warningsZh: specWarningsZh } = specsForKind(def.id);
  warningsZh.push(...specWarningsZh);
  const cellCount = specs.length;

  const sourceRef = (options.sourceRef?.trim() || subject.referenceImageUrl?.trim() || '').trim();
  warningsZh.push(...collectCharacterSheetSubjectWarnings(subject, sourceRef));

  const consistency = lookupCharacterSheetConsistency(
    readCharacterSheetConsistency(options.consistency),
  );
  const consistencyLock = buildCharacterSheetConsistencyPrompt(subject);
  const consistencySummaryZh = buildCharacterSheetConsistencySummaryZh(subject);

  const aspectRatio = (options.aspectRatio ?? DEFAULT_ASPECT[def.id]).trim() || DEFAULT_ASPECT[def.id];
  const styleNoteZh = (options.styleNoteZh ?? '').trim();
  const extraNegative = (options.extraNegative ?? '').trim();
  const negativePrompt = [CHARACTER_SHEET_DEFAULT_NEGATIVE, extraNegative]
    .filter(Boolean)
    .join(', ');

  /* 行列：给定时须容得下全部格，否则回落默认几何并告警 */
  let rows = def.rows;
  let cols = def.cols;
  const overrideRows = readPositiveInt(options.rows);
  const overrideCols = readPositiveInt(options.cols);
  if (overrideRows !== undefined && overrideCols !== undefined) {
    if (overrideRows * overrideCols >= cellCount) {
      rows = overrideRows;
      cols = overrideCols;
    } else {
      warningsZh.push(
        `给定版面 ${overrideRows}×${overrideCols} 容不下 ${cellCount} 格：已改用 ${def.rows}×${def.cols}。`,
      );
    }
  }
  if (cellCount > 0 && rows * cols < cellCount) {
    rows = Math.ceil(cellCount / cols);
  }

  const cells: CharacterSheetCell[] = specs.map((spec, index) => {
    const row = cols > 0 ? Math.floor(index / cols) : 0;
    const col = cols > 0 ? index % cols : index;
    const positionZh = `第 ${index + 1} 格 / 共 ${cellCount} 格（第 ${row + 1} 行第 ${col + 1} 列）`;
    const imagePromptZh = [
      `${def.label} · ${spec.role}，${positionZh}。`,
      `一致性锁定：${consistencySummaryZh}。`,
      `${consistency.zhClause}。`,
      `${spec.viewZh}`,
      styleNoteZh ? `画风补充：${styleNoteZh}。` : '',
    ].join('');
    const imagePrompt = [
      `NX9 character sheet, ${def.label} — ${spec.role} (cell ${index + 1} of ${cellCount}, row ${row + 1}, column ${col + 1}).`,
      `${spec.viewEn}`,
      `${consistency.enClause}.`,
      `${consistencyLock}.`,
      styleNoteZh ? `Additional style note (Chinese, keep the meaning): ${styleNoteZh}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
    return {
      cellIndex: index,
      row,
      col,
      role: spec.role,
      section: spec.section,
      ...(spec.angleId ? { angleId: spec.angleId } : {}),
      ...(spec.angleLabel ? { angleLabel: spec.angleLabel } : {}),
      ...(spec.expressionId ? { expressionId: spec.expressionId } : {}),
      ...(spec.expressionLabel ? { expressionLabel: spec.expressionLabel } : {}),
      ...(spec.poseId ? { poseId: spec.poseId } : {}),
      ...(spec.poseLabel ? { poseLabel: spec.poseLabel } : {}),
      imagePromptZh,
      imagePrompt,
      negativePrompt,
      reuseSourceImage: false,
      needsEndFrame: false,
      endFramePromptZh: '',
      endFramePrompt: '',
    };
  });

  const notesZh = [
    `${def.label}：${cellCount} 格行优先排入 ${rows}×${cols} 版面（${describeSectionOrder(specs) || '无可用格'}）。`,
    `逐格复述同一段一致性锁定短语（${consistency.label}档 · 图生图强度 ${consistency.strength}），保证换角度、换表情、换动作不换人。`,
    sourceRef
      ? '本批以参考图作为图生图基准，逐格沿用同一参考。'
      : '本次未提供参考图：一致性仅由文字锁定短语约束，建议先在素材库补角色参考图。',
    '表情、动作、角度标签全部取自既有预设，未新增词汇表。',
  ].join('');

  return {
    kind: def.id,
    rows,
    cols,
    aspectRatio,
    sourceRef,
    cells,
    notesZh,
    consistencyLock,
    consistencySummaryZh,
    consistency: consistency.id,
    consistencyStrength: consistency.strength,
    warningsZh,
  };
}

/* ────────────────────────── 下游兼容转换 ────────────────────────── */

/** 单格视频提示词（立绘微动，与图提示词分离；下游 clip-gen 直接消费） */
export function buildCharacterSheetCellVideoPrompt(
  cell: CharacterSheetCell,
  planKind?: CharacterSheetKind,
): { videoPromptZh: string; videoPrompt: string } {
  const kindLabel = planKind ? lookupCharacterSheetKindDef(planKind).label : '角色设定表';
  return {
    videoPromptZh:
      `${kindLabel} · ${cell.role}：可用于立绘微动（呼吸 / 发丝 / 轻微转头），${CHARACTER_SHEET_CLIP_SEC} 秒；` +
      '角色设定与参考图保持一致，不改服装与画风。',
    videoPrompt:
      `Character sheet still "${cell.role}": subtle idle motion (breathing, hair sway, slight head turn), ${CHARACTER_SHEET_CLIP_SEC} seconds; ` +
      'character design consistent with the reference, no wardrobe or style change.',
  };
}

function cellImageUrlFor(
  cell: CharacterSheetCell,
  plan: CharacterSheetPlan,
  imageUrls: (string | undefined)[],
): string {
  if (cell.reuseSourceImage) return plan.sourceRef;
  return (imageUrls[cell.cellIndex] ?? '').trim();
}

/** 计划 → GridCellPrompt[]（复用既有宫格数据契约，供下游消费） */
export function characterSheetPlanToGridCells(
  plan: CharacterSheetPlan,
  imageUrls: (string | undefined)[] = [],
): GridCellPrompt[] {
  return plan.cells.map((cell) => {
    const video = buildCharacterSheetCellVideoPrompt(cell, plan.kind);
    return {
      index: cell.cellIndex,
      row: cell.row,
      col: cell.col,
      cellImageUrl: cellImageUrlFor(cell, plan, imageUrls),
      imagePrompt: cell.imagePrompt,
      imagePromptZh: cell.imagePromptZh,
      needsEndFrame: false,
      endFramePrompt: '',
      endFramePromptZh: '',
      endFrameReason: undefined,
      videoPrompt: video.videoPrompt,
      videoPromptZh: video.videoPromptZh,
    };
  });
}

/**
 * 计划 + 每格出图 URL → 宫格结果。
 * 结构与 GridReversePromptsResult 兼容，`ok` 反映是否拿到可用图。
 */
export function characterSheetPlanToGridResult(
  plan: CharacterSheetPlan,
  imageUrls: (string | undefined)[] = [],
  message?: string,
): GridReversePromptsResult {
  const cells = characterSheetPlanToGridCells(plan, imageUrls);
  const splitUrls = plan.cells
    .map((cell, i) => cellImageUrlFor(cell, plan, imageUrls) || (imageUrls[i] ?? '').trim())
    .filter((url) => url.length > 0);
  return {
    ok: splitUrls.length > 0,
    rows: plan.rows,
    cols: plan.cols,
    sourceUrl: plan.sourceRef,
    splitUrls,
    cells,
    message,
  };
}
