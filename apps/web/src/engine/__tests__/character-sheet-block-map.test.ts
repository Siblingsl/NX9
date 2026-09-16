/**
 * 角色设定表节点目录注册与 socket / 交互 / 下游契约回归。
 *
 * 与 character-sheet-plan.test.ts 相同：走相对路径直取 shared 源码，绕开 barrel 缺陷。
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
import {
  DEPRECATED_BLOCK_KINDS,
  getBlockKindMigrationTarget,
  isDeprecatedBlockKind,
} from '../../../../../packages/shared/src/catalog/migrate-block-kinds';
import { resolveRunLabel } from '../../../../../packages/shared/src/utils/run-labels';
import { gatherUpstream } from '../../../../../packages/shared/src/engine/flow-graph';

const KIND = 'character-sheet-desk';

describe('角色设定表：节点目录注册', () => {
  it(`kind=${KIND} 登记进目录，且为可见 / 可生成`, () => {
    const def = lookupBlock(KIND);
    expect(def).toBeDefined();
    expect(def!.kind).toBe(KIND);
    expect(def!.label).toBe('角色设定表');
    expect(def!.category).toBe('generate');
    expect(def!.glyph).toBeTruthy();
    expect(def!.hint).toContain('三视图');
    expect(isDockVisible(def!)).toBe(true);
    expect(BLOCK_CATALOG.filter((b) => b.kind === KIND)).toHaveLength(1);
  });

  it('目录无重复 kind（新增不覆盖既有导出）', () => {
    const kinds = BLOCK_CATALOG.map((b) => b.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toContain('picture-gen');
    expect(kinds).toContain('clip-gen');
    expect(kinds).toContain('multi-grid');
    expect(kinds).toContain(KIND);
  });

  it('出现在生成分组中（BLOCK_GROUPS.generate）', () => {
    const ids = BLOCK_GROUPS.generate.items.map((b) => b.kind);
    expect(ids).toContain(KIND);
  });

  it('不是废弃 kind：不被迁移表改写，也不会渲染成空壳', () => {
    expect(isDeprecatedBlockKind(KIND)).toBe(false);
    expect(getBlockKindMigrationTarget(KIND)).toBeUndefined();
    expect(DEPRECATED_BLOCK_KINDS).not.toContain(KIND);
    // 既有行为不变：历史 character-sheet 仍是被迁移的废弃 kind
    expect(getBlockKindMigrationTarget('character-sheet')).toBe('asset-import');
    expect(isDeprecatedBlockKind('character-sheet')).toBe(true);
  });
});

describe('角色设定表：socket 契约', () => {
  it('注册 socket：角色参考图 / 设定文本入，逐格设定图 / 提示词出', () => {
    const profile = SOCKET_REGISTRY[KIND];
    expect(profile).toBeDefined();
    expect(profile!.accepts).toContain('picture');
    expect(profile!.accepts).toContain('prompt');
    expect(profile!.emits).toContain('picture');
    expect(profile!.emits).toContain('prompt');
    expect(resolveAccepts(KIND)).toContain('picture');
    expect(resolveEmits(KIND)[0]).toBe('picture');
  });

  it('能与 picture-gen / clip-gen / grid-compose / multi-grid 建立连线', () => {
    expect(validateLink('picture-gen', KIND)).toBe(true);
    // 素材导入的出口按 data 决定（mediaKind 预置图片时才露出图片口）
    expect(validateLink('asset-import', KIND, { mediaKind: 'picture' })).toBe(true);
    expect(validateLink(KIND, 'clip-gen')).toBe(true);
    expect(validateLink(KIND, 'grid-compose')).toBe(true);
    expect(validateLink(KIND, 'picture-gen')).toBe(true);
    expect(validateLink('multi-grid', KIND)).toBe(true);
    expect(validateLink(KIND, KIND)).toBe(false);
  });
});

describe('角色设定表：交互与工作区', () => {
  it('登记工作区为 tool 型，走紧凑节点壳（底部跟随工作区）', () => {
    const spec = resolveAttachedWorkspace(KIND);
    expect(spec).toBeDefined();
    expect(spec!.workspaceType).toBe('tool');
    expect(spec!.attachToNode).toBe(true);
    expect(spec!.compactCanvas).toBe(true);
    expect(spec!.showRun).toBe(true);
    expect(ATTACHED_WORKSPACE_REGISTRY[KIND]).toBeDefined();
    expect(shouldUseCompactNodeShell(KIND)).toBe(true);
  });

  it('交互 class 归入 logic；点击展开底部跟随工作区（不进 Inspector）', () => {
    expect(resolveNodeInteractionClass(KIND)).toBe('logic');
    expect(resolveNodeInteraction(KIND).opensPromptBar).toBe(true);
    expect(resolveNodeInteraction(KIND).opensInspector).toBe(false);
  });

  it('运行文案注册：主按钮为「批量出设定图」', () => {
    expect(resolveRunLabel(KIND).primary).toBe('批量出设定图');
    expect(resolveRunLabel(KIND, 'running').primary).toBe('出设定图中…');
  });
});

describe('角色设定表：下游 gatherUpstream 契约', () => {
  const node = (id: string, type: string, data: Record<string, unknown>) => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data,
  });

  it('把逐格设定图与逐格角色提示词交下游', () => {
    const sheet = node('cs', KIND, {
      gridCells: [
        { imagePromptZh: '三视图 · 正面…', imagePrompt: 'front view…' },
        { imagePromptZh: '三视图 · 侧面…', imagePrompt: 'side view…' },
      ],
      splitUrls: ['/media/sheet/front.png', '/media/sheet/side.png'],
    });
    const out = gatherUpstream('down', [sheet], [{ id: 'e', source: 'cs', target: 'down' }]);
    expect(out.pictures).toEqual(['/media/sheet/front.png', '/media/sheet/side.png']);
    expect(out.prompts).toEqual(['三视图 · 正面…', '三视图 · 侧面…']);
  });

  it('只拿到 previewUrl 时也交下游（回写未完成不丢图）', () => {
    const sheet = node('cs', KIND, { previewUrl: '/media/sheet/only.png' });
    const out = gatherUpstream('down', [sheet], [{ id: 'e', source: 'cs', target: 'down' }]);
    expect(out.pictures).toEqual(['/media/sheet/only.png']);
    expect(out.prompts).toEqual([]);
  });

  it('本节点不额外把参考图塞进 pictures（不改变下游构图语义）', () => {
    const sheet = node('cs', KIND, {
      characterSheetReferenceImage: '/media/library/ref.png',
      gridCells: [{ imagePromptZh: '三视图 · 正面…', imagePrompt: 'front view…' }],
      splitUrls: ['/media/sheet/front.png'],
    });
    const out = gatherUpstream('down', [sheet], [{ id: 'e', source: 'cs', target: 'down' }]);
    expect(out.pictures).toEqual(['/media/sheet/front.png']);
  });

  it('既有 kind 的 gather 行为不被影响（多格推演 / 图像生成）', () => {
    const mg = node('mg', 'multi-grid', {
      gridCells: [{ videoPrompt: 'shot one', imagePrompt: 'i1' }],
      splitUrls: ['/media/a.png'],
    });
    const pg = node('pg', 'picture-gen', { previewUrls: ['/media/p.png'] });
    const out = gatherUpstream('down', [mg, pg], [
      { id: 'e1', source: 'mg', target: 'down' },
      { id: 'e2', source: 'pg', target: 'down' },
    ]);
    expect(out.pictures).toEqual(['/media/a.png', '/media/p.png']);
    expect(out.prompts).toEqual(['shot one']);
  });
});
