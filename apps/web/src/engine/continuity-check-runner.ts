export const CONTINUITY_IMAGE_CAP = 4;

export function resolveContinuityModel(data: Record<string, unknown>): string | undefined {
  const raw = ((data.llmModel as string) || (data.model as string) || '').trim();
  return raw || undefined;
}

export function sliceContinuityImages(images: string[]): {
  sent: string[];
  omitted: number;
  note?: string;
} {
  const omitted = Math.max(0, images.length - CONTINUITY_IMAGE_CAP);
  return {
    sent: images.slice(0, CONTINUITY_IMAGE_CAP),
    omitted,
    note: omitted > 0
      ? `视觉模型一次最多 ${CONTINUITY_IMAGE_CAP} 张，已省略后 ${omitted} 张`
      : undefined,
  };
}

export function buildContinuityUserText(opts: {
  imageCount: number;
  omitted?: number;
  context?: string;
}): string {
  const base = `检查 ${opts.imageCount} 个镜头的连贯性`;
  const cap =
    opts.omitted && opts.omitted > 0
      ? `（视觉模型一次最多 ${CONTINUITY_IMAGE_CAP} 张，已省略后 ${opts.omitted} 张）`
      : '';
  const ctx = opts.context?.trim() ? `。上下文：${opts.context.trim()}` : '';
  return `${base}${cap}${ctx}`;
}

export const CONTINUITY_SYSTEM_PROMPT =
  '你是分镜 continuity supervisor。对比多张镜头静帧，列出服装、光影、轴线、道具不一致之处。输出 JSON: {"summary":"...","issues":["..."]}';
