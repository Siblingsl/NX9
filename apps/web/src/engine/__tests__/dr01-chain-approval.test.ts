/**
 * DR-01：批审只写链镜表，禁止回退全局 storyboard（F-003）。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Node } from '@xyflow/react';
import type { StoryboardShot } from '@nx9/shared';
import { approveAllKeyframes } from '../core-pipeline-runner';
import { useFlowGraphMirror } from '../../stores/flow-graph-mirror';
import { useWorkspaceDocument } from '../../stores/workspace-document';

function makeShot(id: string, index: number, hasFrame: boolean): StoryboardShot {
  return {
    id,
    index,
    durationSec: 4,
    shotType: 'medium',
    descriptionZh: `测试镜 ${index}`,
    promptEn: `shot ${index}`,
    status: 'draft',
    keyframeStatus: 'draft',
    ...(hasFrame ? { firstFrameAssetId: `/media/${id}.jpg` } : {}),
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

function setGlobalShot(shot: StoryboardShot) {
  useWorkspaceDocument.setState((s) => ({
    storyboard: { ...s.storyboard, activeEpisodeId: null, shots: [shot] },
  }));
}

function chainShotOf(node: Node, shotId: string): StoryboardShot {
  const chain = (node.data as { chainStoryboard?: { shots: StoryboardShot[] } }).chainStoryboard!;
  return chain.shots.find((s) => s.id === shotId)!;
}

beforeEach(() => {
  useFlowGraphMirror.setState({ workspaceId: null, nodes: [], edges: [], revision: 0 });
  useWorkspaceDocument.setState((s) => ({
    storyboard: { ...s.storyboard, activeEpisodeId: null, shots: [] },
  }));
});

describe('DR-01 批审链隔离', () => {
  it('只批准有图的链镜头并写回各自 desk，不写全局 storyboard', () => {
    const globalShot = makeShot('global-1', 1, true);
    setGlobalShot(globalShot);

    const deskA = deskNode('desk-a', [makeShot('a1', 1, true), makeShot('a2', 2, false)]);
    const deskB = deskNode('desk-b', [makeShot('b1', 1, true)]);
    useFlowGraphMirror.setState({ workspaceId: 'w1', nodes: [deskA, deskB], edges: [], revision: 1 });

    const res = approveAllKeyframes();

    expect(res).toEqual({ ok: 2 });
    const a1 = chainShotOf(useFlowGraphMirror.getState().nodes[0]!, 'a1');
    const a2 = chainShotOf(useFlowGraphMirror.getState().nodes[0]!, 'a2');
    const b1 = chainShotOf(useFlowGraphMirror.getState().nodes[1]!, 'b1');
    expect(a1.keyframeStatus).toBe('approved');
    expect(a1.status).toBe('approved');
    expect(a1.reviewHistory?.length).toBeGreaterThan(0);
    expect(a2.keyframeStatus).toBe('draft');
    expect(b1.keyframeStatus).toBe('approved');
    expect(useWorkspaceDocument.getState().storyboard.shots[0]?.keyframeStatus).toBe('draft');
  });

  it('无链镜表时 blocked=no-chain，不写全局', () => {
    const globalShot = makeShot('global-1', 1, true);
    setGlobalShot(globalShot);

    const res = approveAllKeyframes();

    expect(res).toEqual({ ok: 0, blocked: 'no-chain' });
    expect(useWorkspaceDocument.getState().storyboard.shots[0]?.keyframeStatus).toBe('draft');
  });

  it('源码守卫：approveAllKeyframes 不再调用 doc.updateShot', () => {
    const src = readFileSync(resolve(__dirname, '../core-pipeline-runner.ts'), 'utf8');
    const branch = src.slice(
      src.indexOf('export function approveAllKeyframes'),
      src.indexOf('/** VG-10: 写回链镜表'),
    );
    expect(branch).toContain('getAllChainShots');
    expect(branch).toContain('patchShotOnChainGraph(');
    expect(branch).toContain('shot.id,');
    expect(branch).toContain("blocked: 'no-chain'");
    expect(branch).not.toContain('doc.updateShot');
    expect(branch).not.toContain('activeEpisodeShots(doc.storyboard)');
  });
});
