/**
 * pollVideoUntilDone：success 无 URL 立即失败。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../poll-task.ts'), 'utf8');

describe('pollVideoUntilDone 诚实门禁', () => {
  it('success 无 url 立即 throw，禁止空转超时', () => {
    expect(src).toContain("res.status === 'success'");
    expect(src).toContain('视频任务完成但无输出地址，禁止空成功');
    expect(src).toContain('图片任务完成但无输出地址，禁止空成功');
  });

  it('awaitProxyVideo 无 url/task 拒绝空成功', () => {
    expect(src).toContain('视频生成失败，禁止空成功');
  });
});
