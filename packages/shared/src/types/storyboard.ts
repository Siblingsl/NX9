export type ShotStatus = 'draft' | 'generating' | 'review' | 'approved' | 'failed';

export type ShotType = 'close' | 'medium' | 'wide' | 'extreme-wide' | 'custom';

export type SketchSource = 'ai-grid' | 'ai-single' | 'upload' | 'hand-draw' | 'import';

export interface StoryboardShot {
  id: string;
  index: number;
  durationSec: number;
  shotType: ShotType;
  descriptionZh: string;
  promptEn: string;
  videoPromptEn?: string;
  firstFrameAssetId?: string | null;
  lastFrameAssetId?: string | null;
  videoAssetId?: string | null;
  audioAssetId?: string | null;
  status: ShotStatus;
  characterIds?: string[];
  linkedBlockId?: string | null;
  notes?: string;
  sketchSource?: SketchSource | null;
  sketchPrompt?: string | null;
  sketchApprovedAt?: string | null;
  videoDesc?: string | null;
  associateAssetIds?: string[];
  tableRowId?: string | null;
  subtitleText?: string | null;
  /** 与 SceneSplitRecord 关联 */
  sceneId?: string | null;
  /** 显示用 "1-3" */
  sceneCode?: string | null;
  /** 双阶段审阅：关键帧状态 */
  keyframeStatus?: 'draft' | 'review' | 'approved' | 'failed';
  /** 双阶段审阅：视频状态 */
  videoStatus?: 'draft' | 'review' | 'approved' | 'failed';
}

export type StoryboardPayloadVersion = 1 | 2 | 3;

export interface StoryboardPayload {
  version: StoryboardPayloadVersion;
  title: string;
  reviewMode: 'manual' | 'auto';
  shots: StoryboardShot[];
}

export type VoiceLineStatus = 'pending' | 'generating' | 'ready' | 'failed';

export interface VoiceProfile {
  id: string;
  name: string;
  provider: 'openai-compatible' | 'luxtts' | 'voicebox';
  voiceId: string;
  referenceAudioAssetId?: string | null;
}

export interface VoiceLine {
  id: string;
  shotId?: string | null;
  speaker: string;
  text: string;
  voiceProfileId?: string | null;
  audioAssetId?: string | null;
  status: VoiceLineStatus;
}

export interface VoicePayload {
  version: 1;
  profiles: VoiceProfile[];
  lines: VoiceLine[];
}

export interface WorkspacePreferences {
  artStylePrompt?: string;
  defaultImageModel?: string;
  defaultVideoModel?: string;
}

export function emptyStoryboard(): StoryboardPayload {
  return { version: 2, title: '', reviewMode: 'manual', shots: [] };
}

export function migrateStoryboardPayload(payload: StoryboardPayload): StoryboardPayload {
  let v2: StoryboardPayload & { shots: (StoryboardShot & { status?: string })[] };
  if (payload.version >= 2) {
    v2 = payload as any;
  } else {
    v2 = {
      ...payload,
      version: 2,
      shots: payload.shots.map((s) => ({
        ...s,
        sketchSource: null,
        sketchPrompt: null,
        sketchApprovedAt: null,
      })),
    };
  }
  if (payload.version >= 3) return payload as StoryboardPayload;
  return {
    ...v2,
    version: 3,
    shots: v2.shots.map((s) => ({
      ...s,
      sceneId: (s as any).sceneId ?? null,
      sceneCode: (s as any).sceneCode ?? null,
      keyframeStatus: s.status === 'approved' ? 'approved' : s.status === 'review' ? 'review' : s.status === 'failed' ? 'failed' : 'draft',
      videoStatus: (s as any).videoStatus ?? 'draft',
    })),
  };
}

export function emptyVoice(): VoicePayload {
  return { version: 1, profiles: [], lines: [] };
}
