import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  WORKFLOW_TEMPLATES,
  CLIP_GEN_MODE_CONFIGS,
  normalizeClipGenVideoModeData,
  isClipGenModeAvailable,
  isSeedanceModel,
  buildBridgeContinuationPrompt,
  createEpisodeQueue,
  queueMarkSuccess,
  queueMarkError,
  validateSClassReferences,
  compileSClassPrompt,
} from '@nx9/shared';

const webSrc = resolve(__dirname, '../../web/src');

function readWeb(rel: string) {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

describe('F-035 高级配方名实相符', () => {
  it('CLIP_GEN_MODE 仅 single|bridge（Seedance 不是 videoMode）', () => {
    expect(CLIP_GEN_MODE_CONFIGS.map((c) => c.mode).sort()).toEqual(['bridge', 'single']);
    expect(CLIP_GEN_MODE_CONFIGS.some((c) => (c as { mode: string }).mode === 'seedance')).toBe(
      false,
    );
    expect(CLIP_GEN_MODE_CONFIGS.some((c) => (c as { mode: string }).mode === 'episode-queue')).toBe(
      false,
    );
  });

  it('历史 videoMode=seedance 归一为 single + model', () => {
    const next = normalizeClipGenVideoModeData({ videoMode: 'seedance' });
    expect(next.videoMode).toBe('single');
    expect(isSeedanceModel(next.model)).toBe(true);
    expect(isClipGenModeAvailable('seedance', false).available).toBe(true);
  });

  it('tpl-sclass / bridge / line-art 文案与节点数据诚实', () => {
    const sclass = WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-sclass-seedance')!;
    expect(sclass.label).not.toMatch(/连续镜头/);
    expect(sclass.status).toBe('beta');
    const sBlocks = sclass.build().blocks;
    const sClip = sBlocks.find((b) => b.type === 'clip-gen')!;
    expect(sClip.data.videoMode).toBe('single');
    expect(sClip.data.model).toBe('seedance');
    expect(sClip.data.videoMode).not.toBe('seedance');

    const bridge = WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-bridge-sequence')!;
    expect(bridge.status).toBe('beta');
    const bClip = bridge.build().blocks.find(
      (b) => b.type === 'clip-gen' && (b.data as { videoMode?: string }).videoMode === 'bridge',
    );
    expect(bClip).toBeTruthy();

    const line = WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-line-art-storyboard')!;
    expect(line.description).toMatch(/线稿/);
    const desk = line.build().blocks.find((b) => b.type === 'storyboard-desk')!;
    expect((desk.data as { style?: string }).style).toBe('line-art');
  });

  it('ClipGenBlock 不再提供 videoMode=seedance 空开关', () => {
    const src = readWeb('blocks/core/ClipGenBlock.tsx');
    expect(src).toContain('CLIP_GEN_MODE_CONFIGS');
    expect(src).toContain('normalizeClipGenVideoModeData');
    expect(src).not.toMatch(/id:\s*'seedance',\s*label:\s*'Seedance'/);
    expect(src).toContain('isSeedanceModel');
  });
});

describe('F-049 三路径 mock 闭环（非真机）', () => {
  it('Bridge：续拍 Prompt + runner 分支存在', () => {
    const prompt = buildBridgeContinuationPrompt({
      sourcePrompt: 'walk in',
      nextPrompt: 'walk out',
    });
    expect(prompt).toContain('前情');
    expect(prompt).toContain('接续');
    const ops = readWeb('engine/flow-runner-ops/clip-gen-ops.ts');
    expect(ops).toContain("videoMode === 'bridge'");
    expect(ops).toContain('extractFrames');
    expect(ops).toContain('buildBridgeContinuationPrompt');
    expect(ops).toContain('Bridge 续拍需要源视频');
  });

  it('Episode-queue：多集拆镜队列可推进并可恢复错误', () => {
    let q = createEpisodeQueue(['ep1', 'ep2']);
    q = { ...q, status: 'running' };
    q = queueMarkSuccess(q);
    expect(q.results.ep1).toBe(true);
    expect(q.index).toBe(1);
    q = queueMarkError(q, 'boom');
    expect(q.errors.ep2).toBe('boom');
    expect(q.results.ep2).toBe(false);
    const bar = readWeb('components/EpisodeQueueBar.tsx');
    expect(bar).toContain('EpisodeQueueBar');
    expect(bar).toMatch(/暂停|继续|跳过|取消/);
  });

  it('Seedance：model 约束 + 请求组装守卫', () => {
    expect(validateSClassReferences(10, 0)).toMatch(/超出/);
    expect(validateSClassReferences(1, 1)).toBeNull();
    const compiled = compileSClassPrompt(
      {
        id: 'g1',
        name: 'g1',
        shotIds: ['s1'],
        totalDurationSec: 5,
        overLimit: false,
      },
      [
        {
          id: 's1',
          episodeId: 'e1',
          index: 0,
          durationSec: 5,
          shotType: 'MS',
          descriptionZh: '测',
          promptEn: 'test shot',
          videoPromptEn: 'test shot',
        } as never,
      ],
      { referenceImages: ['a.jpg'] },
    );
    expect(compiled.prompt).toContain('Seedance');
    const req = readWeb('engine/clip-gen-request.ts');
    expect(req).toContain("model === 'seedance'");
    expect(req).toContain('validateSClassReferences');
  });
});

describe('F-034 声音剧代码闭环守卫（真机仍 90%）', () => {
  it('声音剧 / 短片模板含 sound-gen；无假 audio-mix kind', () => {
    const voice = WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-voice-drama');
    const short = WORKFLOW_TEMPLATES.find((t) => t.id === 'tpl-ai-short-film');
    expect(voice || short).toBeTruthy();
    for (const tpl of [voice, short].filter(Boolean)) {
      const kinds = tpl!.build().blocks.map((b) => b.type);
      expect(kinds).toContain('sound-gen');
      expect(kinds).not.toContain('audio-mix');
    }
  });
});
