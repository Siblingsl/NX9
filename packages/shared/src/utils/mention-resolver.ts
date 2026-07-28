/**
 * mention-resolver.ts — `@` 提及注入全节点统一（F-024）。
 *
 * 所有生成入口走同一 resolveMentionsForPrompt。
 */
export interface MentionRef {
  id: string;
  kind: string;
  url?: string;
  label: string;
}

/**
 * 统一解析 prompt 中的 `@` 提及。
 * 将 `@角色:名字` 等 token 替换为实际引用。
 */
export function resolveMentionsForPrompt(
  text: string,
  mentions: MentionRef[],
): { resolved: string; unresolved: string[] } {
  const unresolved: string[] = [];
  let resolved = text;

  for (const ref of mentions) {
    const pattern = new RegExp(`@${ref.kind}:${escapeRegex(ref.label)}`, 'g');
    const replacement = ref.url ?? ref.label;
    if (pattern.test(resolved)) {
      resolved = resolved.replace(pattern, replacement);
    } else {
      // 尝试匹配简单格式
      const simplePattern = new RegExp(`@${escapeRegex(ref.label)}`, 'g');
      if (simplePattern.test(resolved)) {
        resolved = resolved.replace(simplePattern, replacement);
      }
    }
  }

  // 收集未解析的 @ 引用
  const unresolvedPattern = /@(\w[\w\u4e00-\u9fa5:-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = unresolvedPattern.exec(resolved)) !== null) {
    unresolved.push(match[1]);
  }

  return { resolved, unresolved };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 构建带 references 的生成请求 payload。
 */
export function buildPromptWithReferences(
  basePrompt: string,
  mentions: MentionRef[],
): { prompt: string; references: MentionRef[] } {
  const { resolved } = resolveMentionsForPrompt(basePrompt, mentions);
  return {
    prompt: resolved,
    references: mentions,
  };
}
