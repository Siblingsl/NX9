/**
 * asset-bible-image.ts — 资产库 Bible 定妆/场景图生成（F-037）。
 *
 * 角色/场景详情 → 一键调用 picture-gen → 写回 referenceImageUrl。
 * 权威模板来自 gen-bible-character / gen-bible-scene 的 prompt-pack。
 */
import { fillGenTemplate, type GenPromptPack } from './gen-skill-pack';

export interface AssetBibleImageRequest {
  /** 角色名或场景名 */
  name: string;
  /** Bible 描述文本 */
  description: string;
  /** 类型 */
  kind: 'character' | 'scene';
  /** 已有参考图 URL（可选） */
  existingImageUrl?: string | null;
}

export interface AssetBibleImageResult {
  url: string;
  prompt: string;
}

const LEGACY_BIBLE_CHARACTER =
  'Character design sheet: {name}. {description}. Front view, full body, clean background, consistent identity, concept art quality.';
const LEGACY_BIBLE_SCENE =
  'Environment concept art: {name}. {description}. Wide shot, atmospheric lighting, establishing shot, cinematic quality.';

/**
 * 构建定妆图/场景图的生成提示词。
 * @param pack 对应 gen-bible-* 拼装包；优先用 pack.template
 */
export function buildBibleImagePrompt(
  request: AssetBibleImageRequest,
  pack?: GenPromptPack | null,
): string {
  const legacy = request.kind === 'character' ? LEGACY_BIBLE_CHARACTER : LEGACY_BIBLE_SCENE;
  const tpl = pack?.template?.trim() || legacy;
  let prompt = fillGenTemplate(tpl, {
    name: request.name,
    description: request.description,
  });
  if (pack?.quality?.trim() && !prompt.includes(pack.quality.trim())) {
    prompt = `${pack.quality.trim()}\n${prompt}`;
  }
  if (pack?.constraints?.trim()) {
    prompt = `${prompt}\n${pack.constraints.trim()}`;
  }
  if (pack?.overlay?.trim()) {
    prompt = `${prompt}\n${pack.overlay.trim()}`;
  }
  return prompt.trim();
}

/**
 * 构建写入 asset 的 patch。
 */
export function buildBibleImagePatch(
  request: AssetBibleImageRequest,
  result: AssetBibleImageResult,
): Record<string, unknown> {
  return {
    referenceImageUrl: result.url,
    referencePrompt: result.prompt,
  };
}
