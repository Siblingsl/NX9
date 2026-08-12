import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webSrc = resolve(__dirname, '..');

describe('VG-02/04/10 端到端接线锁定', () => {
  it('VG-02 组装器把首尾帧写入 lastFrameUrl', () => {
    const src = readFileSync(resolve(webSrc, 'clip-gen-request.ts'), 'utf8');
    expect(src).toContain("mode === 'keyframe'");
    expect(src).toContain('lastFrameUrl');
    expect(src).toContain('endFrameUrl');
  });

  it('VG-04 工作台有声开关进入请求体，网关映射 generate_audio', () => {
    const chips = readFileSync(
      resolve(webSrc, 'stage-deck/chrome/attached-workspace/generation/video/VideoParamChips.tsx'),
      'utf8',
    );
    expect(chips).toContain('generateAudio');
    const assembler = readFileSync(resolve(webSrc, 'clip-gen-request.ts'), 'utf8');
    expect(assembler).toContain('generateAudio:');
    const gateway = readFileSync(
      resolve(__dirname, '../../../../server/src/modules/gateway/video-payload.util.ts'),
      'utf8',
    );
    expect(gateway).toContain('payload.generate_audio');
  });

  it('VG-10 A 路径 pendingVideoTasks 落盘且工作台有继续查询', () => {
    const core = readFileSync(resolve(webSrc, 'core-pipeline-runner.ts'), 'utf8');
    expect(core).toContain('pendingVideoTasks');
    expect(core).toContain('resumePendingVideoTasks');
    const ws = readFileSync(
      resolve(webSrc, 'stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx'),
      'utf8',
    );
    expect(ws).toContain('resumePendingVideoTasks');
    expect(ws).toContain('继续查询');
  });
});
