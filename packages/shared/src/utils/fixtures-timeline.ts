import type { TimelinePayload } from '../types/timeline';

export const FIXTURE_TIMELINE_V2: TimelinePayload = {
  version: 2,
  title: 'TEST_EP01',
  fps: 30,
  durationSec: 12,
  aspect: '9:16',
  width: 1080,
  height: 1920,
  tracks: [
    {
      id: 'video-1',
      kind: 'video',
      clips: [
        {
          id: 'v1',
          label: '#1',
          startSec: 0,
          durationSec: 4,
          assetUrl: '/media/videos/fixture-a.mp4',
          type: 'video',
        },
        {
          id: 'v2',
          label: '#2',
          startSec: 4,
          durationSec: 4,
          assetUrl: '/media/videos/fixture-b.mp4',
          type: 'video',
          transitionOut: { kind: 'fade', durationSec: 0.3 },
        },
      ],
    },
    {
      id: 'subtitle-1',
      kind: 'video',
      clips: [
        {
          id: 's1',
          label: '字幕',
          startSec: 0,
          durationSec: 8,
          assetUrl: '',
          type: 'subtitle',
          text: '你好，NX9',
        },
      ],
    },
  ],
};

/** 3 个 shots 映射到 FIXTURE_TIMELINE_V2：
 *  shot-1 → v1 (4s, fixture-a.mp4)
 *  shot-2 → v2 (4s, fixture-b.mp4, fade 转场)
 *  shot-3 → 静帧 + descriptionZh 生成字幕 "咖啡拉花，俯拍" (4s)
 *  总时长 12s，字幕轨含 "你好，NX9" 对应前两镜
 */
export const FIXTURE_SHOTS_FOR_TIMELINE = [
  {
    id: 'shot-fixture-1',
    index: 1,
    durationSec: 4,
    descriptionZh: '咖啡店晨光，女主角进门',
    videoAssetId: '/media/videos/fixture-a.mp4',
    audioAssetId: null,
    firstFrameAssetId: null,
    status: 'approved' as const,
  },
  {
    id: 'shot-fixture-2',
    index: 2,
    durationSec: 4,
    descriptionZh: '女主角点单，特写',
    videoAssetId: '/media/videos/fixture-b.mp4',
    audioAssetId: null,
    firstFrameAssetId: null,
    status: 'approved' as const,
    transitionOut: { kind: 'fade' as const, durationSec: 0.3 },
  },
  {
    id: 'shot-fixture-3',
    index: 3,
    durationSec: 4,
    descriptionZh: '咖啡拉花，俯拍',
    videoAssetId: null,
    audioAssetId: null,
    firstFrameAssetId: '/media/images/fixture-still.jpg',
    status: 'review' as const,
  },
];
