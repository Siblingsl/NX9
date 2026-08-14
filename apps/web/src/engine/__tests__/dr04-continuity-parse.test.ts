/**
 * DR-04：连续性 LLM JSON 解析去围栏 + 写回降级（review，禁止整表 failed）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseContinuityLlmJson } from '../continuity-check-runner';

describe('DR-04 parseContinuityLlmJson', () => {
  it('解析 markdown 围栏 JSON，支持字符串与 shotIndex/shotId 对象', () => {
    const raw = [
      '```json',
      '{',
      '  "summary": "两处不一致",',
      '  "issues": [',
      '    { "shotIndex": 0, "message": "服装颜色变了" },',
      '    { "shotId": "s3", "message": "轴线反转" },',
      '    "道具位置不同"',
      '  ]',
      '}',
      '```',
    ].join('\n');

    const parsed = parseContinuityLlmJson(raw);

    expect(parsed.parseFailed).toBe(false);
    expect(parsed.summary).toBe('两处不一致');
    expect(parsed.issues).toEqual([
      { shotIndex: 0, message: '服装颜色变了' },
      { shotId: 's3', message: '轴线反转' },
      { message: '道具位置不同' },
    ]);
  });

  it('非 JSON 返回 parseFailed=true 且 issues 为空', () => {
    const parsed = parseContinuityLlmJson('模型直接输出了两段描述文字，没有 JSON');

    expect(parsed.parseFailed).toBe(true);
    expect(parsed.issues).toEqual([]);
  });

  it('缺少 issues 数组视为解析失败，不伪装成零问题', () => {
    const parsed = parseContinuityLlmJson('{"summary":"ok"}');

    expect(parsed.parseFailed).toBe(true);
    expect(parsed.issues).toEqual([]);
  });
});

describe('DR-04 flow-runner continuity 写回降级', () => {
  it('写回只到 review，禁止整表 failed，且使用 parseContinuityLlmJson', () => {
    const src = readFileSync(resolve(__dirname, '../flow-runner-ops/story-ops.ts'), 'utf8');
    const branch = src.slice(
      src.indexOf("if (kind === 'continuity-check')"),
      src.indexOf("if (kind === 'beat-sync')"),
    );
    expect(branch).toContain('parseContinuityLlmJson(raw)');
    expect(branch).toContain("keyframeStatus: 'review'");
    expect(branch).not.toContain("keyframeStatus: 'failed'");
    expect(branch).not.toContain("status: 'failed'");
    expect(branch).not.toContain('JSON.parse(typeof raw');
  });
});
