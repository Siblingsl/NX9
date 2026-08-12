/**
 * VG-20～26 接线锁定（R2 P2）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { orientationFromAspect, resolveVideoGenParams } from '@nx9/shared';
import {
  showVideoSourceStrip,
  videoFrameStripSlots,
} from '../stage-deck/chrome/attached-workspace/generation/video/video-gen-modes';

const webSrc = resolve(__dirname, '..');

describe('VG-20/21 模式槽位', () => {
  it('image-ref / omni-ref 只显示 Ref；keyframe 显示首尾', () => {
    expect(videoFrameStripSlots('image-ref')).toEqual(['ref']);
    expect(videoFrameStripSlots('omni-ref')).toEqual(['ref']);
    expect(videoFrameStripSlots('keyframe')).toEqual(['start', 'end']);
    expect(videoFrameStripSlots('text-to-video')).toEqual([]);
  });

  it('Bridge 显示源视频条', () => {
    expect(showVideoSourceStrip('bridge')).toBe(true);
    expect(showVideoSourceStrip('keyframe')).toBe(false);
  });
});

describe('VG-24 aspect → orientation/size', () => {
  it('9:16 反推竖屏 size', () => {
    expect(orientationFromAspect('9:16')).toBe('portrait');
    const p = resolveVideoGenParams({ aspect: '9:16', resolution: '720' });
    expect(p.size).toBe('720x1280');
    expect(p.aspect).toBe('9:16');
  });

  it('1:1 反推方屏', () => {
    expect(orientationFromAspect('1:1')).toBe('square');
    expect(resolveVideoGenParams({ aspect: '1:1', resolution: '720' }).size).toBe('1024x1024');
  });
});

describe('VG-22/23/25 执行路径接线', () => {
  it('停止与超时走 awaitProxyVideo，级联捕获 VideoPollTimeoutError', () => {
    const poll = readFileSync(resolve(webSrc, 'poll-task.ts'), 'utf8');
    expect(poll).toContain('export async function awaitProxyVideo');
    expect(poll).toContain('VideoPollTimeoutError');

    const flow = readFileSync(resolve(webSrc, 'flow-runner.ts'), 'utf8');
    expect(flow).toContain('awaitProxyVideo');
    expect(flow).toContain('VideoPollTimeoutError');
    expect(flow).toContain('pendingVideoTasks');
    expect(flow).not.toContain('pollVideoUntilDone');

    const core = readFileSync(resolve(webSrc, 'core-pipeline-runner.ts'), 'utf8');
    expect(core).toContain('awaitProxyVideo');
    expect(core).not.toMatch(/Math\.min\(\s*8\s*,\s*Math\.max\(\s*4/);

    const ws = readFileSync(
      resolve(webSrc, 'stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx'),
      'utf8',
    );
    expect(ws).toContain('onStop={handleStop}');
    expect(ws).toContain('Bridge 续拍需要源视频');
    expect(ws).toContain('VideoSourceStrip');
  });
});
