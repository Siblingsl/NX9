import type { TimelineTransition } from '../types/timeline';

/** 出向转场在延长窗口内的覆盖样式（zIndex/clipPath/filter/transform） */
export interface ClipTransitionStyle {
  zIndex?: number;
  clipPath?: string;
  filter?: string;
  transform?: string;
}

export interface ClipTransitionResult {
  style: ClipTransitionStyle;
  /** Sequence 需要延长的帧数（仅 wipe/shader；fade/cut 为 0，保持压黑历史语义） */
  extendFrames: number;
}

/**
 * 出向转场渲染样式 —— Remotion 成片与 @remotion/player 预览共用同一计算。
 *
 * - fade：在本片段尾窗口内压黑渐隐（不延长 Sequence，历史语义）。
 * - wipe：本片段 nominal 结束后的延长窗口内，置顶从右向左擦出。
 * - shader：同延长窗口内按 shaderId 套预置滤镜（flash 闪白 / blur 模糊 / slide 滑出）。
 */
export function computeClipTransition(
  transitionOut: TimelineTransition | null | undefined,
  frame: number,
  fps: number,
  durationFrames: number,
): ClipTransitionResult {
  const kind = transitionOut && transitionOut.kind !== 'cut' ? transitionOut.kind : null;
  if (!kind || kind === 'fade' || !transitionOut) return { style: {}, extendFrames: 0 };

  const extendFrames = Math.max(1, Math.round((transitionOut.durationSec || 0.4) * fps));
  const inWindow = frame >= durationFrames && frame < durationFrames + extendFrames;
  if (!inWindow) return { style: {}, extendFrames };

  const t = Math.min(1, (frame - durationFrames) / extendFrames);
  const style: ClipTransitionStyle = { zIndex: 10 };
  if (kind === 'wipe') {
    style.clipPath = `inset(0 ${(t * 100).toFixed(2)}% 0 0)`;
  } else if (kind === 'shader') {
    const preset = transitionOut.shaderId || 'flash';
    if (preset === 'blur') {
      style.filter = `blur(${(t * 24).toFixed(1)}px)`;
    } else if (preset === 'slide') {
      style.transform = `translateX(-${(t * 100).toFixed(2)}%)`;
    } else {
      style.filter = `brightness(${(1 + 2.5 * t).toFixed(2)})`;
    }
  }
  return { style, extendFrames };
}

/** 出向转场是否压黑渐隐（fade 才在片段尾窗口内做透明度渐隐） */
export function transitionFadesOut(
  transitionOut: TimelineTransition | null | undefined,
): number {
  if (transitionOut && transitionOut.kind === 'fade') return transitionOut.durationSec;
  return -1;
}
