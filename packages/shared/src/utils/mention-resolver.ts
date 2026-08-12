/**
 * mention-resolver.ts — `@` 提及注入全节点统一（F-024 / OL-06）。
 *
 * 所有生成入口走同一 resolveMentionsForPrompt。
 * 新产品路径优先 `@类型:名`；裸 `@名` 仅兼容旧文案，并记入 unresolvedBare。
 */
export interface MentionRef {
  id: string;
  kind: string;
  url?: string;
  label: string;
}

export interface ResolveMentionsResult {
  resolved: string;
  unresolved: string[];
  /** OL-06：仍靠裸 `@名` 命中的 label（建议升级为 `@角色:名`） */
  unresolvedBare: string[];
  /** 成功解析但走了裸 `@名` 兼容路径的 label */
  resolvedBare: string[];
}

/**
 * 统一解析 prompt 中的 `@` 提及。
 * 将 `@角色:名字` 等 token 替换为实际引用；裸 `@名` 仅作兼容。
 */
export function resolveMentionsForPrompt(
  text: string,
  mentions: MentionRef[],
): ResolveMentionsResult {
  const unresolved: string[] = [];
  const unresolvedBare: string[] = [];
  const resolvedBare: string[] = [];
  let resolved = text;

  for (const ref of mentions) {
    const typedPattern = new RegExp(`@${escapeRegex(ref.kind)}:${escapeRegex(ref.label)}`, 'g');
    const replacement = ref.url ?? ref.label;
    if (typedPattern.test(resolved)) {
      resolved = resolved.replace(typedPattern, replacement);
      continue;
    }
    // 兼容旧裸 `@名`：能替换但记入 resolvedBare，供健康提示升级
    const simplePattern = new RegExp(`@${escapeRegex(ref.label)}(?![:：])`, 'g');
    if (simplePattern.test(resolved)) {
      resolved = resolved.replace(simplePattern, replacement);
      resolvedBare.push(ref.label);
    }
  }

  // 收集未解析的 @ 引用（含裸名）
  const unresolvedPattern = /@([^\s@]+)/g;
  let match: RegExpExecArray | null;
  while ((match = unresolvedPattern.exec(resolved)) !== null) {
    const token = match[1];
    unresolved.push(token);
    if (!token.includes(':') && !token.includes('：')) {
      unresolvedBare.push(token);
    }
  }

  return {
    resolved,
    unresolved,
    unresolvedBare: [...new Set(unresolvedBare)],
    resolvedBare: [...new Set(resolvedBare)],
  };
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

