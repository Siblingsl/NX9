/**
 * 逐帧拉片（frame-study）数据契约。
 *
 * 语义：把一段参考视频按时间码逐帧拆解成「参考帧 + 提示词」的拉片表，
 * 供快捷参考 / 复刻使用。**拉片表是时间轴语义**，与宫格契约
 * （grid-prompts 的 `GridCellPrompt` / `GridReversePromptsResult`）不同：
 * 宫格按 行×列 定位，拉片按 **时间码** 定位，因此本文件自定契约，
 * 不复用宫格的 row / col 字段。
 *
 * 与既有零件的关系（分工见 docs/NX9-FRAME-STUDY.md）：
 * - `frame-sampler` / `frame-endpoints` 节点：只做「抽帧」这一件事，输出图片流；
 * - `analyzeReferenceVideo`（/api/montage/analyze-reference）：整段视频 → 分镜表（镜头级，
 *   不是帧级，且带 LLM 推断成分）；
 * - 本契约：**帧级** —— 逐帧时间码 + 逐帧反推提示词，可导出、可编辑、可送分镜。
 *
 * 全部字段可 JSON 序列化。
 */

/** 抽帧策略 */
export type FrameStudyMode = 'count' | 'interval';

/** 抽帧策略元数据（UI 芯片 / 默认值） */
export interface FrameStudyStrategyDef {
  id: FrameStudyMode;
  label: string;
  hint: string;
  /** 该策略下 value 的含义说明 */
  valueLabel: string;
  defaultValue: number;
  minValue: number;
  maxValue: number;
  unit: string;
}

/** 结构化告警：只描述「怎么处理了这个输入」，不编造缺失值 */
export type FrameStudyWarningCode =
  // ── 输入口径告警 ──
  | 'duration-unknown'
  | 'duration-zero'
  | 'duration-too-long'
  | 'count-clamped'
  | 'interval-clamped'
  | 'frame-count-clamped'
  // ── 管线口径告警 ──
  | 'interval-exceeds-duration'
  | 'coverage-partial'
  | 'sampling-not-even'
  // ── 合并口径告警（mergeFrameStudyReversals）──
  | 'invalid-plan'
  | 'missing-frame'
  | 'missing-reversal'
  | 'reverse-failed'
  | 'out-of-range-result'
  | 'duplicate-result';

export interface FrameStudyWarning {
  code: FrameStudyWarningCode;
  messageZh: string;
}

/** 一次拉片的抽帧计划（纯数据，可序列化 / 可编辑回写） */
export interface FrameStudyPlan {
  /** 上游视频地址（`/media/...`） */
  sourceUrl: string;
  /** 已知的视频时长（秒）；未探到为 `null`（不编造时长） */
  durationSec: number | null;
  mode: FrameStudyMode;
  /** 用户给定并已归一化的策略值：count = 张数，interval = 间隔秒数 */
  value: number;
  /** 用户在 UI 里填的原始值（裁剪前的原值，供 UI 回显真实输入） */
  rawValue: number;
  /** 交给 POST /api/montage/extract-frames 的 count */
  requestedCount: number;
  /**
   * 服务端抽帧器实际使用的间隔秒数。
   * 依据 analyze.service.ts 的 `-vf fps=1/${max(1, floor(30 / count))}`，
   * 即 `max(1, floor(30 / requestedCount))` —— 如实披露，不是本模块的猜测。
   */
  serverIntervalSec: number;
  /**
   * 拉片表采用的时间码（秒，升序）。
   * 口径：**抽帧管线实际会落点的时间码** = `k * serverIntervalSec`（k 从 0 起），
   * 受 `durationSec` 与帧数上限裁剪。拉片表 / 导出 / 送分镜一律以它为准。
   */
  timeSec: number[];
  /**
   * 策略口径的「等距时间码」（秒，升序）：
   * - count 模式：`i * durationSec / (n - 1)`，**含首尾**（i=0 → 0，i=n-1 → durationSec）；
   *   n=1 时只有一帧，落在 `0`。
   * - interval 模式：自 `0` 起按间隔等距；末点距片尾 ≥ 半格时补一个片尾边界帧。
   * 时长未知时无法给出（空数组）——不编造。
   */
  idealTimeSec: number[];
  /**
   * 本计划的**帧数与时间码是否确定**（= 是否探到视频时长）。
   * 为 false 时 `timeSec` 仍是抽帧网格的落点位置，但视频可能比网格短，
   * 实际返回帧数可能少于计划帧数 —— 按帧号对齐、缺帧留空，不补造帧。
   */
  timeSecKnown: boolean;
  /** 实际覆盖到的时长（秒）= 末个时间码；无帧时为 0 */
  coverageSec: number;
  /** 出图宽高比（写入下游出图请求用） */
  aspectRatio: string;
  /** 计划说明（含「时间码按抽帧管线实际落点标注」的口径声明） */
  notesZh: string;
  warnings: FrameStudyWarning[];
}

