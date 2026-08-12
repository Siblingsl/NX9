import { describe, expect, it } from 'vitest';
import { resolvePictureGenNodeForShot } from '../core-pipeline-runner';
import type { StoryboardShot } from '@nx9/shared';

const shot = { id: 'shot-1', index: 0 } as StoryboardShot;

describe('PG-12 镜头绑定 picture-gen 节点', () => {
  it('优先 linkedShotId 绑定的节点', () => {
    const nodes = [
      { id: 'pic-a', type: 'picture-gen', data: {} },
      { id: 'pic-b', type: 'picture-gen', data: { linkedShotId: 'shot-1' } },
    ];
    const hit = resolvePictureGenNodeForShot(shot, nodes, []);
    expect(hit?.id).toBe('pic-b');
  });

  it('其次取分镜台下游连接的 picture-gen', () => {
    const nodes = [
      { id: 'desk', type: 'storyboard-desk', data: { chainStoryboard: { version: 1, shots: [shot] } } },
      { id: 'pic-a', type: 'picture-gen', data: {} },
      { id: 'pic-b', type: 'picture-gen', data: {} },
    ];
    const edges = [{ source: 'desk', target: 'pic-b' }];
    const hit = resolvePictureGenNodeForShot(shot, nodes, edges);
    expect(hit?.id).toBe('pic-b');
  });

  it('显式 id 优先于绑定', () => {
    const nodes = [
      { id: 'pic-a', type: 'picture-gen', data: { linkedShotId: 'shot-1' } },
      { id: 'pic-b', type: 'picture-gen', data: {} },
    ];
    const hit = resolvePictureGenNodeForShot(shot, nodes, [], 'pic-b');
    expect(hit?.id).toBe('pic-b');
  });

  it('都没有则回落画布第一个 picture-gen', () => {
    const nodes = [{ id: 'pic-a', type: 'picture-gen', data: { foo: 1 } }];
    const hit = resolvePictureGenNodeForShot(shot, nodes, []);
    expect(hit?.id).toBe('pic-a');
    expect(hit?.data.foo).toBe(1);
  });
});
