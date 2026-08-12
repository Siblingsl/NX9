/**
 * VG-01/02/03: clip-gen 出片请求组装器
 */
import { describe, expect, it } from 'vitest';
import {
  buildClipGenVideoRequest,
  collectClipGenUpstream,
  findUpstreamReferencePack,
  resolveClipGenPromptMentions,
} from '../clip-gen-request';

const DEPTH_SLOTS = [
  {
    id: 'slot-depth',
    role: 'depth_motion',
    label: '深度视频',
    mediaType: 'video',
    required: true,
    lock: true,
    assetUrl: 'https://media/depth.mp4',
    convertStatus: 'done',
  },
  {
    id: 'slot-char',
    role: 'character',
    label: '人物',
    mediaType: 'image',
    required: true,
    lock: true,
    assetUrl: 'https://media/char.png',
  },
  {
    id: 'slot-scene',
    role: 'scene',
    label: '场景',
    mediaType: 'image',
    required: false,
    lock: true,
    assetUrl: 'https://media/scene.png',
  },
];

describe('buildClipGenVideoRequest', () => {
  it('普通出片：带高级参数 + 上游参考数组', async () => {
    const req = await buildClipGenVideoRequest({
      data: {
        model: 'veo',
        seed: 42,
        negativePrompt: 'blurry, low quality',
        modelParams: 'cfg_scale=7.5',
        generateAudio: true,
      },
      prompt: 'a cat runs',
      imageUrl: 'https://media/first.png',
      upstreamPictures: ['https://media/ref1.png', 'https://media/ref1.png'],
      upstreamClips: ['https://media/refclip.mp4'],
    });
    expect(req.blocked).toBeUndefined();
    expect(req.body.prompt).toBe('a cat runs');
    expect(req.body.imageUrl).toBe('https://media/first.png');
    expect(req.body.seed).toBe(42);
    expect(req.body.negativePrompt).toBe('blurry, low quality');
    expect(req.body.modelParams).toBe('cfg_scale=7.5');
    expect(req.body.generateAudio).toBe(true);
    // 去重后透传
    expect(req.body.referenceImages).toEqual(['https://media/ref1.png']);
    expect(req.body.referenceVideos).toEqual(['https://media/refclip.mp4']);
  });

  it('深度动作复刻玩法：装配提示词 + 深度视频进参考数组（VG-01 主链路）', async () => {
    const req = await buildClipGenVideoRequest({
      data: {
        model: 'veo',
        content: '两人在雨中的巷子里打斗',
        videoPlaybookId: 'depth-action-replica',
        videoPlaybookSlots: DEPTH_SLOTS,
        videoPlaybookEnforce: true,
        videoPlaybookAspect: '9:16',
      },
      prompt: 'fallback prompt',
    });
    expect(req.blocked).toBeUndefined();
    expect(req.playbookId).toBe('depth-action-replica');
    // VG-17: 镜级 prompt 进装配正文，同时保留深度锁文案
    expect(req.prompt).toContain('深度视频');
    expect(req.prompt).toContain('fallback prompt');
    expect(req.body.referenceVideos).toEqual(['https://media/depth.mp4']);
    expect(req.body.referenceImages).toEqual([
      'https://media/char.png',
      'https://media/scene.png',
    ]);
    // 玩法锁画幅
    expect(req.body.aspect_ratio).toBe('9:16');
  });

  it('玩法 + 镜级 prompt 并存：装配含镜级正文，不被节点 content 覆盖（VG-17）', async () => {
    const shotPrompt = '林小雨推开门，雨巷里对峙，镜头缓推';
    const req = await buildClipGenVideoRequest({
      data: {
        model: 'veo',
        content: '工作台补句：霓虹',
        videoPlaybookId: 'depth-action-replica',
        videoPlaybookSlots: DEPTH_SLOTS,
        videoPlaybookEnforce: true,
      },
      prompt: shotPrompt,
    });
    expect(req.blocked).toBeUndefined();
    expect(req.prompt).toContain(shotPrompt);
    expect(req.prompt).not.toContain('工作台补句：霓虹');
    expect(req.prompt).toContain('深度视频');
  });

  it('玩法 enforce 且必填槽缺失 → 阻断', async () => {
    const req = await buildClipGenVideoRequest({
      data: {
        model: 'veo',
        videoPlaybookId: 'depth-action-replica',
        videoPlaybookSlots: DEPTH_SLOTS.map((s) =>
          s.role === 'depth_motion' ? { ...s, assetUrl: undefined } : s,
        ),
        videoPlaybookEnforce: true,
      },
      prompt: 'x',
    });
    expect(req.blocked).toBeTruthy();
  });

  it('首尾帧模式：startFrameUrl → imageUrl，endFrameUrl → lastFrameUrl（VG-02）', async () => {
    const req = await buildClipGenVideoRequest({
      data: {
        model: 'veo',
        videoGenMode: 'keyframe',
        startFrameUrl: 'https://media/start.png',
        endFrameUrl: 'https://media/end.png',
      },
      prompt: 'transition',
    });
    expect(req.blocked).toBeUndefined();
    expect(req.body.imageUrl).toBe('https://media/start.png');
    expect(req.body.lastFrameUrl).toBe('https://media/end.png');
  });

  it('批量首尾帧：keyframeSource=shot 用镜级首帧，不吃节点 startFrameUrl（VG-15）', async () => {
    const req = await buildClipGenVideoRequest({
      data: {
        model: 'veo',
        videoGenMode: 'keyframe',
        startFrameUrl: 'https://media/node-start.png',
        endFrameUrl: 'https://media/node-end.png',
      },
      prompt: 'transition',
      imageUrl: 'https://media/shot-first.png',
      lastFrameUrl: 'https://media/shot-last.png',
      keyframeSource: 'shot',
    });
    expect(req.blocked).toBeUndefined();
    expect(req.body.imageUrl).toBe('https://media/shot-first.png');
    expect(req.body.lastFrameUrl).toBe('https://media/shot-last.png');
  });

  it('批量首尾帧：无镜级尾帧时回退节点 endFrameUrl（VG-15）', async () => {
    const req = await buildClipGenVideoRequest({
      data: {
        model: 'veo',
        videoGenMode: 'keyframe',
        startFrameUrl: 'https://media/node-start.png',
        endFrameUrl: 'https://media/node-end.png',
      },
      prompt: 'transition',
      imageUrl: 'https://media/shot-first.png',
      keyframeSource: 'shot',
    });
    expect(req.body.imageUrl).toBe('https://media/shot-first.png');
    expect(req.body.lastFrameUrl).toBe('https://media/node-end.png');
  });

  it('首尾帧模式缺首图 → 阻断', async () => {
    const req = await buildClipGenVideoRequest({
      data: { model: 'veo', videoGenMode: 'keyframe' },
      prompt: 'transition',
    });
    expect(req.blocked).toContain('首图');
  });

  it('图生视频模式缺首图 → 阻断；有上游首图则通过', async () => {
    const blockedReq = await buildClipGenVideoRequest({
      data: { model: 'veo', videoGenMode: 'image-to-video' },
      prompt: 'x',
    });
    expect(blockedReq.blocked).toContain('首图');

    const okReq = await buildClipGenVideoRequest({
      data: { model: 'veo', videoGenMode: 'image-to-video' },
      prompt: 'x',
      upstreamPictures: ['https://media/up.png'],
    });
    expect(okReq.blocked).toBeUndefined();
    expect(okReq.body.imageUrl).toBe('https://media/up.png');
  });

  it('图片参考模式：referenceFrameUrl 进参考数组（VG-02）', async () => {
    const req = await buildClipGenVideoRequest({
      data: {
        model: 'veo',
        videoGenMode: 'image-ref',
        referenceFrameUrl: 'https://media/ref-frame.png',
      },
      prompt: 'x',
    });
    expect(req.body.referenceImages).toEqual(['https://media/ref-frame.png']);
  });

  it('Seedance 超 S 级参考上限 → 阻断（VG-07）', async () => {
    const req = await buildClipGenVideoRequest({
      data: { model: 'seedance' },
      prompt: 'x',
      upstreamPictures: Array.from({ length: 10 }, (_, i) => `https://media/p${i}.png`),
    });
    expect(req.blocked).toContain('上限');
  });

  it('grok 系模型缺首图 → 阻断', async () => {
    const req = await buildClipGenVideoRequest({
      data: { model: 'grok-imagine-video' },
      prompt: 'x',
    });
    expect(req.blocked).toContain('首图');
  });

  it('Bridge 路径（applyModeDispatch=false）不做模式分发', async () => {
    const req = await buildClipGenVideoRequest({
      data: { model: 'veo', videoGenMode: 'keyframe' },
      prompt: 'continuation',
      imageUrl: 'https://media/end-frame.png',
      applyModeDispatch: false,
    });
    expect(req.blocked).toBeUndefined();
    expect(req.body.imageUrl).toBe('https://media/end-frame.png');
    expect(req.body.lastFrameUrl).toBeUndefined();
  });
});

