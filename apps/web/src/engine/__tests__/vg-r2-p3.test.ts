/**
 * VG-19/27/29/30/31/32/33/34 接线锁定（R2 收口）
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CLIP_GEN_MODE_CONFIGS, migrateBlockKind } from '@nx9/shared';

const webSrc = resolve(__dirname, '..');

describe('VG-19/31 旁路下线', () => {
  it('旧 kind 迁移到 clip-gen', () => {
    expect(migrateBlockKind('motion-story')).toBe('clip-gen');
    expect(migrateBlockKind('seedance-chain')).toBe('clip-gen');
  });

  it('flow-runner 无旁路分支，clip-chain-runner 已删', () => {
    const flowFiles = [
      'flow-runner.ts',
      ...readdirSync(resolve(webSrc, 'flow-runner-ops'))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => `flow-runner-ops/${f}`),
    ];
    const flow = flowFiles
      .map((f) => readFileSync(resolve(webSrc, f), 'utf8'))
      .join('\n');
    expect(flow).not.toContain("kind === 'motion-story'");
    expect(flow).not.toContain("kind === 'seedance-chain'");
    expect(flow).not.toContain('runClipChain');
    expect(existsSync(resolve(webSrc, 'clip-chain-runner.ts'))).toBe(false);
  });
});

describe('VG-27/32/33', () => {
  it('episode-queue 常量已删', () => {
    expect(CLIP_GEN_MODE_CONFIGS.some((c) => (c as { mode: string }).mode === 'episode-queue')).toBe(false);
  });

  it('GenConfigPillBar 已删', () => {
    expect(
      existsSync(
        resolve(webSrc, 'stage-deck/chrome/attached-workspace/generation/GenConfigPillBar.tsx'),
      ),
    ).toBe(false);
  });

  it('工作台并发 1–8', () => {
    const ws = readFileSync(
      resolve(webSrc, 'stage-deck/chrome/attached-workspace/generation/video/VideoWorkspace.tsx'),
      'utf8',
    );
    expect(ws).toContain('[1, 2, 3, 4, 5, 6, 7, 8]');
  });
});

describe('VG-29/30/34', () => {
  it('死卡 run 委托 runFlowBatch', () => {
    const card = readFileSync(resolve(webSrc, '../blocks/core/ClipGenBlock.tsx'), 'utf8');
    expect(card).toContain('runFlowBatch');
    expect(card).toContain('VG-29');
    expect(card).not.toMatch(/audioUrl\s*\?\s*\{\s*audioUrl/);
  });

  it('pending 携带 providerBaseUrl + submittedAt，resume 不覆盖更新成片', () => {
    const poll = readFileSync(resolve(webSrc, 'poll-task.ts'), 'utf8');
    expect(poll).toContain('providerBaseUrl');
    const core = readFileSync(resolve(webSrc, 'core-pipeline-runner.ts'), 'utf8');
    expect(core).toContain('providerBaseUrl');
    expect(core).toContain('submittedAt');
    expect(core).toContain('归档为候选');
  });
});
