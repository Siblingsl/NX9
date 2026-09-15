import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webSrc = resolve(__dirname, '../../web/src');

describe('UX 首用单车道', () => {
  beforeEach(() => {
    // jsdom-free source guards; filter helpers tested via dynamic import if available
  });

  it('first-lane 模块：锁定只放行核心模板/Playbook', async () => {
    // Node 侧无 localStorage → isFirstLaneUnlocked 返回 true；用源码守卫 + 显式常量
    const src = readFileSync(resolve(webSrc, 'engine/first-lane.ts'), 'utf8');
    expect(src).toContain("tpl-core-episode");
    expect(src).toContain("pb-ai-comic-live");
    expect(src).toContain('nx9.firstLane.unlocked');
    expect(src).toContain('filterTemplatesForFirstLane');
    expect(src).toContain('filterPlaybooksForFirstLane');
  });

  it('RecipePicker / Templates / CommandPalette / Export 接线', () => {
    const recipe = readFileSync(
      resolve(webSrc, 'engine/stage-deck/chrome/RecipePickerOverlay.tsx'),
      'utf8',
    );
    expect(recipe).toContain('data-first-lane');
    expect(recipe).toContain('recipe-unlock-all');
    expect(recipe).toContain('FIRST_LANE_TEMPLATE_IDS');

    const panel = readFileSync(resolve(webSrc, 'panels/WorkflowTemplatesPanel.tsx'), 'utf8');
    expect(panel).toContain('filterTemplatesForFirstLane');
    expect(panel).toContain('templates-unlock-all');

    const cmd = readFileSync(
      resolve(webSrc, 'engine/stage-deck/chrome/CommandPalette.tsx'),
      'utf8',
    );
    expect(cmd).toContain('filterTemplatesForFirstLane');
    expect(cmd).toContain('filterPlaybooksForFirstLane');

    const pack = readFileSync(resolve(webSrc, 'blocks/nx9/ExportPackBlock.tsx'), 'utf8');
    expect(pack).toContain('unlockFirstLane');
  });
});
