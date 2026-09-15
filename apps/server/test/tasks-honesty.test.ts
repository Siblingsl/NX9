/**
 * TasksService.pollVideoTask：done 无 URL 立即失败。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../src/modules/tasks/tasks.service.ts'), 'utf8');

describe('TasksService 诚实门禁', () => {
  it('done 无 url 不得空转超时', () => {
    expect(src).toContain('res.done && !res.url');
    expect(src).toContain('视频任务完成但无输出地址，禁止空成功');
    expect(src).toContain("status: 'failed'");
  });
});
