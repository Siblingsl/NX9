export type ShotStatus = 'draft' | 'generating' | 'review' | 'approved' | 'failed';

export type ShotType = 'close' | 'medium' | 'wide' | 'extreme-wide' | 'custom';

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
}

export interface StoryboardPayload {
  version: 1;
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
  return { version: 1, title: '', reviewMode: 'manual', shots: [] };
}

export function emptyVoice(): VoicePayload {
  return { version: 1, profiles: [], lines: [] };
}
