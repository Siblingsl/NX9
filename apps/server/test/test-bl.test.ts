import { describe, it, expect } from 'vitest';

describe('TEST-BL — Block / Node (pure function tests)', () => {

  it('TEST-BL-PIC-001: @角色 batch - @mention parsing extracts correct character names', () => {
    const library = [
      { id: 'c1', name: '张三' },
      { id: 'c2', name: '李四' },
      { id: 'c3', name: '王五' },
    ];

    const parseMentions = (prompt: string | undefined) => {
      if (!prompt) return [];
      const nameMap = new Map(library.map((c) => [c.name, c]));
      const mentionPattern = /@(\S+)/g;
      const seen = new Set<string>();
      const result: Array<typeof library[number]> = [];
      for (const m of prompt.matchAll(mentionPattern)) {
        const name = m[1];
        if (!seen.has(name)) {
          seen.add(name);
          const found = nameMap.get(name);
          if (found) result.push(found);
        }
      }
      return result;
    };

    const result1 = parseMentions('一个 @张三 在 @李四 的咖啡馆里');
    expect(result1).toHaveLength(2);
    expect(result1[0].name).toBe('张三');
    expect(result1[1].name).toBe('李四');

    const result2 = parseMentions('只有 @王五 在场');
    expect(result2).toHaveLength(1);
    expect(result2[0].name).toBe('王五');

    const result3 = parseMentions('无角色提及');
    expect(result3).toHaveLength(0);

    const result4 = parseMentions('@张三 @张三 重复');
    expect(result4).toHaveLength(1);
    expect(result4[0].name).toBe('张三');

    const result5 = parseMentions(undefined);
    expect(result5).toHaveLength(0);
  });

  it('TEST-BL-LIP-001: 无部署时 status=error 明确提示 - disabled nodes return error status', () => {
    const DISABLED_KINDS = new Set(['lipsync-pass']);

    const checkNodeStatus = (kind: string, config: { deployed: boolean }): { status: string; error?: string } => {
      if (DISABLED_KINDS.has(kind) && !config.deployed) {
        return { status: 'error', error: `"${kind}" 节点需要额外部署，请参考文档配置。` };
      }
      return { status: 'idle' };
    };

    const result1 = checkNodeStatus('lipsync-pass', { deployed: false });
    expect(result1.status).toBe('error');
    expect(result1.error).toContain('lipsync-pass');
    expect(result1.error).toContain('部署');

    const result2 = checkNodeStatus('lipsync-pass', { deployed: true });
    expect(result2.status).toBe('idle');

    const result3 = checkNodeStatus('picture-gen', { deployed: false });
    expect(result3.status).toBe('idle');
  });
});
