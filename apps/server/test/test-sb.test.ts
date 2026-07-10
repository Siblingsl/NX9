import { describe, it, expect } from 'vitest';
import type { StoryboardShot } from '@nx9/shared';

describe('TEST-SB — Storyboard (pure function tests)', () => {

  it('TEST-SB-001: 故事板导入 6 镜 - shots with sequential indices can be created and validated', () => {
    const shots: StoryboardShot[] = Array.from({ length: 6 }, (_, i) => ({
      id: `shot-${i + 1}`,
      index: i + 1,
      durationSec: 4,
      shotType: 'medium' as const,
      descriptionZh: `镜号 ${i + 1}`,
      promptEn: `shot ${i + 1}`,
      status: 'draft' as const,
      characterIds: [],
      linkedBlockId: null,
    }));

    expect(shots).toHaveLength(6);
    shots.forEach((s, i) => {
      expect(s.index).toBe(i + 1);
      expect(s.id).toBe(`shot-${i + 1}`);
      expect(s.status).toBe('draft');
    });

    const indices = shots.map((s) => s.index);
    expect(indices).toEqual([1, 2, 3, 4, 5, 6]);

    const unique = new Set(indices);
    expect(unique.size).toBe(6);
  });

  it('TEST-SB-002: 线稿上传写 firstFrameAssetId - updating a shot firstFrameAssetId works', () => {
    const shot: StoryboardShot = {
      id: 'shot-upload-001',
      index: 1,
      durationSec: 4,
      shotType: 'wide',
      descriptionZh: '测试上传',
      promptEn: 'test upload',
      status: 'draft',
      characterIds: [],
      linkedBlockId: null,
      firstFrameAssetId: null,
    };

    expect(shot.firstFrameAssetId).toBeNull();

    const updated = { ...shot, firstFrameAssetId: '/media/images/uploaded-sketch.png' };
    expect(updated.firstFrameAssetId).toBe('/media/images/uploaded-sketch.png');
    expect(updated.index).toBe(shot.index);

    const overwritten = { ...updated, firstFrameAssetId: '/media/images/replaced.png' };
    expect(overwritten.firstFrameAssetId).toBe('/media/images/replaced.png');
  });
});
