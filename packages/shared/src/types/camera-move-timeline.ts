/**
 * NX9「运镜时间轴编排」—— 数据结构定义（纯类型 + 常量，无副作用、可序列化）。
 *
 * 定位：把 `data/camera-move-library.ts` 的 56 条运镜按**时间**串成一条运动轨，
 * 每个片段（segment）占用镜头时长里的一段区间，并带幅度 / 缓动 / 速度曲线。
 * 本模块只描述数据结构，不做任何推理计算；所有变换见
 * `utils/camera-move-timeline.ts`。
 *
 * 诚实约定：
 * - 时间单位统一为**秒**，`startT`/`endT` 是相对镜头起点的偏移；
 * - `durationHintSec`（词库）是经验区间，本模块**不**用它当硬数值，
 *   只在 `moveTimelineFromShotDuration` 里作为「相对权重」的兜底参考；
 * - `amplitude` 是相对幅度倍数（1 = 词条默认强度），不是物理量；
 * - 时间轴本身是可选的会话级编排产物，落库只写既有提示词字段（见文档）。
 */

/** 缓动曲线：作用于段内进度 0..1 */
export type CameraMoveEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/** 速度曲线：在缓动之上叠加的「先慢后快 / 先快后慢 / 匀速」意图，仅用于描述与幅度调制 */
export type CameraMoveSpeedRamp = 'accelerate' | 'decelerate' | 'steady';

/** 时间轴里的一个运镜片段 */
export interface CameraMoveSegment {
  /** 片段稳定 id（同一时间轴内唯一；缺失时由 normalize 补齐） */
  id: string;
  /** 指向 `CAMERA_MOVE_LIBRARY` 的 id；未知 id 由 validate 报 `unknown-move` */
  moveId: string;
  /** 片段起点（秒） */
  startT: number;
  /** 片段终点（秒） */
  endT: number;
  /** 相对幅度倍数，默认 1；建议区间 0.05~4 */
  amplitude?: number;
  /** 缓动曲线，默认 'linear' */
  easing?: CameraMoveEasing;
  /** 速度曲线，默认 'steady' */
  speedRamp?: CameraMoveSpeedRamp;
  /** 编排备注（中文，给分镜表/审阅看，不参与提示词） */
  noteZh?: string;
}

/** 一条完整的运镜运动轨 */
export interface CameraMoveTimeline {
  /** 结构版本号；当前固定 1 */
  version: number;
  /** 镜头总时长（秒） */
  durationSec: number;
  /** 按 startT 升序排列的片段 */
  segments: CameraMoveSegment[];
  /** 是否按节拍对齐（仅标记编排意图，不影响采样数学） */
  beatAligned?: boolean;
}

/** 结构版本常量 */
export const CAMERA_MOVE_TIMELINE_VERSION = 1;

/** 合法的缓动值（供 UI 下拉与校验共用） */
export const CAMERA_MOVE_EASINGS: CameraMoveEasing[] = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
];

/** 合法的速度曲线值 */
export const CAMERA_MOVE_SPEED_RAMPS: CameraMoveSpeedRamp[] = [
  'accelerate',
  'decelerate',
  'steady',
];

/** 缓动中文标签（UI 展示用） */
export const CAMERA_MOVE_EASING_LABELS: Record<CameraMoveEasing, string> = {
  linear: '匀速',
  'ease-in': '渐入',
  'ease-out': '渐出',
  'ease-in-out': '缓入缓出',
};

/** 速度曲线中文标签（UI 展示用） */
export const CAMERA_MOVE_SPEED_RAMP_LABELS: Record<CameraMoveSpeedRamp, string> = {
  accelerate: '加速',
  decelerate: '减速',
  steady: '匀速',
};

/** 幅度建议区间；normalize 只做钳制并在超出时给出提示，不做静默改写语义 */
export const CAMERA_MOVE_AMPLITUDE_MIN = 0.05;
export const CAMERA_MOVE_AMPLITUDE_MAX = 4;
export const CAMERA_MOVE_AMPLITUDE_DEFAULT = 1;

