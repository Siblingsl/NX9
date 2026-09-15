/**
 * 关键帧一致性评分：禁止 LLM 解析失败时落默认 85 假高分。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkStoryboardConsistencyWithAi } from '../storyboard-preview-runner';
import type { StoryboardPreviewFrame } from '@nx9/shared';

vi.mock('../../api/client', () => ({
  api: {
    proxyLlm: vi.fn(),
  },
}));

import { api } from '../../api/client';

const frames: StoryboardPreviewFrame[] = [
  {
    id: 'f1',
    label: 'Shot01',
    startSec: 0,
    endSec: 2,
    promptSummary: '角色站立',
    imageUrl: 'https://example.com/a.png',
  },
  {
    id: 'f2',
    label: 'Shot02',
    startSec: 2,
    endSec: 4,
    promptSummary: '角色坐下',
    imageUrl: 'https://example.com/b.png',
  },
];

describe('关键帧评分诚实性', () => {
  beforeEach(() => {
    vi.mocked(api.proxyLlm).mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('围栏 JSON 可解析并采用 score', async () => {
    vi.mocked(api.proxyLlm).mockResolvedValue({
      content: '```json\n{"score":62,"issues":[{"frameLabel":"Shot01","message":"服装变了"}]}\n```',
    });
    const report = await checkStoryboardConsistencyWithAi(frames, 'character');
    expect(report.overallScore).toBe(62);
    expect(report.dimensions[0]?.issues.some((i) => i.message.includes('服装'))).toBe(true);
  });

  it('非 JSON 解析失败时综合分为 0，不落默认 85', async () => {
    vi.mocked(api.proxyLlm).mockResolvedValue({
      content: '模型直接写了一段散文，没有 JSON',
    });
    const report = await checkStoryboardConsistencyWithAi(frames, 'scene');
    expect(report.overallScore).toBe(0);
    expect(report.dimensions[0]?.issues[0]?.message).toMatch(/无法解析.*禁止空成功/);
  });

  it('源码不再含默认 score = 85', () => {
    const src = readFileSync(resolve(__dirname, '../storyboard-preview-runner.ts'), 'utf8');
    expect(src).not.toContain('let score = 85');
    expect(src).toContain('extractLlmJsonObject');
    expect(src).toContain('LLM 返回无法解析为评分 JSON，禁止空成功');
  });

  it('预览工作区空前置禁止空成功', () => {
    const src = readFileSync(
      resolve(
        __dirname,
        '../stage-deck/chrome/attached-workspace/storyboard-preview/useStoryboardPreviewState.ts',
      ),
      'utf8',
    );
    expect(src).toContain('请先连接图像生成节点（红线连接），禁止空成功');
    expect(src).toContain('请先填写 720° 全景场景描述，禁止空成功');
    expect(src).toContain('没有可评分的关键帧，请先同步并出图，禁止空成功');
    expect(src).toContain('没有可同步的分镜，请先在故事板确认镜头，禁止空成功');
    expect(src).toContain('toastError');
    expect(src).toMatch(/单张重新生成失败[\s\S]*toastError/);
    expect(src).toMatch(/720° 全景生成失败[\s\S]*toastError/);
    expect(src).toMatch(/一致性检查失败[\s\S]*toastError/);
    expect(src).toMatch(/关键帧宫格合成失败[\s\S]*toastError/);
    expect(readFileSync(resolve(__dirname, '../storyboard-preview-runner.ts'), 'utf8')).toContain(
      '尚无预览图，无法检查，禁止空成功',
    );
    expect(
      readFileSync(
        resolve(
          __dirname,
          '../stage-deck/chrome/attached-workspace/storyboard-preview/StoryboardPreviewWorkspace.tsx',
        ),
        'utf8',
      ),
    ).toContain('无可重新生成的分镜（已全部锁定或生成中），禁止空成功');
  });
});
