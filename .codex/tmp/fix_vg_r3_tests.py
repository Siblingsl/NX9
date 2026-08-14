# -*- coding: utf-8 -*-
"""NX9 VG-R3 测试更新（自动保持 CRLF/LF）。"""
import io


def patch_file(path, pairs):
    s = io.open(path, encoding='utf-8', newline='').read()
    nl = '\r\n' if '\r\n' in s else '\n'

    def norm(x):
        return x.replace('\n', nl)

    for old, new in pairs:
        o = norm(old)
        n = norm(new)
        assert s.count(o) == 1, (path, o[:90], s.count(o))
        s = s.replace(o, n, 1)
    io.open(path, 'w', encoding='utf-8', newline='').write(s)
    print('patched', path)


CLIP_TEST_PAIRS = [
    (
        """describe('findUpstreamReferencePack', () => {""",
        """describe('VG-40/41/42 R3 组装器诚实性', () => {
  it('文生视频模式不带首帧（VG-40）', async () => {
    const req = await buildClipGenVideoRequest({
      data: { model: 'veo', videoGenMode: 'text-to-video' },
      prompt: 'x',
      imageUrl: 'https://media/first.png',
      upstreamPictures: ['https://media/ref.png'],
    });
    expect(req.blocked).toBeUndefined();
    expect(req.body.imageUrl).toBeUndefined();
    expect(req.body.referenceImages).toEqual(['https://media/ref.png']);
  });

  it('首尾帧缺尾帧 → 阻断（VG-41）', async () => {
    const req = await buildClipGenVideoRequest({
      data: { model: 'veo', videoGenMode: 'keyframe' },
      prompt: 'transition',
      imageUrl: 'https://media/start.png',
    });
    expect(req.blocked).toContain('尾图');
  });

  it('图片参考无参考 → 阻断；有上游图则通过（VG-41）', async () => {
    const blocked = await buildClipGenVideoRequest({
      data: { model: 'veo', videoGenMode: 'image-ref' },
      prompt: 'x',
    });
    expect(blocked.blocked).toContain('参考图');

    const ok = await buildClipGenVideoRequest({
      data: { model: 'veo', videoGenMode: 'image-ref' },
      prompt: 'x',
      upstreamPictures: ['https://media/up.png'],
    });
    expect(ok.blocked).toBeUndefined();
  });

  it('全能参考无图无视频 → 阻断（VG-41）', async () => {
    const req = await buildClipGenVideoRequest({
      data: { model: 'veo', videoGenMode: 'omni-ref' },
      prompt: 'x',
    });
    expect(req.blocked).toContain('参考');
  });

  it('非法 Provider 参数 → 阻断，不再静默丢弃（VG-42）', async () => {
    const req = await buildClipGenVideoRequest({
      data: { model: 'veo', modelParams: '{broken' },
      prompt: 'x',
    });
    expect(req.blocked).toContain('Provider 参数');
  });
});

describe('findUpstreamReferencePack', () => {""",
    ),
]

DIRECTOR_TEST_PAIRS = [
    (
        """    expect(first.chain.shots.map((shot) => shot.videoStatus)).toEqual(['review', 'review']);""",
        """    expect(first.chain.shots.map((shot) => shot.videoStatus)).toEqual(['review', 'review']);
    // VG-36: 导演批次成片与批量同口径建 videoVersions
    expect(first.chain.shots.map((shot) => shot.videoVersions?.length)).toEqual([1, 1]);
    expect(first.chain.shots.map((shot) => shot.videoVersions?.[0]?.url)).toEqual(['video-s1', 'video-s2']);
    expect(first.chain.shots.map((shot) => shot.videoVersions?.[0]?.model)).toEqual(['veo', 'veo']);""",
    ),
]

patch_file(
    r'F:\code\project\NX9\apps\web\src\engine\__tests__\clip-gen-request.test.ts',
    CLIP_TEST_PAIRS,
)
patch_file(
    r'F:\code\project\NX9\apps\web\src\engine\__tests__\director-keyframe-batch-runner.test.ts',
    DIRECTOR_TEST_PAIRS,
)
print('all test patches applied')
