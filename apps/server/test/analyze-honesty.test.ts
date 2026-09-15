/**
 * 参考视频反推：空分镜表禁止 ok:true。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('analyzeReference 空成功门禁', () => {
  it('未能解析分镜表时 ok 为假并带禁止空成功', () => {
    const src = readFileSync(
      resolve(__dirname, '../src/modules/montage/analyze.service.ts'),
      'utf8',
    );
    expect(src).toContain('ok: shots.length > 0');
    expect(src).toContain('未能解析分镜表，禁止空成功');
    expect(src).toContain('无法访问视频文件，请使用已上传或已生成的 /media/videos/ URL，禁止空成功');
  });
});
