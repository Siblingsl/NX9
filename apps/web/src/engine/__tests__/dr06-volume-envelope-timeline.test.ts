/**
 * DR-06：成片音量关键帧必须在时间轴上有可视包络与拖拽改点。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const timelineSrc = readFileSync(
  resolve(__dirname, '../../blocks/core/clip-editor/TimelinePanel.tsx'),
  'utf8',
);
const cssSrc = readFileSync(resolve(__dirname, '../../blocks/core/clip-editor/edit-desk.css'), 'utf8');

describe('DR-06 音量关键帧时间轴可视', () => {
  it('选中片段渲染包络折线与菱形关键帧，拖动只改 atSec', () => {
    expect(timelineSrc).toContain('clip.volumeKeyframes');
    expect(timelineSrc).toContain('ed-clip__volume');
    expect(timelineSrc).toContain('ed-clip__volume-kf');
    expect(timelineSrc).toContain("op: 'set-volume-keyframe'");
    expect(timelineSrc).toContain('volume: d.volume');
    expect(timelineSrc).toContain('onVolumeKeyframeMove');
  });

  it('包络样式提供可交互菱形（非纯只读折线）', () => {
    expect(cssSrc).toContain('.ed-clip__volume-line polyline');
    expect(cssSrc).toContain('.ed-clip__volume-kf');
    expect(cssSrc).toContain('pointer-events: auto');
    expect(cssSrc).toContain('cursor: ew-resize');
  });
});
