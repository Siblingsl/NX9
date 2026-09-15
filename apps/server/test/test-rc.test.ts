import { describe, it, expect } from 'vitest';
import {
  BLOCK_CATALOG,
  WORKFLOW_TEMPLATES,
  listWorkflowTemplates,
  isWorkflowTemplateListed,
} from '@nx9/shared';

describe('TEST-RC — Recipe Catalog (pure function tests)', () => {
  it('TEST-RC-001: 模板 kinds ⊆ 活跃 catalog（非 deprecated block）', () => {
    const activeKinds = new Set(
      BLOCK_CATALOG.filter((b) => !b.deprecated).map((b) => b.kind),
    );

    for (const tpl of WORKFLOW_TEMPLATES) {
      const { blocks } = tpl.build();
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(
          activeKinds.has(block.type),
          `模板「${tpl.id}」节点 kind「${block.type}」不在活跃 catalog`,
        ).toBe(true);
      }
    }

    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(1);
  });

  it('TEST-RC-002: 全部模板无迁移味 — build() 产物无 migratedFrom 字段', () => {
    for (const tpl of WORKFLOW_TEMPLATES) {
      const { blocks } = tpl.build();
      for (const block of blocks) {
        expect(
          (block.data as Record<string, unknown>).migratedFrom,
          `模板「${tpl.id}」的节点 ${block.id}(${block.type}) 仍依赖 kind 迁移`,
        ).toBeUndefined();
      }
    }
  });

  it('TEST-RC-003: status 完备；启动器隐藏 deprecated', () => {
    for (const tpl of WORKFLOW_TEMPLATES) {
      expect(['ga', 'beta', 'deprecated']).toContain(tpl.status);
    }
    const listed = listWorkflowTemplates();
    expect(listed.every(isWorkflowTemplateListed)).toBe(true);
    expect(listed.some((t) => t.status === 'deprecated')).toBe(false);
    const deprecated = WORKFLOW_TEMPLATES.filter((t) => t.status === 'deprecated');
    expect(deprecated.length).toBeGreaterThan(0);
    for (const d of deprecated) {
      expect(listed.find((t) => t.id === d.id)).toBeUndefined();
      // 历史 id 仍可从全量表按 id 加载
      expect(WORKFLOW_TEMPLATES.find((t) => t.id === d.id)?.build().blocks.length).toBeGreaterThan(0);
    }
  });
});
