/** 工作区内本地媒体 @ 引用（生成图 / 上游图），与素材库 @角色/@场景 并存 */

export type LocalMediaMentionKind = 'generated' | 'upstream';

export interface LocalMediaMentionItem {
  kind: LocalMediaMentionKind;
  /** 1-based 序号，用于 token 与解析 */
  index: number;
  label: string;
  url: string;
}

export const LOCAL_MEDIA_MENTION_PREFIX: Record<LocalMediaMentionKind, string> = {
  generated: '生成',
  upstream: '上游',
};

export const LOCAL_MEDIA_MENTION_TABS: {
  key: LocalMediaMentionKind;
  label: string;
}[] = [
  { key: 'generated', label: '生成图' },
  { key: 'upstream', label: '上游图' },
];

const PREFIX_TO_KIND = Object.fromEntries(
  Object.entries(LOCAL_MEDIA_MENTION_PREFIX).map(([k, v]) => [v, k]),
) as Record<string, LocalMediaMentionKind>;

export function formatLocalMediaMention(kind: LocalMediaMentionKind, label: string): string {
  return `@${LOCAL_MEDIA_MENTION_PREFIX[kind]}:${label}`;
}

export function buildLocalMediaItems(
  generatedUrls: string[],
  upstreamUrls: string[],
): LocalMediaMentionItem[] {
  const items: LocalMediaMentionItem[] = [];
  generatedUrls.forEach((url, i) => {
    if (!url) return;
    items.push({
      kind: 'generated',
      index: i + 1,
      label: `图${i + 1}`,
      url,
    });
  });
  upstreamUrls.forEach((url, i) => {
    if (!url) return;
    items.push({
      kind: 'upstream',
      index: i + 1,
      label: `图${i + 1}`,
      url,
    });
  });
  return items;
}

/** 检测 @ 后是否指向本地媒体 kind */
export function guessLocalMediaKindFromQuery(query: string): LocalMediaMentionKind | null {
  if (!query) return null;
  const bare = query.replace(/:$/, '');
  for (const [kind, prefix] of Object.entries(LOCAL_MEDIA_MENTION_PREFIX) as [
    LocalMediaMentionKind,
    string,
  ][]) {
    if (bare === prefix || bare.startsWith(prefix)) return kind;
  }
  return null;
}

export function labelQueryFromLocalMediaMention(query: string): string {
  const colon = query.indexOf(':');
  if (colon >= 0) return query.slice(colon + 1);
  for (const prefix of Object.values(LOCAL_MEDIA_MENTION_PREFIX)) {
    if (query.startsWith(prefix)) return query.slice(prefix.length).replace(/^:/, '');
  }
  return query;
}

export function insertLocalMediaMentionToken(
  text: string,
  cursor: number,
  kind: LocalMediaMentionKind,
  label: string,
): { value: string; cursor: number } {
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const atIndex = before.lastIndexOf('@');
  const prefix = atIndex >= 0 ? before.slice(0, atIndex) : before;
  const token = `${formatLocalMediaMention(kind, label)} `;
  const value = `${prefix}${token}${after}`;
  return { value, cursor: prefix.length + token.length };
}

/** 在光标/选区处追加 @生成/@上游（不替换未完成的 @ 查询） */
export function insertLocalMediaMentionAtSelection(
  text: string,
  cursor: number,
  kind: LocalMediaMentionKind,
  label: string,
  selectionEnd?: number,
): { value: string; cursor: number } {
  const end = selectionEnd ?? cursor;
  const from = Math.min(cursor, end);
  const to = Math.max(cursor, end);
  const token = `${formatLocalMediaMention(kind, label)} `;
  const value = `${text.slice(0, from)}${token}${text.slice(to)}`;
  return { value, cursor: from + token.length };
}

export function parseLocalMediaMentions(
  text: string | undefined,
): Array<{ kind: LocalMediaMentionKind; label: string }> {
  if (!text) return [];
  const pattern = /@(生成|上游):(\S+)/g;
  const seen = new Set<string>();
  const result: Array<{ kind: LocalMediaMentionKind; label: string }> = [];
  for (const m of text.matchAll(pattern)) {
    const kind = PREFIX_TO_KIND[m[1]];
    const label = m[2];
    const key = `${kind}:${label}`;
    if (kind && !seen.has(key)) {
      seen.add(key);
      result.push({ kind, label });
    }
  }
  return result;
}

/** 从 prompt 中的 @生成/@上游 token 解析出参考图 URL */
export function resolveLocalMediaMentionUrls(
  prompt: string | undefined,
  generatedUrls: string[],
  upstreamUrls: string[],
): string[] {
  const mentions = parseLocalMediaMentions(prompt);
  if (mentions.length === 0) return [];
  const pool = buildLocalMediaItems(generatedUrls, upstreamUrls);
  const urls: string[] = [];
  for (const m of mentions) {
    const item = pool.find(
      (i) =>
        i.kind === m.kind &&
        (i.label === m.label ||
          i.label.toLowerCase() === m.label.toLowerCase() ||
          `图${i.index}` === m.label),
    );
    if (item?.url && !urls.includes(item.url)) urls.push(item.url);
  }
  return urls;
}
