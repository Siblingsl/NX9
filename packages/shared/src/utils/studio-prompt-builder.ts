/**
 * 制作台专业提示词生成（与画布可复用，但面向「通告台 / 镜头表」语义）。
 * 输出英文成图/成片主提示词，中文说明保留在镜头 descriptionZh。
 */
import type { CharacterProfile } from '../types/character';
import type { EnvironmentProfile } from '../types/environment';
import type { EpisodeMeta, StoryboardShot } from '../types/storyboard';
import { enrichPromptWithCharacters } from './character-prompt';
import { enrichPromptWithEnvironment } from './environment-prompt';
import { buildLineArtShotPrompt } from './line-art-prompt';

export interface StudioPromptContext {
  shot: StoryboardShot;
  characters?: CharacterProfile[];
  environment?: EnvironmentProfile | null;
  episode?: EpisodeMeta | null;
  /** 全剧默认美术方向 */
  globalArtDirection?: string;
  /** 画风补充，如 anime cel-shading / cinematic live-action */
  artStyle?: string;
}

const CAMERA_MOVE_EN: Record<string, string> = {
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

function shotSizeEn(shotType: string | undefined): string {
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

function translateCamera(move?: string | null): string {
  if (!move?.trim()) return '';
  const key = move.trim();
  return CAMERA_MOVE_EN[key] || CAMERA_MOVE_EN[key.toLowerCase()] || `camera move: ${key}`;
}

/**
 * 专业分镜预览图（关键帧 / storyboard still）提示词
 */
export function buildStudioImagePrompt(ctx: StudioPromptContext): string {
  const { shot, characters = [], environment, episode, globalArtDirection, artStyle } = ctx;
  const lines: string[] = [];

  lines.push('Professional storyboard keyframe, single cinematic still frame, high narrative clarity, production quality, locked character/environment continuity.');
  lines.push(shotSizeEn(shot.shotType));

  const cam = translateCamera(shot.cameraMove);
  if (cam) lines.push(cam);

  const subject =
    shot.imagePromptPro?.trim() ||
    shot.promptEn?.trim() ||
    shot.descriptionZh?.trim() ||
    'story moment';
  lines.push(`Scene content: ${subject}`);

  if (shot.lighting?.trim()) lines.push(`Lighting: ${shot.lighting.trim()}`);
  if (shot.colorGrade?.trim()) lines.push(`Color grade / palette: ${shot.colorGrade.trim()}`);

  const art = [episode?.artDirection, globalArtDirection, artStyle].filter(Boolean).join('; ');
  if (art) lines.push(`Art direction: ${art}`);
  if (episode?.cameraStyle?.trim()) lines.push(`Episode camera language: ${episode.cameraStyle.trim()}`);

  if (shot.sceneName) lines.push(`Location: ${shot.sceneName}`);

  let prompt = lines.join('\n');
  if (characters.length) prompt = enrichPromptWithCharacters(prompt, characters);
  if (environment) prompt = enrichPromptWithEnvironment(prompt, environment);

  prompt +=
    '\nConstraints: consistent character identity across franchise bible, coherent environment continuity, single frame only, no watermark, no UI chrome, no multi-panel grid, no text overlay.';
  return prompt.trim();
}

/**
 * 专业镜头视频提示词（运镜 + 表演 + 光色）
 */
export function buildStudioVideoPrompt(ctx: StudioPromptContext): string {
  const { shot, characters = [], environment, episode, globalArtDirection, artStyle } = ctx;
  const lines: string[] = [];

  lines.push('Cinematic continuous shot, natural motion, production-ready short clip, identity-locked from first frame.');
  lines.push(`Duration intent: about ${shot.durationSec || 4} seconds.`);
  lines.push(shotSizeEn(shot.shotType));

  const cam = translateCamera(shot.cameraMove) || 'subtle motivated camera movement';
  lines.push(`Camera: ${cam}`);

  const action =
    shot.videoPromptPro?.trim() ||
    shot.videoPromptEn?.trim() ||
    shot.videoDesc?.trim() ||
    shot.descriptionZh?.trim() ||
    shot.promptEn?.trim() ||
    'character action continues naturally';
  lines.push(`Action & performance: ${action}`);

  if (shot.lighting?.trim()) lines.push(`Lighting continuity: ${shot.lighting.trim()}`);
  if (shot.colorGrade?.trim()) lines.push(`Color grade: ${shot.colorGrade.trim()}`);
  if (shot.audioDirection?.trim()) lines.push(`Sound design note: ${shot.audioDirection.trim()}`);

  const art = [episode?.artDirection, globalArtDirection, artStyle].filter(Boolean).join('; ');
  if (art) lines.push(`Look: ${art}`);

  let prompt = lines.join('\n');
  if (characters.length) prompt = enrichPromptWithCharacters(prompt, characters);
  if (environment) prompt = enrichPromptWithEnvironment(prompt, environment);

  prompt +=
    '\nConstraints: maintain character identity and costume from first frame, continuous motivated camera, no jump cuts, no text overlay, filmic motion blur only when motivated, keep spatial continuity.';
  return prompt.trim();
}

/**
 * 分镜线稿提示词：用于草图确认、构图预览、手绘画板参考。
 * 不替代正式关键帧出图；它故意去掉色彩、材质和最终渲染词，避免污染成图 Prompt。
 */
export function buildStudioLineArtPrompt(ctx: StudioPromptContext): string {
  const { shot, characters = [], environment, episode, globalArtDirection } = ctx;
  const base = [
    shot.sketchPrompt?.trim(),
    shot.descriptionZh?.trim(),
    shot.sceneName ? `location: ${shot.sceneName}` : '',
    shotSizeEn(shot.shotType),
    translateCamera(shot.cameraMove),
    episode?.cameraStyle ? `episode camera language: ${episode.cameraStyle}` : '',
    globalArtDirection ? `overall art direction reference: ${globalArtDirection}` : '',
  ].filter(Boolean).join('\n');

  let prompt = buildLineArtShotPrompt(base, shot.shotType);
  if (characters.length) prompt = enrichPromptWithCharacters(prompt, characters);
  if (environment) prompt = enrichPromptWithEnvironment(prompt, environment);
  return `${prompt}\nConstraints: composition draft only; preserve character identity via silhouette, hairline and costume landmarks; no color, no shading fill, no polished render, no photoreal skin, no watermark, no multi-panel collage.`.trim();
}

/** 一键为镜头写入专业提示词字段（不覆盖用户非空手写时可选 force） */
export function applyStudioPromptsToShot(
  shot: StoryboardShot,
  ctx: Omit<StudioPromptContext, 'shot'>,
  opts?: { force?: boolean },
): Partial<StoryboardShot> {
  const force = opts?.force ?? false;
  const full: StudioPromptContext = { ...ctx, shot };
  const image = buildStudioImagePrompt(full);
  const video = buildStudioVideoPrompt(full);
  const sketch = buildStudioLineArtPrompt(full);
  return {
    imagePromptPro: force || !shot.imagePromptPro?.trim() ? image : shot.imagePromptPro,
    videoPromptPro: force || !shot.videoPromptPro?.trim() ? video : shot.videoPromptPro,
    // 同步到执行链常用字段，便于出图/出视频 runner 读取
    promptEn: force || !shot.promptEn?.trim() ? image : shot.promptEn,
    videoPromptEn: force || !shot.videoPromptEn?.trim() ? video : shot.videoPromptEn,
    sketchPrompt: force || !shot.sketchPrompt?.trim() ? sketch : shot.sketchPrompt,
  };
}
