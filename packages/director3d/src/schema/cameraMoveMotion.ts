/**
 * NX9「大师运镜库 → 3D 导演台机位运动」映射（增量新增，纯函数、可序列化、不抛异常）。
 *
 * 定位：`shared/src/data/camera-move-library.ts` 的 56 条运镜**只是词**——它们能拼进提示词，
 * 但不会让舞台里的相机真的动起来。本模块把每条运镜的 `family`（推/拉/摇/移/升降/环绕/变焦/
 * 手持/航拍/特殊）解析成**可执行的机位运动参数**，并生成一串相对当前机位的相机关键帧
 * （az / el / dist / fov / roll + 视线转角 + 平行位移），供舞台即时预演与「套用为关键帧」。
 *
 * 机位自由度口径（与 `cameraGeometry.ts` 完全一致，不新增自由度）：
 * - 环绕口径 `az / el / dist`：相机绕**视线目标**的球坐标，复用 `getOrbit` / `setOrbit` /
 *   `applyOrbitToCamera`；正 az = 相机绕主体向右环绕，正 el = 抬高机位，正 dist = 远离主体；
 * - 视线口径 `yaw / pitch`：机位不动、只转视线方向（真正的摇 / 俯仰），实现方式是把
 *   `camera.target` 绕机位旋转，与既有 `lookAt(target)` 取景口径一致；
 * - 平移口径 `side / up / forward`：机位与视线目标**同步**平移（横移 / 升降 / 前移），
 *   画面构图不变、背景流动——这是轨道移镜的正确表达；
 * - 视野 `fov`：正 = 变广角（拉远），负 = 变长焦（推近）；
 * - `roll`：绕光轴滚转（写入既有 `transform.rotation[2]`，即荷兰角）。
 *
 * 诚实边界（**不假装等价**）：
 * - 依赖场景内容的运镜（穿越门缝、前景遮挡揭示）、依赖对焦自由度的运镜（跟焦转移）、
 *   依赖时间变速的运镜（时间切片）、依赖把机位绑到人身上的运镜（人体固定机位）、
 *   以及需要被摄主体同步运动的跟拍，都无法用上述自由度等价表达。这些词条一律标记为
 *   `representation: 'proxy'` 并给出中文说明（见 `motionProxyNote`），只保证**机位走向与节奏**；
 * - 跟焦 / 景深 / 运动模糊 / 升格降格本身不在机位参数里，本模块不生成、也不伪造这些效果；
 * - `durationHintSec` 取自词库的经验区间，只用于预演时长的兜底与展示，不是硬参数。
 *
 * 其它边界：
 * - 只读依赖 shared **源码**（相对路径），绕开 `@nx9/shared` barrel 的既有缺陷；
 * - 关键帧首帧**逐字节等于**当前机位（`structuredClone`），保证「套用运镜」不会让取景瞬移。
 */

import {
  applyOrbitToCamera,
  buildCameraPrompt,
  clamp,
  deg2rad,
  getOrbit,
  rad2deg,
  setOrbit,
} from './cameraGeometry';
import type { CameraMoveId, PromptDetailFlags } from './cameraGeometry';
import type {
  Director3dCameraKey,
  Director3dShotState,
  DirectorCameraShot,
  DirectorShotCamera,
  ViewportAspectRatio,
} from './directorProject';
import {
  CAMERA_MOVE_FAMILY_LABELS,
  lookupCameraMove,
  withCameraMovePrompt,
  type CameraMoveDef,
  type CameraMoveFamily,
} from '../../../shared/src/data/camera-move-library';
import type { CameraMoveKeyframe } from './cameraMoveTimelineKeys';
import { CAMERA_MOVE_TIMELINE_VERSION } from '../../../shared/src/types/camera-move-timeline';
import type {
  CameraMoveEasing,
  CameraMoveSpeedRamp,
  CameraMoveTimeline,
} from '../../../shared/src/types/camera-move-timeline';
import { applyMoveEasing } from '../../../shared/src/utils/camera-move-timeline';

/** 由「大师运镜库」生成的机位 id 前缀（用于套用 / 移除时批量识别） */
export const MOTION_CAMERA_PREFIX = 'cammv-';

/** FOV 允许区间（度）。下限约 135mm 长焦，上限约 14mm 广角，与机位台滑杆同量级。 */
export const MOTION_FOV_MIN = 12;
export const MOTION_FOV_MAX = 100;

/** 关键帧数允许区间（含首尾）；少于 2 帧不成运动。 */
export const MOTION_FRAMES_MIN = 2;
export const MOTION_FRAMES_MAX = 12;

/** 幅度倍数允许区间（1 = 词条默认强度） */
export const MOTION_AMPLITUDE_MIN = 0.05;
export const MOTION_AMPLITUDE_MAX = 4;

/** 是否与「真机位」等价：`native` 可用现有自由度表达；`proxy` 只能近似走向。 */
export type MotionRepresentation = 'native' | 'proxy';

/** 一条运镜的机位增量（相对当前机位；单位：度 / 米） */
export interface MotionChannelDelta {
  az: number;
  el: number;
  dist: number;
  yaw: number;
  pitch: number;
  side: number;
  up: number;
  forward: number;
  fov: number;
  roll: number;
}

/** 抖动幅度（手持 / 震动类）；采样值是 [-1,1] 的确定性噪声，两端归零。 */
export interface MotionJitterAmplitude {
  az: number;
  el: number;
  dist: number;
  roll: number;
  yaw: number;
  pitch: number;
}

/** 解析后的可执行机位运动参数（家族默认 + 词条覆盖 + 缩放，已序列化友好） */
export interface CameraMoveMotionSpec {
  family: CameraMoveFamily;
  delta: MotionChannelDelta;
  jitter: MotionJitterAmplitude;
  /** 关键帧数（含首尾） */
  frames: number;
  /** 滑动变焦：fov 由 dist 反解，保持主体画面尺寸不变 */
  preserveSubjectSize: boolean;
  /** 建议时长区间（秒） */
  durationHintSec: [number, number];
}

interface RawMotionSpec {
  delta?: Partial<MotionChannelDelta>;
  jitter?: Partial<MotionJitterAmplitude>;
  frames?: number;
  preserveSubjectSize?: boolean;
  durationHintSec?: [number, number];
}

