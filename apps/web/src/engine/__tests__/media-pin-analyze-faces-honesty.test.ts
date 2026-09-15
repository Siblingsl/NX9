/**
 * MediaPin 表情分析：ok:false 时不得写入假「无人脸」结果。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('MediaPin analyzeFaces 诚实性', () => {
  it('消费端校验 res.ok，失败 throw', () => {
    const src = readFileSync(
      resolve(__dirname, '../../blocks/utility/MediaPinBlock.tsx'),
      'utf8',
    );
    expect(src).toContain('api.analyzeFaces');
    expect(src).toContain('if (!res.ok)');
    expect(src).toContain('throw new Error');
    expect(src).toContain('表情分析失败，禁止空成功');
  });
});
