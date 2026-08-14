/**
 * DR-07：BGM 真生成未接入，UI 必须诚实标「仅导入」，禁止引导配置后假装可生成。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const webSrc = resolve(__dirname, '..');
const blockSrc = readFileSync(resolve(webSrc, '../blocks/core/SoundGenBlock.tsx'), 'utf8');
const settingsSrc = readFileSync(resolve(webSrc, '../panels/SettingsModal.tsx'), 'utf8');
const runnerSrc = readFileSync(resolve(webSrc, 'flow-runner-ops/media-ops.ts'), 'utf8');
const validationDoc = readFileSync(
  resolve(__dirname, '../../../../../docs/REAL-PROVIDER-VALIDATION.md'),
  'utf8',
);

describe('DR-07 BGM 诚实边界（仅导入）', () => {
  it('音乐模式不提供生成按钮，明示仅导入音频', () => {
    expect(blockSrc).toContain('BGM 仅支持导入音频');
    expect(blockSrc).toContain('禁止假成功');
    expect(blockSrc).not.toContain('生成 BGM');
    expect(blockSrc).not.toContain('BGM 服务未配置');
    expect(blockSrc).not.toContain('bgmApiKey');
  });

  it('设置面板 BGM 标为预留，不宣传已可生成', () => {
    expect(settingsSrc).toContain('真实 BGM 生成 API 未接入');
    expect(settingsSrc).toContain('仅支持导入音频');
  });

  it('画布 run 的 music 分支仍走真实网关（未接 provider 时明确失败）', () => {
    const branch = runnerSrc.slice(
      runnerSrc.indexOf("if (kind === 'sound-gen')"),
      runnerSrc.indexOf("if (kind === 'grid-split')"),
    );
    expect(branch).toContain("soundMode === 'music'");
    expect(branch).toContain('runSoundGenBgm');
  });

  it('真实供应商验收文档已记 BGM 未放行', () => {
    expect(validationDoc).toContain('BGM');
    expect(validationDoc).toContain('BGM_NOT_IMPLEMENTED');
  });
});
