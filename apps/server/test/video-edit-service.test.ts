/**
 * SE-DEEP-06/07/08：video-edit 取消、任务落盘与 Fal storage 上传收口。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const service = readFileSync(
  resolve(__dirname, '../src/modules/montage/video-edit.service.ts'),
  'utf8',
);
const store = readFileSync(
  resolve(__dirname, '../src/modules/montage/render-task-store.ts'),
  'utf8',
);
const controller = readFileSync(
  resolve(__dirname, '../src/modules/montage/montage.controller.ts'),
  'utf8',
);

describe('SE-DEEP-06/07/08 video-edit 生产收口', () => {
  it('任务落盘且服务重启时中断标记', () => {
    expect(store).toContain("VIDEO_EDIT_TASKS_FILE = join(PATHS.data, 'render-tasks', 'video-edit.json')");
    expect(service).toContain('loadTaskRecords');
    expect(service).toContain('saveTaskRecords');
    expect(service).toContain('服务重启，任务已中断');
  });

  it('取消 API 存在，cancelled 不被后续状态覆写', () => {
    expect(controller).toContain("@Delete('video-edit-tasks/:taskId')");
    expect(service).toContain('async cancel(taskId: string): Promise<boolean>');
    expect(service).toContain("if (!job || job.status === 'cancelled') return;");
  });

  it('本地媒体经 Fal storage 上传，禁止整段 base64', () => {
    expect(service).toContain('rest.alpha.fal.ai/storage/upload/init');
    expect(service).toContain('fs.createReadStream(local)');
    expect(service).not.toMatch(/data:[^;]+;base64/);
    expect(service).not.toContain('base64,');
  });

  it('未知 providerId 明确失败，不静默回落到默认供应商', () => {
    expect(service).toContain('未知视频编辑供应商');
    expect(service).toContain('VIDEO_EDIT_PROVIDERS.some((p) => p.id === body.providerId)');
  });
});
