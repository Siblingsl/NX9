/**
 * F-046 Hyperframes 取消态 · F-048 并发单轨 · F-050 时间线确认
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { has_timeline_confirmed, has_timeline_draft } from '@nx9/shared';
import { applyHyperframesTaskUpdate } from '../src/modules/montage/hyperframes-task';

const root = resolve(__dirname, '../../..');
const webSrc = resolve(root, 'apps/web/src');

function readWeb(rel: string): string {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

describe('F-046 Hyperframes cancel state machine', () => {
  it('cancelled 不被 done/error 覆写', () => {
    expect(
      applyHyperframesTaskUpdate({ status: 'cancelled' }, { status: 'done', url: '/x.mp4' }),
    ).toBeNull();
    expect(
      applyHyperframesTaskUpdate({ status: 'cancelled' }, { status: 'error', message: 'x' }),
    ).toBeNull();
  });

  it('useTaskPoll 保留 cancelled 状态（不并入 error 冒充失败后可误成功）', () => {
    const src = readWeb('hooks/use-task-poll.ts');
    expect(src).toContain("'cancelled'");
    expect(src).toContain("raw === 'cancelled'");
    expect(src).toMatch(/status:\s*'cancelled'/);
  });

  it('ExportPack 取消清 hfTaskId 且不写 success', () => {
    const src = readWeb('blocks/nx9/ExportPackBlock.tsx');
    expect(src).toContain("hfTask.status === 'cancelled'");
    expect(src).toContain('exportReady: false');
    expect(src).toContain("method: 'DELETE'");
    expect(src).toContain('hfTaskId: undefined');
    // cancel path must not set status success in same block
    const cancelBlock = src.slice(src.indexOf("hfTask.status === 'cancelled'"));
    expect(cancelBlock.slice(0, 400)).not.toContain("status: 'success'");
  });

  it('montage controller 暴露 DELETE cancel', () => {
    const src = readFileSync(
      resolve(root, 'apps/server/src/modules/montage/montage.controller.ts'),
      'utf8',
    );
    expect(src).toContain("@Delete('tasks/:taskId')");
    expect(src).toContain('cancelTask');
  });
});

describe('F-048 clip-gen concurrency single track', () => {
  it('卡面 ClipGenBlock 不再暴露并发/重试输入', () => {
    const src = readWeb('blocks/core/ClipGenBlock.tsx');
    expect(src).not.toMatch(/type="number"[\s\S]{0,80}concurrency/);
    expect(src).not.toContain('maxRetries: Math.max(0');
  });

  it('VideoWorkspace 为唯一配置 UI 且并发上限 4', () => {
    const src = readWeb(
      'engine/stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx',
    );
    expect(src).toContain('批出配置');
    expect(src).toContain('Math.min(4');
    expect(src).not.toContain('[1, 2, 3, 4, 5, 6, 7, 8]');
  });

  it('core-pipeline 批出读取 concurrency/maxRetries 并钳制', () => {
    const src = readWeb('engine/core-pipeline-runner.ts');
    expect(src).toContain('clipData.concurrency');
    expect(src).toContain('Math.min(4');
    expect(src).toContain('maxRetries');
  });
});

describe('F-050 timeline confirm readiness', () => {
  it('has_timeline_confirmed 要求有效时间线 + confirmedAt', () => {
    expect(
      has_timeline_confirmed({
        nodes: [{ id: 'ce', type: 'clip-editor', data: { timelineDraft: { clips: [{ id: 'c1' }] } } }],
        edges: [],
      } as any),
    ).toBe(false);

    expect(
      has_timeline_confirmed({
        nodes: [
          {
            id: 'ce',
            type: 'clip-editor',
            data: {
              timelineDraft: { clips: [{ id: 'c1' }] },
              confirmedAt: '2026-09-11T00:00:00.000Z',
            },
          },
        ],
        edges: [],
      } as any),
    ).toBe(true);
  });

  it('有 confirmedAt 无时间线仍 false', () => {
    expect(
      has_timeline_confirmed({
        nodes: [
          {
            id: 'ce',
            type: 'clip-editor',
            data: { confirmedAt: '2026-09-11T00:00:00.000Z' },
          },
        ],
        edges: [],
      } as any),
    ).toBe(false);
  });

  it('ClipEditor 确认写入 confirmedAt', () => {
    const src = readWeb('blocks/core/ClipEditorBlock.tsx');
    expect(src).toContain('confirmedAt');
    expect(src).toContain('new Date().toISOString()');
  });

  it('has_timeline_draft 与 confirmed 解耦', () => {
    expect(
      has_timeline_draft({
        nodes: [{ id: 'ce', type: 'clip-editor', data: { timelineDraft: { clips: [{ id: 'c1' }] } } }],
        edges: [],
      } as any),
    ).toBe(true);
  });
});
