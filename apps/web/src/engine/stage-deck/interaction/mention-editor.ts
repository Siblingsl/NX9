/** P4-07: @mention token helpers for Composer Deck */

export interface MentionOption {
  blockId: string;
  label: string;
  url?: string;
}

/** Serialize to plain prompt with @[label](blockId) markers */
export function insertMentionToken(text: string, cursor: number, option: MentionOption): {
  value: string;
  cursor: number;
} {
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const atIndex = before.lastIndexOf('@');
  const prefix = atIndex >= 0 ? before.slice(0, atIndex) : before;
  const token = `@[${option.label}](${option.blockId}) `;
  const value = `${prefix}${token}${after}`;
  return { value, cursor: (prefix + token).length };
}

/** Export prompt for models: replace tokens with URL or @Label */
export function serializeMentionPrompt(text: string, options: MentionOption[]): string {
  return text.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, blockId) => {
    const opt = options.find((o) => o.blockId === blockId);
    if (opt?.url) return opt.url;
    return `@${label}`;
  });
}

export function detectMentionQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor);
  const match = before.match(/@([\w\u4e00-\u9fa5-]*)$/);
  return match ? match[1] : null;
}