describe('collectClipGenUpstream', () => {
  it('批量入口能拿到参考板 + 上游图/视频（VG-16）', () => {
    const nodes = [
      {
        id: 'ref-1',
        type: 'reference-board',
        data: {
          playbookId: 'mood-board',
          pictures: ['https://media/board.png'],
          clips: ['https://media/board.mp4'],
          slots: [
            {
              id: 's1',
              role: 'style',
              label: '风格参考',
              mediaType: 'image',
              required: false,
              lock: false,
              assetUrl: 'https://media/style.png',
            },
          ],
          enforce: false,
        },
      },
      {
        id: 'pic-1',
        type: 'picture-gen',
        data: { previewUrl: 'https://media/up-pic.png' },
      },
      { id: 'clip-1', type: 'clip-gen', data: {} },
    ];
    const edges = [
      { source: 'ref-1', target: 'clip-1' },
      { source: 'pic-1', target: 'clip-1' },
    ];
    const collected = collectClipGenUpstream('clip-1', nodes, edges);
    expect(collected.pack?.styleUrls).toEqual(['https://media/style.png']);
    expect(collected.pictures).toEqual(
      expect.arrayContaining(['https://media/board.png', 'https://media/up-pic.png']),
    );
    expect(collected.clips).toContain('https://media/board.mp4');
  });
});

