/**
 * F-027 acceptance test — 多上游 desk 解析规则
 *
 * G1 验收清单:
 * - [x] 策略可切换 (merge / primary)
 * - [x] 行为与文档一致
 *
 * G2 主流程: gatherUpstream 读取 upstreamPolicy → resolveUpstreamSources 过滤 → consumer 使用
 * G3 本文件 + 缺陷分析同步
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import {
  resolveUpstreamSources,
  mergeUpstreamData,
  type UpstreamPolicy,
} from '@nx9/shared';
import { gatherUpstream } from '@nx9/shared';
import type { FlowBlock, FlowLink } from '@nx9/shared';

const WEB_ROOT = resolve(__dirname, '..', '..', '..', 'apps', 'web', 'src');
const SHARED_ROOT = resolve(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

function readWeb(relPath: string): string {
  return readFileSync(resolve(WEB_ROOT, relPath), 'utf-8');
}
function readShared(relPath: string): string {
  return readFileSync(resolve(SHARED_ROOT, relPath), 'utf-8');
}
function fileExists(relPath: string, base: string = WEB_ROOT): boolean {
  return existsSync(resolve(base, relPath));
}

const UPSTREAM_POLICY = 'utils/upstream-policy.ts';
const FLOW_GRAPH = 'engine/flow-graph.ts';
const UPSTREAM_POLICY_SELECT = 'blocks/shared/UpstreamPolicySelect.tsx';
const BLOCK_SHELL = 'blocks/shared/BlockShell.tsx';
const FLOW_RUNNER = 'engine/flow-runner.ts';
const CLIP_GEN_BLOCK = 'blocks/core/ClipGenBlock.tsx';
const SOUND_GEN_BLOCK = 'blocks/core/SoundGenBlock.tsx';
const USE_UPSTREAM_PROMPT = 'blocks/shared/use-upstream-prompt.ts';
const USE_UPSTREAM_MEDIA = 'engine/stage-deck/chrome/attached-workspace/generation/use-upstream-media.ts';

// ─── test helpers ───
function makeBlock(id: string, type: string, data: Record<string, unknown> = {}): FlowBlock {
  return { id, type, data } as FlowBlock;
}
function makeLink(source: string, target: string): FlowLink {
  return { source, target } as FlowLink;
}

describe('F-027 acceptance', () => {
  // ═══════════ source files ═══════════
  describe('source files exist', () => {
    const webFiles = [
      UPSTREAM_POLICY_SELECT,
      BLOCK_SHELL,
      CLIP_GEN_BLOCK,
      SOUND_GEN_BLOCK,
      USE_UPSTREAM_PROMPT,
      USE_UPSTREAM_MEDIA,
      FLOW_RUNNER,
    ];
    const sharedFiles = [UPSTREAM_POLICY, FLOW_GRAPH];

    for (const f of webFiles) {
      it(f, () => {
        expect(fileExists(f)).toBe(true);
      });
    }
    for (const f of sharedFiles) {
      it(`${f} (shared)`, () => {
        expect(fileExists(f, SHARED_ROOT)).toBe(true);
      });
    }
  });

  // ═══════════ resolveUpstreamSources contract ═══════════
  describe('resolveUpstreamSources', () => {
    const sources = [
      { nodeId: 's1', nodeType: 'script-desk', label: 'A剧本', data: { name: 'A' } },
      { nodeId: 's2', nodeType: 'script-desk', label: 'B剧本', data: { name: 'B' } },
      { nodeId: 's3', nodeType: 'picture-gen', label: '图生成', data: { name: 'C' } },
    ];

    it('merge returns all sources', () => {
      const result = resolveUpstreamSources(sources, 'merge');
      expect(result.sources).toHaveLength(3);
      expect(result.sources[0].nodeId).toBe('s1');
    });

    it('primary with specific sourceId returns only that source', () => {
      const result = resolveUpstreamSources(sources, 'primary', 's2');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].nodeId).toBe('s2');
      expect(result.activeSourceId).toBe('s2');
    });

    it('primary without sourceId returns first source', () => {
      const result = resolveUpstreamSources(sources, 'primary');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].nodeId).toBe('s1');
    });

    it('primary with non-existent sourceId falls back to first', () => {
      const result = resolveUpstreamSources(sources, 'primary', 'nonexistent');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].nodeId).toBe('s1');
    });

    it('empty sources returns empty array', () => {
      const result = resolveUpstreamSources([], 'merge');
      expect(result.sources).toHaveLength(0);
    });

    it('single source with primary returns that source', () => {
      const result = resolveUpstreamSources([sources[0]], 'primary');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].nodeId).toBe('s1');
    });
  });

  // ═══════════ mergeUpstreamData contract ═══════════
  describe('mergeUpstreamData', () => {
    it('merges array fields', () => {
      const data = [
        { data: { shots: [1, 2] } },
        { data: { shots: [3] } },
      ];
      const result = mergeUpstreamData(data, ['shots']);
      expect(result.shots).toEqual([1, 2, 3]);
    });

    it('takes first non-null for scalar fields', () => {
      const data = [
        { data: { name: 'A', count: 10 } },
        { data: { name: 'B', count: 20 } },
      ];
      const result = mergeUpstreamData(data, ['name', 'count']);
      expect(result.name).toBe('A');
      expect(result.count).toBe(10);
    });

    it('skips undefined/null values', () => {
      const data = [
        { data: { name: null } },
        { data: { name: 'B' } },
      ];
      const result = mergeUpstreamData(data, ['name']);
      expect(result.name).toBe('B');
    });
  });

  // ═══════════ gatherUpstream with policy ═══════════
  describe('gatherUpstream with policy', () => {
    const blockA = makeBlock('prompt1', 'prompt', { content: 'prompt A' });
    const blockB = makeBlock('prompt2', 'prompt', { content: 'prompt B' });
    const target = makeBlock('target1', 'clip-editor');
    const blocks = [blockA, blockB, target];

    it('merge policy returns both prompts', () => {
      const links = [makeLink('prompt1', 'target1'), makeLink('prompt2', 'target1')];
      const result = gatherUpstream('target1', blocks, links, 'merge');
      expect(result.prompts).toHaveLength(2);
    });

    it('primary policy returns only one prompt', () => {
      const links = [makeLink('prompt1', 'target1'), makeLink('prompt2', 'target1')];
      const result = gatherUpstream('target1', blocks, links, 'primary', 'prompt1');
      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0]).toContain('prompt A');
    });

    it('primary with second source returns that one', () => {
      const links = [makeLink('prompt1', 'target1'), makeLink('prompt2', 'target1')];
      const result = gatherUpstream('target1', blocks, links, 'primary', 'prompt2');
      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0]).toContain('prompt B');
    });

    it('no policy returns all (default behavior)', () => {
      const links = [makeLink('prompt1', 'target1'), makeLink('prompt2', 'target1')];
      const result = gatherUpstream('target1', blocks, links);
      expect(result.prompts).toHaveLength(2);
    });
  });

  // ═══════════ UpstreamPolicy type exported ═══════════
  describe('UpstreamPolicy type', () => {
    it("is exported from upstream-policy.ts", () => {
      const src = readShared(UPSTREAM_POLICY);
      expect(src).toContain("export type UpstreamPolicy = 'merge' | 'primary'");
    });

    it('is re-exported from shared index', () => {
      const src = readShared('index.ts');
      expect(src).toContain('type UpstreamPolicy');
      expect(src).toContain('resolveUpstreamSources');
    });
  });

  // ═══════════ UpstreamPolicySelect UI ═══════════
  describe('UpstreamPolicySelect component', () => {
    const src = readWeb(UPSTREAM_POLICY_SELECT);

    it('exports UpstreamPolicySelect', () => {
      expect(src).toContain('function UpstreamPolicySelect');
    });

    it('renders 全部合并 option', () => {
      expect(src).toContain('全部合并');
    });

    it('renders 仅主要来源 option', () => {
      expect(src).toContain('仅主要来源');
    });

    it('hides when no multi-source types', () => {
      expect(src).toContain('multiSourceTypes.length === 0');
      expect(src).toContain('return null');
    });

    it('uses useUpstreamSources hook for incoming edges', () => {
      expect(src).toContain('useUpstreamSources');
    });

    it('writes upstreamPolicy + primarySourceId via onChange', () => {
      expect(src).toContain('upstreamPolicy:');
      expect(src).toContain('primarySourceId');
    });
  });

  // ═══════════ BlockShell integration ═══════════
  describe('BlockShell renders UpstreamPolicySelect', () => {
    const src = readWeb(BLOCK_SHELL);

    it('imports UpstreamPolicySelect', () => {
      expect(src).toContain('UpstreamPolicySelect');
    });

    it('passes upstreamPolicy from data', () => {
      expect(src).toMatch(/upstreamPolicy\s*[=:]/);
    });

    it('passes primarySourceId from data', () => {
      expect(src).toContain('primarySourceId');
    });

    it('writes via updateNodeData on change', () => {
      expect(src).toContain('updateNodeData(id, policyData)');
    });
  });

  // ═══════════ Consumer coverage: all pass policy ═══════════
  describe('consumer policy passing', () => {
    it('ClipGenBlock passes upstreamPolicy to gatherUpstream', () => {
      const src = readWeb(CLIP_GEN_BLOCK);
      const hasGatherUpstream = src.includes('gatherUpstream');
      const hasUpstreamPolicy = src.includes('upstreamPolicy');
      expect(hasGatherUpstream).toBe(true);
      expect(hasUpstreamPolicy).toBe(true);
    });

    it('SoundGenBlock passes upstreamPolicy to gatherUpstream', () => {
      const src = readWeb(SOUND_GEN_BLOCK);
      const hasGatherUpstream = src.includes('gatherUpstream');
      const hasUpstreamPolicy = src.includes('upstreamPolicy');
      expect(hasGatherUpstream).toBe(true);
      expect(hasUpstreamPolicy).toBe(true);
    });

    it('use-upstream-prompt passes upstreamPolicy to gatherUpstream', () => {
      const src = readWeb(USE_UPSTREAM_PROMPT);
      expect(src).toContain('upstreamPolicy');
      expect(src).toContain('primarySourceId');
      expect(src).toContain('gatherUpstream(');
    });

    it('use-upstream-media imports UpstreamPolicy type', () => {
      const src = readWeb(USE_UPSTREAM_MEDIA);
      expect(src).toContain('type UpstreamPolicy');
    });

    it('use-upstream-media passes upstreamPolicy to gatherUpstream', () => {
      const src = readWeb(USE_UPSTREAM_MEDIA);
      expect(src).toContain('upstreamPolicy');
      expect(src).toContain('primarySourceId');
    });
  });

  // ═══════════ flow-runner: line 740 fix ═══════════
  describe('flow-runner clip-gen multi-shot passes policy', () => {
    const src = readWeb(FLOW_RUNNER);

    it('clip-gen multi-shot gatherUpstream call includes upstreamPolicy', () => {
      const idx = src.indexOf("const chainShots");
      expect(idx).toBeGreaterThan(-1);
      const block = src.slice(idx, idx + 600);
      expect(block).toContain("upstreamPolicy, primarySourceId");
    });

    it('flow-runner batch path passes policy (existing correct)', () => {
      expect(src).toContain('gatherUpstream(id, [...blockMap.values()], links, upstreamPolicy, primarySourceId)');
    });
  });

  // ═══════════ flow-graph.ts fix ═══════════
  describe('flow-graph.ts no blockId fallback', () => {
    const src = readShared(FLOW_GRAPH);

    it('uses primarySourceId || undefined (not blockId)', () => {
      expect(src).toContain('primarySourceId || undefined');
    });

    it('does NOT use primarySourceId ?? blockId', () => {
      expect(src).not.toContain('primarySourceId ?? blockId');
    });

    it('gatherUpstream accepts policy parameter', () => {
      expect(src).toContain('policy?: UpstreamPolicy');
      expect(src).toContain('primarySourceId?: string | null');
    });

    it('F-027: 按策略解析上游 comment present', () => {
      expect(src).toContain('F-027: 按策略解析上游');
    });
  });
});
