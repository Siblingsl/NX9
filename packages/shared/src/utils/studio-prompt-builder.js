import { enrichPromptWithCharacters } from './character-prompt';
import { enrichPromptWithEnvironment } from './environment-prompt';
const CAMERA_MOVE_EN = {
    固定: 'static locked-off camera',
    推: 'slow dolly in',
    拉: 'slow dolly out',
    摇: 'gentle pan',
    移: 'lateral tracking shot',
    跟: 'follow tracking shot',
    升: 'crane up',
    降: 'crane down',
    手持: 'handheld micro-shake, intimate documentary feel',
    环绕: 'orbit around subject',
    static: 'static locked-off camera',
    'dolly-in': 'slow dolly in',
    'dolly-out': 'slow dolly out',
    pan: 'gentle pan',
    track: 'lateral tracking shot',
    follow: 'follow tracking shot',
    handheld: 'handheld micro-shake',
    orbit: 'orbit around subject',
};
function shotSizeEn(shotType) {
    switch (shotType) {
        case 'close':
            return 'close-up shot';
        case 'medium':
            return 'medium shot';
        case 'wide':
            return 'wide shot';
        case 'extreme-wide':
            return 'extreme wide establishing shot';
        default:
            return shotType ? `${shotType} framing` : 'cinematic framing';
    }
}
function translateCamera(move) {
    if (!move?.trim())
        return '';
    const key = move.trim();
    return CAMERA_MOVE_EN[key] || CAMERA_MOVE_EN[key.toLowerCase()] || `camera move: ${key}`;
}
/**
 * 专业分镜预览图（关键帧 / storyboard still）提示词
 */
export function buildStudioImagePrompt(ctx) {
    const { shot, characters = [], environment, episode, globalArtDirection, artStyle } = ctx;
    const lines = [];
    lines.push('Professional storyboard keyframe, single cinematic still frame, high detail, production quality.');
    lines.push(shotSizeEn(shot.shotType));
    const cam = translateCamera(shot.cameraMove);
    if (cam)
        lines.push(cam);
    const subject = shot.imagePromptPro?.trim() ||
        shot.promptEn?.trim() ||
        shot.descriptionZh?.trim() ||
        'story moment';
    lines.push(`Scene content: ${subject}`);
    if (shot.lighting?.trim())
        lines.push(`Lighting: ${shot.lighting.trim()}`);
    if (shot.colorGrade?.trim())
        lines.push(`Color grade / palette: ${shot.colorGrade.trim()}`);
    const art = [episode?.artDirection, globalArtDirection, artStyle].filter(Boolean).join('; ');
    if (art)
        lines.push(`Art direction: ${art}`);
    if (episode?.cameraStyle?.trim())
        lines.push(`Episode camera language: ${episode.cameraStyle.trim()}`);
    if (shot.sceneName)
        lines.push(`Location: ${shot.sceneName}`);
    let prompt = lines.join('\n');
    if (characters.length)
        prompt = enrichPromptWithCharacters(prompt, characters);
    if (environment)
        prompt = enrichPromptWithEnvironment(prompt, environment);
    prompt +=
        '\nConstraints: consistent character identity, coherent environment, no watermark, no UI chrome, no multi-panel grid.';
    return prompt.trim();
}
/**
 * 专业镜头视频提示词（运镜 + 表演 + 光色）
 */
export function buildStudioVideoPrompt(ctx) {
    const { shot, characters = [], environment, episode, globalArtDirection, artStyle } = ctx;
    const lines = [];
    lines.push('Cinematic continuous shot, natural motion, production-ready short clip.');
    lines.push(`Duration intent: about ${shot.durationSec || 4} seconds.`);
    lines.push(shotSizeEn(shot.shotType));
    const cam = translateCamera(shot.cameraMove) || 'subtle motivated camera movement';
    lines.push(`Camera: ${cam}`);
    const action = shot.videoPromptPro?.trim() ||
        shot.videoPromptEn?.trim() ||
        shot.videoDesc?.trim() ||
        shot.descriptionZh?.trim() ||
        shot.promptEn?.trim() ||
        'character action continues naturally';
    lines.push(`Action & performance: ${action}`);
    if (shot.lighting?.trim())
        lines.push(`Lighting continuity: ${shot.lighting.trim()}`);
    if (shot.colorGrade?.trim())
        lines.push(`Color grade: ${shot.colorGrade.trim()}`);
    if (shot.audioDirection?.trim())
        lines.push(`Sound design note: ${shot.audioDirection.trim()}`);
    const art = [episode?.artDirection, globalArtDirection, artStyle].filter(Boolean).join('; ');
    if (art)
        lines.push(`Look: ${art}`);
    let prompt = lines.join('\n');
    if (characters.length)
        prompt = enrichPromptWithCharacters(prompt, characters);
    if (environment)
        prompt = enrichPromptWithEnvironment(prompt, environment);
    prompt +=
        '\nConstraints: maintain identity from first frame, no jump cuts, no text overlay, filmic motion blur only when motivated.';
    return prompt.trim();
}
/** 一键为镜头写入专业提示词字段（不覆盖用户非空手写时可选 force） */
export function applyStudioPromptsToShot(shot, ctx, opts) {
    const force = opts?.force ?? false;
    const full = { ...ctx, shot };
    const image = buildStudioImagePrompt(full);
    const video = buildStudioVideoPrompt(full);
    return {
        imagePromptPro: force || !shot.imagePromptPro?.trim() ? image : shot.imagePromptPro,
        videoPromptPro: force || !shot.videoPromptPro?.trim() ? video : shot.videoPromptPro,
        // 同步到执行链常用字段，便于出图/出视频 runner 读取
        promptEn: force || !shot.promptEn?.trim() ? image : shot.promptEn,
        videoPromptEn: force || !shot.videoPromptEn?.trim() ? video : shot.videoPromptEn,
    };
}