const ZERO_DELTA: MotionChannelDelta = {
  az: 0,
  el: 0,
  dist: 0,
  yaw: 0,
  pitch: 0,
  side: 0,
  up: 0,
  forward: 0,
  fov: 0,
  roll: 0,
};

const ZERO_JITTER: MotionJitterAmplitude = {
  az: 0,
  el: 0,
  dist: 0,
  roll: 0,
  yaw: 0,
  pitch: 0,
};

/**
 * 家族默认运动参数。方向约定见模块头注释。
 * `frames` 含首尾：**摇/推/变焦** 3 帧足够勾出路径；**升降/航拍** 4 帧；**环绕** 5 帧
 * （90° 一步，scrub 时弧线不失真）；**手持** 6 帧（抖动需要更密的采样）。
 */
const FAMILY_MOTION: Record<CameraMoveFamily, RawMotionSpec> = {
  static: { delta: {}, frames: 2, durationHintSec: [4, 10] },
  push: { delta: { dist: -1.2 }, frames: 3, durationHintSec: [3, 8] },
  pull: { delta: { dist: 1.4 }, frames: 3, durationHintSec: [3, 8] },
  pan: { delta: { yaw: 45 }, frames: 3, durationHintSec: [3, 8] },
  tilt: { delta: { pitch: 30 }, frames: 3, durationHintSec: [2, 6] },
  track: { delta: { side: 1 }, frames: 3, durationHintSec: [2, 6] },
  crane: { delta: { el: 30, dist: 0.8 }, frames: 4, durationHintSec: [3, 8] },
  orbit: { delta: { az: 150 }, frames: 5, durationHintSec: [3, 8] },
  zoom: { delta: { fov: -16 }, frames: 3, durationHintSec: [1, 4] },
  handheld: {
    delta: { dist: -0.3 },
    jitter: { az: 1.2, el: 0.9, dist: 0.06, roll: 1.5 },
    frames: 6,
    durationHintSec: [3, 10],
  },
  aerial: { delta: { el: 18, dist: 1.2 }, frames: 4, durationHintSec: [4, 12] },
  special: { delta: { az: 30, el: 4, dist: -0.3, fov: -4, roll: 6 }, frames: 3, durationHintSec: [2, 6] },
};

/**
 * 词条级覆盖：在家族默认之上定方向与幅度，逐条对齐词库语义（56 条全覆盖）。
 * 未列出的 id 直接吃家族默认（新增词条不会掉进「无运动」）。
 */
const MOVE_MOTION: Record<string, RawMotionSpec> = {
  // ── 固定（机位不动；前景遮挡类额外标 proxy）──
  'static-locked-off': { delta: {} },
  'static-tableau': { delta: {} },
  'static-foreground-frame': { delta: {} },

  // ── 推镜 ──
  'push-slow': { delta: { dist: -0.9 } },
  'push-fast': { delta: { dist: -1.8 } },
  'push-through': { delta: { dist: -1.4 } },
  'push-to-closeup': { delta: { dist: -2.6 }, frames: 4 },
  'push-past-foreground': { delta: { dist: -1.0 } },

  // ── 拉镜 ──
  'pull-slow': { delta: { dist: 1.1 } },
  'pull-reveal': { delta: { dist: 1.9 } },
  'pull-isolate': { delta: { dist: 2.8 }, frames: 4 },
  'pull-through-frames': { delta: { dist: 1.5 } },

  // ── 摇镜（视线口令，机位不动）──
  'pan-slow': { delta: { yaw: 42 } },
  'pan-fast': { delta: { yaw: 88 } },
  'pan-follow': { delta: { yaw: 55 } },
  'pan-reveal': { delta: { yaw: 60 } },

  // ── 俯仰 ──
  'tilt-up': { delta: { pitch: 38 } },
  'tilt-down': { delta: { pitch: -38 } },
  'tilt-reveal-vertical': { delta: { pitch: 30 } },

  // ── 移镜（机位与视点同步平移）──
  'truck-left': { delta: { side: -1.2 } },
  'truck-right': { delta: { side: 1.2 } },
  'track-follow': { delta: { forward: 1.4 }, frames: 4 },
  'track-side-profile': { delta: { side: 1.6 }, frames: 4 },
  'track-walk-talk': { delta: { forward: 1.2 }, frames: 4 },

  // ── 升降 ──
  'crane-up': { delta: { el: 32, dist: 1.0 } },
  'crane-down': { delta: { el: -30, dist: -0.5 } },
  'crane-reveal': { delta: { el: 24, dist: 0.4 } },
  'jib-arc': { delta: { az: 28, el: 18, dist: 0.6 }, frames: 5 },

  // ── 环绕 ──
  'orbit-90': { delta: { az: 90 }, frames: 5 },
  'orbit-180': { delta: { az: 180 }, frames: 7 },
  'orbit-360': { delta: { az: 360 }, frames: 9 },
  'orbit-arc-in': { delta: { az: 60, dist: -1.1 }, frames: 6 },
  'orbit-spiral-up': { delta: { az: 90, el: 24, dist: -0.3 }, frames: 6 },

  // ── 变焦 ──
  'zoom-in': { delta: { fov: -14 } },
  'zoom-out': { delta: { fov: 14 } },
  'snap-zoom': { delta: { fov: -20 } },
  'crash-zoom': { delta: { fov: -26 }, jitter: { az: 0.8, el: 0.6, roll: 1.2 }, frames: 4 },
  // 滑动变焦：推轨前进 + 视野反向放宽，由 preserveSubjectSize 联动反解 fov
  'dolly-zoom': { delta: { dist: -1.0, fov: 0 }, preserveSubjectSize: true, frames: 4 },

  // ── 手持（抖动 + 轻微位移）──
  'handheld-follow': { delta: { dist: -0.2 }, frames: 6 },
  'handheld-verite': {
    delta: { dist: -0.2 },
    jitter: { az: 2.0, el: 1.5, dist: 0.09, roll: 2.4 },
    frames: 8,
  },
  'handheld-tense': {
    delta: { dist: -0.3 },
    jitter: { az: 3.2, el: 2.4, dist: 0.12, roll: 3.6, yaw: 2.0 },
    frames: 8,
  },
  'handheld-push-in': { delta: { dist: -0.9 }, frames: 6 },

  // ── 航拍 ──
  'drone-pullback': { delta: { el: 14, dist: 2.6 }, frames: 5 },
  'drone-forward-fly': { delta: { forward: 2.4, el: -2 }, frames: 4 },
  'drone-orbit': { delta: { az: 110, el: 26, dist: 0.8 }, frames: 7 },
  'drone-top-down': { delta: { el: 52, dist: -1.0 }, frames: 4 },
  'drone-rise-reveal': { delta: { el: 28, dist: 1.2 }, frames: 5 },
  'fpv-flythrough': { delta: { forward: 2.6, el: -4 }, frames: 5 },

  // ── 特殊 ──
  'whip-pan': { delta: { yaw: 150 } },
  'whip-tilt': { delta: { pitch: 80 } },
  'rack-focus': { delta: { fov: 4 }, frames: 2 },
  'parallax-slide': { delta: { side: 1.6, az: 8 }, frames: 4 },
  'dutch-roll': { delta: { roll: 20 } },
  'snorricam': { delta: { dist: -0.7 } },
  'bullet-time': { delta: { az: 85 }, frames: 7 },
  'impact-shake': {
    delta: { dist: -0.15 },
    jitter: { az: 3.5, el: 2.8, dist: 0.14, roll: 5 },
    frames: 5,
  },
};

