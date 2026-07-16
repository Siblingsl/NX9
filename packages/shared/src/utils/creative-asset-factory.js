import { defaultCharacterVariants } from '../data/creative-asset-presets';
import { regenerateCharacterPrompts, regenerateVoicePrompts, regenerateWorkspacePrompts } from './creative-asset-prompts';
export function newCharacterProfile(name = '新角色') {
    const id = `char-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const variants = defaultCharacterVariants();
    const base = {
        id,
        name,
        descriptionZh: '',
        consistencyPrompt: '',
        referenceImageUrl: null,
        referenceAudioUrl: null,
        tags: [],
        bible: {
            identity: '',
            appearance: '',
            personality: '',
            background: '',
            voice: '',
            relationships: '',
        },
        creative: {
            ...variants,
            aliases: [],
            occupation: '',
            identityRole: '',
            personalityText: '',
            backgroundStory: '',
            worldView: '',
        },
    };
    const creative = regenerateCharacterPrompts(base);
    return normalizeCharacterProfile({
        ...base,
        creative,
        consistencyPrompt: creative.consistency?.consistencyPrompt ?? '',
    });
}
export function normalizeCharacterProfile(c) {
    const variants = defaultCharacterVariants();
    const creative = c.creative ?? {};
    return {
        ...c,
        creative: {
            ...variants,
            ...creative,
            aliases: [...new Set((creative.aliases ?? []).map((item) => item.trim()).filter(Boolean))],
            expressions: creative.expressions?.length ? creative.expressions : variants.expressions,
            poses: creative.poses?.length ? creative.poses : variants.poses,
            angles: creative.angles?.length ? creative.angles : variants.angles,
        },
        consistencyPrompt: c.consistencyPrompt?.trim() ||
            creative.consistency?.consistencyPrompt?.trim() ||
            creative.prompts?.bible?.text?.trim() ||
            c.consistencyPrompt,
    };
}
export function patchCharacterCreative(c, patch) {
    return normalizeCharacterProfile({
        ...c,
        creative: { ...c.creative, ...patch },
    });
}
export function patchWorkspaceCreative(item, patch) {
    return {
        ...item,
        creative: { ...item.creative, ...patch },
    };
}
export function patchVoiceCreative(s, patch) {
    return { ...s, creative: { ...s.creative, ...patch } };
}
export function refreshCharacterPrompts(c) {
    const creative = regenerateCharacterPrompts(c);
    return normalizeCharacterProfile({
        ...c,
        creative,
        consistencyPrompt: creative.consistency?.consistencyPrompt ?? c.consistencyPrompt,
    });
}
export function refreshWorkspacePrompts(item) {
    const creative = regenerateWorkspacePrompts(item);
    return { ...item, creative };
}
export function refreshVoicePrompts(s) {
    return { ...s, creative: regenerateVoicePrompts(s) };
}
