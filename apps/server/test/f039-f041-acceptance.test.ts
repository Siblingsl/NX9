import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BLOCK_CATALOG } from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const webSrc = resolve(__dirname, '../../web/src');

describe('F-039 dist 防污染 + shared 构建 DX', () => {
  it('check-dist-dx 门禁脚本通过', () => {
    const r = spawnSync('node', [resolve(root, 'scripts/check-dist-dx.mjs')], {
      cwd: root,
      encoding: 'utf8',
      shell: true,
    });
    expect(r.status, r.stderr || r.stdout).toBe(0);
  });

  it('root package.json / vite alias / ensure 脚本存在', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.dev).toContain('@nx9/shared');
    expect(pkg.scripts.dev).toContain('build');
    expect(pkg.scripts['dev:server']).toContain('predev:server');
    expect(readFileSync(resolve(root, 'scripts/ensure-shared-dist.mjs'), 'utf8')).toContain(
      'packages/shared/dist/esm/index.js',
    );
    const vite = readFileSync(resolve(root, 'apps/web/vite.config.ts'), 'utf8');
    expect(vite).toMatch(/@nx9\/shared/);
    expect(vite).toMatch(/packages\/shared\/src|sharedSrc/);
  });
});

describe('F-040 GenericBlock 全 kind 抽检', () => {
  it('活跃 catalog kind 均有专用 loader（不静默落 Generic）', () => {
    const registry = readFileSync(resolve(webSrc, 'blocks/registry.tsx'), 'utf8');
    const start = registry.indexOf('const blockLoaders');
    const end = registry.indexOf('export const BLOCK_LOADER_KINDS');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const loaderBlock = registry.slice(start, end);
    const active = BLOCK_CATALOG.filter((b) => !b.deprecated);
    const missing = active.filter((b) => {
      const quoted = loaderBlock.includes(`'${b.kind}'`) || loaderBlock.includes(`"${b.kind}"`);
      const bare = new RegExp(`\\n\\s*${b.kind}\\s*:`).test(loaderBlock);
      return !(quoted || bare);
    }).map((b) => b.kind);
    expect(missing, `缺少 loader: ${missing.join(', ')}`).toEqual([]);
  });

  it('registry Proxy 兜底 + GenericBlock 未知卡文案', () => {
    const registry = readFileSync(resolve(webSrc, 'blocks/registry.tsx'), 'utf8');
    expect(registry).toContain('new Proxy');
    expect(registry).toContain('genericWithSuspense');
    expect(registry).toContain('BLOCK_LOADER_KINDS');

    const generic = readFileSync(resolve(webSrc, 'blocks/shared/GenericBlock.tsx'), 'utf8');
    expect(generic).toContain('未注册节点');
    expect(generic).toContain('generic-block-unknown');
    expect(generic).toContain('migrateNode');
  });
});

describe('F-041 首次画布引导接线', () => {
  it('FlowSurface 挂载 EmptyCanvasGuide；storage key 稳定', () => {
    const flow = readFileSync(resolve(webSrc, 'engine/FlowSurface.tsx'), 'utf8');
    expect(flow).toContain('EmptyCanvasGuide');
    expect(flow).toContain('recipePickerDismissed');

    const guide = readFileSync(
      resolve(webSrc, 'components/canvas/EmptyCanvasGuide.tsx'),
      'utf8',
    );
    expect(guide).toContain("nx9.canvas.onboarded");
    expect(guide).toContain('clearCanvasOnboarded');
    expect(guide).toContain('data-testid="empty-canvas-guide"');
  });
});
