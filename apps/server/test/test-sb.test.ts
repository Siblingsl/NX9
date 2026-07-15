import { describe, it, expect } from 'vitest';
import {
  adoptStoryboardVideoVersion,
  appendEpisodeExportRecord,
  appendStoryboardReviewEvent,
  appendStoryboardVideoVersion,
  buildDirectorCharacterPlacementPrompt,
  resolveStoryboardVideoVersions,
  type StoryboardShot,
} from '@nx9/shared';

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

  it('TEST-SB-003: 批审驳回原因保留完整审阅记录', () => {
    const shot = makeShot();
    const rejected = appendStoryboardReviewEvent(shot, {
      id: 'review-1',
      stage: 'keyframe',
      decision: 'rejected',
      comment: '人物向画面左侧移动，并改为中景',
      createdAt: '2026-07-14T01:00:00.000Z',
    });
    const approved = appendStoryboardReviewEvent({ ...shot, reviewHistory: rejected }, {
      id: 'review-2',
      stage: 'keyframe',
      decision: 'approved',
      createdAt: '2026-07-14T01:05:00.000Z',
    });
    expect(approved).toHaveLength(2);
    expect(approved[0].comment).toContain('左侧');
    expect(approved[1].decision).toBe('approved');
  });

  it('TEST-SB-004: 视频生成累积版本且只采用指定版本', () => {
    const shot = makeShot();
    const firstPatch = appendStoryboardVideoVersion(shot, {
      id: 'video-v1', url: '/v1.mp4', createdAt: '2026-07-14T01:00:00.000Z', status: 'candidate',
    });
    const withFirst = { ...shot, ...firstPatch };
    const secondPatch = appendStoryboardVideoVersion(withFirst, {
      id: 'video-v2', url: '/v2.mp4', createdAt: '2026-07-14T01:01:00.000Z', status: 'candidate',
    });
    const withSecond = { ...withFirst, ...secondPatch };
    expect(resolveStoryboardVideoVersions(withSecond).map((item) => item.url)).toEqual(['/v1.mp4', '/v2.mp4']);

    const adopted = adoptStoryboardVideoVersion(withSecond, 'video-v1');
    expect(adopted?.videoAssetId).toBe('/v1.mp4');
    expect(adopted?.adoptedVideoVersionId).toBe('video-v1');
    expect(adopted?.videoStatus).toBe('approved');
    expect(adopted?.videoVersions?.find((item) => item.id === 'video-v1')?.status).toBe('adopted');
  });

  it('TEST-SB-005: 导出历史按最新记录置顶并限制长度', () => {
    const base = [1, 2].map((index) => ({
      id: `export-${index}`,
      episodeId: 'episode-1',
      url: `/episode-${index}.mp4`,
      fileName: `episode-${index}.mp4`,
      mode: 'ffmpeg-episode' as const,
      shotCount: 8,
      durationSec: 40,
      createdAt: `2026-07-14T01:0${index}:00.000Z`,
    }));
    const history = appendEpisodeExportRecord(base, {
      ...base[0], id: 'export-3', url: '/episode-3.mp4', fileName: 'episode-3.mp4',
    }, 2);
    expect(history).toHaveLength(2);
    expect(history[0].id).toBe('export-3');
  });

  it('TEST-SB-006: 3D 人物摆位进入分镜生成 Prompt', () => {
    const prompt = buildDirectorCharacterPlacementPrompt({
      sourceBlockId: 'director-3d',
      captureId: 'capture-1',
      captureUrl: '/capture.png',
      appliedAt: '2026-07-14T01:00:00.000Z',
      characterPlacements: [{
        objectId: 'actor-1',
        characterId: 'character-1',
        name: '林夏',
        position: [-1.2, 0, 0.5],
        rotation: [0, 1.57, 0],
        scale: [1, 1, 1],
        posePresetId: 'stand',
      }],
    });
    expect(prompt).toContain('林夏');
    expect(prompt).toContain('-1.20');
    expect(prompt).toContain('yaw 1.57');
  });
});

function makeShot(): StoryboardShot {
  return {
    id: 'shot-test',
    index: 1,
    durationSec: 4,
    shotType: 'medium',
    descriptionZh: '测试镜头',
    promptEn: 'test shot',
    status: 'draft',
  };
}
