/**
 * 智能剪辑台第 7 份文档回归：建议不空转、预览/导出诚实、@素材附图、
 * FFmpeg 防呆、对比同步、波形与 overlay 入口。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectAssetMentionUrls, type AssetLibraryItem } from '@nx9/shared';

const webSrc = resolve(__dirname, '..');
const desk = resolve(webSrc, '../blocks/core/clip-editor');
const read = (rel: string) => readFileSync(resolve(webSrc, rel), 'utf8');

describe('SE-DEEP-01/11 建议不再空转', () => {
  it('编排器不再产出 template-patch 或 patch: {}', () => {
    const src = read('smart-edit-orchestrator.ts');
    expect(src).not.toContain("kind: 'template-patch'");
    expect(src).not.toMatch(/patch:\s*\{\s*\}/);
    expect(src).not.toMatch(/patch:\s*\{/);
  });

  it('建议类型 patch 可选，UI 对旧 template-patch 明确说明无需采纳', () => {
    const shared = readFileSync(
      resolve(webSrc, '../../../../packages/shared/src/types/smart-edit.ts'),
      'utf8',
    );
    expect(shared).toContain('patch?: Record<string, unknown>');
    const edit = readFileSync(resolve(desk, 'EditDesk.tsx'), 'utf8');
    expect(edit).toContain('无需采纳');
    expect(edit).toContain('result.notes');
  });
});

describe('SE-DEEP-02/09 预览与导出引擎诚实', () => {
  it('HF/FFmpeg 下台内预览明确标注为 Remotion 合成', () => {
    const src = readFileSync(resolve(desk, 'PreviewPlayer.tsx'), 'utf8');
    expect(src).toContain('engine');
    expect(src).toContain('hyperframes');
    expect(src).toContain('ffmpeg');
    expect(src).toContain('预览为 Remotion 合成');
  });

  it('FFmpeg 禁止确认送交与同步交付打包', () => {
    const src = readFileSync(resolve(desk, 'EditDesk.tsx'), 'utf8');
    expect(src).toMatch(/disabled=\{!hasContent \|\| pendingItems\.length > 0 \|\| engine === 'ffmpeg'\}/);
    expect(src).toMatch(/disabled=\{!hasContent \|\| engine === 'ffmpeg'\}/);
    expect(src).toContain('FFmpeg 仅诊断拼接');
  });
});

describe('SE-DEEP-03 wipe/shader 转场不再静默', () => {
  it('检查器旁注仅 fade 生效', () => {
    const src = readFileSync(resolve(desk, 'InspectorPanel.tsx'), 'utf8');
    expect(src).toContain('wipe / shader 暂未接入渲染层');
  });
});

describe('SE-DEEP-04 @素材引用附图', () => {
  it('collectAssetMentionUrls 收集条目主图并去重', () => {
    const privateItems: AssetLibraryItem[] = [
      {
        id: 'p1',
        kind: 'scene',
        scope: 'private',
        label: '天台',
        prompt: '黄昏天台',
        imageUrl: '/private-rooftop.png',
      },
      {
        id: 'p2',
        kind: 'character',
        scope: 'private',
        label: '银发',
        prompt: '银发风衣',
      },
    ];
    const publicItems: AssetLibraryItem[] = [
      {
        id: 'b1',
        kind: 'character',
        scope: 'public',
        label: '银发',
        prompt: '公共银发',
        imageUrl: '/public-silver.png',
      },
    ];
    expect(collectAssetMentionUrls('@场景:天台 @角色:银发', privateItems, publicItems)).toEqual([
      '/private-rooftop.png',
    ]);
    expect(
      collectAssetMentionUrls('@场景:天台 @场景:天台', privateItems, publicItems),
    ).toEqual(['/private-rooftop.png']);
    expect(collectAssetMentionUrls('无引用', privateItems, publicItems)).toEqual([]);
  });

  it('Gemini 编辑请求携带 frame + 引用图列表', () => {
    const src = readFileSync(resolve(desk, 'SmartReplacePanel.tsx'), 'utf8');
    expect(src).toContain('referenceImageUrls: [frameUrl, ...mentionRefUrls]');
    expect(src).toContain('collectAssetMentionUrls');
  });
});

describe('SE-DEEP-05 采纳可写回正式版', () => {
  it('ClipEditorBlock 使用 adoptStoryboardVideoVersion，面板提供二选一', () => {
    const clip = read('../blocks/core/ClipEditorBlock.tsx');
    expect(clip).toContain('adoptStoryboardVideoVersion');
    const panel = readFileSync(resolve(desk, 'SmartReplacePanel.tsx'), 'utf8');
    expect(panel).toContain('时间线+采用正式版');
  });
});

describe('SE-DEEP-06 智能替换可取消', () => {
  it('面板中止轮询并调用服务端取消，服务端提供 DELETE', () => {
    const panel = readFileSync(resolve(desk, 'SmartReplacePanel.tsx'), 'utf8');
    expect(panel).toContain('AbortController');
    expect(panel).toContain('videoEditCancel');
    expect(panel).toContain('停止当前任务');
    const controller = readFileSync(
      resolve(webSrc, '../../../../apps/server/src/modules/montage/montage.controller.ts'),
      'utf8',
    );
    expect(controller).toContain('video-edit-tasks/:taskId');
    expect(controller).toContain("@Delete('video-edit-tasks/:taskId')");
  });
});

describe('SE-DEEP-13 对比播放头同步', () => {
  it('compare 双视频共享播放头', () => {
    const src = readFileSync(resolve(desk, 'SmartReplacePanel.tsx'), 'utf8');
    expect(src).toContain('syncCompare');
    expect(src).toContain('origVideoRef');
    expect(src).toContain('newVideoRef');
    expect(src).toContain("addEventListener('timeupdate'");
  });
});

describe('SE-SPEC-03 音频波形', () => {
  it('时间轴提供 WebAudio 波形条', () => {
    const src = readFileSync(resolve(desk, 'TimelinePanel.tsx'), 'utf8');
    expect(src).toContain('useAudioPeaks');
    expect(src).toContain('ed-clip__wave');
    const css = readFileSync(resolve(desk, 'edit-desk.css'), 'utf8');
    expect(css).toContain('.ed-clip__wave');
  });
});

describe('SE-SPEC-04 overlay 位姿', () => {
  it('类型、检查器、时间轴与 Remotion 合成同源', () => {
    const timeline = readFileSync(
      resolve(webSrc, '../../../../packages/shared/src/types/timeline.ts'),
      'utf8',
    );
    expect(timeline).toContain('overlay?: { x: number; y: number; scale: number; rotation?: number }');
    const inspector = readFileSync(resolve(desk, 'InspectorPanel.tsx'), 'utf8');
    expect(inspector).toContain('贴片位姿');
    const timelinePanel = readFileSync(resolve(desk, 'TimelinePanel.tsx'), 'utf8');
    expect(timelinePanel).toContain('+ 贴片轨');
    const videoClip = readFileSync(
      resolve(webSrc, '../../../../packages/remotion-compositions/src/clips/VideoClip.tsx'),
      'utf8',
    );
    expect(videoClip).toContain('clip.overlay');
  });
});

describe('SE-SPEC-02/05 诚实终态', () => {
  it('无跨帧追踪供应商时直接替换路径禁用且明示', () => {
    const registry = readFileSync(
      resolve(webSrc, '../../../../packages/shared/src/data/provider-registry.ts'),
      'utf8',
    );
    expect(registry).toContain('supportsFrameTracking: boolean');
    expect(registry).toContain('supportsFrameTracking: false');
    const src = readFileSync(resolve(desk, 'SmartReplacePanel.tsx'), 'utf8');
    expect(src).toContain('hasVideoEditFrameTracking');
    expect(src).toContain(
      "disabled={busy || (replaceMode === 'direct' && !hasVideoEditFrameTracking)}",
    );
    expect(src).toContain('未接入跨帧自动追踪');
    expect(src).toContain('视频级直接替换当前不可用');
  });

  it('单供应商注册表、UI 与服务端拒绝一致', () => {
    const registry = readFileSync(
      resolve(webSrc, '../../../../packages/shared/src/data/provider-registry.ts'),
      'utf8',
    );
    expect(registry).toContain('VIDEO_EDIT_PROVIDERS');
    expect(registry).toContain("id: 'wan-vace'");
    const panel = readFileSync(resolve(desk, 'SmartReplacePanel.tsx'), 'utf8');
    expect(panel).toContain('videoEditProviders.length < 2');
    expect(panel).toContain('不会自动切换供应商');
    const service = readFileSync(
      resolve(webSrc, '../../../../apps/server/src/modules/montage/video-edit.service.ts'),
      'utf8',
    );
    expect(service).toContain('未知视频编辑供应商');
    expect(service).toContain('VIDEO_EDIT_PROVIDERS.some');
  });
});

describe('SE-DEEP-12 beat-cut 能力诚实元数据', () => {
  it('beat-cut 建议带算法元数据且 notes 明示未做音频听感', () => {
    const src = readFileSync(resolve(webSrc, 'smart-edit-orchestrator.ts'), 'utf8');
    expect(src).toContain("algorithm: 'reference-shot-durations'");
    expect(src).toContain('audioAnalyzed: false');
    expect(src).toContain('未做音频听感');
    const shared = readFileSync(
      resolve(webSrc, '../../../../packages/shared/src/types/smart-edit.ts'),
      'utf8',
    );
    expect(shared).toContain('audioAnalyzed?: boolean');
  });
});
