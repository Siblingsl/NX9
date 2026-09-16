/**
 * NX9「运镜时间轴 → 3D 导演台」适配器（增量新增，纯函数）。
 *
 * 把 `CameraMoveTimeline`（秒为单位的运动轨）转换为导演台可用的多段 A→B
 * 相机关键帧序列，并支持按时间采样。复用既有 `cameraGeometry.ts` 的
 * `applyOrbitToCamera` / `getOrbit` / `interpolateCamera`，不替换、不改写它们。
 *
 * 诚实边界（重要）：
 * - 导演台相机模型只有 球坐标(az/el/dist) + fov + roll，因此下表是**代理映射**：
 *   无法在 3D 里等价表达的运镜（跟焦转移 / 时间切片 / 人体固定机位等）被映射到
 *   最接近的机位运动，只用于**预览机位走向与节奏**，不等价于成片效果。
 * - `interpolateCamera` 内部自带 smoothstep；本模块把时间轴的 easing 施加在其
 *   **之前**（复合曲线）。故 `linear` 在 3D 里并非严格匀速，而是沿内置平滑曲线。
 * - 只读依赖 shared 源码（相对路径）：绕过 `@nx9/shared` barrel 的既有缺陷，
 *   与 `apps/web` 单测的「相对路径直取源码」约定一致。
 */

import type { DirectorCameraShot } from './directorProject';
import { applyOrbitToCamera, getOrbit, interpolateCamera, clamp } from './cameraGeometry';
import {
  lookupCameraMove,
  type CameraMoveFamily,
} from '../../../shared/src/data/camera-move-library';
import { moveSegmentProgress, normalizeMoveTimeline } from '../../../shared/src/utils/camera-move-timeline';
import type {
  CameraMoveEasing,
  CameraMoveSpeedRamp,
  CameraMoveTimeline,
} from '../../../shared/src/types/camera-move-timeline';

/** 一个时间轴关键帧（含时间戳与来源片段信息，便于展示与采样） */
export interface CameraMoveKeyframe {
  camera: DirectorCameraShot;
  /** 相对镜头起点的秒数 */
  tSec: number;
  /** 该关键帧之后的运动片段（tSec 之前为静止/持稳；最后一帧为 null） */
  segmentId: string | null;
  moveId: string | null;
  labelZh: string;
  easing: CameraMoveEasing;
  speedRamp: CameraMoveSpeedRamp;
}

/** 单段运动对应的机位增量（球坐标 + 视野 + 滚转，均为相对量） */
export interface CameraMoveDelta {
  az: number;
  el: number;
  dist: number;
  fov: number;
  roll: number;
}

/** 导演台生成机位的 id 前缀（用于「套用/清除」批量识别） */
export const MOVE_TIMELINE_CAMERA_PREFIX = 'movetl-';

/** 逐段推断机位增量的基准缩放；`amplitude` 会乘上去，再乘本缩放 */
export interface CameraMoveKeyframeScale {
  /** 距离增量的全局缩放（默认 1） */
  distance?: number;
  /** 角度增量的全局缩放（默认 1） */
  angle?: number;
  /** fov 增量缩放（默认 1） */
  fov?: number;
}

/** 按家族给出的代理机位增量（相对量；正 az = 向右环绕，正 el = 上扬） */
const FAMILY_DELTA: Record<CameraMoveFamily, CameraMoveDelta> = {
  static: { az: 0, el: 0, dist: 0, fov: 0, roll: 0 },
  push: { az: 0, el: 0, dist: -1.2, fov: 0, roll: 0 },
  pull: { az: 0, el: 0, dist: 1.4, fov: 0, roll: 0 },
  pan: { az: 35, el: 0, dist: 0, fov: 0, roll: 0 },
  tilt: { az: 0, el: 26, dist: 0, fov: 0, roll: 0 },
  track: { az: 22, el: 0, dist: -0.2, fov: 0, roll: 0 },
  crane: { az: 0, el: 30, dist: -0.6, fov: 0, roll: 0 },
  orbit: { az: 150, el: 0, dist: -0.4, fov: 0, roll: 0 },
  zoom: { az: 0, el: 0, dist: 0, fov: -16, roll: 0 },
  handheld: { az: 6, el: 3, dist: -0.3, fov: 0, roll: -2 },
  aerial: { az: 0, el: 18, dist: -1.6, fov: -6, roll: 0 },
  special: { az: 30, el: 4, dist: -0.3, fov: -4, roll: 6 },
};

