/**
 * watchVideoTask：SSE 回退不得无校验 resolve；产物取自 url/result.url。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { taskOutputUrl, type TaskSnapshot } from '../../hooks/use-task-stream';

const src = readFileSync(resolve(__dirname, '../../hooks/use-task-stream.ts'), 'utf8');

describe('watchVideoTask 诚实门禁', () => {
  it('源码：onerror 终态走 settle，禁止盲 resolve', () => {
    expect(src).toContain('taskOutputUrl');
    expect(src).toContain('任务完成但无输出地址，禁止空成功');
    expect(src).toContain('任务流中断，请重试');
    expect(src).not.toMatch(/onerror[\s\S]{0,220}resolve\(t as TaskSnapshot\)/);
  });

  it('taskOutputUrl 识别顶层与 result.url', () => {
    expect(taskOutputUrl({ id: '1', status: 'done', progress: 100, url: '/a.mp4' })).toBe('/a.mp4');
    expect(
      taskOutputUrl({ id: '2', status: 'done', progress: 100, result: { url: '/b.mp4' } } as TaskSnapshot),
    ).toBe('/b.mp4');
    expect(taskOutputUrl({ id: '3', status: 'done', progress: 100 })).toBeUndefined();
  });
});
