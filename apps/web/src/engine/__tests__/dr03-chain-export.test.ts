/**
 * DR-03：simpleConcatExport 与导出工作区只消费链镜表，禁止回退全局 storyboard。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Node } from '@xyflow/react';
import type { StoryboardShot } from '@nx9/shared';

const { concatEpisode } = vi.hoisted(() => ({
  concatEpisode: vi.fn(async () => ({
    ok: true,
    url: '/media/episode.mp4',
    status: 'ok',
  })),
}));

vi.mock('../../api/client', () => ({ api: { concatEpisode } }));

import { simpleConcatExport } from '../core-pipeline-runner';
import { useFlowGraphMirror } from '../../stores/flow-graph-mirror';
import { useWorkspaceDocument } from '../../stores/workspace-document';

function makeShot(id: string, index: number): StoryboardShot {
  return {
    id,
    index,
    durationSec: 4,
    shotType: 'medium',
    descriptionZh: `测试镜 ${index}`,
    promptEn: `shot ${index}`,
    status: 'approved',
    keyframeStatus: 'approved',
    videoStatus: 'approved',
    firstFrameAssetId: `/media/${id}.jpg`,
    videoAssetId: `/media/${id}.mp4`,
  } as StoryboardShot;
}

function deskNode(id: string, shots: StoryboardShot[]): Node {
  return {
    id,
    type: 'storyboard-desk',
    position: { x: 0, y: 0 },
    data: { chainStoryboard: { version: 2, shots } },
  };
}

beforeEach(() => {
  concatEpisode.mockClear();
  useFlowGraphMirror.setState({ workspaceId: null, nodes: [], edges: [], revision: 0 });
  useWorkspaceDocument.setState((s) => ({
    storyboard: { ...s.storyboard, activeEpisodeId: null, shots: [] },
  }));
});

describe('DR-03 简单导出链隔离', () => {
  it('只导出链镜表中已采用的视频', async () => {
    useFlowGraphMirror.setState({
      workspaceId: 'w1',
      nodes: [deskNode('desk-a', [makeShot('s1', 1), makeShot('s2', 2)])],
      edges: [],
      revision: 1,
    });

    const res = await simpleConcatExport();

    expect(res).toMatchObject({ ok: true, url: '/media/episode.mp4' });
    expect(concatEpisode).toHaveBeenCalledTimes(1);
    const calls = concatEpisode.mock.calls as unknown as Array<[{ shots: StoryboardShot[] }]>;
    const body = calls[0]![0];
    expect(body.shots.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(body.shots.every((s) => s.videoAssetId && s.videoStatus === 'approved')).toBe(true);
  });

  it('无链镜表时 blocked，不调用后端也不读全局', async () => {
    useWorkspaceDocument.setState((s) => ({
      storyboard: {
        ...s.storyboard,
        activeEpisodeId: null,
        shots: [makeShot('global-1', 1)],
      },
    }));

    const res = await simpleConcatExport();

    expect(res.ok).toBe(false);
    expect(res.message).toContain('未连接上游链镜表');
    expect(concatEpisode).not.toHaveBeenCalled();
  });

  it('源码守卫：simpleConcatExport 走 getAllChainShots，不再读全局 shots', () => {
    const src = readFileSync(resolve(__dirname, '../core-pipeline-runner.ts'), 'utf8');
    const start = src.indexOf('export async function simpleConcatExport');
    const nextExport = src.indexOf('export async function', start + 10);
    const branch = src.slice(start, nextExport === -1 ? start + 6000 : nextExport);
    expect(branch).toContain('getAllChainShots');
    expect(branch).toContain('chainShots.length === 0');
    expect(branch).toContain('已禁止回退全局导出（F-003）');
    expect(branch).not.toContain('activeEpisodeShots(doc.storyboard)');
    expect(branch).not.toContain('console.warn');
  });

  it('源码守卫：ExportWorkspace 用 resolveShotsForBlock 并标明仅连接链', () => {
    const src = readFileSync(
      resolve(__dirname, '../stage-deck/chrome/attached-workspace/config/ExportWorkspace.tsx'),
      'utf8',
    );
    expect(src).toContain('resolveShotsForBlock(blockId, nodes, edges)');
    expect(src).toContain('仅导出连接链中已采用的视频');
    expect(src).not.toContain('activeEpisodeShots');
  });
});
