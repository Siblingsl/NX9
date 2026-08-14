/**
 * SB-D-02 / SB-D-05: 复制镜清媒体字段、批量复制/批删不可变改写。
 */
import { describe, expect, it } from 'vitest';
import type {
  ScriptBreakdownPayload,
  ScriptBreakdownShot,
} from '@nx9/shared';
import {
  copyShotInBreakdown,
  copyShotsInBreakdown,
  removeShotsFromBreakdown,
} from '../storyboard-desk-runner';

function shot(id: string, index: number, url: string | null = null): ScriptBreakdownShot {
  return {
    id,
    episodeId: 'ep-1',
    episodeIndex: 0,
    index,
    sceneId: 'sc',
    sceneCode: `1-${index}`,
    title: `镜${index}`,
    durationSec: 3,
    characters: [],
    scene: '',
    scriptText: '',
    dialogue: [],
    imagePrompt: '',
    videoPrompt: '',
    previewImageUrl: url,
    referenceImageUrl: url,
    status: 'approved',
  };
}

function makePayload(): ScriptBreakdownPayload {
  return {
    version: 1,
    title: 'test',
    sourceText: '',
    generatedAt: '2026-08-12T00:00:00.000Z',
    episodes: [{
      id: 'ep-1',
      index: 1,
      title: '第1集',
      shots: [shot('s1', 1, 'https://mock/line-1.png'), shot('s2', 2, null)],
    }],
  };
}

describe('copyShotInBreakdown（SB-D-02/05）', () => {
  it('复制镜清空媒体字段并回到 draft，原 payload 不被就地改写', () => {
    const payload = makePayload();
    (payload.episodes[0].shots[0] as ScriptBreakdownShot & { sketchUrl?: string | null }).sketchUrl =
      'https://mock/sketch.png';
    const originalShot = payload.episodes[0].shots[0];
    const originalIndex = originalShot.index;

    const next = copyShotInBreakdown(payload, 'ep-1', 's1');

    expect(next).not.toBe(payload);
    expect(next.episodes[0].shots[0]).not.toBe(originalShot);
    expect(originalShot.index).toBe(originalIndex);
    expect(originalShot.previewImageUrl).toBe('https://mock/line-1.png');

    const copy = next.episodes[0].shots[1];
    expect(copy.id).toMatch(/^s1-copy-/);
    expect(copy.sceneCode).toBe('');
    expect(copy.previewImageUrl).toBeNull();
    expect(copy.referenceImageUrl).toBeNull();
    expect((copy as ScriptBreakdownShot & { sketchUrl?: string | null }).sketchUrl).toBeNull();
    expect(copy.status).toBe('draft');
    expect(next.episodes[0].shots.map((s) => s.index)).toEqual([1, 2, 3]);
  });
});

describe('copyShotsInBreakdown（SB-D-02/05）', () => {
  it('批量复制按原序插入缺图副本，重排 index 且不污染原对象', () => {
    const payload = makePayload();
    const beforeIndex = payload.episodes[0].shots[1].index;

    const next = copyShotsInBreakdown(payload, 'ep-1', ['s2']);

    expect(next).not.toBe(payload);
    expect(payload.episodes[0].shots[1].index).toBe(beforeIndex);
    const copied = next.episodes[0].shots.filter((s) => s.id.startsWith('s2-copy-'));
    expect(copied).toHaveLength(1);
    expect(copied[0].previewImageUrl).toBeNull();
    expect(copied[0].status).toBe('draft');
    expect(next.episodes[0].shots.map((s) => s.index)).toEqual([1, 2, 3]);
  });
});

describe('removeShotsFromBreakdown（SB-D-05）', () => {
  it('批删返回新 payload，原 payload 镜头对象与 index 不变', () => {
    const payload = makePayload();
    const originalFirst = payload.episodes[0].shots[0];
    const originalIndex = originalFirst.index;

    const next = removeShotsFromBreakdown(payload, 'ep-1', ['s1']);

    expect(next).not.toBe(payload);
    expect(payload.episodes[0].shots).toHaveLength(2);
    expect(payload.episodes[0].shots[0]).toBe(originalFirst);
    expect(originalFirst.index).toBe(originalIndex);
    expect(next.episodes[0].shots.map((s) => s.id)).toEqual(['s2']);
    expect(next.episodes[0].shots[0].index).toBe(1);
  });
});
