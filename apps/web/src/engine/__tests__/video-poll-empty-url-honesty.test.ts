/**
 * 视频轮询：上游 success 无 URL 不得假装「仍在生成」。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const engineRoot = resolve(__dirname, '..');
const webSrc = resolve(__dirname, '../..');

describe('视频 success 无 URL 诚实门禁', () => {
  it('ClipGenBlock 标 error，禁止空成功', () => {
    const src = readFileSync(resolve(webSrc, 'blocks/core/ClipGenBlock.tsx'), 'utf8');
    expect(src).toContain("res.status === 'success' && !res.url");
    expect(src).toContain('视频任务标成功但未返回 URL，禁止空成功');
    expect(src).toContain('toastError');
  });

  it('VideoWorkspace 标 error，禁止空成功', () => {
    const src = readFileSync(
      resolve(engineRoot, 'stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx'),
      'utf8',
    );
    expect(src).toContain("res.status === 'success' && !res.url");
    expect(src).toContain('视频任务标成功但未返回 URL，禁止空成功');
    expect(src).toContain('视频任务空成功已拒绝，禁止空成功');
    expect(src).toMatch(/视频任务标成功但未返回 URL[\s\S]*toastError/);
  });

  it('resumePendingVideoTasks 记 failed，禁止挂 pending', () => {
    const src = readFileSync(resolve(engineRoot, 'core-pipeline-runner.ts'), 'utf8');
    expect(src).toContain("res.status === 'success' && !res.url");
    expect(src).toContain('视频任务空成功已拒绝，禁止空成功');
  });

  it('pollVideoUntilDone failed 默认文案禁止空成功', () => {
    const src = readFileSync(resolve(engineRoot, 'poll-task.ts'), 'utf8');
    expect(src).toContain('图片生成任务失败，禁止空成功');
    expect(src).toContain('视频生成任务失败，禁止空成功');
  });
});
