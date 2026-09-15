/**
 * F-032 参考板约束注入 + F-036 工具菜单衔接验收
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractReferenceConstraints,
  buildConstrainedPrompt,
  UTILITY_BLOCKS,
} from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const webSrc = resolve(root, 'apps/web/src');

function readWeb(rel: string): string {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

describe('F-032 reference board constraints', () => {
  it('extracts flat UI fields from ReferenceBoardWorkspace shape', () => {
    const c = extractReferenceConstraints({
      styleNotes: 'neon rain',
      palette: ['#111', '#0ff'],
      boardImages: ['https://cdn/a.png'],
      enforce: true,
    });
    expect(c).not.toBeNull();
    expect(c!.style).toBe('neon rain');
    expect(c!.palette).toContain('#111');
    expect(c!.assetUrls).toEqual(['https://cdn/a.png']);
    expect(c!.enforce).toBe(true);
  });

  it('enforce with no content blocks generation', () => {
    const r = buildConstrainedPrompt('base', { enforce: true }, undefined);
    expect(r.blocked).toBe(true);
  });

  it('director batch opts wires referenceConstraint', () => {
    const src = readWeb('blocks/core/director-desk/director-batch-opts.ts');
    expect(src).toContain('collectUpstreamReferenceConstraint');
    expect(src).toContain('referenceConstraint');
  });

  it('ReferenceBoardWorkspace exposes enforce toggle and constraints sync', () => {
    const src = readWeb(
      'engine/stage-deck/chrome/attached-workspace/tool/ReferenceBoardWorkspace.tsx',
    );
    expect(src).toContain('enforce');
    expect(src).toContain('constraints:');
    expect(src).toContain('强约束');
  });

  it('director runner injects board assetUrls into refs', () => {
    const src = readWeb('engine/director-desk-runner.ts');
    expect(src).toContain('constraint.assetUrls');
    expect(src).toContain("usedRefs.push('reference-board')");
  });
});

describe('F-036 utility desk menus', () => {
  it('lists four utility blocks', () => {
    expect(UTILITY_BLOCKS.map((u) => u.kind)).toEqual([
      'continuity-check',
      'caption-asr',
      'inpaint-edit',
      'grid-compose',
    ]);
  });

  it('DeskUtilityToolsMenu spawns with connectToSource', () => {
    const src = readWeb('blocks/shared/DeskUtilityToolsMenu.tsx');
    expect(src).toContain('UTILITY_BLOCKS');
    expect(src).toContain('connectToSource');
    expect(src).toContain('requestSpawnForShot');
  });

  it('DirectorMainPanel mounts utility menu', () => {
    const src = readWeb('blocks/core/director-desk/director-main-panel.tsx');
    expect(src).toContain('DeskUtilityToolsMenu');
  });

  it('StoryboardDesk mounts utility menu', () => {
    const src = readWeb('blocks/craft/storyboard-desk/use-storyboard-desk.tsx');
    expect(src).toContain('DeskUtilityToolsMenu');
  });

  it('FlowSurface auto-connects on connectToSource', () => {
    const src = readWeb('engine/FlowSurface.tsx');
    expect(src).toContain('connectToSource');
  });
});
