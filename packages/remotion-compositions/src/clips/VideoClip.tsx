import React from 'react';
import { AbsoluteFill, OffthreadVideo, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { TimelineClip, TimelineClipMask } from '@nx9/shared';
import { sampleClipVolume, sampleAnimKeyframes, ANIM_DEFAULTS, computeClipTransition, transitionFadesOut, heartPolygonPoints, diamondPolygonPoints, toClipPathPolygon, polygonFeatherMask, isPolygonMaskKind } from '@nx9/shared';

interface VideoClipProps {
  clip: TimelineClip;
}

/**
 * 视频 / 图片片段：trim（startFrom）、变速（playbackRate）、
 * 音量、淡入淡出与 transitionOut（fade 压黑渐隐；wipe 擦除；shader 预置 flash/blur/slide 滤镜，
 * 在 Sequence 延长窗口内置顶擦出、下一片段从底下显现），
 * 以及属性关键帧动画（opacity/scale/x/y/rotation）、蒙版、混合模式——
 * 预览与 Remotion 成片共用同一字段。
 */
export const VideoClip: React.FC<VideoClipProps> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const durationFrames = Math.max(1, Math.round(clip.durationSec * fps));
  const tSec = frame / fps;

  // SE-EDIT-02: 片段效果（模糊等）——预览与成片共用同一字段
  const blurPx = clip.effects?.blur && clip.effects.blur > 0 ? clip.effects.blur : undefined;
  const effectStyle: React.CSSProperties = blurPx ? { filter: `blur(${blurPx}px)` } : {};

  let opacity = 1;
  const fadeInFrames = Math.round((clip.fadeInSec ?? 0) * fps);
  if (fadeInFrames > 0) {
    opacity *= interpolate(frame, [0, fadeInFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  // 出向转场：fade 在本片段尾窗口内压黑渐隐（历史语义，保持不变）；
  // wipe / shader 在 Sequence 延长窗口（本片段 nominal 结束后）置顶擦出，
  // 让下一片段从底下显现，形成真正的过渡（见 Nx9Episode 的 Sequence 延长）。
  // 计算与预览共用 @nx9/shared 的纯函数。
  const { style: transitionStyle, extendFrames } = computeClipTransition(
    clip.transitionOut,
    frame,
    fps,
    durationFrames,
  );

  const fadeSec = transitionFadesOut(clip.transitionOut);
  const tailFadeSec = fadeSec >= 0 ? fadeSec : clip.fadeOutSec ?? 0;
  const tailFadeFrames = Math.round(tailFadeSec * fps);
  if (tailFadeFrames > 0) {
    opacity *= interpolate(
      frame,
      [durationFrames - tailFadeFrames, durationFrames],
      [1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
  }

  // 属性关键帧动画（片内相对时间）
  const animOpacity = sampleAnimKeyframes(clip.animations?.opacity, tSec, ANIM_DEFAULTS.opacity);
  const animScale = sampleAnimKeyframes(clip.animations?.scale, tSec, ANIM_DEFAULTS.scale);
  const animX = sampleAnimKeyframes(clip.animations?.x, tSec, ANIM_DEFAULTS.x);
  const animY = sampleAnimKeyframes(clip.animations?.y, tSec, ANIM_DEFAULTS.y);
  const animRotation = sampleAnimKeyframes(clip.animations?.rotation, tSec, ANIM_DEFAULTS.rotation);
  opacity *= animOpacity;

  const blendStyle: React.CSSProperties =
    clip.blendMode && clip.blendMode !== 'normal' ? { mixBlendMode: clip.blendMode as React.CSSProperties['mixBlendMode'] } : {};

  let media: React.ReactNode = null;

  if (clip.type === 'image' || clip.type === 'overlay') {
    const overlay = clip.overlay ?? { x: 50, y: 50, scale: 1, rotation: 0 };
    const transform = `translate(-50%, -50%) scale(${animScale * overlay.scale})${(animRotation + (overlay.rotation ?? 0)) ? ` rotate(${animRotation + (overlay.rotation ?? 0)}deg)` : ''}`;
    media = (
      <AbsoluteFill style={{ opacity, ...effectStyle, ...blendStyle, ...transitionStyle }}>
        <Img
          src={clip.assetUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            ...(clip.type === 'overlay'
              ? {
                  position: 'absolute',
                  left: `${animX}%`,
                  top: `${animY}%`,
                  transform,
                }
              : { transform: `scale(${animScale})` }),
          }}
        />
      </AbsoluteFill>
    );
  } else if (clip.type === 'video') {
    const volume = (f: number) => sampleClipVolume(clip, f / fps);
    media = (
      <AbsoluteFill style={{ opacity, ...effectStyle, ...blendStyle, ...transitionStyle }}>
        <OffthreadVideo
          src={clip.assetUrl}
          startFrom={Math.round((clip.trimInSec ?? 0) * fps)}
          playbackRate={clip.speed ?? 1}
          volume={volume}
          muted={(clip.volume ?? 1) === 0 && !(clip.volumeKeyframes?.length)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            ...(animScale !== 1 ? { transform: `scale(${animScale})` } : {}),
          }}
        />
      </AbsoluteFill>
    );
  }

  if (media === null) return null;
  if (!clip.mask) return media;
  return (
    <AbsoluteFill>
      <MaskedLayer clip={clip} canvasW={width} canvasH={height}>
        {media}
      </MaskedLayer>
    </AbsoluteFill>
  );
};

/** 蒙版裁剪层：clip-path 形状 + 可选羽化（mask 渐变）与内描边 */
const MaskedLayer: React.FC<{
  clip: TimelineClip;
  canvasW: number;
  canvasH: number;
  children: React.ReactNode;
}> = ({ clip, canvasW, canvasH, children }) => {
  const m = clip.mask as TimelineClipMask;
  const x = m.x ?? 50;
  const y = m.y ?? 50;
  const w = m.w ?? 80;
  const h = m.h ?? 80;
  const rotation = m.rotation ?? 0;
  const feather = m.feather ?? 0;
  const stroke = m.stroke ?? 0;
  const base = Math.min(canvasW, canvasH);

  const clipPath = (() => {
    switch (m.kind) {
      case 'rect':
        return `inset(${Math.max(0, y - h / 2)}% ${Math.max(0, 100 - x - w / 2)}% ${Math.max(0, 100 - y - h / 2)}% ${Math.max(0, x - w / 2)}%)`;
      case 'ellipse':
        return `ellipse(${Math.max(0, w / 2)}% ${Math.max(0, h / 2)}% at ${x}% ${y}%)`;
      case 'diamond':
        return `polygon(${toClipPathPolygon(diamondPolygonPoints(x, y, w, h))})`;
      case 'heart':
        // 心形用经典曲线拟合多边形（百分比语义与 rect/ellipse 一致，替代旧 px path 缩放 hack）
        return `polygon(${toClipPathPolygon(heartPolygonPoints(x, y, w, h))})`;
      case 'cinematic':
        return `inset(${Math.max(0, y)}% 0 ${Math.max(0, h)}% 0)`;
      default:
        return undefined;
    }
  })();

  const transform = rotation ? `rotate(${rotation}deg)` : undefined;

  const maskImage = (() => {
    if (feather <= 0) return undefined;
    const f = feather;
    switch (m.kind) {
      case 'rect': {
        const left = Math.max(0, x - w / 2);
        const right = Math.min(100, x + w / 2);
        const top = Math.max(0, y - h / 2);
        const bottom = Math.min(100, y + h / 2);
        return {
          WebkitMaskImage: `linear-gradient(to right, transparent ${left}%, #000 ${Math.min(100, left + f)}%, #000 ${Math.max(0, right - f)}%, transparent ${right}%), linear-gradient(to bottom, transparent ${top}%, #000 ${Math.min(100, top + f)}%, #000 ${Math.max(0, bottom - f)}%, transparent ${bottom}%)`,
          WebkitMaskComposite: 'intersect',
        };
      }
      case 'ellipse':
        return {
          WebkitMaskImage: `radial-gradient(ellipse ${Math.max(1, w / 2)}% ${Math.max(1, h / 2)}% at ${x}% ${y}%, #000 ${Math.max(0, 100 - f)}%, transparent 100%)`,
        };
      case 'cinematic':
        return {
          WebkitMaskImage: `linear-gradient(to bottom, transparent ${Math.max(0, y)}%, #000 ${Math.min(100, y + f)}%, #000 ${Math.max(0, 100 - h - f)}%, transparent ${Math.min(100, 100 - h)}%)`,
        };
      default:
        return undefined;
    }
  })();

  // 菱形 / 心形：多边形羽化走 SVG 高斯模糊蒙版（百分比空间与 clip-path 精确对齐）
  const polygonFeather = feather > 0 && isPolygonMaskKind(m.kind)
    ? polygonFeatherMask(
        m.kind === 'heart'
          ? heartPolygonPoints(x, y, w, h)
          : diamondPolygonPoints(x, y, w, h),
        feather,
        canvasW,
        canvasH,
      )
    : undefined;

  const strokePx = stroke > 0 ? (stroke / 100) * base : 0;

  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    ...(clipPath ? { clipPath, WebkitClipPath: clipPath } : {}),
    ...(transform ? { transform } : {}),
    ...maskImage,
    ...(polygonFeather
      ? {
          maskImage: polygonFeather.maskImage,
          maskSize: polygonFeather.maskSize,
          maskRepeat: polygonFeather.maskRepeat,
          WebkitMaskImage: polygonFeather.maskImage,
          WebkitMaskSize: polygonFeather.maskSize,
          WebkitMaskRepeat: polygonFeather.maskRepeat,
        }
      : {}),
    ...(strokePx > 0 ? { boxShadow: `inset 0 0 0 ${strokePx}px rgba(255,255,255,0.9)` } : {}),
  };

  return <div style={style}>{children}</div>;
};
