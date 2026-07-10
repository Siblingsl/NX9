export interface StorySkeleton {
  title: string;
  logline: string;
  acts: { name: string; beats: string[] }[];
  episodeCount: number;
  hookPoints: string[];
}

export interface AdaptationStrategy {
  sourceType: 'novel' | 'outline' | 'script';
  tone: string;
  pacing: 'fast' | 'medium' | 'slow';
  omitRules: string[];
  emphasis: string[];
}

export interface StoryboardTableRow {
  id: string;
  group: string;
  shotSize: string;
  cameraMove: string;
  durationSec: number;
  descriptionZh: string;
  dialogue: string;
  sfx: string;
  videoDesc: string;
  associateAssetIds: string[];
}

export interface ScriptPlanPayload {
  version: 2;
  sourceText?: string;
  screenplayMd?: string;
  directorPlanMd?: string;
  skeleton?: StorySkeleton | null;
  adaptation?: AdaptationStrategy | null;
  storyboardTable: StoryboardTableRow[];
  activeEpisode?: string | null;
  scenes?: import('./scene-split').SceneSplitRecord[];
}
