import { DEFAULT_SCRIPT_BREAKDOWN_CONFIG, DEFAULT_SCRIPT_BREAKDOWN_PROMPTS, } from '../types/script-breakdown';
export function normalizeScriptBreakdownConfig(input) {
    const raw = { ...DEFAULT_SCRIPT_BREAKDOWN_CONFIG, ...(input ?? {}) };
    const rawControls = { ...DEFAULT_SCRIPT_BREAKDOWN_CONFIG.directorControls, ...(raw.directorControls ?? {}) };
    const normalizeList = (value) => Array.isArray(value)
        ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12)
        : [];
    const minShot = Math.max(1, Math.min(15, Math.round(Number(raw.minShotDurationSec) || 3)));
    const maxShot = Math.max(minShot, Math.min(30, Math.round(Number(raw.maxShotDurationSec) || 8)));
    return {
        ...raw,
        episodeCount: Math.max(1, Math.min(50, Math.round(Number(raw.episodeCount) || 1))),
        targetEpisodeDurationSec: Math.max(15, Math.min(1800, Math.round(Number(raw.targetEpisodeDurationSec) || 90))),
        minShotDurationSec: minShot,
        maxShotDurationSec: maxShot,
        maxShotsPerEpisode: Math.max(3, Math.min(100, Math.round(Number(raw.maxShotsPerEpisode) || 24))),
        visualStyle: String(raw.visualStyle || DEFAULT_SCRIPT_BREAKDOWN_CONFIG.visualStyle).trim(),
        directorControls: {
            storyGenres: normalizeList(rawControls.storyGenres),
            narrativeStyles: normalizeList(rawControls.narrativeStyles),
            emotionalTones: normalizeList(rawControls.emotionalTones),
            imageStyles: normalizeList(rawControls.imageStyles),
            videoStyles: normalizeList(rawControls.videoStyles),
            lightingStyles: normalizeList(rawControls.lightingStyles),
            colorStyles: normalizeList(rawControls.colorStyles),
            cinematographyStyles: normalizeList(rawControls.cinematographyStyles),
            shotSizes: normalizeList(rawControls.shotSizes),
            cameraMoves: normalizeList(rawControls.cameraMoves),
            shotFeelings: normalizeList(rawControls.shotFeelings),
            eraBackgrounds: normalizeList(rawControls.eraBackgrounds),
            sceneEnvironments: normalizeList(rawControls.sceneEnvironments),
            architectureStyles: normalizeList(rawControls.architectureStyles),
            costumeStyles: normalizeList(rawControls.costumeStyles),
            musicStyles: normalizeList(rawControls.musicStyles),
            soundEffectStyles: normalizeList(rawControls.soundEffectStyles),
            imageQualities: normalizeList(rawControls.imageQualities),
            characterPerformances: normalizeList(rawControls.characterPerformances),
            actionIntensities: normalizeList(rawControls.actionIntensities),
            continuityRequirements: normalizeList(rawControls.continuityRequirements),
            targetPlatforms: normalizeList(rawControls.targetPlatforms),
        },
    };
}
function buildDirectorControlDirective(config) {
    const entries = [
        ['剧情类型', config.directorControls.storyGenres],
        ['叙事风格', config.directorControls.narrativeStyles],
        ['情绪基调', config.directorControls.emotionalTones],
        ['图片风格', config.directorControls.imageStyles],
        ['视频风格', config.directorControls.videoStyles],
        ['光影风格', config.directorControls.lightingStyles],
        ['色彩风格', config.directorControls.colorStyles],
        ['摄影风格', config.directorControls.cinematographyStyles],
        ['景别偏好', config.directorControls.shotSizes],
        ['运镜偏好', config.directorControls.cameraMoves],
        ['镜头感觉', config.directorControls.shotFeelings],
        ['时代背景', config.directorControls.eraBackgrounds],
        ['场景环境', config.directorControls.sceneEnvironments],
        ['建筑风格', config.directorControls.architectureStyles],
        ['服装风格', config.directorControls.costumeStyles],
        ['音乐风格', config.directorControls.musicStyles],
        ['音效风格', config.directorControls.soundEffectStyles],
        ['画面质量', config.directorControls.imageQualities],
        ['角色表现', config.directorControls.characterPerformances],
        ['动作强度', config.directorControls.actionIntensities],
        ['连贯性要求', config.directorControls.continuityRequirements],
        ['目标平台适配', config.directorControls.targetPlatforms],
    ];
    const selected = entries.filter(([, values]) => values.length > 0);
    if (!selected.length) {
        return '导演控制项：用户未手动选择，请 AI 根据原文类型、情绪、平台和生产参数自动匹配。';
    }
    return [
        '导演控制项：以下为用户手动选择的生产约束，必须优先遵守；未选择的维度由 AI 自动补全。',
        ...selected.map(([label, values]) => `${label}：${values.join('、')}`),
    ].join('\n');
}
export function normalizeScriptBreakdownPrompts(input) {
    return {
        episodePlannerSystem: input?.episodePlannerSystem?.trim() || DEFAULT_SCRIPT_BREAKDOWN_PROMPTS.episodePlannerSystem,
        episodeBreakdownSystem: input?.episodeBreakdownSystem?.trim() || DEFAULT_SCRIPT_BREAKDOWN_PROMPTS.episodeBreakdownSystem,
    };
}
function balancedChunks(text, count) {
    const units = text
        .split(/\n{2,}|(?<=[。！？!?])\s*/)
        .map((item) => item.trim())
        .filter(Boolean);
    if (units.length === 0)
        return [text.trim()].filter(Boolean);
    const target = Math.max(1, Math.ceil(units.reduce((sum, item) => sum + item.length, 0) / count));
    const chunks = [];
    let current = [];
    let length = 0;
    for (const unit of units) {
        const remainingSlots = count - chunks.length;
        if (current.length > 0 && length + unit.length > target && remainingSlots > 1) {
            chunks.push(current.join('\n'));
            current = [];
            length = 0;
        }
        current.push(unit);
        length += unit.length;
    }
    if (current.length)
        chunks.push(current.join('\n'));
    while (chunks.length > count) {
        const tail = chunks.pop();
        chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n${tail}`;
    }
    while (chunks.length < count) {
        let longestIndex = 0;
        for (let index = 1; index < chunks.length; index++) {
            if (chunks[index].length > chunks[longestIndex].length)
                longestIndex = index;
        }
        const longest = chunks[longestIndex];
        if (!longest || longest.length < 2)
            break;
        const middle = Math.floor(longest.length / 2);
        const candidates = [longest.lastIndexOf('\n', middle), longest.lastIndexOf('。', middle), middle]
            .filter((position) => position > 0 && position < longest.length - 1);
        const splitAt = candidates[0] ?? middle;
        chunks.splice(longestIndex, 1, longest.slice(0, splitAt + 1).trim(), longest.slice(splitAt + 1).trim());
    }
    return chunks;
}
/** 优先尊重原文“第X集”；否则按固定集数或目标时长进行稳定本地预分段。 */
export function splitSourceIntoEpisodeChunks(sourceText, configInput) {
    const config = normalizeScriptBreakdownConfig(configInput);
    const source = sourceText.trim();
    if (!source)
        return [];
    const marker = /第\s*([一二三四五六七八九十百\d]+)\s*集[^\n]*/g;
    const matches = [...source.matchAll(marker)];
    if (matches.length > 0 && config.episodeMode === 'auto') {
        return matches.map((match, index) => {
            const start = match.index ?? 0;
            const end = matches[index + 1]?.index ?? source.length;
            return {
                id: `chunk-${index + 1}`,
                index: index + 1,
                explicitTitle: match[0].trim(),
                text: source.slice(start, end).trim(),
            };
        });
    }
    const estimatedCount = config.episodeMode === 'fixed'
        ? config.episodeCount
        : Math.max(1, Math.min(50, Math.ceil(source.length / Math.max(800, config.targetEpisodeDurationSec * 18))));
    return balancedChunks(source, estimatedCount).map((text, index) => ({
        id: `chunk-${index + 1}`,
        index: index + 1,
        text,
    }));
}
/** 单集超长时分窗，后续窗口附带上一窗口尾部作为只读连续性上下文。 */
export function splitLongEpisodeText(text, maxChars = 10000) {
    if (text.length <= maxChars)
        return [{ text }];
    const parts = balancedChunks(text, Math.ceil(text.length / maxChars));
    return parts.map((part, index) => ({
        text: part,
        contextBefore: index > 0 ? parts[index - 1].slice(-600) : undefined,
    }));
}
export function buildEpisodePlannerUserPrompt(chunks, configInput) {
    const config = normalizeScriptBreakdownConfig(configInput);
    return [
        '请为以下已按原文顺序切分的内容制定分集计划。每个 chunk 必须且只能归属一集，不得遗漏、合并到错误集或改变顺序。',
        `生产参数：${JSON.stringify(config)}`,
        buildDirectorControlDirective(config),
        [
            '输出结构必须是 JSON 对象：',
            '{"title":"全剧标题",',
            '"storyAnalysis":{"title":"故事标题","genre":"爱情/悬疑/奇幻/武侠/科幻/都市/历史等","coreTheme":"核心主题","background":{"era":"时代","location":"地点","worldview":"世界观"},"visualStyle":"整体视觉风格"},',
            '"characters":[{"name":"角色名称","identity":"身份","age":"年龄","appearance":"外貌特征","height":"身高","bodyType":"体型","hairstyle":"发型","costume":"服装","signatureElements":"标志性元素","personality":"性格","relationships":"人物关系","goal":"人物目标","currentEmotion":"当前情绪","fixedVisualKeywords":"英文为主的固定视觉关键词，用于AI保持角色一致"}],',
            '"acts":[{"name":"第1幕","title":"章节标题","storyGoal":"剧情目标","conflict":"冲突","emotionalShift":"情绪变化","keyEvents":["关键事件"],"characterChange":"角色变化"}],',
            '"episodes":[{"index":1,"chunkId":"chunk-1","title":"第1集标题","logline":"本集一句话梗概","hook":"结尾钩子","characters":["角色名"],"locations":["场景名"]}]}。',
        ].join(''),
        '注意：这是导演/编剧层面的整体设计，不要按标点或段落机械拆分。',
        `分段摘要：${JSON.stringify(chunks.map((chunk) => ({
            id: chunk.id,
            explicitTitle: chunk.explicitTitle,
            length: chunk.text.length,
            opening: chunk.text.slice(0, 700),
            ending: chunk.text.slice(-300),
        })))}`,
    ].join('\n\n');
}
export function buildEpisodeBreakdownUserPrompt(args) {
    const config = normalizeScriptBreakdownConfig(args.config);
    return [
        `只拆分第 ${args.episodeIndex} 集《${args.title}》，不要输出其他集。`,
        args.logline ? `本集梗概：${args.logline}` : '',
        `生产参数：${JSON.stringify(config)}`,
        buildDirectorControlDirective(config),
        args.contextBefore ? `上一段连续性上下文（只用于保持连续，禁止重复生成镜头）：\n${args.contextBefore}` : '',
        [
            '输出 JSON 对象，严格结构：',
            '{"episode":{"title":"标题","logline":"梗概"},"scenes":[{',
            '"code":"1-1","title":"场景标题","location":"明确地点","timeOfDay":"日/夜/黄昏等","interiorExterior":"INT|EXT|INT/EXT","summary":"场景目的",',
            '"shots":[{"title":"镜头标题","durationSec":5,"shotSize":"ECU|CU|MS|FS|WS|OTS","cameraMove":"固定|推|拉|摇|移|跟|手持",',
            '"purpose":"镜头目的：表现孤独/制造悬念/展示关系/推动剧情等","cameraAngle":"平视|俯拍|仰拍|侧拍","cameraLens":"广角|标准镜头|长焦",',
            '"characters":["稳定角色名"],"scriptText":"对应剧情与可视动作","visual":"电影级关键帧画面描述：环境、人物位置、光线、动作、情绪、构图","action":"动作设计：开始动作、变化、结束动作",',
            '"dialogue":[{"speaker":"角色名","text":"对白","emotion":"情绪"}],"narration":"旁白，可为空","sound":"环境声音与音乐设计",',
            '"audiovisualLanguage":"视听语言：1-3句中文成段描写，写运镜如何服务情绪与戏剧信息、景别功能、光色/材质对比、声画关系；禁止只罗列景别运镜词条",',
            '"imagePrompt":"可直接生成单帧的完整提示词","videoPrompt":"动作+运镜+时长+连续性提示词","negativePrompt":"排除项",',
            '"continuityNotes":["服装/道具/位置/朝向/光线延续"]}]}]}。',
            `每镜 ${config.minShotDurationSec}-${config.maxShotDurationSec} 秒；本集最多 ${config.maxShotsPerEpisode} 镜；目标总时长约 ${config.targetEpisodeDurationSec} 秒。`,
            `画幅 ${config.aspectRatio}；目标形态 ${config.targetFormat}；节奏 ${config.pacing}；改编忠实度 ${config.adaptationFidelity}；对白密度 ${config.dialogueDensity}。`,
            `imagePrompt/videoPrompt 语言：${config.promptLanguage}；统一视觉风格：${config.visualStyle}。`,
            '【audiovisualLanguage 强制要求】必须是完整句子组成的视听叙述，不是标签。',
            '真人范例：「微摇的镜头跟随角色的挣扎，特写交代了男子受制、无法反抗的生理困境。金属的冷色与鲜红的血液形成强烈对比，增强了视觉冲击力。」',
            '动漫范例：「跟镜压进角色侧脸，速度线在背景炸开，特写咬紧的牙关把崩溃情绪钉死。硬边阴影与高饱和对比色把怒意推到前景。」',
            '国漫/3D 范例：「缓推穿过灵雾落在袍角与剑光交击，再切近眼部高光；冷青体积光与暖金法阵分层，烟尘粒子拖出余韵。」',
            'shotSize/cameraMove/cameraAngle 仍可填写技术字段；audiovisualLanguage 必须另行写出叙事化视听描写，二者不可互相替代。',
            '图片 Prompt 必须英文优先，并包含：(masterpiece), cinematic scene, fixed character description, environment, action, camera angle, lighting, film photography, high detail。',
            '视频 Prompt 必须包含：镜头运动、人物动作过程、环境变化、时间变化、情绪变化。',
            '不得仅写“同上”“保持一致”；每条 Prompt 与 audiovisualLanguage 必须独立可执行。',
        ].join('\n'),
        `本集原文：\n${args.sourceText}`,
    ].filter(Boolean).join('\n\n');
}
export function createScriptBreakdownPromptPack(config, prompts) {
    return {
        schema: 'nx9-script-breakdown-prompt',
        version: 1,
        exportedAt: new Date().toISOString(),
        config: normalizeScriptBreakdownConfig(config),
        prompts: normalizeScriptBreakdownPrompts(prompts),
    };
}
export function parseScriptBreakdownPromptPack(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const value = raw;
    if (value.schema !== 'nx9-script-breakdown-prompt')
        return null;
    return createScriptBreakdownPromptPack(value.config, value.prompts);
}
export function createScriptBreakdownExportEnvelope(payload) {
    return { schema: 'nx9-script-breakdown-result', version: 1, exportedAt: new Date().toISOString(), payload };
}
export function parseScriptBreakdownExportEnvelope(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const value = raw;
    const payload = value.schema === 'nx9-script-breakdown-result' ? value.payload : raw;
    if (!payload || !Array.isArray(payload.episodes))
        return null;
    if (validateScriptBreakdownPayload(payload).some((item) => item.level === 'error'))
        return null;
    return payload;
}
/** 导入与 AI 返回共用的生产质量检查，不再只判断 descriptionZh 非空。 */
export function validateScriptBreakdownPayload(payload) {
    const diagnostics = [];
    if (!payload.episodes.length) {
        diagnostics.push({ level: 'error', code: 'episodes_empty', message: '拆分结果没有任何分集' });
        return diagnostics;
    }
    const episodeIds = new Set();
    const shotIds = new Set();
    for (const episode of payload.episodes) {
        if (!episode.id || episodeIds.has(episode.id)) {
            diagnostics.push({ level: 'error', code: 'episode_id_invalid', episodeId: episode.id, message: `分集 ID 缺失或重复：${episode.id || '空'}` });
        }
        episodeIds.add(episode.id);
        if (!episode.title?.trim())
            diagnostics.push({ level: 'error', code: 'episode_title_empty', episodeId: episode.id, message: `${episode.id} 缺少标题` });
        if (!episode.shots.length)
            diagnostics.push({ level: 'error', code: 'shots_empty', episodeId: episode.id, message: `${episode.title || episode.id} 没有镜头` });
        const sceneIds = new Set(episode.shots.map((shot) => shot.sceneId).filter(Boolean));
        if (sceneIds.size === 0)
            diagnostics.push({ level: 'warning', code: 'scenes_missing', episodeId: episode.id, message: `${episode.title} 缺少场景归属` });
        for (const shot of episode.shots) {
            if (!shot.id || shotIds.has(shot.id))
                diagnostics.push({ level: 'error', code: 'shot_id_invalid', episodeId: episode.id, message: `${episode.title} 存在缺失或重复镜头 ID` });
            shotIds.add(shot.id);
            if (!shot.scriptText?.trim())
                diagnostics.push({ level: 'error', code: 'shot_text_empty', episodeId: episode.id, message: `${shot.sceneCode || shot.id} 缺少剧情/动作描述` });
            if (!shot.imagePrompt?.trim())
                diagnostics.push({ level: 'error', code: 'image_prompt_empty', episodeId: episode.id, message: `${shot.sceneCode || shot.id} 缺少图片 Prompt` });
            if (!shot.videoPrompt?.trim())
                diagnostics.push({ level: 'error', code: 'video_prompt_empty', episodeId: episode.id, message: `${shot.sceneCode || shot.id} 缺少视频 Prompt` });
            if (!Number.isFinite(shot.durationSec) || shot.durationSec <= 0)
                diagnostics.push({ level: 'error', code: 'duration_invalid', episodeId: episode.id, message: `${shot.sceneCode || shot.id} 镜头时长无效` });
            if (shot.characters.length === 0)
                diagnostics.push({ level: 'info', code: 'characters_empty', episodeId: episode.id, message: `${shot.sceneCode || shot.id} 未识别到出场角色，请在分镜网格复核` });
        }
    }
    return diagnostics;
}
