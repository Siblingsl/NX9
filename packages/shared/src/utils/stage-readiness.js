export const PIPELINE_STAGES = [
    { id: 'script', label: '剧本' },
    { id: 'storyboard', label: '分镜' },
    { id: 'generate', label: '生成' },
    { id: 'voice', label: '配音' },
    { id: 'export', label: '导出' },
];
function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
function nodeHasGeneratedAsset(data) {
    if (!data)
        return false;
    const status = data.status;
    if (status !== 'done' && status !== 'success')
        return false;
    return Boolean(data.previewUrl ||
        data.videoUrl ||
        data.audioUrl ||
        (Array.isArray(data.previewUrls) && data.previewUrls.length > 0));
}
/** P3-02: 检查五阶段产物是否就绪 */
export function computeStageReadiness(input) {
    const { storyboard, voice, nodes } = input;
    const shots = storyboard.shots ?? [];
    const hasScript = hasText(storyboard.title) ||
        shots.some((s) => hasText(s.descriptionZh) || hasText(s.promptEn));
    const hasStoryboard = shots.length > 0 &&
        shots.some((s) => hasText(s.descriptionZh) || hasText(s.promptEn) || s.durationSec > 0);
    const hasGenerate = nodes.some((n) => nodeHasGeneratedAsset(n.data));
    const hasVoice = (voice.lines?.length ?? 0) > 0 &&
        voice.lines.some((l) => l.status === 'ready' || hasText(l.audioAssetId));
    const hasExport = shots.some((s) => s.status === 'approved');
    return {
        script: hasScript,
        storyboard: hasStoryboard,
        generate: hasGenerate,
        voice: hasVoice,
        export: hasExport,
    };
}
export const PIPELINE_STAGE_FIXES = {
    script: { templateId: 'tpl-novel-import', label: '加载「小说拆镜 → 开拍」配方' },
    storyboard: { spawnKind: 'shot-script', label: '添加 shot-script 模块' },
    generate: { templateId: 'tpl-nx9-character-pipeline', label: '加载「角色设定 → 出图」配方' },
    voice: { spawnKind: 'sound-gen', label: '添加 sound-gen 模块' },
    export: { templateId: 'tpl-nx9-review-pipeline', label: '加载「分镜 → 审阅 → 交付」配方' },
};
/** 阶段 dot 颜色：已完成 / 当前 / 未开始 */
export function resolvePipelineStageStates(readiness) {
    const values = PIPELINE_STAGES.map((s) => readiness[s.id]);
    const firstIncomplete = values.findIndex((v) => !v);
    return values.map((done, i) => {
        if (done)
            return 'done';
        if (firstIncomplete === i)
            return 'active';
        return 'pending';
    });
}
