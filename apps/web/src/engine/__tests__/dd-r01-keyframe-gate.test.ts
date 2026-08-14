import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const flowRunner = readFileSync(resolve(__dirname, '../flow-runner-ops/clip-gen-ops.ts'), 'utf8');

describe('DD-R-01 clip-gen 关键帧门禁链隔离', () => {
  it('无批次门禁读连接链，不读全局 storyboard', () => {
    const start = flowRunner.indexOf("if (kind === 'clip-gen')");
    const end = flowRunner.indexOf("if (kind === 'chat-model')");
    const gate = flowRunner.slice(start, flowRunner.indexOf('const charCtx', start));
    const branch = flowRunner.slice(start, end > start ? end : undefined);
    expect(gate).toContain('readUpstreamChainStoryboard');
    expect(gate).toContain('activeChainEpisodeShots');
    expect(gate).toContain('拒绝回退全局镜表');
    expect(gate).not.toContain('useWorkspaceDocument.getState().storyboard');
    expect(branch).not.toMatch(/activeEpisodeShots\(/);
  });

  it('审片会话在无链时也不再回落全局 storyboard', () => {
    const reviewGate = readFileSync(
      resolve(__dirname, '../stage-deck/utils/review-gate-session.ts'),
      'utf8',
    );
    expect(reviewGate).not.toContain('allowGlobalFallback: true');
    expect(reviewGate).toContain('不回退全局 storyboard');
  });
});
