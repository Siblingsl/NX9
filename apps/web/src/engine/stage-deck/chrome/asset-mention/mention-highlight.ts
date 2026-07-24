/** 提示词中所有 @token 的高亮与点击定位 */

export interface MentionSpan {
  start: number;
  end: number;
  text: string;
}

/** 角色/场景/生成/上游等完整 @ 引用 */
export const MENTION_TOKEN_RE =
  /@(?:生成|上游|角色|服装|场景|镜头|情绪|钩子|声音):[^\s@]+/g;

export function findAllMentionSpans(text: string): MentionSpan[] {
  if (!text) return [];
  const spans: MentionSpan[] = [];
  for (const m of text.matchAll(MENTION_TOKEN_RE)) {
    const start = m.index ?? 0;
    spans.push({ start, end: start + m[0].length, text: m[0] });
  }
  return spans;
}

/** 光标落在某个 @token 内（含右边界）则返回该 span */
export function findMentionSpanAt(text: string, pos: number): MentionSpan | null {
  for (const span of findAllMentionSpans(text)) {
    if (pos >= span.start && pos <= span.end) return span;
  }
  return null;
}

export type MentionSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; start: number; end: number };

export function splitMentionSegments(text: string): MentionSegment[] {
  const spans = findAllMentionSpans(text);
  if (spans.length === 0) return [{ type: 'text', text }];
  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, span.start) });
    }
    segments.push({ type: 'mention', text: span.text, start: span.start, end: span.end });
    cursor = span.end;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', text: text.slice(cursor) });
  }
  return segments;
}
