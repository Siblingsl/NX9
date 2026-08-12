import { describe, expect, it } from 'vitest';
import {
  buildVoiceDramaTimeline,
  resolveCharacterReferenceAudio,
  type TimelinePayload,
} from '@nx9/shared';

describe('OL-19 resolveCharacterReferenceAudio + timeline stamp', () => {
  const sounds = [
    { id: 'snd1', audioUrl: 'https://cdn.example/lib.mp3' },
    { id: 'snd2', audioUrl: '' },
  ];

  it('优先声音库 id，再回退 referenceAudioUrl', () => {
    expect(
      resolveCharacterReferenceAudio(
        { soundAssetId: 'snd1', referenceAudioUrl: 'https://cdn.example/direct.mp3' },
        sounds,
      ),
    ).toEqual({ audioUrl: 'https://cdn.example/lib.mp3', soundAssetId: 'snd1' });

    expect(
      resolveCharacterReferenceAudio(
        { soundAssetId: 'snd-missing', referenceAudioUrl: 'https://cdn.example/direct.mp3' },
        sounds,
      ),
    ).toEqual({ audioUrl: 'https://cdn.example/direct.mp3', soundAssetId: 'snd-missing' });

    expect(resolveCharacterReferenceAudio({ referenceAudioUrl: 'https://cdn.example/only.mp3' }, sounds)).toEqual({
      audioUrl: 'https://cdn.example/only.mp3',
    });
  });

  it('buildVoiceDramaTimeline 写入 clip.soundAssetId', () => {
    const base: TimelinePayload = {
      version: 3,
      title: 't',
      fps: 24,
      durationSec: 10,
      aspect: '9:16',
      width: 1080,
      height: 1920,
      tracks: [],
    };
    const next = buildVoiceDramaTimeline(
      base,
      [
        {
          id: 'l1',
          shotId: 'sh1',
          speaker: '林晓',
          text: '你好',
          audioAssetId: 'https://cdn.example/vo.mp3',
          soundAssetId: 'snd1',
          status: 'ready',
        },
      ],
      'https://cdn.example/bgm.mp3',
    );
    const vo = next.tracks.find((t) => t.label === '对白');
    const bgm = next.tracks.find((t) => t.label === 'BGM');
    expect(vo?.clips[0]?.soundAssetId).toBe('snd1');
    expect(vo?.clips[0]?.shotId).toBe('sh1');
    expect(bgm?.clips[0]?.volume).toBe(0.4);
  });
});
