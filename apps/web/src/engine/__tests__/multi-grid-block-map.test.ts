/**
 * 多格推演节点目录注册与 socket / 交互 / 下游契约回归。
 *
 * 与 multi-grid-plan.test.ts 相同：走相对路径直取 shared 源码，绕开 barrel 缺陷。
 */
import { describe, expect, it } from 'vitest';
import {
  BLOCK_CATALOG,
  BLOCK_GROUPS,
  isDockVisible,
  lookupBlock,
} from '../../../../../packages/shared/src/catalog/block-catalog';
import {
  SOCKET_REGISTRY,
  resolveAccepts,
  resolveEmits,
  validateLink,
} from '../../../../../packages/shared/src/catalog/socket-registry';
import {
  ATTACHED_WORKSPACE_REGISTRY,
  resolveAttachedWorkspace,
  shouldUseCompactNodeShell,
} from '../../../../../packages/shared/src/catalog/attached-workspace';
import {
  resolveNodeInteraction,
  resolveNodeInteractionClass,
} from '../../../../../packages/shared/src/catalog/node-interaction';
import { resolveRunLabel } from '../../../../../packages/shared/src/utils/run-labels';
import { gatherUpstream } from '../../../../../packages/shared/src/engine/flow-graph';

describe('多格推演：节点目录注册', () => {
  it('kind=multi-grid 登记进目录，且为可见 / 可生成', () => {
    const def = lookupBlock('multi-grid');
    expect(def).toBeDefined();
    expect(def!.kind).toBe('multi-grid');
    expect(def!.label).toBe('多格推演');
    expect(def!.category).toBe('generate');
    expect(def!.glyph).toBeTruthy();
    expect(isDockVisible(def!)).toBe(true);
    expect(BLOCK_CATALOG.filter((b) => b.kind === 'multi-grid')).toHaveLength(1);
  });

  it('目录无重复 kind（新增不覆盖既有导出）', () => {
    const kinds = BLOCK_CATALOG.map((b) => b.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toContain('picture-gen');
    expect(kinds).toContain('clip-gen');
    expect(kinds).toContain('grid-compose');
  });

  it('出现在生成分组中（BLOCK_GROUPS.generate）', () => {
    const ids = BLOCK_GROUPS.generate.items.map((b) => b.kind);
    expect(ids).toContain('multi-grid');
  });
});

describe('多格推演：socket 契约', () => {
  it('注册 socket：上游图片 / 文本入，下游图片 / 提示词出', () => {
    const profile = SOCKET_REGISTRY['multi-grid'];
    expect(profile).toBeDefined();
    expect(profile!.accepts).toContain('picture');
    expect(profile!.emits).toContain('picture');
    expect(profile!.emits).toContain('prompt');
    expect(resolveAccepts('multi-grid')).toContain('picture');
    expect(resolveEmits('multi-grid')[0]).toBe('picture');
  });

  it('能与 picture-gen / clip-gen / grid-compose 建立连线', () => {
    expect(validateLink('picture-gen', 'multi-grid')).toBe(true);
    expect(validateLink('multi-grid', 'clip-gen')).toBe(true);
    expect(validateLink('multi-grid', 'grid-compose')).toBe(true);
    expect(validateLink('multi-grid', 'picture-gen')).toBe(true);
  });
});

describe('多格推演：交互与工作区', () => {
  it('登记工作区为 tool 型，走紧凑节点壳（底部跟随工作区）', () => {
    const spec = resolveAttachedWorkspace('multi-grid');
    expect(spec).toBeDefined();
    expect(spec!.workspaceType).toBe('tool');
    expect(spec!.attachToNode).toBe(true);
    expect(spec!.compactCanvas).toBe(true);
    expect(spec!.showRun).toBe(true);
    expect(ATTACHED_WORKSPACE_REGISTRY['multi-grid']).toBeDefined();
    expect(shouldUseCompactNodeShell('multi-grid')).toBe(true);
  });

  it('交互 class 归入 logic；点击展开底部跟随工作区（不进 Inspector）', () => {
    expect(resolveNodeInteractionClass('multi-grid')).toBe('logic');
    // attachToNode=true → 点击节点展开其底部工作区（与宫格节点同规范）
    expect(resolveNodeInteraction('multi-grid').opensPromptBar).toBe(true);
    expect(resolveNodeInteraction('multi-grid').opensInspector).toBe(false);
  });

  it('运行文案注册：主按钮为「批量推演出图」', () => {
    expect(resolveRunLabel('multi-grid').primary).toBe('批量推演出图');
    expect(resolveRunLabel('multi-grid', 'running').primary).toBe('推演出图中…');
  });
});

describe('多格推演：下游 gatherUpstream 契约', () => {
  const node = (id: string, type: string, data: Record<string, unknown>) => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  });

  it('默认把逐格图与逐格视频提示词交下游（批出）', () => {
    const grid = node('mg', 'multi-grid', {
      gridCells: [
        { videoPrompt: 'shot one', imagePrompt: 'i1' },
        { videoPrompt: 'shot two', imagePrompt: 'i2' },
      ],
      splitUrls: ['/media/a.png', '/media/b.png'],
    });
    const out = gatherUpstream('down', [grid], [{ id: 'e', source: 'mg', target: 'down' }]);
    expect(out.pictures).toEqual(['/media/a.png', '/media/b.png']);
    expect(out.prompts).toEqual(['shot one', 'shot two']);
  });

  it('「送入视频生成」选中格时，下游按单镜消费（该格提示词 + 首帧前置）', () => {
    const grid = node('mg', 'multi-grid', {
      gridCells: [
        { videoPrompt: 'shot one', imagePrompt: 'i1' },
        { videoPrompt: 'shot two', imagePrompt: 'i2' },
        { videoPrompt: 'shot three', imagePrompt: 'i3' },
      ],
      splitUrls: ['/media/a.png', '/media/b.png', '/media/c.png'],
      sendToVideoIndex: 2,
    });
    const out = gatherUpstream('down', [grid], [{ id: 'e', source: 'mg', target: 'down' }]);
    expect(out.prompts).toEqual(['shot three']);
    expect(out.pictures[0]).toBe('/media/c.png');
    expect(out.pictures).toHaveLength(3);
  });

  it('非法 sendToVideoIndex 回退为全量批出', () => {
    const grid = node('mg', 'multi-grid', {
      gridCells: [{ videoPrompt: 'shot one', imagePrompt: 'i1' }],
      splitUrls: ['/media/a.png'],
      sendToVideoIndex: 99,
    });
    const out = gatherUpstream('down', [grid], [{ id: 'e', source: 'mg', target: 'down' }]);
    expect(out.pictures).toEqual(['/media/a.png']);
    expect(out.prompts).toEqual(['shot one']);
  });
});
