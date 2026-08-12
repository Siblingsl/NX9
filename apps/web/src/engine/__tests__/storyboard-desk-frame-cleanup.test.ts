/**
 * SB-OL-03 / SB-OL-07: 删镜、清线稿后清理关联预览帧（孤儿帧治理）
 */
import { describe, expect, it } from 'vitest';
import type { StoryboardPreviewFrame } from '@nx9/shared';
import { removeFramesForShotIds } from '../storyboard-desk-runner';

function frame(id: string, sourceShotId: string, imageUrl = 'https://x/img.png'): StoryboardPreviewFrame {
  return {
    id,
    order: 1,
    label: id,
    startSec: 0,
    endSec: 3,
    sourceShotId,
    promptSummary: '',
    imageUrl,
    status: 'success',
    locked: false,
  };
}

describe('removeFramesForShotIds', () => {
  it('按 sourceShotId 移除对应帧', () => {
    const frames = [frame('f1', 'shot-a'), frame('f2', 'shot-b')];
    const next = removeFramesForShotIds(frames, ['shot-a']);
    expect(next).not.toBeNull();
    expect(next!.map((f) => f.id)).toEqual(['f2']);
  });

  it('按帧 id 前缀（spf- / frame- / frame-line-）移除写回帧', () => {
    const frames = [
      { ...frame('spf-shot-a', ''), sourceShotId: '' },
      { ...frame('frame-line-shot-b', ''), sourceShotId: '' },
      { ...frame('frame-shot-c', ''), sourceShotId: '' },
      frame('keep', 'shot-d'),
    ];
    const next = removeFramesForShotIds(frames, ['shot-a', 'shot-b', 'shot-c']);
    expect(next).not.toBeNull();
    expect(next!.map((f) => f.id)).toEqual(['keep']);
  });

  it('帧 id 等于镜头 id 时也移除（旧数据兼容）', () => {
    const frames = [{ ...frame('shot-a', ''), sourceShotId: '' }, frame('f2', 'shot-b')];
    const next = removeFramesForShotIds(frames, ['shot-a']);
    expect(next).not.toBeNull();
    expect(next!.map((f) => f.id)).toEqual(['f2']);
  });

  it('无匹配帧时返回 null（调用方不写节点）', () => {
    const frames = [frame('f1', 'shot-a')];
    expect(removeFramesForShotIds(frames, ['shot-z'])).toBeNull();
    expect(removeFramesForShotIds([], ['shot-a'])).toBeNull();
    expect(removeFramesForShotIds(frames, [])).toBeNull();
  });

  it('批量删除多个镜头的帧', () => {
    const frames = [
      frame('f1', 'shot-a'),
      frame('f2', 'shot-b'),
      frame('f3', 'shot-c'),
    ];
    const next = removeFramesForShotIds(frames, ['shot-a', 'shot-c']);
    expect(next).not.toBeNull();
    expect(next!.map((f) => f.sourceShotId)).toEqual(['shot-b']);
  });

  it('不误删相似前缀的其它镜头帧', () => {
    // shot-a1 不应被 shot-a 命中
    const frames = [frame('f1', 'shot-a1'), frame('spf-shot-a10', '')];
    expect(removeFramesForShotIds(frames, ['shot-a'])).toBeNull();
  });

  it('合镜退役的两镜帧一并移除，保留未合并镜', () => {
    const frames = [
      frame('f1', 'shot-1'),
      frame('spf-shot-2', 'shot-2'),
      frame('f3', 'shot-3'),
    ];
    const next = removeFramesForShotIds(frames, ['shot-1', 'shot-2']);
    expect(next).not.toBeNull();
    expect(next!.map((f) => f.sourceShotId)).toEqual(['shot-3']);
  });
});
