import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeTimelineDuration, type TimelinePayload } from '@nx9/shared';
import { videoUrlsFromTimeline } from '../clip-editor-render';

const webSrc = resolve(__dirname, '..');

describe('SE-01 clip-editor 渲染共用链', () => {
  it('videoUrlsFromTimeline 只取视频轨有地址的 clip', () => {
    const timeline: TimelinePayload = {
      version: 3,
      title: 't',
      fps: 30,
      durationSec: 0,
      aspect: '9:16',
      width: 1080,
      height: 1920,
      tracks: [
        {
          id: 'V1',
          kind: 'video',
          clips: [
            { id: 'c1', label: 'a', startSec: 0, durationSec: 2, assetUrl: '/a.mp4', type: 'video' },
            { id: 'c2', label: 'b', startSec: 2, durationSec: 2, assetUrl: '', type: 'video' },
          ],
        },
        {
          id: 'A1',
          kind: 'audio',
          clips: [
            { id: 'a1', label: 'vo', startSec: 0, durationSec: 2, assetUrl: '/vo.mp3', type: 'audio' },
          ],
        },
      ],
    };
    timeline.durationSec = computeTimelineDuration(timeline);
    expect(videoUrlsFromTimeline(timeline)).toEqual(['/a.mp4']);
  });

  it('flow-runner 不再假成功 / 不再读全局镜表', () => {
    const src = readFileSync(resolve(webSrc, 'flow-runner-ops/media-ops.ts'), 'utf8');
    const branch = src.slice(src.indexOf("if (kind === 'clip-editor')"), src.indexOf("if (kind === 'asset-bundle')"));
    expect(branch).toContain('renderClipEditorTimeline');
    expect(branch).toContain('resolveUpstreamShotsFromGraph');
    expect(branch).not.toContain('useWorkspaceDocument.getState().storyboard');
    expect(branch).not.toContain('Remotion 渲染请打开工作室');
  });

  it('ClipEditorBlock 复用同一渲染函数', () => {
    const src = readFileSync(resolve(webSrc, '../blocks/core/ClipEditorBlock.tsx'), 'utf8');
    expect(src).toContain('renderClipEditorTimeline');
    expect(src).not.toContain('Remotion 渲染请打开工作室');
  });

  it('SE-RESUME: renderClipEditorTimeline 暴露 onSubmitted 回调', () => {
    const src = readFileSync(resolve(webSrc, 'clip-editor-render.ts'), 'utf8');
    expect(src).toContain('onSubmitted?: (taskId: string, engine:');
    expect(src).toContain('opts?.onSubmitted?.(res.taskId,');
  });

  it('SE-RESUME: ClipEditorBlock 挂载恢复渲染 + 卡死 running 诚实标错', () => {
    const src = readFileSync(resolve(webSrc, '../blocks/core/ClipEditorBlock.tsx'), 'utf8');
    expect(src).toContain('claimedRenderTasks');
    expect(src).toContain('inFlightBlockOps');
    expect(src).toContain('pollMontageTaskUntilDone(renderTaskId, kind)');
    expect(src).toContain('上次操作未完成（页面刷新或服务重启），请重新执行');
    expect(src).toContain('onSubmitted: (taskId, backend)');
  });

  it('HF/Remotion done 无 URL 立即失败，禁止空成功轮询空转', () => {
    const src = readFileSync(resolve(webSrc, 'clip-editor-render.ts'), 'utf8');
    expect(src).toContain('Hyperframes 渲染完成但无输出地址，禁止空成功');
    expect(src).toContain('Remotion 渲染完成但无输出地址，禁止空成功');
    expect(src).toContain('Remotion 渲染失败，禁止空成功');
    expect(src).toContain('渲染超时，禁止空成功');
  });

  it('ClipEditorBlock 编排空上游 / 空时间线禁止空成功', () => {
    const src = readFileSync(resolve(webSrc, '../blocks/core/ClipEditorBlock.tsx'), 'utf8');
    expect(src).toContain('请先连接导演台或带镜头的上游节点，禁止空成功');
    expect(src).toContain('上游未提供可用镜头，禁止空成功');
    expect(src).toContain('请先连接视频上游，或放入额外片段，禁止空成功');
    expect(src).toContain('编排未生成有效时间线，禁止空成功');
    expect(src).toContain('timelineDraft: result.timeline');
    expect(src).toContain('无对白行可注入，禁止空成功');
    expect(src).toContain('请先把本节点连到交付打包，再同步时间线，禁止空成功');
    expect(src).toContain('toastError');
  });
});
