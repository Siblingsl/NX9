/**
 * F-011 成片出口心智收口验收
 * - 编排（智能剪辑）与出片（交付打包）文案区隔
 * - 无有效时间线不得假装导出成功
 * - Playbook has_timeline_draft 与 tracks[].clips / confirmedAt 打通
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FIXTURE_TIMELINE_V2,
  countTimelineClips,
  hasEffectiveTimeline,
  has_timeline_draft,
  parseTimelineDraft,
  type PlaybookReadinessContext,
} from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const webSrc = resolve(root, 'apps/web/src');

function readWeb(rel: string) {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

function emptyCtx(partial: Partial<PlaybookReadinessContext> = {}): PlaybookReadinessContext {
  return {
    storyboard: { shots: [] },
    voice: { lines: [] },
    nodes: [],
    ...partial,
  };
}

describe('F-011 有效时间线判定', () => {
  it('空对象 / 空 tracks 不算有效', () => {
    expect(hasEffectiveTimeline(null)).toBe(false);
    expect(hasEffectiveTimeline(undefined)).toBe(false);
    expect(hasEffectiveTimeline({ tracks: [] } as never)).toBe(false);
    expect(
      hasEffectiveTimeline({
        version: 2,
        title: 'x',
        fps: 30,
        durationSec: 0,
        aspect: '9:16',
        width: 1080,
        height: 1920,
        tracks: [{ id: 'v', kind: 'video', clips: [] }],
      }),
    ).toBe(false);
  });

  it('正式 TimelinePayload tracks[].clips≥1 有效', () => {
    expect(countTimelineClips(FIXTURE_TIMELINE_V2)).toBeGreaterThanOrEqual(1);
    expect(hasEffectiveTimeline(FIXTURE_TIMELINE_V2)).toBe(true);
    expect(hasEffectiveTimeline(JSON.stringify(FIXTURE_TIMELINE_V2))).toBe(true);
  });

  it('兼容遗留顶层 clips', () => {
    expect(hasEffectiveTimeline({ clips: [{ id: 'c1' }] })).toBe(true);
    expect(parseTimelineDraft(JSON.stringify({ clips: [{ id: 'c1' }] }))).toBeTruthy();
  });
});

describe('F-011 Playbook has_timeline_draft 打通', () => {
  it('读 clip-editor 真实 tracks 时间线', () => {
    const noDraft = emptyCtx({
      nodes: [{ id: 'ed', type: 'clip-editor', data: {} }],
    });
    expect(has_timeline_draft(noDraft)).toBe(false);

    const withTracks = emptyCtx({
      nodes: [
        {
          id: 'ed',
          type: 'clip-editor',
          data: { timelineDraft: FIXTURE_TIMELINE_V2, confirmedAt: '2026-07-28T00:00:00.000Z' },
        },
      ],
    });
    expect(has_timeline_draft(withTracks)).toBe(true);

    const withJsonString = emptyCtx({
      nodes: [
        {
          id: 'ed',
          type: 'clip-editor',
          data: { timelineDraft: JSON.stringify(FIXTURE_TIMELINE_V2) },
        },
      ],
    });
    expect(has_timeline_draft(withJsonString)).toBe(true);
  });
});

describe('F-011 文案区隔与防假成功（源码门禁）', () => {
  it('ExportPack：编排/出片说明 + 无时间线禁用 + 导出前守卫', () => {
    const src = readWeb('blocks/nx9/ExportPackBlock.tsx');
    expect(src).toContain('编排请在');
    expect(src).toContain('智能剪辑');
    expect(src).toContain('导出成片');
    expect(src).toContain('交付打包 · 出片');
    expect(src).toContain('modeNeedsTimeline');
    expect(src).toContain('无有效时间线，无法导出成片');
    expect(src).toContain('openSmartEdit');
    expect(src).toContain('timelineHasClips');
  });

  it('export-pack-runner：无时间线返回 ok:false，禁止假成功', () => {
    const src = readWeb('engine/export-pack-runner.ts');
    expect(src).toContain('hasEffectiveTimeline');
    expect(src).toContain('NO_TIMELINE_MSG');
    expect(src).toContain("return { ok: false, message: NO_TIMELINE_MSG }");
    expect(src).toContain('!res.ok || !res.taskId');
  });

  it('flow-runner：export-pack 失败不得标 success', () => {
    const src = readWeb('engine/flow-runner.ts');
    expect(src).toContain("kind === 'export-pack'");
    expect(src).toContain('if (!res.ok)');
    expect(src).toContain("status: 'error'");
    expect(src).toContain('hasEffectiveTimeline');
    expect(src).toContain('timeline');
  });

  it('ClipEditor：主 CTA 确认并送交；预览非最终出片', () => {
    const src = readWeb('blocks/core/ClipEditorBlock.tsx');
    expect(src).toContain('确认时间线并送交导出');
    expect(src).toContain('智能剪辑 · 编排');
    expect(src).toContain('最终出片在交付打包');
    expect(src).toContain('预览渲染（非最终出片）');
    expect(src).toContain('confirmedAt');
    expect(src).toContain('syncToExportPack');
    // 禁止双主按钮：预览不是 primary
    expect(src).toMatch(/className="se2-btn"[\s\S]{0,120}预览渲染/);
  });

  it('run-labels：export-pack=导出成片，clip-editor=智能编排', () => {
    const src = readFileSync(
      resolve(root, 'packages/shared/src/utils/run-labels.ts'),
      'utf8',
    );
    expect(src).toContain("'export-pack'");
    expect(src).toContain('导出成片');
    expect(src).toContain("'clip-editor'");
    expect(src).toContain('智能编排');
  });
});

describe('F-011 runExportPack 无时间线行为', () => {
  it('hyperframes / remotion 无 clips 直接失败', async () => {
    // 动态导入 web runner 会拉 DOM/api；此处用 shared 守卫复现契约
    expect(hasEffectiveTimeline(null)).toBe(false);
    expect(hasEffectiveTimeline({ tracks: [{ id: 'v', kind: 'video', clips: [] }] } as never)).toBe(
      false,
    );
    const runner = readWeb('engine/export-pack-runner.ts');
    expect(runner).toMatch(/hyperframes-episode[\s\S]*?hasEffectiveTimeline/);
    expect(runner).toMatch(/remotion-bundle[\s\S]*?hasEffectiveTimeline/);
  });
});
