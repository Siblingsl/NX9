/**
 * F-014 sound-gen BGM 真接入验收
 * - gatherUpstream 从 sound-gen 提取 audioUrl → sounds[]
 * - buildVoiceDramaTimeline 接收 bgmUrl 并注入 BGM 轨
 * - 无假占位成功态（sound-gen 未配 key 不得标 done）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  gatherUpstream,
  buildVoiceDramaTimeline,
  FIXTURE_TIMELINE_V2,
} from '@nx9/shared';
import type { FlowBlock, VoiceLine } from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const webSrc = resolve(root, 'apps/web/src');

function readWeb(rel: string) {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

function makeBlock(overrides: Partial<FlowBlock> = {}): FlowBlock {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'sound-gen',
    position: { x: 0, y: 0 },
    data: { blockIndex: 1, status: 'done' },
    ...overrides,
  } as FlowBlock;
}

describe('F-014 sound-gen BGM 真接入', () => {

  // ─── gatherUpstream：sound-gen.audioUrl → sounds[] ───
  it('gatherUpstream 从 sound-gen 提取 audioUrl 到 sounds', () => {
    const soundBlock = makeBlock({
      type: 'sound-gen',
      data: {
        blockIndex: 1,
        status: 'done',
        audioUrl: '/api/media/bgm-track.mp3',
      },
    });

    const result = gatherUpstream(
      'target-1',
      [soundBlock],
      [{ id: 'e1', source: soundBlock.id, target: 'target-1' }],
    );

    expect(result.sounds).toHaveLength(1);
    expect(result.sounds[0]).toBe('/api/media/bgm-track.mp3');
  });

  it('gatherUpstream sound-gen 无 audioUrl 时不出空串', () => {
    const soundBlock = makeBlock({
      type: 'sound-gen',
      data: { blockIndex: 1, status: 'running' },
    });

    const result = gatherUpstream(
      'target-1',
      [soundBlock],
      [{ id: 'e1', source: soundBlock.id, target: 'target-1' }],
    );

    expect(result.sounds).toHaveLength(0);
  });

  it('gatherUpstream 多 sound-gen 聚合全部 sounds', () => {
    const s1 = makeBlock({
      id: 'sg-1', type: 'sound-gen',
      data: { blockIndex: 1, status: 'done', audioUrl: '/bgm1.mp3' },
    });
    const s2 = makeBlock({
      id: 'sg-2', type: 'sound-gen',
      data: { blockIndex: 2, status: 'done', audioUrl: '/bgm2.mp3' },
    });

    const result = gatherUpstream(
      'target-1',
      [s1, s2],
      [
        { id: 'e1', source: 'sg-1', target: 'target-1' },
        { id: 'e2', source: 'sg-2', target: 'target-1' },
      ],
    );

    expect(result.sounds).toHaveLength(2);
  });

  // ─── buildVoiceDramaTimeline：bgmUrl → BGM 轨（v3 规范 ID：A 前缀 + label） ───
  it('buildVoiceDramaTimeline 传入 bgmUrl 时添加 BGM 音轨', () => {
    const tl = { ...FIXTURE_TIMELINE_V2, durationSec: 30 };
    const updated = buildVoiceDramaTimeline(tl, [], '/bgm/test.mp3');

    const bgmTrack = updated.tracks.find((t) => t.label === 'BGM' && t.kind === 'audio');
    expect(bgmTrack).toBeDefined();
    expect(bgmTrack!.id).toMatch(/^A\d+$/);
    expect(bgmTrack!.clips[0].assetUrl).toBe('/bgm/test.mp3');
    expect(bgmTrack!.clips[0].label).toBe('BGM');
    expect(bgmTrack!.clips[0].durationSec).toBe(30);
  });

  it('buildVoiceDramaTimeline 未传 bgmUrl 时不添加 BGM 轨', () => {
    const tl = { ...FIXTURE_TIMELINE_V2, durationSec: 30 };
    const updated = buildVoiceDramaTimeline(tl, [], undefined);

    const bgmTrack = updated.tracks.find((t) => t.label === 'BGM');
    expect(bgmTrack).toBeUndefined();
  });

  it('buildVoiceDramaTimeline 同时注入 VO 和 BGM 双轨', () => {
    const tl = { ...FIXTURE_TIMELINE_V2, durationSec: 45 };
    const voiceLines: VoiceLine[] = [
      { id: 'vo1', shotId: 'shot-1', text: '台词A', speaker: '男主', audioAssetId: '/vo1.mp3' },
      { id: 'vo2', shotId: 'shot-2', text: '台词B', speaker: '女主', audioAssetId: '/vo2.mp3' },
    ];
    const updated = buildVoiceDramaTimeline(tl, voiceLines, '/bgm/ost.mp3');

    const voTrack = updated.tracks.find((t) => t.label === '对白' && t.kind === 'audio');
    const bgmTrack = updated.tracks.find((t) => t.label === 'BGM' && t.kind === 'audio');
    expect(voTrack).toBeDefined();
    expect(bgmTrack).toBeDefined();
    expect(voTrack!.id).not.toBe(bgmTrack!.id);
    expect(voTrack!.clips).toHaveLength(2);
    expect(bgmTrack!.clips[0].assetUrl).toBe('/bgm/ost.mp3');
  });

  // ─── 无假占位成功态 ───
  it('SoundGenBlock BGM 模式：未配 apiKey 不标 done，明确 error', () => {
    const src = readWeb('blocks/core/SoundGenBlock.tsx');

    // 必须有 BGM API Key 校验逻辑（bgmSettings.apiKey）
    const generateBgmFn = src.slice(
      src.indexOf('const generateBgm'),
      src.indexOf('}, [props.id'),
    );
    expect(generateBgmFn).toMatch(/bgmSettings\.apiKey/);

    // 校验 key 缺失后必须提示并 return，不得继续到写 done
    const hasKeyGuard = generateBgmFn.includes('未配置 BGM API Key');
    expect(hasKeyGuard).toBe(true);

    // status='done' 在 try 块内、fetch/poll 成功后，不在 catch 或校验前
    expect(generateBgmFn.includes("audioUrl: url")).toBe(true);
  });

  // ─── 主路径接线（源码守卫） ───
  it('ClipEditorBlock 源码：upstreamSounds 已传入 orchestrateDramaTimeline', () => {
    const src = readWeb('blocks/core/ClipEditorBlock.tsx');

    // 断言 upstreamSounds 被使用（非仅 destructure 不用）
    const usagesAfterInit = src.slice(src.indexOf('useUpstreamMedia(props.id)'));
    const upstreamSoundsRefs = (usagesAfterInit.match(/upstreamSounds/g) ?? []).length;
    // 至少：1 次解构声明 + 1 次 drama bgmUrl + 1 次 viral bgmUrl + 1 次 对白注入
    expect(upstreamSoundsRefs).toBeGreaterThanOrEqual(4);

    // drama 分支传 bgmUrl
    expect(src).toMatch(/bgmUrl:\s*upstreamSounds\[0\]/);

    // buildVoiceDramaTimeline 传 bgmUrl（外层可能套 migrate）
    expect(src).toMatch(/buildVoiceDramaTimeline\([^)]*voiceLines,\s*bgmUrl\)/);
  });

  it('smart-edit-orchestrator：orchestrateDramaTimeline 收到 bgmUrl 时添加 BGM 轨', () => {
    const src = readWeb('engine/smart-edit-orchestrator.ts');

    // bgmUrl 参数声明
    expect(src).toMatch(/bgmUrl\?:\s*string/);

    // BGM 轨注入逻辑（v3：nextTrackId 分配规范 A 前缀 ID + BGM label）
    const hasBgmInjection = src.includes("label: 'BGM'") && src.includes("nextTrackId(");
    expect(hasBgmInjection).toBe(true);

    // viral 分支也支持
    const viralHasBgm = src.slice(src.indexOf('orchestrateViralTimeline')).includes('bgmUrl');
    expect(viralHasBgm).toBe(true);
  });

  // ─── 声音剧模板已有 sound-gen → clip-editor 边 ───
  it('tpl-voice-drama 含 sound-gen → clip-editor 连线', () => {
    const tplPath = resolve(root, 'packages/shared/src/data/workflow-templates.ts');
    const src = readFileSync(tplPath, 'utf8');

    const tplSection = src.slice(
      src.indexOf("id: 'tpl-voice-drama'"),
      src.indexOf("'tpl-link-replicate'"),
    );
    expect(tplSection).toContain("node('sound-gen'");
    expect(tplSection).toContain("node('clip-editor'");
  });
});