/** moveId 级代理修正（在家族增量之上覆盖方向/幅度语义） */
const MOVE_OVERRIDE: Record<string, Partial<CameraMoveDelta>> = {
  'pan-left': { az: -35 },
  'truck-left': { az: -20, dist: 0 },
  'truck-right': { az: 20, dist: 0 },
  'crane-down': { el: -30 },
  'tilt-down': { el: -26 },
  'pull-isolate': { dist: 2.2 },
  'pull-reveal': { dist: 1.8 },
  'push-through': { dist: -1.8 },
  'push-fast': { dist: -1.6 },
  'orbit-90': { az: 90 },
  'orbit-180': { az: 180 },
  'orbit-360': { az: 360 },
  'orbit-arc-in': { az: 60, dist: -1.0 },
  'orbit-spiral-up': { az: 90, el: 24 },
  'zoom-in': { fov: -14 },
  'zoom-out': { fov: 16 },
  'snap-zoom': { fov: -20 },
  'crash-zoom': { fov: -24, dist: -0.6 },
  'dolly-zoom': { dist: -1.0, fov: 16 },
  'whip-pan': { az: 90 },
  'whip-tilt': { el: 46, az: 0 },
  'dutch-roll': { roll: 14, az: 0, el: 0, dist: 0, fov: 0 },
  'bullet-time': { az: 46, fov: -8 },
  'impact-shake': { dist: -0.25, roll: -5, az: 0, el: 0 },
  'snorricam': { dist: -1.0, az: 0, el: 0 },
  'rack-focus': { fov: 6, az: 0, el: 0, dist: 0 },
  'parallax-slide': { dist: -0.6, az: 24 },
  'fpv-flythrough': { dist: -2.0, fov: -14 },
  'drone-forward-fly': { dist: -1.8, el: 0 },
  'drone-pullback': { dist: 2.0, el: 8 },
  'drone-top-down': { el: 60, dist: -1.0 },
  'drone-rise-reveal': { el: 34, dist: 0.6 },
  'handheld-push-in': { dist: -0.9, az: 0, el: 0, roll: 0 },
};

/** 把运镜词条解析成机位增量（家族代理 + moveId 修正）；未知 id 按 static 处理并返回 false */
function deltaForMove(
  moveId: string,
  amplitude: number,
  scale: Required<CameraMoveKeyframeScale>,
): { delta: CameraMoveDelta; known: boolean } {
  const def = lookupCameraMove(moveId);
  const base: CameraMoveDelta = FAMILY_DELTA[def?.family ?? 'static'];
  const over = MOVE_OVERRIDE[moveId] ?? {};
  const raw: CameraMoveDelta = {
    az: over.az ?? base.az,
    el: over.el ?? base.el,
    dist: over.dist ?? base.dist,
    fov: over.fov ?? base.fov,
    roll: over.roll ?? base.roll,
  };
  const delta: CameraMoveDelta = {
    az: raw.az * amplitude * scale.angle,
    el: raw.el * amplitude * scale.angle,
    dist: raw.dist * amplitude * scale.distance,
    fov: raw.fov * amplitude * scale.fov,
    roll: raw.roll * amplitude * scale.angle,
  };
  return { delta, known: Boolean(def) };
}

function applyDelta(camera: DirectorCameraShot, delta: CameraMoveDelta): DirectorCameraShot {
  const pos = { x: camera.transform.position[0], y: camera.transform.position[1], z: camera.transform.position[2] };
  const target = { x: camera.target[0], y: camera.target[1], z: camera.target[2] };
  const cur = getOrbit(pos, target);
  const next = applyOrbitToCamera(camera, {
    az: cur.az + delta.az,
    el: cur.el + delta.el,
    dist: cur.dist + delta.dist,
    fov: camera.fov + delta.fov,
  });
  const roll = camera.transform.rotation[2] + delta.roll;
  return {
    ...next,
    transform: { ...next.transform, rotation: [next.transform.rotation[0], next.transform.rotation[1], roll] },
  };
}

export interface BuildCameraMoveKeyframesOptions {
  scale?: CameraMoveKeyframeScale;
  /** 是否在首帧前补一个 t=0 的持稳关键帧（默认 true；保证轨道从 0 开始） */
  leadIn?: boolean;
}

function resolveScale(opts?: CameraMoveKeyframeScale): Required<CameraMoveKeyframeScale> {
  return {
    distance: opts?.distance ?? 1,
    angle: opts?.angle ?? 1,
    fov: opts?.fov ?? 1,
  };
}

/**
 * 把时间轴转换为关键帧序列。
 *
 * 结构：可选 t=0 起始持稳帧 + 每段「起点帧（沿用上一段结束机位）+ 终点帧（施加本段机位增量）」。
 * 规则：
 * - 上一段终点与本段起点重合时只保留一帧，该帧归属**从它开始的那一段**（labelZh / easing 取后者），
 *   于是「相邻两帧之间的区间缓动」= 起点帧自带缓动，天然对应正确片段；
 * - 段间空隙不额外插帧：相邻两帧机位相同，采样时自然表现为持稳（缓动对结果无影响）；
 * - 末帧的 easing 不属于任何区间，仅作展示。
 */