/**
 * 代理近似说明（**只在此表出现的词条**才是 proxy）。
 * 每条都写清「为什么不能等价」以及舞台实际生成了什么，便于 UI 与文档如实标注。
 */
const PROXY_NOTES: Record<string, string> = {
  'static-foreground-frame': '前景门框 / 窗沿遮挡属构图与场景内容，机位本身不动，舞台不生成位移。',
  'push-through': '需要穿过门缝 / 车窗等场景开口；舞台只生成沿光轴前进的机位轨迹，穿越感取决于场景本身。',
  'push-past-foreground': '需要前景物体掠过形成遮挡节奏；舞台只生成前进轨迹，遮挡节奏取决于场景本身。',
  'pull-through-frames': '需要连续穿过多层门框退出；舞台只生成后退轨迹，纵深层次取决于场景本身。',
  'crane-reveal': '需要越过前景遮挡物才成立；舞台只生成升降轨迹，揭示效果取决于场景本身。',
  'drone-rise-reveal': '需要被遮挡目标随升起逐步露出；舞台只生成升降轨迹，揭示效果取决于场景本身。',
  'fpv-flythrough': '需要穿越门窗 / 树林的折线路径；舞台只生成直线前飞轨迹。',
  'track-follow': '需要被摄主体同步运动（舞台主体静止）；以「机位与视点同步前移」近似，背景不产生跟随速度差。',
  'track-walk-talk': '需要对话人物同步行走（舞台主体静止）；以机位前移近似，不还原人物位移。',
  'pan-follow': '需要主体同步横移（舞台主体静止）；以视线随动近似。',
  'rack-focus': '舞台机位没有对焦 / 焦平面自由度，只能以轻微焦段变化示意，不等价于跟焦转移。',
  'bullet-time': '舞台无法表达升格 / 时间变速，只生成环绕机位轨迹，不还原时间凝固。',
  'snorricam': '需要把机位刚绑在人物身上；舞台机位独立于人物，只能以贴近主体近似。',
};

/** 该运镜是否只能做代理近似 */
export function isProxyMotion(moveId: string | null | undefined): boolean {
  const def = lookupCameraMove(moveId);
  return Boolean(def && PROXY_NOTES[def.id]);
}

/** 代理近似的中文说明；native 运镜返回空字符串。 */
export function motionProxyNote(moveId: string | null | undefined): string {
  const def = lookupCameraMove(moveId);
  return def ? (PROXY_NOTES[def.id] ?? '') : '';
}

/** 解析后的展示 + 执行计划 */
export interface CameraMoveMotionPlan {
  moveId: string;
  /** 是否命中运镜词库 */
  found: boolean;
  family: CameraMoveFamily;
  familyLabelZh: string;
  labelZh: string;
  labelEn: string;
  descZh: string;
  /** 通常适配的景别（词库建议） */
  shotSizes: string[];
  difficulty: CameraMoveDef['difficulty'] | null;
  representation: MotionRepresentation;
  /** 代理近似说明；native 为空字符串 */
  proxyNoteZh: string;
  delta: MotionChannelDelta;
  jitter: MotionJitterAmplitude;
  preserveSubjectSize: boolean;
  frames: number;
  durationHintSec: [number, number];
  durationSec: number;
  /** 是否改动视野（推拉变焦 / 滑动变焦 / 变焦类） */
  changesFov: boolean;
  /** 起 / 终点机位（未给基准机位时为 null） */
  start: DirectorShotCamera | null;
  end: DirectorShotCamera | null;
  /** 中文一句话说明（可直接展示） */
  summaryZh: string;
}

export interface ResolveMotionSpecOptions {
  /** 相对幅度倍数（1 = 词条默认；钳制到 0.05~4） */
  amplitude?: number;
  /** 通道缩放（角度 / 距离 / 视野分别乘） */
  scale?: { angle?: number; distance?: number; fov?: number };
  /** 关键帧数覆盖（钳制到 2~12） */
  frames?: number;
}

