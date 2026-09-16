/**
 * 角色设定表 / 三视图数据契约。
 *
 * 四种版面语义：
 * - `turnaround`：三视图四视角（正面 / 3-4 侧 / 侧面 / 背面）
 * - `expression`：表情表（取既有角色设定表情预设）
 * - `pose`：动作表（取既有角色设定动作预设）
 * - `full`：三视图 + 表情 + 动作的整套设定表版面（行列自算）
 *
 * 与既有宫格数据结构（GridCellPrompt / GridReversePromptsResult）兼容：
 * 本文件的计划经 utils/character-sheet-plan 转换为 GridCellPrompt，
 * 供 clip-gen / grid-compose 等下游直接消费。全部字段可 JSON 序列化。
 *
 * 口径：本文件只描述 NX9 自身能力，不引入任何运行时依赖。
 */
import type { CharacterBible } from './character';

export type CharacterSheetKind = 'turnaround' | 'expression' | 'pose' | 'full';

/** 一致性强度档位：越高越贴参考图，留给表情 / 姿态的变化空间越小 */
export type CharacterSheetConsistencyLevel = 'loose' | 'standard' | 'strict';

/** 版面分区：三视图 / 表情 / 动作 */
export type CharacterSheetSectionId = 'turnaround' | 'expression' | 'pose';

/**
 * 单格设定表内容。
 * `row` / `col` 由总格数与列数行优先自算，`cellIndex` 与数组下标严格对齐。
 */
export interface CharacterSheetCell {
  /** 0 起的格序号（行优先） */
  cellIndex: number;
  row: number;
  col: number;
  /** 该格语义标签，如「三视图 · 正面」「表情 · 平静」「动作 · 战斗」 */
  role: string;
  /** 该格所属分区 */
  section: CharacterSheetSectionId;
  /** 三视图：角度 id（取自既有角度预设） */
  angleId?: string;
  /** 三视图：角度标签，如「正面」 */
  angleLabel?: string;
  /** 表情表：表情 id（取自既有角色表情预设） */
  expressionId?: string;
  /** 表情表：表情标签，如「平静」 */
  expressionLabel?: string;
  /** 动作表：动作 id（取自既有角色设定动作预设） */
  poseId?: string;
  /** 动作表：动作标签，如「站立」 */
  poseLabel?: string;
  imagePromptZh: string;
  imagePrompt: string;
  negativePrompt?: string;
  /** 该格直接复用参考图，不重新出图 */
  reuseSourceImage: boolean;
  /** 用户在面板中改写过提示词（中英同源，出图按改写后的文本发送） */
  promptEdited?: boolean;
  needsEndFrame: boolean;
  endFramePromptZh: string;
  endFramePrompt: string;
}

/**
 * 角色一致性输入：把「角色是谁」压成一段可复述的锁定短语。
 * 字段全部可选 —— 缺失时由构造器给出告警，不编造设定。
 */
export interface CharacterSheetSubject {
  /** 角色 id（登记回素材库时用于定位既有角色） */
  characterId?: string;
  /** 角色名 */
  name?: string;
  /** 外观 / 识别特征（一致性最关键锚点） */
  appearanceZh?: string;
  /** 服装 / 造型 */
  outfitZh?: string;
  /** 画风 / 渲染风格 */
  styleZh?: string;
  /** 配色 */
  paletteZh?: string;
  /** 职业 / 身份 */
  occupationZh?: string;
  /** 性格（影响表情与体态） */
  personalityZh?: string;
  /** 禁止出现的特征 */
  forbiddenTraits?: string;
  /** 无参考图时的文字参考描述 */
  referenceNoteZh?: string;
  /** 参考图 URL（作为图生图参考） */
  referenceImageUrl?: string;
  /** Character Bible 六层锚点（复用既有结构） */
  bible?: CharacterBible;
}

/** buildCharacterSheetPlan 的选项（按 kind 取用对应子集） */
export interface CharacterSheetPlanOptions {
  /** 角色设定 */
  subject?: CharacterSheetSubject;
  /** 参考图 URL（上游图 / 角色参考图）；缺省时取 subject.referenceImageUrl */
  sourceRef?: string;
  /** 版面行数覆盖（不足容纳全部格时忽略并告警，不抛异常） */
  rows?: number;
  /** 版面列数覆盖（同上） */
  cols?: number;
  /** 单格出图宽高比 */
  aspectRatio?: string;
  /** 一致性强度档位 */
  consistency?: CharacterSheetConsistencyLevel;
  /** 节点级附加负面提示词（叠加到每格） */
  extraNegative?: string;
  /** 画风补充说明（中文，写入每格风格层） */
  styleNoteZh?: string;
}

/** 一次角色设定表的完整生成计划（纯数据，可序列化 / 可编辑回写） */
export interface CharacterSheetPlan {
  kind: CharacterSheetKind;
  rows: number;
  cols: number;
  /** 单格出图宽高比 */
  aspectRatio: string;
  /** 参考图 / 上游图；无参考图时为空串（不编造） */
  sourceRef: string;
  cells: CharacterSheetCell[];
  /** 计划说明（含版面顺序与「无参考图」口径声明） */
  notesZh: string;
  /** 一致性锁定短语（英文，逐格复述，保证换角度不换人） */
  consistencyLock: string;
  /** 一致性锁定摘要（中文，面板展示） */
  consistencySummaryZh: string;
  /** 一致性强度档位 */
  consistency: CharacterSheetConsistencyLevel;
  /** 图生图强度（0–1，随 consistency 档位给出；按此值出图） */
  consistencyStrength: number;
  /** 角色信息缺失 / 版面覆盖被忽略等告警（不编造，也不静默） */
  warningsZh: string[];
}

/** 版面元数据（UI 芯片 / 默认几何） */
export interface CharacterSheetKindDef {
  id: CharacterSheetKind;
  label: string;
  hint: string;
  rows: number;
  cols: number;
  cellCount: number;
}
