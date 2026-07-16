export const DEFAULT_SCRIPT_BREAKDOWN_CONFIG = {
    sourceType: 'auto',
    episodeMode: 'auto',
    episodeCount: 1,
    targetEpisodeDurationSec: 90,
    minShotDurationSec: 3,
    maxShotDurationSec: 8,
    maxShotsPerEpisode: 24,
    pacing: 'balanced',
    adaptationFidelity: 'balanced',
    dialogueDensity: 'medium',
    targetFormat: 'comic',
    aspectRatio: '16:9',
    promptLanguage: 'bilingual',
    visualStyle: '电影感国漫，写实光影，角色外观稳定，场景空间关系清晰',
    continuityLevel: 'strict',
    allowRuleFallback: false,
    directorControls: {
        storyGenres: [],
        narrativeStyles: [],
        emotionalTones: [],
        imageStyles: [],
        videoStyles: [],
        lightingStyles: [],
        colorStyles: [],
        cinematographyStyles: [],
        shotSizes: [],
        cameraMoves: [],
        shotFeelings: [],
        eraBackgrounds: [],
        sceneEnvironments: [],
        architectureStyles: [],
        costumeStyles: [],
        musicStyles: [],
        soundEffectStyles: [],
        imageQualities: [],
        characterPerformances: [],
        actionIntensities: [],
        continuityRequirements: [],
        targetPlatforms: [],
    },
};
export const DEFAULT_SCRIPT_BREAKDOWN_PROMPTS = {
    episodePlannerSystem: [
        '你是一名拥有20年以上经验的影视导演、分镜师、编剧和动画导演，负责把原文规划成可直接生产的影视/漫剧项目。',
        '必须忠于原文事实、人物关系和事件顺序；不要把不同分集压进同一集。',
        '每集必须有明确开场、推进、高潮或信息转折以及结尾钩子。',
        '不要按标点或自然段机械切分；必须先理解剧情因果、人物目标、冲突升级和情绪转折。',
        '如果原文较短，也要按专业短剧/漫剧制作逻辑规划成完整的一集，而不是逐句拆段。',
        '必须建立稳定角色档案：身份、年龄、外貌、服装、标志性元素、性格、关系、目标、当前情绪、固定视觉关键词。',
        '必须给出故事整体分析：类型、核心主题、时代/地点/世界观、整体视觉风格。',
        '必须给出幕/章节拆解：剧情目标、冲突、情绪变化、关键事件、角色变化。',
        '仅输出 JSON 对象，不要 markdown，不要解释。',
    ].join('\n'),
    episodeBreakdownSystem: [
        '你是专业分镜导演、编剧和 AI 视觉提示词工程师，同时具备真人影视、动漫、国漫、3D 动画的镜头语言素养。',
        '把指定单集拆成场景，再把场景拆成可直接生产的镜头；严禁输出其他分集内容。',
        '你要做的是专业剧本改编与分镜设计，不是按句号、逗号或段落切开原文。',
        '每个场景必须有明确戏剧目的：信息揭示、人物选择、关系变化、危险逼近、反转或情绪推进。',
        '每个镜头必须服务于场景目的，允许合并多句原文为一个可拍镜头，也允许把关键动作拆成多个镜头。',
        '每镜必须可拍、可画、动作连续，角色名称稳定；对白必须标注说话人和情绪。',
        '每镜必须包含：purpose、visual、action、sound、audiovisualLanguage、imagePrompt、videoPrompt。',
        '',
        '【视听语言 audiovisualLanguage — 最高优先级字段之一】',
        'audiovisualLanguage 必须是 1～3 句完整的中文镜头叙事描写，写「镜头如何讲故事」，而不是标签清单。',
        '禁止输出：仅「特写 / 推镜头 / 平视 / 长焦」等词条罗列；禁止空泛的「画面好看」「电影感」。',
        '必须把运镜、景别、光色、材质、声画、角色状态编织成连贯句子，说明它们如何服务情绪与戏剧信息。',
        '',
        '写作结构建议（可自然融合，不必分条）：',
        '1) 运镜与景别如何跟随/压迫/疏离角色；',
        '2) 关键帧信息（表情、肢体、道具、受制或主动）；',
        '3) 光色、材质、对比如何强化冲击或情绪；',
        '4) 可选：环境声、呼吸、音乐与画面同步的感觉。',
        '',
        '真人/写实影视范例：',
        '「微摇的镜头跟随角色的挣扎，特写交代了男子受制、无法反抗的生理困境。金属的冷色与鲜红的血液形成强烈对比，增强了视觉冲击力。」',
        '',
        '动漫/赛璐璐范例：',
        '「手持感的跟镜压近角色侧脸，速度线在背景炸开，特写咬紧的牙关与泛红眼角把崩溃情绪钉死。平涂阴影切成硬边，高饱和对比色把怒意推到前景。」',
        '',
        '国漫/3D 仙侠范例：',
        '「缓推镜头穿过灵雾，中景落在袍角翻飞与剑光交击；随后切近眼部高光，刀光反射在虹膜上。冷青的体积光与暖金法阵形成层次，烟尘粒子拖出一丝余韵。」',
        '',
        '暗黑写实/惊悚范例：',
        '「低机位微仰缓推，让走廊尽头的身影显得压迫；景深虚化前景铁栏，把视线钉在颤抖的指节。青灰雾气吞没高光，只有一点腥红提示危险逼近。」',
        '',
        '请根据导演控制中的图片风格/视频风格/角色表现自动选择语感：真人写实偏摄影与材质，动漫偏线、影、速度线与夸张表情，古风偏烟尘、光雾与器物质感。',
        '',
        'imagePrompt 描述单一关键帧（英文优先），videoPrompt 描述从该关键帧开始的动作、镜头运动和连续性。',
        '连续镜头必须说明服装、道具、人物相对位置、朝向、光线和时间状态的延续。',
        '仅输出 JSON 对象，不要 markdown，不要解释。',
    ].join('\n'),
};
export function emptyScriptBreakdown(sourceText = '') {
    return {
        version: 1,
        title: '未命名剧本',
        sourceText,
        episodes: [],
        generatedAt: new Date().toISOString(),
    };
}
export function flattenScriptBreakdownShots(payload) {
    return payload?.episodes.flatMap((episode) => episode.shots) ?? [];
}
/** 将剧本拆分结果转换为后续批审、视频与导出共用的 Shot 数据。 */
export function storyboardShotsFromScriptBreakdown(payload) {
    const episodeTitles = new Map(payload?.episodes.map((episode) => [episode.id, episode.title]) ?? []);
    return flattenScriptBreakdownShots(payload).map((shot, index) => {
        const approved = shot.status === 'approved';
        const hasPreview = Boolean(shot.previewImageUrl);
        const shotType = shot.shotSize === 'CU' || shot.shotSize === 'ECU'
            ? 'close'
            : shot.shotSize === 'WS'
                ? 'wide'
                : shot.shotSize === 'FS'
                    ? 'wide'
                    : 'medium';
        return {
            id: shot.id,
            episodeId: shot.episodeId,
            episodeIndex: shot.episodeIndex,
            episodeTitle: episodeTitles.get(shot.episodeId) ?? `第 ${shot.episodeIndex} 集`,
            index,
            durationSec: Math.max(1, shot.durationSec || 5),
            shotType,
            descriptionZh: shot.scriptText || shot.title,
            promptEn: shot.imagePrompt,
            videoPromptEn: shot.videoPrompt,
            firstFrameAssetId: shot.previewImageUrl ?? null,
            status: approved ? 'approved' : hasPreview ? 'review' : 'draft',
            characterIds: [],
            characterNames: shot.characters,
            sceneName: shot.scene,
            sceneId: shot.sceneId,
            sceneCode: shot.sceneCode,
            notes: shot.continuityNotes?.length ? shot.continuityNotes.join('\n') : undefined,
            keyframeStatus: approved ? 'approved' : hasPreview ? 'review' : 'draft',
            videoStatus: 'draft',
        };
    });
}
/** 按名称/场次码把剧本语义绑定到项目角色库与场景库的稳定资产 ID。 */
export function bindStoryboardShotAssets(shots, characters, environments) {
    const characterByName = new Map();
    for (const character of characters) {
        const keys = [
            character.name,
            character.creative?.nickname,
            ...(character.creative?.aliases ?? []),
        ].map((item) => item?.trim()).filter((item) => Boolean(item));
        for (const key of keys)
            characterByName.set(key, character);
    }
    return shots.map((shot) => {
        const characterIds = (shot.characterNames ?? [])
            .map((name) => characterByName.get(name.trim())?.id)
            .filter((id) => Boolean(id));
        const environment = environments.find((item) => (shot.sceneCode && item.sceneCode === shot.sceneCode) ||
            (shot.sceneName && item.name.trim() === shot.sceneName.trim()));
        return {
            ...shot,
            characterIds,
            sceneAssetId: environment?.id ?? shot.sceneAssetId ?? null,
        };
    });
}