export interface BuildMotionKeyframesOptions extends ResolveMotionSpecOptions {
  /** 时间曲线：把 t∈[0,1] 映射为空间进度（默认 'linear'） */
  easing?: CameraMoveEasing;
  /** 机位 id 前缀（默认 MOTION_CAMERA_PREFIX） */
  idPrefix?: string;
  /** 时长（秒）；缺省取建议区间中点 */
  durationSec?: number;
  /** 机位名前缀（默认运镜中文名） */
  namePrefix?: string;
  /** 关键帧视野比例（缺省 16:9） */
  aspectRatio?: ViewportAspectRatio;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mergeDelta(base: Partial<MotionChannelDelta> | undefined, over: Partial<MotionChannelDelta> | undefined): MotionChannelDelta {
  const out: MotionChannelDelta = { ...ZERO_DELTA, ...(base ?? {}) };
  if (!over) return out;
  for (const key of Object.keys(ZERO_DELTA) as (keyof MotionChannelDelta)[]) {
    const value = over[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function mergeJitter(
  base: Partial<MotionJitterAmplitude> | undefined,
  over: Partial<MotionJitterAmplitude> | undefined,
): MotionJitterAmplitude {
  const out: MotionJitterAmplitude = { ...ZERO_JITTER, ...(base ?? {}) };
  if (!over) return out;
  for (const key of Object.keys(ZERO_JITTER) as (keyof MotionJitterAmplitude)[]) {
    const value = over[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function validHint(hint: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(hint) || hint.length < 2) return fallback;
  const lo = hint[0];
  const hi = hint[1];
  if (typeof lo !== 'number' || typeof hi !== 'number' || !Number.isFinite(lo) || !Number.isFinite(hi)) {
    return fallback;
  }
  if (lo <= 0 || hi < lo) return fallback;
  return [lo, hi];
}

function resolveFamily(moveId: string | null | undefined): CameraMoveFamily {
  return lookupCameraMove(moveId)?.family ?? 'static';
}

/**
 * 解析一条运镜的机位运动参数（纯函数；未知 id 按「无运动」处理，不抛异常）。
 */
export function resolveMotionSpec(
  moveId: string | null | undefined,
  opts: ResolveMotionSpecOptions = {},
): CameraMoveMotionSpec {
  const def = lookupCameraMove(moveId);
  const family = def?.family ?? 'static';
  const familySpec = FAMILY_MOTION[family] ?? FAMILY_MOTION.static;
  // 未知 id 不吃任何词条覆盖（没有对应词条时 MOVE_MOTION 天然取不到）
  const moveSpec = def ? (MOVE_MOTION[def.id] ?? {}) : {};
  const amplitude = clamp(finiteOr(opts.amplitude, 1), MOTION_AMPLITUDE_MIN, MOTION_AMPLITUDE_MAX);
  const angleScale = finiteOr(opts.scale?.angle, 1);
  const distanceScale = finiteOr(opts.scale?.distance, 1);
  const fovScale = finiteOr(opts.scale?.fov, 1);

  const rawDelta = mergeDelta(familySpec.delta, moveSpec.delta);
  const rawJitter = mergeJitter(familySpec.jitter, moveSpec.jitter);
  const delta: MotionChannelDelta = {
    az: rawDelta.az * amplitude * angleScale,
    el: rawDelta.el * amplitude * angleScale,
    dist: rawDelta.dist * amplitude * distanceScale,
    yaw: rawDelta.yaw * amplitude * angleScale,
    pitch: rawDelta.pitch * amplitude * angleScale,
    side: rawDelta.side * amplitude * distanceScale,
    up: rawDelta.up * amplitude * distanceScale,
    forward: rawDelta.forward * amplitude * distanceScale,
    fov: rawDelta.fov * amplitude * fovScale,
    roll: rawDelta.roll * amplitude * angleScale,
  };
  const jitter: MotionJitterAmplitude = {
    az: rawJitter.az * amplitude * angleScale,
    el: rawJitter.el * amplitude * angleScale,
    dist: rawJitter.dist * amplitude * distanceScale,
    roll: rawJitter.roll * amplitude * angleScale,
    yaw: rawJitter.yaw * amplitude * angleScale,
    pitch: rawJitter.pitch * amplitude * angleScale,
  };

  const fallbackFrames = moveSpec.frames ?? familySpec.frames ?? 3;
  const frames = def
    ? Math.round(clamp(finiteOr(opts.frames, fallbackFrames), MOTION_FRAMES_MIN, MOTION_FRAMES_MAX))
    : 1;
  const preserveSubjectSize = Boolean(moveSpec.preserveSubjectSize ?? familySpec.preserveSubjectSize ?? false);
  const durationHintSec = validHint(
    def?.durationHintSec ?? moveSpec.durationHintSec,
    validHint(moveSpec.durationHintSec ?? familySpec.durationHintSec, [2, 6]),
  );

  return {
    family,
    delta,
    jitter,
    frames,
    preserveSubjectSize,
    durationHintSec,
  };
}

/* ── 向量小工具（不引第三方；three 的 Vector3 在纯函数里没必要） ── */

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const UP: Vec3 = { x: 0, y: 1, z: 0 };

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addScaled(a: Vec3, b: Vec3, k: number): Vec3 {
  return { x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

function normalize(a: Vec3, fallback: Vec3): Vec3 {
  const len = length(a);
  if (!(len > 1e-9)) return { ...fallback };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

/** 罗德里格斯旋转：把 v 绕单位轴 k 转 angle（弧度） */
function rotateAroundAxis(v: Vec3, k: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = cross(k, v);
  const kd = k.x * v.x + k.y * v.y + k.z * v.z;
  return {
    x: v.x * c + kv.x * s + k.x * kd * (1 - c),
    y: v.y * c + kv.y * s + k.y * kd * (1 - c),
    z: v.z * c + kv.z * s + k.z * kd * (1 - c),
  };
}

/** 视线方向的「相机右方」；正上 / 正下时退化为世界 +X，避免叉积为零向量 */
function rightOf(dir: Vec3): Vec3 {
  const right = cross(dir, UP);
  return normalize(right, { x: 1, y: 0, z: 0 });
}

/* ── 抖动噪声（确定性，便于单测与复现） ── */

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 第 index 个抖动用力的确定性采样，落在 [-1,1]（同一个 moveId + index 永远同值） */
export function motionJitterSample(moveId: string, index: number): number {
  let state = (hashString(moveId) ^ Math.imul(index + 1, 2654435761)) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  state ^= state << 13;
  state >>>= 0;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  return (state / 0xffffffff) * 2 - 1;
}

/** 抖动窗口：两端归零，保证首帧 = 当前机位、末帧不残余抖动 */
function jitterWindow(t: number): number {
  return Math.sin(Math.PI * clamp(t, 0, 1));
}

/** 是否所有通道都没有运动 */
export function isMotionlessSpec(spec: CameraMoveMotionSpec): boolean {
  const d = spec.delta;
  const j = spec.jitter;
  return (
    d.az === 0 && d.el === 0 && d.dist === 0 && d.yaw === 0 && d.pitch === 0
    && d.side === 0 && d.up === 0 && d.forward === 0 && d.fov === 0 && d.roll === 0
    && j.az === 0 && j.el === 0 && j.dist === 0 && j.roll === 0 && j.yaw === 0 && j.pitch === 0
  );
}

/** 基准机位 → 球坐标（相对视线目标） */
function orbitOf(camera: DirectorCameraShot) {
  return getOrbit(
    {
      x: camera.transform.position[0],
      y: camera.transform.position[1],
      z: camera.transform.position[2],
    },
    { x: camera.target[0], y: camera.target[1], z: camera.target[2] },
  );
}

/**
 * 按「总增量 × 进度」算出某一帧的机位。
 *
 * 顺序（固定，保证可复现）：球坐标 → 视线转角 → 平行平移 → 视野 → 滚转。
 * `progress` 已含幅度缩放；`jitterWeight` 是抖动窗口（首尾为 0）。
 *
 * 机位 / 视线 / 平移三个口径全为 0 时**不做球坐标往返换算**，直接沿用基准位置与目标点：
 * 纯变焦（zoom）与固定机位（static）因此逐字节不动，不会被 `getOrbit → setOrbit`
 * 的浮点往返挪走一点点取景。
 */
function poseAt(
  base: DirectorCameraShot,
  spec: CameraMoveMotionSpec,
  progress: number,
  jitterWeight: number,
  jitterIndex: number,
  moveId: string,
): DirectorCameraShot {
  const d = spec.delta;
  const j = spec.jitter;
  const sample = jitterWeight === 0 ? 0 : jitterWeight * motionJitterSample(moveId, jitterIndex);

  const cur = orbitOf(base);
  // 逐帧生效的通道值
  const azDelta = d.az * progress + j.az * sample;
  const elDelta = d.el * progress + j.el * sample;
  const distDelta = d.dist * progress + j.dist * sample;
  const yawDeg = d.yaw * progress + j.yaw * sample;
  const pitchDeg = d.pitch * progress + j.pitch * sample;
  const side = d.side * progress;
  const up = d.up * progress;
  const forward = d.forward * progress;
  const movesGeometry =
    azDelta !== 0 || elDelta !== 0 || distDelta !== 0
    || yawDeg !== 0 || pitchDeg !== 0
    || side !== 0 || up !== 0 || forward !== 0;

  const target0: Vec3 = { x: base.target[0], y: base.target[1], z: base.target[2] };
  let pos: Vec3 = {
    x: base.transform.position[0],
    y: base.transform.position[1],
    z: base.transform.position[2],
  };
  let target: Vec3 = { ...target0 };
  let distEff = Math.max(0.05, length(sub(pos, target0)));

  if (movesGeometry) {
    // 1) 球坐标通道：复用既有 applyOrbitToCamera（内部走 getOrbit / setOrbit）
    const next = applyOrbitToCamera(base, {
      az: cur.az + azDelta,
      el: cur.el + elDelta,
      dist: cur.dist + distDelta,
    });
    pos = {
      x: next.transform.position[0],
      y: next.transform.position[1],
      z: next.transform.position[2],
    };
    // 实际生效的环绕距离（setOrbit 会钳制）—— 滑动变焦按它反解 fov
    distEff = Math.max(0.05, length(sub(pos, target0)));

    // 2) 视线转角：机位不动，把目标点绕机位转（正 yaw = 视线向右，正 pitch = 视线抬起）
    const span = Math.max(0.05, length(sub(target0, pos)));
    let dir = normalize(sub(target0, pos), { x: 0, y: 0, z: -1 });
    if (yawDeg !== 0) dir = rotateAroundAxis(dir, UP, -deg2rad(yawDeg));
    if (pitchDeg !== 0) dir = rotateAroundAxis(dir, rightOf(dir), deg2rad(pitchDeg));
    dir = normalize(dir, { x: 0, y: 0, z: -1 });
    target = addScaled(pos, dir, span);

    // 3) 平行平移：机位与目标点同步位移（构图不变、背景流动）
    if (side !== 0 || up !== 0 || forward !== 0) {
      const right = rightOf(dir);
      const offset: Vec3 = {
        x: right.x * side + UP.x * up + dir.x * forward,
        y: right.y * side + UP.y * up + dir.y * forward,
        z: right.z * side + UP.z * up + dir.z * forward,
      };
      pos = addScaled(pos, offset, 1);
      target = addScaled(target, offset, 1);
    }
  }

  // 4) 视野：滑动变焦由距离反解，保持主体画面尺寸不变（dist × tan(fov/2) 恒定）
  let fov = base.fov + d.fov * progress;
  if (spec.preserveSubjectSize && movesGeometry) {
    const baseDist = Math.max(0.1, cur.dist);
    const ratio = (baseDist * Math.tan(deg2rad(base.fov) / 2)) / Math.max(0.1, distEff);
    fov = rad2deg(2 * Math.atan(Math.max(1e-4, ratio)));
  }
  fov = clamp(fov, MOTION_FOV_MIN, MOTION_FOV_MAX);

  // 5) 滚转：沿用既有 roll 槽位 transform.rotation[2]；rotation[0]/[1] 不被机位台维护，原样保留
  const roll = base.transform.rotation[2] + d.roll * progress + j.roll * sample;

  return {
    ...base,
    fov,
    target: [target.x, target.y, target.z],
    transform: {
      ...base.transform,
      position: [pos.x, pos.y, pos.z],
      rotation: [base.transform.rotation[0], base.transform.rotation[1], roll],
    },
  };
}

function shotCameraOf(camera: DirectorCameraShot, aspectRatio: ViewportAspectRatio): DirectorShotCamera {
  return {
    position: [...camera.transform.position] as [number, number, number],
    target: [...camera.target] as [number, number, number],
    rotation: [...camera.transform.rotation] as [number, number, number],
    fov: camera.fov,
    aspectRatio,
  };
}

function directorCameraOf(key: Director3dCameraKey, id: string): DirectorCameraShot {
  return {
    id,
    name: key.name?.trim() ? key.name : '关键帧机位',
    fov: key.camera.fov,
    target: [...key.camera.target] as [number, number, number],
    transform: {
      position: [...key.camera.position] as [number, number, number],
      rotation: [...key.camera.rotation] as [number, number, number],
      scale: [1, 1, 1],
    },
    captures: [],
  };
}

function durationOf(spec: CameraMoveMotionSpec, requested?: number): number {
  if (typeof requested === 'number' && Number.isFinite(requested) && requested > 0) {
    return clamp(requested, 0.5, 60);
  }
  const [lo, hi] = spec.durationHintSec;
  return clamp((lo + hi) / 2, 0.5, 60);
}

/**
 * 生成机位关键帧序列（相对当前机位）。
 *
 * 保证：
 * - 首帧**逐字节等于** `baseCamera`（不会瞬移取景）；
 * - 未知 / 空 id → 只返回 1 帧（无运动），不抛异常；
 * - 球坐标与视野都被钳制到机位台允许的区间内（见 setOrbit / MOTION_FOV_*）。
 */
export function buildMotionKeyframes(
  moveId: string | null | undefined,
  baseCamera: DirectorCameraShot | null | undefined,
  opts: BuildMotionKeyframesOptions = {},
): DirectorCameraShot[] {
  const base = normalizeBaseCamera(baseCamera);
  const key = typeof moveId === 'string' ? moveId.trim() : '';
  const spec = resolveMotionSpec(key, opts);
  const frames = Math.max(1, spec.frames);
  const easing: CameraMoveEasing = opts.easing ?? 'linear';
  const prefix = opts.idPrefix ?? MOTION_CAMERA_PREFIX;
  const label = lookupCameraMove(key)?.labelZh ?? '当前机位';
  const namePrefix = opts.namePrefix ?? label;

  const out: DirectorCameraShot[] = [];
  for (let index = 0; index < frames; index += 1) {
    const t = frames <= 1 ? 0 : index / (frames - 1);
    // 首帧直接克隆基准机位：避免 setOrbit 往返带来的浮点漂移，保证「起点=当前机位」
    const pose = index === 0
      ? structuredClone(base)
      : poseAt(base, spec, applyMoveEasing(t, easing), jitterWindow(t), index, key);
    out.push({
      ...pose,
      id: `${prefix}${index + 1}`,
      name: frames <= 1 ? namePrefix : `${namePrefix} ${index + 1}/${frames}`,
      captures: [],
    });
  }
  return out;
}

function normalizeBaseCamera(camera: DirectorCameraShot | null | undefined): DirectorCameraShot {
  if (camera && typeof camera === 'object') {
    const position = camera.transform?.position;
    const target = camera.target;
    const fov = camera.fov;
    if (isFiniteTriple(position) && isFiniteTriple(target) && typeof fov === 'number' && Number.isFinite(fov)) {
      return {
        id: typeof camera.id === 'string' && camera.id ? camera.id : 'cam-base',
        name: typeof camera.name === 'string' ? camera.name : '主镜头',
        fov,
        target: [...target] as [number, number, number],
        transform: {
          position: [...position] as [number, number, number],
          rotation: isFiniteTriple(camera.transform?.rotation)
            ? [...camera.transform.rotation] as [number, number, number]
            : [0, 0, 0],
          scale: isFiniteTriple(camera.transform?.scale)
            ? [...camera.transform.scale] as [number, number, number]
            : [1, 1, 1],
        },
        captures: [],
      };
    }
  }
  // 非法基准机位 → 用既有默认导演视角兜底，绝不抛异常
  return {
    id: 'cam-base',
    name: '主镜头',
    fov: 50,
    target: [0, 1.05, 0],
    transform: { position: [0, 1.55, 5.4], rotation: [0, 0, 0], scale: [1, 1, 1] },
    captures: [],
  };
}

function isFiniteTriple(raw: unknown): raw is [number, number, number] {
  return Array.isArray(raw) && raw.length === 3
    && raw.every((value) => typeof value === 'number' && Number.isFinite(value));
}

/**
 * 机位关键帧序列 → `Director3dCameraKey[]`（带归一化时间位，可直接写进镜头态 `cameraKeys`）。
 */
export function buildMotionCameraKeys(
  moveId: string | null | undefined,
  baseCamera: DirectorCameraShot | null | undefined,
  opts: BuildMotionKeyframesOptions = {},
): Director3dCameraKey[] {
  const aspectRatio = opts.aspectRatio ?? '16:9';
  const cameras = buildMotionKeyframes(moveId, baseCamera, opts);
  const last = Math.max(1, cameras.length - 1);
  return cameras.map((camera, index) => ({
    id: camera.id,
    t: cameras.length <= 1 ? 0 : index / last,
    camera: shotCameraOf(camera, aspectRatio),
    name: camera.name,
  }));
}

/** 关键帧 → 运镜时间轴适配器的关键帧形状（复用既有 `sampleCameraMoveTimeline` 做插值采样） */
export function motionKeysToMoveKeyframes(
  keys: Director3dCameraKey[],
  moveId: string | null | undefined,
  opts: { durationSec?: number; easing?: CameraMoveEasing; speedRamp?: CameraMoveSpeedRamp; labelZh?: string } = {},
): CameraMoveKeyframe[] {
  const def = lookupCameraMove(moveId);
  const spec = resolveMotionSpec(moveId);
  const durationSec = durationOf(spec, opts.durationSec);
  const labelZh = opts.labelZh ?? def?.labelZh ?? String(moveId ?? '当前机位');
  const segmentId = `motion:${def?.id ?? String(moveId ?? 'none')}`;
  return keys.map((key, index) => ({
    camera: directorCameraOf(key, key.id),
    tSec: clamp(key.t, 0, 1) * durationSec,
    segmentId,
    moveId: def?.id ?? null,
    labelZh: keys.length >= 1 && index === 0 ? `${labelZh}（起点）` : labelZh,
    easing: opts.easing ?? 'linear',
    speedRamp: opts.speedRamp ?? 'steady',
  }));
}

/** 单片段运镜时间轴（供「加入运镜时间轴」走既有交接轨，复用其套用 / 播放能力） */
export function motionToCameraMoveTimeline(
  moveId: string | null | undefined,
  opts: { amplitude?: number; durationSec?: number; easing?: CameraMoveEasing } = {},
): CameraMoveTimeline | null {
  const def = lookupCameraMove(moveId);
  if (!def) return null;
  const spec = resolveMotionSpec(def.id, { amplitude: opts.amplitude });
  const durationSec = durationOf(spec, opts.durationSec);
  return {
    version: CAMERA_MOVE_TIMELINE_VERSION,
    durationSec,
    segments: [
      {
        id: `motion-${def.id}`,
        moveId: def.id,
        startT: 0,
        endT: durationSec,
        amplitude: clamp(finiteOr(opts.amplitude, 1), MOTION_AMPLITUDE_MIN, MOTION_AMPLITUDE_MAX),
        easing: opts.easing ?? 'ease-in-out',
        speedRamp: 'steady',
      },
    ],
  };
}

/** 一次解析的完整产物（面板一次拿全：计划 + 机位 + 关键帧 + 可 scrub 的关键帧形状） */
export interface CameraMoveMotionPreview {
  plan: CameraMoveMotionPlan;
  /** 带时间位的机位关键帧（可直接写镜头态 cameraKeys） */
  keys: Director3dCameraKey[];
  /** 机位序列（id 已按 cammv-* 命名，可直接写 project.cameras） */
  cameras: DirectorCameraShot[];
  /** 运镜时间轴关键帧形状（供 sampleCameraMoveTimeline 复用采样） */
  keyframes: CameraMoveKeyframe[];
}

/**
 * 面板 / 宿主的一次性入口：把一条运镜解析成计划与机位序列。
 * `baseCamera` 非法时用默认导演视角兜底（并在 plan.found 上如实反映词条是否命中）。
 */
export function buildMotionPreview(
  moveId: string | null | undefined,
  baseCamera: DirectorCameraShot | null | undefined,
  opts: BuildMotionKeyframesOptions = {},
): CameraMoveMotionPreview {
  const key = typeof moveId === 'string' ? moveId.trim() : '';
  const cameras = buildMotionKeyframes(key, baseCamera, opts);
  const keys = buildMotionCameraKeys(key, baseCamera, opts);
  const plan = describeMotionPlan(key, baseCamera, opts);
  return {
    plan,
    keys,
    cameras,
    keyframes: motionKeysToMoveKeyframes(keys, key, {
      durationSec: plan.durationSec,
      easing: opts.easing,
      labelZh: plan.labelZh,
    }),
  };
}

/**
 * 「直接套用为关键帧」的**纯映射**：只改机位序列与激活机位，不碰环境 / 物体 / 候选帧。
 *
 * 激活机位固定为**首帧**（= 套用前的当前机位），因此套用运镜不会让舞台取景瞬移；
 * 运镜时间轴轨（`cameraMoveTimelineKeys`）用的是同一份 `cameraKeys` 结构，
 * 因此面板两条路径（套用关键帧 / 加入时间轴后套用）落盘后的形状一致。
 */
export function applyMotionToShotState(
  state: Director3dShotState,
  moveId: string | null | undefined,
  opts: BuildMotionKeyframesOptions = {},
): { state: Director3dShotState; plan: CameraMoveMotionPlan } {
  const base: DirectorCameraShot = {
    id: 'cam-base',
    name: '主镜头',
    fov: state?.camera?.fov ?? 50,
    target: (state?.camera?.target ? [...state.camera.target] : [0, 1.05, 0]) as [number, number, number],
    transform: {
      position: (state?.camera?.position ? [...state.camera.position] : [0, 1.55, 5.4]) as [number, number, number],
      rotation: (state?.camera?.rotation ? [...state.camera.rotation] : [0, 0, 0]) as [number, number, number],
      scale: [1, 1, 1],
    },
    captures: [],
  };
  const aspectRatio = opts.aspectRatio ?? state?.camera?.aspectRatio ?? '16:9';
  const preview = buildMotionPreview(moveId, base, { ...opts, aspectRatio });
  const keys = preview.keys;
  return {
    plan: preview.plan,
    state: {
      ...state,
      cameraKeys: keys,
      activeCameraKeyId: keys.length > 0 ? keys[0]!.id : null,
      updatedAt: new Date().toISOString(),
    },
  };
}

/** 计划里的机位增量 → 中文短语（只列真正非零的通道） */
export function motionDeltaPhrases(plan: Pick<CameraMoveMotionPlan, 'delta' | 'preserveSubjectSize'>): string[] {
  const d = plan.delta;
  const parts: string[] = [];
  if (d.dist !== 0) parts.push(`${d.dist < 0 ? '沿光轴前推' : '沿光轴后拉'} ${Math.abs(d.dist).toFixed(2)} m`);
  if (d.az !== 0) parts.push(`绕主体向${d.az > 0 ? '右' : '左'}环绕 ${Math.abs(d.az).toFixed(0)}°`);
  if (d.el !== 0) parts.push(`${d.el > 0 ? '抬升机位' : '降低机位'} ${Math.abs(d.el).toFixed(0)}°`);
  if (d.yaw !== 0) parts.push(`视线向${d.yaw > 0 ? '右' : '左'}转 ${Math.abs(d.yaw).toFixed(0)}°`);
  if (d.pitch !== 0) parts.push(`视线向${d.pitch > 0 ? '上' : '下'}转 ${Math.abs(d.pitch).toFixed(0)}°`);
  if (d.side !== 0) parts.push(`向${d.side > 0 ? '右' : '左'}横移 ${Math.abs(d.side).toFixed(2)} m（机位与视点同步）`);
  if (d.up !== 0) parts.push(`${d.up > 0 ? '上升' : '下降'} ${Math.abs(d.up).toFixed(2)} m`);
  if (d.forward !== 0) parts.push(`${d.forward > 0 ? '沿视线前进' : '沿视线后退'} ${Math.abs(d.forward).toFixed(2)} m（机位与视点同步）`);
  if (d.fov !== 0) parts.push(`变焦${d.fov < 0 ? '推近' : '拉远'} ${Math.abs(d.fov).toFixed(0)}°（FOV）`);
  if (d.roll !== 0) parts.push(`绕光轴滚转 ${Math.abs(d.roll).toFixed(0)}°（荷兰角）`);
  return parts;
}

function motionJitterPhrase(jitter: MotionJitterAmplitude): string {
  const items: string[] = [];
  if (jitter.az !== 0) items.push(`方位 ±${jitter.az.toFixed(2)}°`);
  if (jitter.el !== 0) items.push(`仰角 ±${jitter.el.toFixed(2)}°`);
  if (jitter.dist !== 0) items.push(`距离 ±${jitter.dist.toFixed(2)}m`);
  if (jitter.roll !== 0) items.push(`滚转 ±${jitter.roll.toFixed(2)}°`);
  if (jitter.yaw !== 0) items.push(`视线水平 ±${jitter.yaw.toFixed(2)}°`);
  if (jitter.pitch !== 0) items.push(`视线垂直 ±${jitter.pitch.toFixed(2)}°`);
  return items.length > 0 ? `叠加确定性抖动（${items.join(' / ')}，首尾归零）` : '';
}

/**
 * 结构化运动计划（含中文一句话说明）。
 * 不传 `baseCamera` 时 `start` / `end` 为 null，其余字段一样可用。
 */
export function describeMotionPlan(
  moveId: string | null | undefined,
  baseCamera?: DirectorCameraShot | null,
  opts: BuildMotionKeyframesOptions = {},
): CameraMoveMotionPlan {
  const key = typeof moveId === 'string' ? moveId.trim() : '';
  const def = lookupCameraMove(key);
  const spec = resolveMotionSpec(key, opts);
  const frames = spec.frames;
  const durationSec = durationOf(spec, opts.durationSec);

  let start: DirectorShotCamera | null = null;
  let end: DirectorShotCamera | null = null;
  if (baseCamera) {
    const cameras = buildMotionKeyframes(key, baseCamera, opts);
    start = shotCameraOf(cameras[0]!, opts.aspectRatio ?? '16:9');
    end = shotCameraOf(cameras[cameras.length - 1]!, opts.aspectRatio ?? '16:9');
  }

  const proxyNoteZh = motionProxyNote(def?.id ?? key);
  const phrases = motionDeltaPhrases({ delta: spec.delta, preserveSubjectSize: spec.preserveSubjectSize });
  const jitterZh = motionJitterPhrase(spec.jitter);
  if (jitterZh) phrases.push(jitterZh);
  if (spec.preserveSubjectSize) phrases.push('距离与 FOV 联动，主体画面尺寸保持不变');
  const body = phrases.length > 0 ? phrases.join('，') : '机位保持不动（无位移）';
  const [lo, hi] = spec.durationHintSec;
  const summaryZh = def
    ? `${def.labelZh}：${body}；${frames} 帧机位关键帧，建议 ${lo}–${hi}s（预演按 ${durationSec.toFixed(1)}s）`
      + `${proxyNoteZh ? `；代理近似：${proxyNoteZh}` : ''}`
    : `未识别的运镜 id「${key || '空'}」：不生成机位运动，保留当前机位。`;

  return {
    moveId: key,
    found: Boolean(def),
    family: def?.family ?? 'static',
    familyLabelZh: CAMERA_MOVE_FAMILY_LABELS[def?.family ?? 'static'],
    labelZh: def?.labelZh ?? (key || '当前机位'),
    labelEn: def?.labelEn ?? '',
    descZh: def?.descZh ?? '',
    shotSizes: def?.shotSizes ? [...def.shotSizes] : [],
    difficulty: def?.difficulty ?? null,
    representation: proxyNoteZh ? 'proxy' : 'native',
    proxyNoteZh,
    delta: { ...spec.delta },
    jitter: { ...spec.jitter },
    preserveSubjectSize: spec.preserveSubjectSize,
    frames,
    durationHintSec: spec.durationHintSec,
    durationSec,
    changesFov: spec.delta.fov !== 0 || spec.preserveSubjectSize,
    start,
    end,
    summaryZh,
  };
}

/** project.cameras 里由运镜库生成的机位数量 */
export function countMotionCameras(cameras: { id: string }[] | null | undefined): number {
  if (!Array.isArray(cameras)) return 0;
  return cameras.filter((camera) => typeof camera?.id === 'string' && camera.id.startsWith(MOTION_CAMERA_PREFIX)).length;
}

export interface BuildMotionCameraPromptOptions {
  /** 已套用的大师运镜 id；非空且命中词库时，短语并入同一 `camera movement:` 槽位 */
  moveId?: string | null;
  /** 未套用大师运镜时的既有运镜条目（store 的 `CameraMoveId`），行为与改动前完全一致 */
  fallbackMove?: CameraMoveId | string | null;
  details?: Partial<PromptDetailFlags>;
  subjectYawDeg?: number;
  roll?: number;
  lightingPrompt?: string;
  lang?: 'en' | 'zh' | 'both';
}

/**
 * 镜头语言提示词：在既有 `buildCameraPrompt` 之上并入大师运镜短语。
 *
 * - 命中词库：基础提示词**关掉** `movement` 细节（避免与词库短语重复），再由
 *   `withCameraMovePrompt` 写入同一 `camera movement:` 槽位（不新增任何持久化字段）；
 * - 未命中 / 未套用：走原参数，输出与改动前逐字符一致（老行为不变）。
 */
export function buildMotionCameraPrompt(
  camera: DirectorCameraShot,
  opts: BuildMotionCameraPromptOptions = {},
): string {
  const def = lookupCameraMove(opts.moveId);
  if (!def) {
    return buildCameraPrompt(camera, {
      roll: opts.roll,
      subjectYawDeg: opts.subjectYawDeg,
      move: opts.fallbackMove ?? null,
      details: opts.details,
      lightingPrompt: opts.lightingPrompt,
    });
  }
  const base = buildCameraPrompt(camera, {
    roll: opts.roll,
    subjectYawDeg: opts.subjectYawDeg,
    move: null,
    details: { ...(opts.details ?? {}), movement: false },
    lightingPrompt: opts.lightingPrompt,
  });
  return withCameraMovePrompt(base, [def.id], { lang: opts.lang ?? 'en' });
}
