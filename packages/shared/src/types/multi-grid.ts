/**
 * 多格推演（multi-grid）数据契约。
 *
 * 三种语义：
 * - `multi-cam-9` / `multi-cam-25`：多机位宫格关键帧（方位 × 景别矩阵）
 * - `story-predict-4`：剧情推演四宫格（起因 → 冲突 → 转折 → 收束/钩子）
 * - `frame-predict`：画面推演（N 秒前 / 当前 / M 秒后）
 *
 * 与既有宫格数据结构（GridCellPrompt / GridReversePromptsResult）兼容：
 * 本文件的计划经 utils/multi-grid-plan 转换为 GridCellPrompt，供下游
 * clip-gen / grid-compose 直接消费。全部字段可 JSON 序列化。
 */

export type MultiGridMode =
  | 'multi-cam-9'
  | 'multi-cam-25'
  | 'story-predict-4'
  | 'frame-predict';

/** 单格推演内容 */
export interface MultiGridCell {
  /** 0 起的格序号（行优先） */
  cellIndex: number;
  row: number;
  col: number;
  /** 该格语义标签，如「左前 45° · 中景」「转折」「3 秒后」 */
  role: string;
  imagePromptZh: string;
  imagePrompt: string;
  negativePrompt?: string;
  /** 机位方位标签（多机位模式），如「左前 45°」 */
  cameraAngleLabel?: string;
  /** 景别标签，如「中景」 */
  shotSizeLabel?: string;
  /** 时间偏移秒数；仅画面推演使用（负数为过去） */
  timeOffsetSec?: number;
  /** 建议机位坐标提示（相对主体，单位米）；非对源图的测量结论 */
  cameraPositionHint?: string;
  /** 建议等效焦距（毫米） */
  focalLengthMm?: number;
  /** 建议机位高度（米） */
  cameraHeightM?: number;
  /** 该格直接复用源图，不重新出图（画面推演「当前」格） */
  reuseSourceImage?: boolean;
  /** 用户在面板中改写过提示词（中英同源，出图按改写后的文本发送） */
  promptEdited?: boolean;
  needsEndFrame: boolean;
  endFramePromptZh: string;
  endFramePrompt: string;
}

/** 一次推演的完整生成计划（纯数据，可序列化 / 可编辑回写） */
export interface MultiGridPlan {
  mode: MultiGridMode;
  rows: number;
  cols: number;
  /** 出图宽高比 */
  aspectRatio: string;
  sourceUrl: string;
  cells: MultiGridCell[];
  /** 计划说明（含「建议值非实测」的口径声明） */
  notesZh: string;
}

/** 多机位宫格选项（9 格 = 3×3，25 格 = 5×5） */
export interface MultiCamPlanOptions {
  rows?: number;
  cols?: number;
  /** 等效焦距区间（毫米），默认 [18, 100] */
  focalRange?: [number, number];
  subjectZh?: string;
  subjectEn?: string;
  aspectRatio?: string;
}

/** 剧情推演节拍：可只给中文；给英文时中英提示词同步 */
export type StoryBeatInput = string | { zh: string; en?: string };

export interface StoryPredictPlanOptions {
  /** 最多 4 条节拍，缺省部分用内置节拍补齐 */
  beats?: StoryBeatInput[];
  /** 剧情方向（中文），写入各格节拍说明 */
  direction?: string;
  directionEn?: string;
  aspectRatio?: string;
}

export interface FramePredictPlanOptions {
  /** 当前帧之前推演秒数，默认 5 */
  beforeSec?: number;
  /** 当前帧之后推演秒数，默认 3 */
  afterSec?: number;
  motionZh?: string;
  motionEn?: string;
  aspectRatio?: string;
}

/** buildMultiGridPlan 的统一选项（按 mode 取用对应子集） */
export interface MultiGridPlanOptions
  extends MultiCamPlanOptions,
    StoryPredictPlanOptions,
    FramePredictPlanOptions {}

/** 模式元数据（UI 芯片 / 默认几何） */
export interface MultiGridModeDef {
  id: MultiGridMode;
  label: string;
  hint: string;
  rows: number;
  cols: number;
  cellCount: number;
}
