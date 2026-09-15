/**
 * DR-07：BGM 诚实边界——未配置通道时仅导入、不出现生成按钮；
 * 已配置 Suno 兼容通道后才提供 AI 生成，禁止配置缺失时假装可生成。
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

describe('DR-07 BGM 诚实边界（未配置仅导入）', () => {
  it('未配置时明示仅导入；生成按钮由 bgmReady 守卫，不凭空出现', () => {
    expect(blockSrc).toContain('未配置 BGM 通道');
    expect(blockSrc).toContain('仅支持导入音频');
    // 生成入口必须挂在 bgmReady（Base URL + Key 齐备）之后
    expect(blockSrc).toContain('bgmReady');
    expect(blockSrc.indexOf('bgmReady')).toBeLessThan(blockSrc.indexOf('AI 生成'));
  });

  it('设置面板标明已接 Suno 兼容协议，且未配置仍仅导入', () => {
    expect(settingsSrc).toContain('Suno 兼容');
    expect(settingsSrc).toContain('未配置时声音节点仅支持导入音频');
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
