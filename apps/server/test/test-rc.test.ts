import { describe, it, expect } from 'vitest';
import {
  BLOCK_CATALOG,
  WORKFLOW_TEMPLATES,
} from '@nx9/shared';

describe('TEST-RC — Recipe Catalog (pure function tests)', () => {

  it('TEST-RC-001: 每 featured Recipe 可加载无 404 block - featured workflow templates reference valid block kinds', () => {
    const catalogKinds = new Set(BLOCK_CATALOG.map((b) => b.kind));

    const templates = WORKFLOW_TEMPLATES;

    for (const tpl of templates) {
      const { blocks } = tpl.build();

      for (const block of blocks) {
        expect(catalogKinds.has(block.type)).toBe(true);
      }

      expect(blocks.length).toBeGreaterThan(0);
    }

    expect(templates.length).toBeGreaterThanOrEqual(1);
  });

  it('TEST-RC-002: 全部模板无迁移味 — build() 产物无 migratedFrom 字段', () => {
    for (const tpl of WORKFLOW_TEMPLATES) {
      const { blocks } = tpl.build();
      for (const block of blocks) {
        expect(
          (block.data as Record<string, unknown>).migratedFrom,
          `模板「${tpl.id}」的节点 ${block.id}(${block.type}) 仍依赖 kind 迁移`
        ).toBeUndefined();
      }
    }
  });
});
