import type { StoryboardShot } from '../types/storyboard';
import type { GridCellPrompt } from '../types/grid-prompts';

/** 将宫格反推结果转为故事板镜头 */
export function gridCellsToStoryboardShots(cells: GridCellPrompt[]): StoryboardShot[] {
  return cells.map((c, i) => ({
    id: `shot-grid-${Date.now()}-${i}`,
    index: i + 1,
    durationSec: 4,
    shotType: 'medium' as const,
    descriptionZh: c.imagePromptZh || c.videoPromptZh || `宫格 #${c.index}`,
    promptEn: c.imagePrompt || c.videoPrompt,
    videoPromptEn: c.videoPrompt,
    status: 'draft' as const,
    characterIds: [],
    linkedBlockId: null,
    notes: c.needsEndFrame ? `尾帧: ${c.endFramePromptZh || c.endFramePrompt}` : undefined,
  }));
}
