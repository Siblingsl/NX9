/**
 * F-044 — 「运行」入口心智统一验收
 */
import { describe, expect, it } from 'vitest';
import { listedRunLabelKinds, resolveRunLabel } from '@nx9/shared';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('F-044 run labels', () => {
  it('core kinds are not bare 运行', () => {
    for (const kind of [
      'picture-gen',
      'clip-gen',
      'director-desk',
      'export-pack',
      'sound-gen',
      'clip-editor',
      'script-desk',
      'storyboard-desk',
      'upscale-lite',
      'bg-remove',
      'continuity-check',
      'prompt',
      'iterator',
    ]) {
      const label = resolveRunLabel(kind).primary;
      expect(label).not.toBe('运行');
      expect(label.length).toBeGreaterThan(1);
    }
  });

  it('default is 运行本节点 not bare 运行', () => {
    expect(resolveRunLabel('unknown-kind-xyz').primary).toBe('运行本节点');
  });

  it('busy status swaps to busy text', () => {
    expect(resolveRunLabel('clip-gen', 'running').primary).toBe('生成中…');
    expect(resolveRunLabel('export-pack', 'running').primary).toBe('导出中…');
  });

  it('prompt batch count uses 生成 (n)', () => {
    expect(resolveRunLabel('prompt', undefined, 3).primary).toBe('生成 (3)');
  });

  it('lists dedicated kinds', () => {
    const kinds = listedRunLabelKinds();
    expect(kinds).toContain('director-desk');
    expect(kinds).toContain('bg-remove');
    expect(kinds).not.toContain('default');
  });

  it('ComposerWorkspaceShell resolves kind when runLabel omitted', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../apps/web/src/engine/stage-deck/chrome/attached-workspace/composer/ComposerWorkspaceShell.tsx'),
      'utf-8',
    );
    expect(src).toContain('resolveRunLabel(kind');
    expect(src).toContain('resolvedRunLabel');
  });

  it('utility blocks use dictionary', () => {
    const upscale = readFileSync(
      resolve(__dirname, '../../../apps/web/src/blocks/utility/UpscaleLiteBlock.tsx'),
      'utf-8',
    );
    const bg = readFileSync(
      resolve(__dirname, '../../../apps/web/src/blocks/utility/BgRemoveBlock.tsx'),
      'utf-8',
    );
    expect(upscale).toContain("resolveRunLabel('upscale-lite'");
    expect(upscale).not.toContain('运行放大');
    expect(bg).toContain("resolveRunLabel('bg-remove'");
    expect(bg).not.toContain('运行抠图');
  });
});
