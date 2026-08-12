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
  /**
   * OL-19 加深：成片轨绑定的声音库条目 id。
   * 配音/对白 clip 优先写此字段，便于 unused / 重绑 / 替换源音。
   */
  soundAssetId?: string | null;
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
  renderPreset?: 'ffmpeg-fast' | 'hyperframes-vertical' | 'remotion-studio';
  metadata?: {
    episodeId?: string;
    approvedOnly?: boolean;
    exportedAt?: string;
  };
}
