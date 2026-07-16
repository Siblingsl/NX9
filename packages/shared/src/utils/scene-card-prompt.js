export function compileScenePrompt(card) {
    const parts = [];
    if (card.sceneName.trim())
        parts.push(`场景：${card.sceneName.trim()}`);
    const desc = card.description.trim();
    if (desc)
        parts.push(desc);
    const env = [];
    if (card.era.trim())
        env.push(`时代/风格：${card.era.trim()}`);
    if (card.lighting.trim())
        env.push(`光线：${card.lighting.trim()}`);
    if (env.length > 0)
        parts.push(env.join('；'));
    if (card.props.length > 0) {
        parts.push(`道具：${card.props.filter(Boolean).join('、')}`);
    }
    if (card.referenceUrls.length > 0) {
        parts.push(`参考图 ${card.referenceUrls.length} 张已附`);
    }
    return parts.join('\n');
}
