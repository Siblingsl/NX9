/** 将宫格反推结果转为故事板镜头 */
export function gridCellsToStoryboardShots(cells) {
    return cells.map((c, i) => ({
        id: `shot-grid-${Date.now()}-${i}`,
        index: i + 1,
        durationSec: 4,
        shotType: 'medium',
        descriptionZh: c.imagePromptZh || c.videoPromptZh || `宫格 #${c.index}`,
        promptEn: c.imagePrompt || c.videoPrompt,
        videoPromptEn: c.videoPrompt,
        status: 'draft',
        characterIds: [],
        linkedBlockId: null,
        notes: c.needsEndFrame ? `尾帧: ${c.endFramePromptZh || c.endFramePrompt}` : undefined,
    }));
}