export function buildCameraMoveKeyframes(
  timeline: CameraMoveTimeline | null | undefined,
  baseCamera: DirectorCameraShot,
  opts: BuildCameraMoveKeyframesOptions = {},
): CameraMoveKeyframe[] {
  const norm = normalizeMoveTimeline(timeline);
  const scale = resolveScale(opts.scale);
  const leadIn = opts.leadIn ?? true;
  const segments = norm.segments;

  const keys: CameraMoveKeyframe[] = [];
  let cursor: DirectorCameraShot = structuredClone(baseCamera);

  if (leadIn && (segments.length === 0 || segments[0].startT > 1e-9)) {
    keys.push({
      camera: structuredClone(cursor),
      tSec: 0,
      segmentId: null,
      moveId: null,
      labelZh: '起始持稳',
      easing: 'linear',
      speedRamp: 'steady',
    });
  }

  for (const seg of segments) {
    const amplitude = finiteAmplitude(seg.amplitude) ? seg.amplitude : 1;
    const { delta, known } = deltaForMove(seg.moveId, amplitude, scale);
    const labelZh = known ? lookupCameraMove(seg.moveId)!.labelZh : String(seg.moveId);
    const frame = {
      segmentId: seg.id,
      moveId: seg.moveId,
      labelZh,
      easing: (seg.easing ?? 'linear') as CameraMoveEasing,
      speedRamp: (seg.speedRamp ?? 'steady') as CameraMoveSpeedRamp,
    };
    const end = applyDelta(cursor, delta);
    const last = keys[keys.length - 1];
    if (last && Math.abs(last.tSec - seg.startT) <= 1e-9) {
      // 上一段终点与本段起点重合：把该帧改写为本段起点帧，避免重复帧
      keys[keys.length - 1] = { ...last, ...frame };
    } else {
      keys.push({ camera: structuredClone(cursor), tSec: seg.startT, ...frame });
    }
    keys.push({ camera: end, tSec: seg.endT, ...frame });
    cursor = end;
  }

  return keys;
}

function finiteAmplitude(v: number | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** 关键帧 → 导演台 `DirectorCameraShot` 数组（去掉时间戳，供 `project.cameras` 使用） */
export function moveTimelineToDirectorCameras(
  timeline: CameraMoveTimeline | null | undefined,
  baseCamera: DirectorCameraShot,
  opts: BuildCameraMoveKeyframesOptions = {},
): DirectorCameraShot[] {
  const keys = buildCameraMoveKeyframes(timeline, baseCamera, opts);
  return keys.map((k, i) => ({
    ...structuredClone(k.camera),
    id: `${MOVE_TIMELINE_CAMERA_PREFIX}${i + 1}`,
    name: k.labelZh,
  }));
}

export interface CameraMoveTimelineSampleResult {
  /** 采样得到的相机（越界按端点钳制） */
  camera: DirectorCameraShot;
  /** 命中的关键帧索引（用于 UI 显示当前段） */
  keyIndex: number;
  /** 相邻两关键帧之间的局部进度 0..1 */
  local: number;
  /** 施加时间轴 easing 后的局部进度 */
  eased: number;
  /** 命中片段 id（持稳帧为 null） */
  segmentId: string | null;
  moveId: string | null;
}

/**
 * 按时间采样关键帧序列：在两相邻关键帧间用 `interpolateCamera` 插值。
 * `local` 先经过该片段 easing / speedRamp（`moveSegmentProgress`），
 * 再交给 `interpolateCamera`（其内部自带 smoothstep，属复合曲线）。
 */
export function sampleCameraMoveTimeline(
  keys: CameraMoveKeyframe[],
  tSec: number,
): CameraMoveTimelineSampleResult | null {
  if (!keys || keys.length === 0) return null;
  if (keys.length === 1) {
    const k = keys[0];
    return { camera: structuredClone(k.camera), keyIndex: 0, local: 0, eased: 0, segmentId: k.segmentId, moveId: k.moveId };
  }
  const t = clamp(tSec, keys[0].tSec, keys[keys.length - 1].tSec);
  let i = 0;
  for (let idx = 0; idx < keys.length - 1; idx += 1) {
    if (t >= keys[idx].tSec - 1e-9 && t <= keys[idx + 1].tSec + 1e-9) {
      i = idx;
      break;
    }
  }
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.tSec - a.tSec;
  const local = span > 0 ? clamp((t - a.tSec) / span, 0, 1) : 0;
  const eased = moveSegmentProgress(local, a.easing, a.speedRamp);
  const camera = interpolateCamera(a.camera, b.camera, eased);
  return { camera, keyIndex: i, local, eased, segmentId: a.segmentId, moveId: a.moveId };
}

/** 一段可读的中文计划描述（供导演台 rail / 交接确认展示） */
export function describeMoveTimelinePlan(
  timeline: CameraMoveTimeline | null | undefined,
): string {
  const norm = normalizeMoveTimeline(timeline);
  if (norm.segments.length === 0) return '运镜时间轴为空';
  return norm.segments
    .map((seg) => {
      const def = lookupCameraMove(seg.moveId);
      const label = def?.labelZh ?? String(seg.moveId);
      return `${label}（${seg.startT.toFixed(1)}–${seg.endT.toFixed(1)}s）`;
    })
    .join(' → ');
}