describe('resolveClipGenPromptMentions', () => {
  it('批量补句把 @角色 解析进正文（VG-26）', () => {
    const resolved = resolveClipGenPromptMentions('主角 @林小雨 走进雨巷', {
      characters: [
        {
          id: 'char-1',
          name: '林小雨',
          consistencyPrompt: 'black bob hair, raincoat',
        },
      ],
    });
    expect(resolved).toContain('black bob hair, raincoat');
    expect(resolved).not.toMatch(/@林小雨/);
  });
});

describe('findUpstreamReferencePack', () => {
  it('从上游 reference-board 提取引用包', () => {
    const nodes = [
      {
        id: 'ref-1',
        type: 'reference-board',
        data: {
          playbookId: 'mood-board',
          slots: [
            {
              id: 's1',
              role: 'style',
              label: '风格参考',
              mediaType: 'image',
              required: false,
              lock: false,
              assetUrl: 'https://media/style.png',
            },
          ],
          enforce: false,
        },
      },
      { id: 'clip-1', type: 'clip-gen', data: {} },
    ];
    const pack = findUpstreamReferencePack('clip-1', nodes, [
      { source: 'ref-1', target: 'clip-1' },
    ]);
    expect(pack?.styleUrls).toEqual(['https://media/style.png']);
  });
});
