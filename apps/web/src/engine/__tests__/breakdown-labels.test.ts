import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  breakdownBusyLabel,
  breakdownNewOnlyLabel,
  breakdownNextStepHint,
  breakdownPrimaryLabel,
} from '../breakdown-labels';

describe('breakdown-labels 术语统一', () => {
  it('空台 / 同步 / 新增共用「拆镜」动词', () => {
    expect(breakdownPrimaryLabel({})).toBe('拆镜');
    expect(breakdownPrimaryLabel({ hasLocalShots: true })).toBe('拆镜 · 同步');
    expect(breakdownPrimaryLabel({ stale: true, newEpisodeCount: 2 })).toBe('拆镜 · 新增 2 集');
    expect(breakdownPrimaryLabel({ stale: true })).toBe('拆镜 · 同步');
    expect(breakdownBusyLabel()).toBe('拆镜中…');
    expect(breakdownNewOnlyLabel(3)).toBe('拆镜 · 新增 3 集');
    expect(breakdownNextStepHint(false)).toBe('拆镜');
    expect(breakdownNextStepHint(true)).toBe('拆镜 · 同步');
  });

  it('编剧台 / 分镜台入口不再散落旧三套说法作主 CTA', () => {
    const root = resolve(__dirname, '../..');
    const actions = readFileSync(
      resolve(root, 'blocks/nx9/script-desk/use-script-desk-actions.ts'),
      'utf8',
    );
    expect(actions).toContain('breakdownNextStepHint');
    expect(actions).not.toMatch(/return hasLocalBreakdown \? '同步最新成稿'/);

    const panel = readFileSync(
      resolve(root, 'blocks/craft/storyboard-desk/breakdown-panel.tsx'),
      'utf8',
    );
    expect(panel).toContain('breakdownPrimaryLabel');
    expect(panel).not.toContain("'从成稿拆镜'");
    expect(panel).not.toContain("'同步最新成稿'");
  });
});
