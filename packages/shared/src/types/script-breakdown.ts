export interface ScriptBreakdownDialogueLine {
  speaker: string;
  text: string;
  emotion?: string;
}

export interface ScriptBreakdownShot {
  id: string;
  episodeId: string;
  episodeIndex: number;
  index: number;
  sceneId: string;
  sceneCode: string;
  title: string;
  durationSec: number;
  characters: string[];
  scene: string;
  scriptText: string;
  dialogue: ScriptBreakdownDialogueLine[];
  imagePrompt: string;
  videoPrompt: string;
  referenceImageUrl?: string | null;
  previewImageUrl?: string | null;
  status: 'draft' | 'previewing' | 'approved';
}

export interface ScriptBreakdownEpisode {
  id: string;
  index: number;
  title: string;
  logline?: string;
  shots: ScriptBreakdownShot[];
}

export interface ScriptBreakdownPayload {
  version: 1;
  title: string;
  sourceText: string;
  episodes: ScriptBreakdownEpisode[];
  generatedAt: string;
}

export function emptyScriptBreakdown(sourceText = ''): ScriptBreakdownPayload {
  return {
    version: 1,
    title: '未命名剧本',
    sourceText,
    episodes: [],
    generatedAt: new Date().toISOString(),
  };
}

export function flattenScriptBreakdownShots(
  payload: ScriptBreakdownPayload | undefined,
): ScriptBreakdownShot[] {
  return payload?.episodes.flatMap((episode) => episode.shots) ?? [];
}
