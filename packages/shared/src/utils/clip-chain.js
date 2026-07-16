export function emptyClipChain() {
    return { version: 1, items: [], currentIndex: 0 };
}
/** Build clip chain from storyboard shots (ordered by index). */
export function shotsToClipChain(shots, projectGoal) {
    const sorted = [...shots].sort((a, b) => a.index - b.index);
    return {
        version: 1,
        currentIndex: 0,
        projectGoal,
        items: sorted.map((s, i) => ({
            index: i + 1,
            shotId: s.id,
            label: `Clip ${String(i + 1).padStart(2, '0')}`,
            prompt: s.videoPromptEn || s.promptEn || s.descriptionZh,
            videoPromptEn: s.videoPromptEn,
            status: 'pending',
            videoUrl: s.videoAssetId ?? undefined,
        })),
    };
}
/** Seedance continuation prompt — passes prior clip context to next. */
export function buildContinuationPrompt(item, priorItems, projectGoal) {
    const occurred = priorItems
        .filter((p) => p.status === 'done')
        .map((p) => `- ${p.label}: ${p.prompt.slice(0, 120)}`)
        .join('\n');
    return [
        projectGoal ? `项目目标：${projectGoal}` : '',
        occurred ? `已发生：\n${occurred}` : '',
        `本段只拍：${item.prompt}`,
        '不能提前出现：后续剧情内容',
        '参考：Video1 仅参考上一段结尾运镜节奏',
        `提示词：${item.videoPromptEn || item.prompt}`,
    ]
        .filter(Boolean)
        .join('\n\n');
}
export function summarizeClipResult(item) {
    return `${item.label} 完成 — ${item.prompt.slice(0, 80)}`;
}
