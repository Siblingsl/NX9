export const CONTINUITY_IMAGE_CAP = 4;

export interface ContinuityIssue {
  /** 可选：issue 对应的镜头序号（0 起，与发送图像顺序一致）。 */
  shotIndex?: number;
  /** 可选：issue 对应的镜头 id（优先于 shotIndex）。 */
  shotId?: string;
  message: string;
}

export interface ParsedContinuityLlm {
  summary?: string;
  issues: ContinuityIssue[];
  /** LLM 返回无法解析为预期 JSON 时为 true，调用方应如实展示而不假装无问题。 */
  parseFailed: boolean;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  const tryParse = (input: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(input) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(candidate);
  if (direct) return direct;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) return tryParse(candidate.slice(start, end + 1));
  return null;
}

function normalizeContinuityIssue(item: unknown): ContinuityIssue | null {
  if (typeof item === 'string') {
    const message = item.trim();
    return message ? { message } : null;
  }
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const message = typeof record.message === 'string' ? record.message.trim() : '';
  if (!message) return null;
  const shotId = typeof record.shotId === 'string' ? record.shotId : undefined;
  const shotIndex = typeof record.shotIndex === 'number'
    ? record.shotIndex
    : typeof record.index === 'number'
      ? record.index
      : undefined;
  return { shotIndex, shotId, message };
}

/** DR-04: 去 markdown 围栏并归一化 LLM 返回的连续性 issue 列表。 */
export function parseContinuityLlmJson(raw: unknown): ParsedContinuityLlm {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  const json = extractJsonObject(text);
  if (!json) return { issues: [], parseFailed: true };
  const summary = typeof json.summary === 'string' ? json.summary.trim() : undefined;
  if (!Array.isArray(json.issues)) return { summary, issues: [], parseFailed: true };
  const issues = json.issues
    .map(normalizeContinuityIssue)
    .filter((issue): issue is ContinuityIssue => issue !== null);
  return { summary, issues, parseFailed: false };
}

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
  '你是分镜 continuity supervisor。对比多张镜头静帧，列出服装、光影、轴线、道具不一致之处。' +
  '输出 JSON: {"summary":"...","issues":[{"shotIndex":0,"message":"..."}]}；shotIndex 从 0 开始对应输入图像顺序，无法定位时可省略。';
