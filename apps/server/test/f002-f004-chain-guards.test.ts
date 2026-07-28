/**
 * F-002/F-003 链聚合与制作台绑定纯函数测（跑在 server vitest）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');

describe('F-002/F-003/F-004 source guards', () => {
  it('batchGenerateVideosFromShots no longer falls back to global storyboard.shots', () => {
    const src = readFileSync(
      resolve(root, 'apps/web/src/engine/core-pipeline-runner.ts'),
      'utf8',
    );
    expect(src.includes('禁止回退全局')).toBe(true);
    expect(src.includes('回退全局 storyboard.shots——请确认调用方传了 chainShots')).toBe(false);
  });

  it('ClipGenBlock no longer writes global storyboard on missing desk', () => {
    const src = readFileSync(
      resolve(root, 'apps/web/src/blocks/core/ClipGenBlock.tsx'),
      'utf8',
    );
    expect(src.includes('禁止写全局')).toBe(true);
    expect(src.includes('写回全局 storyboard——无上游 desk')).toBe(false);
  });

  it('getAllChainShots defaults to no global fallback', () => {
    const src = readFileSync(
      resolve(root, 'apps/web/src/engine/chain-storyboard-aggregate.ts'),
      'utf8',
    );
    expect(src.includes('allowGlobalFallback')).toBe(true);
    expect(src.includes('默认不回退全局')).toBe(true);
  });

  it('studio uses flow-graph-mirror instead of useReactFlow', () => {
    const src = readFileSync(
      resolve(root, 'apps/web/src/pages/studio/useStudioDesk.ts'),
      'utf8',
    );
    expect(src.includes('useFlowGraphMirror')).toBe(true);
    expect(src.includes("from '@xyflow/react'")).toBe(false);
  });
});
