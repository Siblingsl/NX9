import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webSrc = resolve(__dirname, '../../web/src');
const root = resolve(__dirname, '../../..');

describe('UX P2-5 导演台空态渐进披露', () => {
  it('无镜时隐藏出图参数条，并提示空态', () => {
    const main = readFileSync(
      resolve(webSrc, 'blocks/core/director-desk/director-main-panel.tsx'),
      'utf8',
    );
    expect(main).toContain('director-empty-hint');
    expect(main).toMatch(/stats\.total === 0/);
    expect(main).toMatch(/stats\.total > 0[\s\S]*dd2-output-strip/);
    expect(main).toContain('hasShots={stats.total > 0}');
    // 3D 空态不再重复两套文案
    const guideBlocks = main.match(/guidePendingRepair \? '3D 截图待修复'/g) ?? [];
    expect(guideBlocks.length).toBe(1);
  });

  it('批出设置：无镜时高级参数进 details', () => {
    const drawer = readFileSync(
      resolve(webSrc, 'blocks/core/director-desk/director-settings-drawer.tsx'),
      'utf8',
    );
    expect(drawer).toContain('hasShots');
    expect(drawer).toContain('director-settings-advanced');
    expect(drawer).toContain('director-settings-empty-tip');
    expect(drawer).toMatch(/hasShots \? \([\s\S]*advanced[\s\S]*\) : \([\s\S]*details/);
  });

  it('连接预设不暴露 GrokGo 内部代号作标题', () => {
    const settings = readFileSync(
      resolve(root, 'packages/shared/src/types/settings.ts'),
      'utf8',
    );
    expect(settings).not.toMatch(/label:\s*'GrokGo/);
    expect(settings).toContain('本地视频桥（开发）');
  });
});
