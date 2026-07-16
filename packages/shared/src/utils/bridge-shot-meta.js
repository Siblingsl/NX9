/** 默认 Bridge 参数：溶解过渡 0.5s */
export function defaultBridge(fromShotId, toShotId) {
    return {
        durationSec: 0.5,
        bridgePreset: 'dissolve',
        refImageIds: [fromShotId, toShotId],
    };
}
/** 将 bridge 元信息编译为 prompt 后缀 */
export function bridgePromptSuffix(bridges) {
    if (!bridges || bridges.length === 0)
        return '';
    const descs = bridges.map((b) => {
        const presetLabel = { dissolve: '溶解过渡', 'match-cut': '匹配剪辑', wipe: '划变', fade: '淡入淡出' }[b.bridgePreset] ?? b.bridgePreset;
        return `${presetLabel} (${b.durationSec}s)`;
    });
    return `[转场: ${descs.join(', ')}]`;
}
