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
});
