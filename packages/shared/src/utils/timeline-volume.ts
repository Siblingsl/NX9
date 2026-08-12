import type { TimelineClip, TimelineVolumeKeyframe } from '../types/timeline';

const SNAP_SEC = 0.05;

export function clampClipVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(2, volume));
}

export function sortVolumeKeyframes(
  keyframes: TimelineVolumeKeyframe[] | undefined,
): TimelineVolumeKeyframe[] {
  return (keyframes ?? [])
    .map((kf) => ({ atSec: Math.max(0, kf.atSec), volume: clampClipVolume(kf.volume) }))
    .sort((a, b) => a.atSec - b.atSec);
}

export function upsertVolumeKeyframe(
  keyframes: TimelineVolumeKeyframe[] | undefined,
  atSec: number,
  volume: number,
): TimelineVolumeKeyframe[] {
  const next = sortVolumeKeyframes(keyframes);
  const t = Math.max(0, atSec);
  const v = clampClipVolume(volume);
  const hit = next.findIndex((kf) => Math.abs(kf.atSec - t) <= SNAP_SEC);
  if (hit >= 0) {
    next[hit] = { atSec: next[hit].atSec, volume: v };
    return next;
  }
  next.push({ atSec: t, volume: v });
  return sortVolumeKeyframes(next);
}

export function removeVolumeKeyframe(
  keyframes: TimelineVolumeKeyframe[] | undefined,
  atSec: number,
): TimelineVolumeKeyframe[] {
  return sortVolumeKeyframes(keyframes).filter((kf) => Math.abs(kf.atSec - atSec) > SNAP_SEC);
}

export function splitVolumeKeyframes(
  keyframes: TimelineVolumeKeyframe[] | undefined,
  relSec: number,
): { left: TimelineVolumeKeyframe[]; right: TimelineVolumeKeyframe[] } {
  const keys = sortVolumeKeyframes(keyframes);
  if (keys.length === 0) return { left: [], right: [] };

  const cut = Math.max(0, relSec);
  // 切口处采样，保证左右段衔接无音量跳变
  const cutVolume = sampleEnvelopeAt(keys, cut);
  const left = keys.filter((kf) => kf.atSec < cut - 1e-6);
  const rightRaw = keys.filter((kf) => kf.atSec > cut + 1e-6);

  return {
    left: upsertVolumeKeyframe(left, cut, cutVolume),
    right: [
      { atSec: 0, volume: cutVolume },
      ...rightRaw.map((kf) => ({ ...kf, atSec: Math.max(0, kf.atSec - cut) })),
    ],
  };
}

function sampleEnvelopeAt(keys: TimelineVolumeKeyframe[], t: number): number {
  if (keys.length === 0) return 1;
  if (keys.length === 1) return keys[0].volume;
  if (t <= keys[0].atSec) return keys[0].volume;
  if (t >= keys[keys.length - 1].atSec) return keys[keys.length - 1].volume;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.atSec && t <= b.atSec) {
      const span = Math.max(0.0001, b.atSec - a.atSec);
      const u = (t - a.atSec) / span;
      return clampClipVolume(a.volume + (b.volume - a.volume) * u);
    }
  }
  return keys[keys.length - 1].volume;
}

/**
 * 采样片段在 localSec（相对起点）的有效音量：主推子 × 包络 × 淡入淡出。
 */
export function sampleClipVolume(clip: TimelineClip, localSec: number): number {
  const duration = Math.max(0.001, clip.durationSec);
  const t = Math.max(0, Math.min(duration, localSec));
  const master = clampClipVolume(clip.volume ?? 1);
  const keys = sortVolumeKeyframes(clip.volumeKeyframes);
  let envelope = 1;
  if (keys.length === 1) {
    envelope = keys[0].volume;
  } else if (keys.length >= 2) {
    if (t <= keys[0].atSec) envelope = keys[0].volume;
    else if (t >= keys[keys.length - 1].atSec) envelope = keys[keys.length - 1].volume;
    else {
      for (let i = 0; i < keys.length - 1; i++) {
        const a = keys[i];
        const b = keys[i + 1];
        if (t >= a.atSec && t <= b.atSec) {
          const span = Math.max(0.0001, b.atSec - a.atSec);
          const u = (t - a.atSec) / span;
          envelope = clampClipVolume(a.volume + (b.volume - a.volume) * u);
          break;
        }
      }
    }
  }
  let fade = 1;
  const fadeIn = clip.fadeInSec ?? 0;
  const fadeOut = clip.fadeOutSec ?? 0;
  if (fadeIn > 0 && t < fadeIn) fade *= t / fadeIn;
  if (fadeOut > 0 && t > duration - fadeOut) fade *= Math.max(0, (duration - t) / fadeOut);
  return clampClipVolume(master * envelope * fade);
}
