/**
 * asset-bible-image.ts — 资产库 Bible 定妆/场景图生成（F-037）。
 *
 * 角色/场景详情 → 一键调用 picture-gen → 写回 referenceImageUrl。
 */
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

/**
 * 构建定妆图/场景图的生成提示词。
 */
export function buildBibleImagePrompt(request: AssetBibleImageRequest): string {
  if (request.kind === 'character') {
    return `Character design sheet: ${request.name}. ${request.description}. Front view, full body, clean background, consistent identity, concept art quality.`;
  }
  return `Environment concept art: ${request.name}. ${request.description}. Wide shot, atmospheric lighting, establishing shot, cinematic quality.`;
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
