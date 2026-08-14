/**
 * VG-35～VG-47 R3 深度收口接线锁定。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BLOCK_KIND_MIGRATION_PATCHES,
  migrateBlockKinds,
  validateVideoModelParams,
} from '@nx9/shared';
import { collectClipGenUpstream } from '../clip-gen-request';

const webSrc = resolve(__dirname, '..');

describe('VG-35/45 链镜媒体进 gatherUpstream', () => {
  it('storyboard-desk 链首帧进 pictures、成片进 clips', () => {
    const nodes = [
      {
        id: 'sb',
        type: 'storyboard-desk',
        data: {
          chainStoryboard: {
            version: 2,
            activeEpisodeId: 'ep',
            shots: [
              {
                id: 's1',
                index: 0,
                durationSec: 4,
                shotType: 'medium',
                descriptionZh: 'a',
                promptEn: 'a',
                status: 'approved',
                keyframeStatus: 'approved',
                firstFrameAssetId: 'https://m/f1.png',
                videoAssetId: 'https://m/v1.mp4',
              },
              {
                id: 's2',
                index: 1,
                durationSec: 4,
                shotType: 'medium',
                descriptionZh: 'b',
                promptEn: 'b',
                status: 'approved',
                keyframeStatus: 'approved',
                firstFrameAssetId: 'https://m/f2.png',
                videoAssetId: 'https://m/v2.mp4',
              },
            ],
          },
        },
      },
      { id: 'clip', type: 'clip-gen', data: {} },
    ];
    const edges = [{ source: 'sb', target: 'clip' }];
    const collected = collectClipGenUpstream('clip', nodes as any, edges as any);
    expect(collected.pictures).toEqual(
      expect.arrayContaining(['https://m/f1.png', 'https://m/f2.png']),
    );
    expect(collected.clips).toEqual(
      expect.arrayContaining(['https://m/v1.mp4', 'https://m/v2.mp4']),
    );
  });
});

describe('VG-36/37/46 执行层接线', () => {
  it('flow-runner 无 bridge-clip 假成功分支，出片路径不写 content', () => {
    const flow = readFileSync(resolve(webSrc, 'flow-runner-ops/clip-gen-ops.ts'), 'utf8');
    expect(flow).not.toContain("kind === 'bridge-clip'");
    expect(flow).not.toContain('content: singleReq.prompt');
    expect(flow).not.toContain('content: finalPrompt');
    expect(flow).not.toContain('content: continuationPrompt');
    expect(flow).toContain('batchSummary:');
    expect(flow).toContain('appendStoryboardVideoVersion');
  });

  it('导演批次成片与批量同口径建 videoVersions', () => {
    const src = readFileSync(resolve(webSrc, 'director-keyframe-batch-runner.ts'), 'utf8');
    expect(src).toContain('appendStoryboardVideoVersion');
    expect(src).toContain('videoVersions: versionPatch.videoVersions');
  });

  it('批量返回 skipped 并写节点 message', () => {
    const core = readFileSync(resolve(webSrc, 'core-pipeline-runner.ts'), 'utf8');
    expect(core).toContain('Promise<{ ok: number; fail: number; skipped: number }>');
    expect(core).toContain('跳过 ${skipped} 镜');
  });
});

describe('VG-42/47 参数与迁移归一', () => {
  it('validateVideoModelParams 与网关 parseModelParams 同口径', () => {
    expect(validateVideoModelParams('{"cfg_scale":7.5}')).toBeNull();
    expect(validateVideoModelParams('cfg_scale=7.5')).toBeNull();
    expect(validateVideoModelParams('{broken')).toContain('JSON');
    expect(validateVideoModelParams('nonsense')).toContain('key=value');
    expect(validateVideoModelParams('')).toBeNull();
  });

  it('迁移补丁只保留 single/bridge + videoGenMode，并清扫孤儿 videoMode', () => {
    expect(BLOCK_KIND_MIGRATION_PATCHES['seedance-chain']).toMatchObject({
      videoMode: 'single',
      videoGenMode: 'image-to-video',
      model: 'seedance',
    });
    expect(BLOCK_KIND_MIGRATION_PATCHES['bridge-clip']).toMatchObject({
      videoMode: 'bridge',
      videoGenMode: 'bridge',
    });
    const res = migrateBlockKinds([
      { id: 'n1', type: 'clip-gen', data: { videoMode: 'chain', model: 'seedance' } },
    ]);
    expect(res.migratedCount).toBe(1);
    expect((res.nodes[0].data as any).videoMode).toBe('single');
    expect((res.nodes[0].data as any).videoGenMode).toBe('image-to-video');
  });
});

describe('VG-38/43/44 工作台接线', () => {
  it('单镜 resume 写链 + 清 taskId；linked 保留子集；retry 可停', () => {
    const ws = readFileSync(
      resolve(webSrc, 'stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx'),
      'utf8',
    );
    expect(ws).toContain('appendStoryboardVideoVersion(shot, version)');
    expect(ws).toContain('taskId: undefined');
    expect(ws).toContain('if (prev.length > 0) return;');
    expect(ws).toContain('signal: controller.signal');
    expect(ws).toContain('res.skipped > 0');
    expect(ws).toContain('validateVideoModelParams');
  });
});
