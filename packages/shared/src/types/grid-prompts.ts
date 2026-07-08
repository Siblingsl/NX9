/** 宫格单格三层 Prompt（对标 moyin scene-prompt-generator） */
export interface GridCellPrompt {
  index: number;
  row: number;
  col: number;
  cellImageUrl: string;
  imagePrompt: string;
  imagePromptZh: string;
  needsEndFrame: boolean;
  endFramePrompt: string;
  endFramePromptZh: string;
  endFrameReason?: string;
  videoPrompt: string;
  videoPromptZh: string;
}

export interface GridReversePromptsResult {
  ok: boolean;
  rows: number;
  cols: number;
  sourceUrl: string;
  splitUrls: string[];
  cells: GridCellPrompt[];
  message?: string;
}