/** 单帧拉片条目（时间轴定位：timeSec） */
export interface FrameStudyItem {
  /** 0 起的帧序号（时间轴顺序，与 plan.timeSec 下标对齐） */
  index: number;
  /** 该帧时间码（秒）；时长未知时为 undefined —— 不编造时间码 */
  timeSec?: number;
  /** 抽帧得到的帧图地址（`/media/exports/...`），也是拉片表缩略图 */
  thumbnailUrl?: string;
  /** 反推的中文提示词（帧级，可直接粘贴使用） */
  reversePromptZh?: string;
  /** 反推的英文提示词 */
  reversePromptEn?: string;
  /** 景别标签（仅当反推文本里字面命中既有景别词表时才有值，不做语义推断） */
  shotSizeLabel?: string;
  /** 运镜标签（仅当反推文本里字面命中运镜词时才有值，不做语义推断） */
  cameraMoveLabel?: string;
  /** 备注 / 失败原因（如该帧反推失败，这里如实写明） */
  notes?: string;
}

/** 一次拉片的完整结果（拉片表） */
export interface FrameStudyResult {
  /** 至少有一帧拿到可用帧图时为 true；一帧都没有为 false（禁止空成功） */
  ok: boolean;
  plan: FrameStudyPlan;
  items: FrameStudyItem[];
  /** 有帧图的条目数 */
  frameCount: number;
  /** 拿到反推提示词的条目数 */
  reversedCount: number;
  warnings: FrameStudyWarning[];
  /** 可读结论（中文）；失败时为真实原因 */
  messageZh: string;
}

/**
 * 单帧反推输入（由执行器按帧号产出，合并层只按 index 归位）。
 * 字段全部可选：缺什么就留空什么，绝不补造。
 */
export interface FrameStudyReverseInput {
  /** 帧序号（0 起，与 plan.timeSec 下标对齐） */
  index: number;
  /** 该帧时间码（秒）；执行器按抽帧管线实际落点给出，缺省时合并层回落 plan.timeSec */
  timeSec?: number;
  /** 帧图地址 */
  thumbnailUrl?: string;
  reversePromptZh?: string;
  reversePromptEn?: string;
  shotSizeLabel?: string;
  cameraMoveLabel?: string;
  /** 失败原因 / 备注 */
  error?: string;
}

/** 拉片表导出格式 */
export type FrameStudyExportFormat = 'json' | 'csv';

/** `buildFrameStudyPlan` 的输入（全部字段可缺省：缺省 → 默认策略 + 结构化告警） */
export interface FrameStudyPlanInput {
  /** 视频时长（秒）；未知 / 0 / 负数 → 时间码留空并告警（不编造） */
  durationSec?: number | null;
  /** 抽帧策略 */
  mode: FrameStudyMode;
  /** 策略值：count = 张数，interval = 间隔秒数 */
  value?: number;
  /** 上游视频地址 */
  sourceUrl?: string;
  /** 出图宽高比（缺省 16:9） */
  aspectRatio?: string;
}
