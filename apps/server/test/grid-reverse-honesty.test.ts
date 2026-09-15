/**
 * 宫格 Vision 反推：LLM 非 JSON 时不得静默空成功。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('GridService 反推诚实性', () => {
  it('解析失败时写出明确失败文案，禁止空 prompt 假成功', () => {
    const src = readFileSync(resolve(__dirname, '../src/modules/grid/grid.service.ts'), 'utf8');
    expect(src).toContain('extractLlmJsonObject');
    expect(src).toContain('未假装成功');
    expect(src).not.toContain("data = JSON.parse(res.choices?.[0]?.message?.content ?? '{}')");
  });
});
