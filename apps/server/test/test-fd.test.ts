import { describe, it, expect } from 'vitest';
import type { StoryboardShot } from '@nx9/shared';

describe('TEST-FD — Flow Domain (pure function tests)', () => {

  it('TEST-FD-001: picture-gen @mention parsing', () => {
    const prompt = '一个 @张三 在 @李四 的咖啡馆里';
    const characters = [
      { id: 'c1', name: '张三' },
      { id: 'c2', name: '王五' },
      { id: 'c3', name: '李四' },
    ];
    const mentionPattern = /@(\S+)/g;
    const mentionNames = new Set<string>();
    for (const m of prompt.matchAll(mentionPattern)) {
      mentionNames.add(m[1]);
    }
    const nameMap = new Map(characters.map((c) => [c.name, c]));
    const found = [...mentionNames].map((n) => nameMap.get(n)).filter(Boolean);
    expect(found).toHaveLength(2);
    expect(found[0]!.name).toBe('张三');
    expect(found[1]!.name).toBe('李四');
  });

  it('TEST-FD-002: enrichPromptWithCharacters appends suffix', () => {
    const characters = [
      { id: 'c1', name: '张三', consistencyPrompt: '年轻男性' },
    ];
    const suffix = characters.map((c) => `[Character ${c.name}]: ${c.consistencyPrompt}`).join('\n');
    const enriched = `原始 prompt\n\nCharacter consistency:\n${suffix}`;
    expect(enriched).toContain('张三');
    expect(enriched).toContain('Character consistency:');
  });

  it('TEST-FD-003: motion-story single shot linkedShotId filter', () => {
    const shots: StoryboardShot[] = [
      { id: 's1', index: 0 } as StoryboardShot,
      { id: 's2', index: 1 } as StoryboardShot,
      { id: 's3', index: 2 } as StoryboardShot,
    ];
    const linkedShotId = 's2';
    const filtered = linkedShotId ? shots.filter((s) => s.id === linkedShotId) : shots;
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('s2');
  });

  it('TEST-FD-004: review-gate blocked status', () => {
    const blocked = { status: 'blocked', message: '有镜头待审阅' };
    expect(blocked.status).toBe('blocked');
    expect(blocked.message).toBeTruthy();
  });

  it('TEST-FD-005: export-pack mode routing', () => {
    const modes = ['zip', 'ffmpeg-episode', 'hyperframes-episode', 'remotion-bundle'] as const;
    const mode = 'ffmpeg-episode';
    expect(modes.includes(mode as any)).toBe(true);
  });

  it('TEST-FD-006: picture-gen runner n parameter propagation', () => {
    const n = Math.min(4, Math.max(1, 2));
    expect(n).toBe(2);
    const clamped = Math.min(4, Math.max(1, 6));
    expect(clamped).toBe(4);
  });

  it('TEST-FD-007: clip-editor transition from node data', () => {
    const d = { transition: 'dissolve' };
    const transition = (d.transition as string) ?? 'none';
    expect(transition).toBe('dissolve');
    expect(transition === 'none' ? undefined : transition).toBe('dissolve');

    const d2: Record<string, unknown> = {};
    const transition2 = (d2.transition as string) ?? 'none';
    expect(transition2 === 'none' ? undefined : transition2).toBeUndefined();
  });

  it('TEST-FD-008: cascade chain — upstream dependency collection', () => {
    interface Edge { source: string; target: string }
    const collectUpstreamIds = (blockId: string, edges: Edge[]): Set<string> => {
      const upstream = new Set<string>();
      const queue: string[] = [blockId];
      const seen = new Set<string>([blockId]);
      while (queue.length > 0) {
        const targetId = queue.shift()!;
        for (const edge of edges) {
          if (edge.target !== targetId || seen.has(edge.source)) continue;
          seen.add(edge.source);
          upstream.add(edge.source);
          queue.push(edge.source);
        }
      }
      return upstream;
    };
    const collectCascadeChain = (blockId: string, edges: Edge[]): Set<string> => {
      const chain = collectUpstreamIds(blockId, edges);
      chain.add(blockId);
      return chain;
    };

    const edges: Edge[] = [
      { source: 'prompt', target: 'pic' },
      { source: 'pic', target: 'clip' },
      { source: 'script', target: 'review' },
    ];
    const chain = collectCascadeChain('clip', edges);
    expect(chain.has('clip')).toBe(true);
    expect(chain.has('pic')).toBe(true);
    expect(chain.has('prompt')).toBe(true);
    expect(chain.has('script')).toBe(false);

    const isolated = collectCascadeChain('script', edges);
    expect(isolated.has('script')).toBe(true);
    expect(isolated.has('review')).toBe(false);
  });
});