/** 时间轴问题的严重度 */
export type CameraMoveTimelineIssueSeverity = 'error' | 'warning';

/** 时间轴问题码（结构化校验结果，不抛异常） */
export type CameraMoveTimelineIssueCode =
  /** durationSec 非有限数或 <= 0 */
  | 'invalid-duration'
  /** segments 为空 */
  | 'empty'
  /** startT / endT 非有限数 */
  | 'invalid-time'
  /** startT < 0 */
  | 'negative-start'
  /** endT > durationSec */
  | 'out-of-range'
  /** endT <= startT */
  | 'zero-duration'
  /** moveId 不在运镜词库 */
  | 'unknown-move'
  /** 同一时间轴内 id 重复 */
  | 'duplicate-id'
  /** 与前一段区间重叠 */
  | 'overlap'
  /** 未按 startT 升序排列 */
  | 'unsorted'
  /** amplitude 非正数或超出建议区间 */
  | 'invalid-amplitude'
  /** 片段之间留有空隙（不致命，仅提示） */
  | 'gap'
  /** 首段未从 0 开始 / 末段未覆盖到 durationSec（仅提示） */
  | 'uncovered';

/** 一条结构化问题描述 */
export interface CameraMoveTimelineIssue {
  code: CameraMoveTimelineIssueCode;
  severity: CameraMoveTimelineIssueSeverity;
  /** 命中的片段 id（与时间轴整体相关时为 null） */
  segmentId: string | null;
  /** 中文说明（可直接展示给用户） */
  messageZh: string;
}

/** 校验结果汇总 */
export interface CameraMoveTimelineValidation {
  ok: boolean;
  /** error 级问题（ok=false 时必然非空） */
  errors: CameraMoveTimelineIssue[];
  /** warning 级问题（不阻塞使用） */
  warnings: CameraMoveTimelineIssue[];
  /** 全部问题（errors 在前） */
  issues: CameraMoveTimelineIssue[];
}

/** 采样结果：某个时刻的运动状态 */
export interface CameraMoveTimelineSample {
  /** 实际用于计算的时刻（已钳制到 [0, durationSec]） */
  t: number;
  /** 是否发生过钳制（t 入参越界） */
  clamped: boolean;
  /** 命中的片段；落在空隙 / 空时间轴时为 null */
  segment: CameraMoveSegment | null;
  /** 命中片段的 moveId；无命中为 null */
  moveId: string | null;
  /** 段内线性进度 0..1（无命中为 0） */
  linearProgress: number;
  /** 段内进度 0..1（已应用 easing 与 speedRamp） */
  progress: number;
  /** 整体进度 0..1 */
  overallProgress: number;
  /** 当前生效幅度倍数（空隙按 0 计） */
  amplitude: number;
  /** 是否落在两段之间的空隙 */
  inGap: boolean;
  /** 中文组合运动描述（已执行段 → 当前段(进度) → 待执行段） */
  composedZh: string;
  /** 英文组合运动描述 */
  composedEn: string;
}

/** 组合提示词里的单个片段 */
export interface ComposedMovePromptPart {
  segmentId: string;
  moveId: string;
  /** 词库中文名（拿不到未知 id 时回落为 moveId 本身） */
  labelZh: string;
  /** 词库英文名 */
  labelEn: string;
  startT: number;
  endT: number;
  durationSec: number;
  amplitude: number;
  easing: CameraMoveEasing;
  speedRamp: CameraMoveSpeedRamp;
  /** 中文提示词短语 */
  phraseZh: string;
  /** 英文提示词短语 */
  phraseEn: string;
}

/** 组合运镜提示词结果 */
export interface ComposedMovePrompt {
  /** 中文整段描述（按时间顺序，含节拍/时长） */
  zh: string;
  /** 英文整段描述 */
  en: string;
  /** 按 opts.lang 选出的片段（lang='both' 时为 `en / zh`） */
  text: string;
  /** 按时间顺序的分段明细（未知 moveId 也会出现，短语回落为 id） */
  parts: ComposedMovePromptPart[];
  segmentCount: number;
  durationSec: number;
  beatAligned: boolean;
}
