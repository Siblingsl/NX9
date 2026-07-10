export interface SceneSplitRecord {
  id: string;
  sceneCode: string;
  episode: number;
  location: string;
  interior: '内' | '外';
  timeOfDay: string;
  characters: string[];
  summary: string;
  beatCount?: number;
}

export interface SceneSplitPayload {
  version: 1;
  scenes: SceneSplitRecord[];
  sourceHash?: string;
}
