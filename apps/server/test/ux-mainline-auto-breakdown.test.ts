import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webSrc = resolve(__dirname, '../../web/src');

describe('UX 一条主干：确认成稿 → 送到分镜 → 自动拆镜', () => {
  it('确认成稿在 autoAdvance 下直送；空台预检通过后自动拆镜', () => {
    const actions = readFileSync(
      resolve(webSrc, 'blocks/nx9/script-desk/use-script-desk-actions.ts'),
      'utf8',
    );
    expect(actions).toContain('autoAdvanceEnabled');
    expect(actions).toContain('doHandoffToStoryboard()');
    expect(actions).toContain('handoffRunnerRef');
    expect(actions).toContain('queueMicrotask(() => handoffRunnerRef.current())');
    expect(actions).toContain('autoAdvance && readiness.ready');
    expect(actions).toContain('设定就绪后自动送分镜');
    expect(actions).toContain('autoHandoffReadyKeyRef');
    expect(actions).toContain('空台将自动拆镜');

    const desk = readFileSync(
      resolve(webSrc, 'blocks/craft/storyboard-desk/use-storyboard-desk.tsx'),
      'utf8',
    );
    expect(desk).toContain('交接后自动拆镜');
    expect(desk).toContain('skipOverwriteConfirm: true');
    expect(desk).toContain('autoBreakdownTokenRef');

    const ops = readFileSync(
      resolve(webSrc, 'blocks/craft/storyboard-desk/breakdown-queue-ops.ts'),
      'utf8',
    );
    expect(ops).toContain('skipOverwriteConfirm');
  });
});
