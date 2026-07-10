import type { AssetLibraryKind } from '@nx9/shared';
import { ASSET_KIND_MENTION_PREFIX, formatAssetMention } from '@nx9/shared';

/** 检测光标前是否有未完成的 @ 查询（@ 或 @关键字） */
export function detectAssetMentionQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor);
  const match = before.match(/@([\w\u4e00-\u9fa5:]*)$/);
  return match ? match[1] : null;
}

/** 将 @查询 替换为完整素材引用 token */
export function insertAssetMentionToken(
  text: string,
  cursor: number,
  kind: AssetLibraryKind,
  label: string,
): { value: string; cursor: number } {
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const atIndex = before.lastIndexOf('@');
  const prefix = atIndex >= 0 ? before.slice(0, atIndex) : before;
  const token = `${formatAssetMention(kind, label)} `;
  const value = `${prefix}${token}${after}`;
  return { value, cursor: prefix.length + token.length };
}

/** 根据 @ 后输入猜测素材库 Tab */
export function guessKindFromMentionQuery(query: string): AssetLibraryKind | null {
  if (!query) return null;
  const bare = query.replace(/:$/, '');
  for (const [kind, prefix] of Object.entries(ASSET_KIND_MENTION_PREFIX) as [
    AssetLibraryKind,
    string,
  ][]) {
    if (bare === prefix || bare.startsWith(prefix)) return kind;
  }
  return null;
}

/** 过滤 @ 查询后的标签关键字（如 "角色:" → ""） */
export function labelQueryFromMention(query: string): string {
  const colon = query.indexOf(':');
  if (colon >= 0) return query.slice(colon + 1);
  for (const prefix of Object.values(ASSET_KIND_MENTION_PREFIX)) {
    if (query.startsWith(prefix)) return query.slice(prefix.length).replace(/^:/, '');
  }
  return query;
}

/** 估算 input/textarea 光标处的屏幕坐标（用于 Portal 定位） */
export function getInputCaretScreenPoint(
  element: HTMLInputElement | HTMLTextAreaElement,
  position: number,
): { top: number; left: number } {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const mirror = document.createElement('div');
  const props = [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'letterSpacing',
    'textTransform',
    'wordSpacing',
    'textIndent',
    'whiteSpace',
    'wordWrap',
    'wordBreak',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'boxSizing',
    'lineHeight',
  ] as const;

  mirror.style.position = 'fixed';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.top = `${rect.top}px`;
  mirror.style.left = `${rect.left}px`;
  mirror.style.width = `${rect.width}px`;
  mirror.style.overflow = 'hidden';
  mirror.style.whiteSpace = element instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre';
  mirror.style.wordWrap = 'break-word';

  for (const prop of props) {
    mirror.style[prop] = style[prop];
  }

  const textBefore = element.value.slice(0, position);
  const textAfter = element.value.slice(position);
  mirror.textContent = textBefore;
  const marker = document.createElement('span');
  marker.textContent = textAfter.length > 0 ? textAfter[0] : '.';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const markerRect = marker.getBoundingClientRect();
  document.body.removeChild(mirror);

  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 16;
  return {
    left: Math.min(markerRect.left, rect.right - 8),
    top: markerRect.top + lineHeight + 4,
  };
}
