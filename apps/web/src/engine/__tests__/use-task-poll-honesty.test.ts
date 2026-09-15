/**
 * useTaskPoll：done 无 URL 不得标完成。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(__dirname, '../../hooks/use-task-poll.ts'), 'utf8');

describe('useTaskPoll 诚实门禁', () => {
  it('done 无 url 标 error，禁止空成功', () => {
    expect(src).toContain("raw === 'done'");
    expect(src).toContain('渲染完成但无输出地址，禁止空成功');
    expect(src).toContain("status: 'error'");
  });
});
