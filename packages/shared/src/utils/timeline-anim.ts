import type { TimelineAnimKeyframe, TimelineClip, TimelineClipAnimations } from '../types/timeline';

/**
 * 属性关键帧工具：排序 / 打点 / 删除 / 采样 / 分割。
 * 与音量包络（timeline-volume.ts）同构；动画属性用于片段级
 * 透明度/位姿/缩放随时间变化（预览与 Remotion 成片共用）。
 */

/** 各动画属性的静态默认值（无关键帧时使用） */
export const ANIM_DEFAULTS: Record<keyof TimelineClipAnimations, number> = {
  opacity: 1,
  x: 50,
  y: 50,
  scale: 1,
  rotation: 0,
};

export function sortAnimKeyframes(kfs?: TimelineAnimKeyframe[]): TimelineAnimKeyframe[] {
  if (!kfs || kfs.length === 0) return [];
  return [...kfs].sort((a, b) => a.atSec - b.atSec);
}

export function upsertAnimKeyframe(
  kfs: TimelineAnimKeyframe[] | undefined,
  atSec: number,
  value: number,
  ease?: TimelineAnimKeyframe['ease'],
): TimelineAnimKeyframe[] {
  const next = (kfs ?? []).filter((k) => Math.abs(k.atSec - atSec) > 1e-6);
  next.push({ atSec: Math.round(atSec * 1000) / 1000, value: Math.round(value * 1000) / 1000, ...(ease ? { ease } : {}) });
  return sortAnimKeyframes(next);
}

export function removeAnimKeyframe(
  kfs: TimelineAnimKeyframe[] | undefined,
  atSec: number,
): TimelineAnimKeyframe[] | undefined {
  const orig = kfs ?? [];
  const next = orig.filter((k) => Math.abs(k.atSec - atSec) > 1e-6);
  if (next.length === orig.length) return undefined; // 无变化
  return next.length > 0 ? next : undefined;
}

function easeValue(ease: TimelineAnimKeyframe['ease'] | undefined, t: number): number {
  const x = Math.max(0, Math.min(1, t));
  switch (ease) {
    case 'ease-in':
      return x * x;
    case 'ease-out':
      return 1 - (1 - x) * (1 - x);
    case 'ease-in-out':
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    default:
      return x;
  }
}

/** 采样关键帧序列在 tSec 处的值（两端 clamp） */
export function sampleAnimKeyframes(
  kfs: TimelineAnimKeyframe[] | undefined,
  tSec: number,
  defaultValue: number,
): number {
  const sorted = sortAnimKeyframes(kfs);
  if (sorted.length === 0) return defaultValue;
  if (tSec <= sorted[0].atSec) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (tSec >= last.atSec) return last.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (tSec >= a.atSec && tSec <= b.atSec) {
      const span = b.atSec - a.atSec;
      if (span <= 1e-6) return b.value;
      const t = (tSec - a.atSec) / span;
      return a.value + (b.value - a.value) * easeValue(b.ease, t);
    }
  }
  return last.value;
}

/** 采样片段某动画属性在时间线绝对秒处的值（相对片段起点换算） */
export function sampleClipAnimation(
  clip: Pick<TimelineClip, 'animations' | 'startSec'>,
  prop: keyof TimelineClipAnimations,
  timelineSec: number,
): number {
  const t = Math.max(0, timelineSec - clip.startSec);
  return sampleAnimKeyframes(clip.animations?.[prop], t, ANIM_DEFAULTS[prop]);
}

/** 分割片段时按相对时间切开动画关键帧（仿音量包络） */
export function splitAnimKeyframes(
  anims: TimelineClipAnimations | undefined,
  atSec: number,
): { left: TimelineClipAnimations | undefined; right: TimelineClipAnimations | undefined } {
  if (!anims) return { left: undefined, right: undefined };
  const left: TimelineClipAnimations = {};
  const right: TimelineClipAnimations = {};
  let any = false;
  for (const prop of Object.keys(anims) as Array<keyof TimelineClipAnimations>) {
    const kfs = anims[prop];
    if (!kfs || kfs.length === 0) continue;
    const sorted = sortAnimKeyframes(kfs);
    const lk: TimelineAnimKeyframe[] = [];
    const rk: TimelineAnimKeyframe[] = [];
    for (const k of sorted) {
      if (k.atSec <= atSec + 1e-6) {
        lk.push(k);
      } else {
        rk.push({ ...k, atSec: Math.round((k.atSec - atSec) * 1000) / 1000 });
      }
    }
    // 分割点两侧各补一个延续点（采样值），保证左右两段动画连续不跳变
    if (rk.length > 0 && lk.length > 0) {
      const midValue = sampleAnimKeyframes(kfs, atSec, ANIM_DEFAULTS[prop]);
      rk.unshift({ atSec: 0, value: midValue });
      const last = lk[lk.length - 1];
      if (Math.abs(last.atSec - atSec) > 1e-6) {
        lk.push({ atSec: Math.round(atSec * 1000) / 1000, value: midValue });
      }
    }
    if (lk.length > 0) {
      left[prop] = lk;
      any = true;
    }
    if (rk.length > 0) {
      right[prop] = rk;
      any = true;
    }
  }
  return {
    left: any && Object.keys(left).length > 0 ? left : undefined,
    right: any && Object.keys(right).length > 0 ? right : undefined,
  };
}
