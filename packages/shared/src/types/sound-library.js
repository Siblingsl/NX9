export const BUILTIN_PUBLIC_SOUND_ASSETS = [
    {
        id: 'builtin-sound-warm-narration',
        name: '温暖旁白',
        description: '适合治愈、成长、回忆类短片的温柔叙述声线。',
        audioUrl: '',
        tags: ['旁白', '治愈', '温暖'],
        creative: {
            voiceTone: 'warm, gentle, intimate narration voice',
            age: '青年至中年',
            gender: '中性',
            speed: '中慢速',
            emotion: '温暖、克制、有陪伴感',
            language: '中文普通话',
        },
    },
    {
        id: 'builtin-sound-suspense-drone',
        name: '悬疑低频氛围',
        description: '用于推理、惊悚、反转前的低频压迫感氛围声。',
        audioUrl: '',
        tags: ['悬疑', '惊悚', '氛围'],
        creative: {
            voiceTone: 'low frequency suspense drone, subtle pulse, cinematic tension',
            speed: '缓慢推进',
            emotion: '不安、压迫、等待揭示',
            language: '无对白',
        },
    },
    {
        id: 'builtin-sound-city-night',
        name: '城市夜景环境声',
        description: '远处车流、人声、霓虹街区的都市夜晚环境底声。',
        audioUrl: '',
        tags: ['城市', '夜晚', '环境声'],
        creative: {
            voiceTone: 'distant traffic, soft crowd murmur, neon city ambience at night',
            speed: '稳定持续',
            emotion: '孤独、都市感、现实质感',
            language: '环境声',
        },
    },
    {
        id: 'builtin-sound-epic-action',
        name: '史诗动作鼓点',
        description: '适合追逐、战斗、爆发转折的鼓点与管弦推进。',
        audioUrl: '',
        tags: ['动作', '史诗', '战斗'],
        creative: {
            voiceTone: 'epic percussion, rising orchestral hits, cinematic action rhythm',
            speed: '快速递进',
            emotion: '热血、紧张、爆发',
            language: '无对白',
        },
    },
    {
        id: 'builtin-sound-rain-window',
        name: '雨夜窗边',
        description: '雨滴敲窗、远雷与室内静默，适合情绪独白和失落段落。',
        audioUrl: '',
        tags: ['雨声', '情绪', '室内'],
        creative: {
            voiceTone: 'rain on window, distant thunder, quiet room tone',
            speed: '缓慢持续',
            emotion: '悲伤、怀旧、私密',
            language: '环境声',
        },
    },
    {
        id: 'builtin-sound-light-comedy',
        name: '轻喜剧节拍',
        description: '用于尴尬、反差、轻松桥段的轻快节奏和短促音效点。',
        audioUrl: '',
        tags: ['喜剧', '轻快', '节奏'],
        creative: {
            voiceTone: 'light comedic rhythm, playful plucks, small accent hits',
            speed: '中快速',
            emotion: '轻松、俏皮、反差',
            language: '无对白',
        },
    },
];
export function emptySoundLibrary() {
    return { version: 1, sounds: [] };
}
export function newSoundAsset(name = '新声音') {
    return {
        id: `sound-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        description: '',
        audioUrl: '',
        tags: [],
    };
}
