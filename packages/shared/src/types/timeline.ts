export type TimelineAspect = '16:9' | '9:16' | '1:1';

export interface TimelineTransition {
  kind: 'cut' | 'fade' | 'wipe' | 'shader';
  durationSec: number;
  shaderId?: string;
}

/** 片段内音量包络点；atSec 相对片段起点。 */
export interface TimelineVolumeKeyframe {
  atSec: number;
  volume: number;
}

export interface TimelineClip {
  id: string;
  shotId?: string;
  label: string;
  startSec: number;
  durationSec: number;
  assetUrl: string;
  type: 'video' | 'audio' | 'image' | 'subtitle' | 'overlay';
  takeId?: string;
  trimInSec?: number;
  trimOutSec?: number;
  transitionOut?: TimelineTransition;
  text?: string;
  style?: Record<string, string | number>;
  /** 音量 0–2，默认 1（主推子） */
  volume?: number;
  /** 人工精剪：片段内音量关键帧，与主推子相乘后再套淡入淡出 */
  volumeKeyframes?: TimelineVolumeKeyframe[];
  fadeInSec?: number;
  fadeOutSec?: number;
  /** 变速 0.25–4，默认 1 */
  speed?: number;
  /** probe 回写的素材真实时长（trim 上限） */
  sourceDurationSec?: number;
  /** 智能替换前的原素材地址，供回滚溯源 */
  replacedFrom?: string;
  /** SE-SPEC-04: 贴片位姿；x/y 为合成画面百分比锚点（50/50=居中），scale 为缩放倍率 */
  overlay?: { x: number; y: number; scale: number; rotation?: number };
  /**
   * OL-19 加深：成片轨绑定的声音库条目 id。
   * 配音/对白 clip 优先写此字段，便于 unused / 重绑 / 替换源音。
   */
  soundAssetId?: string | null;
  /** 片段视觉效果（模糊等）；预览与成片共用 */
  effects?: TimelineClipEffects;
  /** 属性关键帧动画；预览与成片共用 */
  animations?: TimelineClipAnimations;
  /** 片段蒙版；预览与成片共用 */
  mask?: TimelineClipMask;
  /** CSS mix-blend-mode（normal/multiply/screen/overlay…）；缺省 normal */
  blendMode?: string;
}

/** 片段级视觉效果；预览与 Remotion 成片共用同一字段 */
export interface TimelineClipEffects {
  /** 高斯模糊半径（px），0/缺省 = 不模糊 */
  blur?: number;
}

/** 画布背景：预览与成片共用；缺省为纯黑 */
export interface TimelineBackground {
  kind: 'color' | 'gradient';
  /** kind=color 时生效 */
  color?: string;
  /** kind=gradient 时生效 */
  gradientFrom?: string;
  gradientTo?: string;
}

/** 属性动画关键帧；atSec 相对片段起点 */
export interface TimelineAnimKeyframe {
  atSec: number;
  value: number;
  /** 缓动；缺省 linear */
  ease?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

/** 片段属性随时间动画（预览与 Remotion 成片共用同一字段） */
export interface TimelineClipAnimations {
  /** 0–1 */
  opacity?: TimelineAnimKeyframe[];
  /** 画布百分比锚点 0–100（仅 overlay 位姿使用） */
  x?: TimelineAnimKeyframe[];
  y?: TimelineAnimKeyframe[];
  /** 缩放 0.2–3（所有视觉片段可用，以画布中心为锚） */
  scale?: TimelineAnimKeyframe[];
  /** 旋转角度（仅 overlay 位姿使用） */
  rotation?: TimelineAnimKeyframe[];
}

export type TimelineMaskKind = 'rect' | 'ellipse' | 'diamond' | 'heart' | 'cinematic';

/** 片段级蒙版：x/y 为形状中心（画布百分比），w/h 为宽高（画布百分比） */
export interface TimelineClipMask {
  kind: TimelineMaskKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 旋转角度 */
  rotation?: number;
  /** 羽化（画布百分比单位 0–10）；diamond/heart 走 SVG 高斯模糊蒙版 */
  feather?: number;
  /** 描边（画布百分比单位），0 = 无 */
  stroke?: number;
}

/** v3 轨道类型：字幕/贴片从 video 中分出 */
export type TimelineTrackKind = 'video' | 'audio' | 'subtitle' | 'overlay';

export interface TimelineTrack {
  /** v3 规范 ID：V1..Vn / A1..An / S1..Sn / O1..On */
  id: string;
  kind: TimelineTrackKind;
  clips: TimelineClip[];
  label?: string;
  muted?: boolean;
  locked?: boolean;
}

export interface TimelinePayload {
  /** v3 = 规范化轨道 ID + kind；加载时经 migrateTimelinePayload 迁移 */
  version: number;
  title: string;
  fps: number;
  durationSec: number;
  aspect: TimelineAspect;
  width: number;
  height: number;
  tracks: TimelineTrack[];
  /** 画布背景（颜色/渐变）；缺省纯黑 */
  background?: TimelineBackground;
  renderPreset?: 'ffmpeg-fast' | 'hyperframes-vertical' | 'remotion-studio';
  metadata?: {
    episodeId?: string;
    approvedOnly?: boolean;
    exportedAt?: string;
  };
}
