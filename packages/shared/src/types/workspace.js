import { emptyStoryboard, emptyVoice, migrateStoryboardPayload } from './storyboard';
import { emptyCharacterLibrary } from './character';
import { emptySoundLibrary } from './sound-library';
import { emptyBacklotCustom, emptyBacklotWorkspace } from '../data/backlot-templates';
import { DEFAULT_CANVAS_APPEARANCE } from '../utils/canvas-theme';
export function isWorkspaceV3(payload) {
    return payload.version === 3;
}
export function migrateV2ToV3(v2) {
    return {
        ...v2,
        version: 3,
        aliases: {},
        groups: [],
        takes: [],
        viewMode: 'explore',
    };
}
export function normalizeWorkspacePayload(raw) {
    const storyboard = raw.storyboard ? migrateStoryboardPayload(raw.storyboard) : emptyStoryboard();
    const base = {
        version: 2,
        blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
        links: Array.isArray(raw.links) ? raw.links : [],
        viewport: raw.viewport ?? { x: 0, y: 0, zoom: 1 },
        nextBlockIndex: raw.nextBlockIndex ?? 1,
        storyboard,
        voice: raw.voice ?? emptyVoice(),
        characters: raw.characters ?? emptyCharacterLibrary(),
        soundLibrary: raw.soundLibrary ?? emptySoundLibrary(),
        backlotCustom: raw.backlotCustom ?? emptyBacklotCustom(),
        backlotWorkspace: raw.backlotWorkspace ?? emptyBacklotWorkspace(),
        preferences: raw.preferences ?? {},
        canvasAppearance: raw.canvasAppearance ?? DEFAULT_CANVAS_APPEARANCE,
    };
    const rawScriptPlan = raw.scriptPlan;
    if (raw.version === 3) {
        return {
            ...base,
            version: 3,
            aliases: raw.aliases ?? {},
            lanes: raw.lanes,
            groups: raw.groups ?? [],
            takes: raw.takes ?? [],
            viewMode: raw.viewMode ?? 'explore',
            scriptPlan: rawScriptPlan,
            environments: raw.environments ?? undefined,
            playbookSession: raw.playbookSession ?? null,
        };
    }
    return base;
}
