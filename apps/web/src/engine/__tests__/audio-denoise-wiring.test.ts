import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** 源码级接线守卫：音频降噪 UI 已接入 SoundGenBlock，且调用的是 api.audioDenoise */
describe('音频降噪 UI 接线守卫', () => {
  const p = path.resolve(__dirname, '../../blocks/core/SoundGenBlock.tsx');
  const c = readFileSync(p, 'utf8');

  it('SoundGenBlock 存在音频降噪入口', () => {
    expect(c).toContain('音频降噪');
    expect(c).toContain('handleDenoise');
  });

  it('调用的是 api.audioDenoise（不造第二套真源）', () => {
    expect(c).toContain('api.audioDenoise');
    expect(c).not.toMatch(/fetch\(.*audio-denoise/);
  });

  it('成功后写回既有字段 audioUrl（不新增持久化字段名）', () => {
    expect(c).toMatch(/updateNodeData\(props\.id,\s*\{\s*audioUrl:\s*res\.url/);
  });

  it('失败与空态都有中文提示（禁止空成功）', () => {
    expect(c).toContain('禁止空成功');
    expect(c).toContain('还没有可降噪的音频');
  });

  it('处理中有 busy 态（禁止重复点击）', () => {
    expect(c).toContain('denoiseBusy');
    expect(c).toContain('disabled={denoiseBusy || !audioUrl}');
  });

  it('强度与模式控件受控', () => {
    expect(c).toContain('setDenoiseMode');
    expect(c).toContain('setDenoiseStrength');
  });


describe('剪辑台音频降噪接线守卫', () => {
  const p = path.resolve(__dirname, '../../blocks/core/clip-editor/InspectorPanel.tsx');
  const c = readFileSync(p, 'utf8');

  it('剪辑台存在音频降噪入口（对齐变速位）', () => {
    expect(c).toContain('音频降噪');
    expect(c).toContain('handleDenoise');
    expect(c).toContain('api.audioDenoise');
  });

  it('成功后走 replace-clip-asset（与保音调渲染同口径，不新增字段）', () => {
    expect(c).toContain("{ op: 'replace-clip-asset', clipId: clip.id, assetUrl: res.url }");
  });

  it('失败与空态都有中文提示（禁止空成功）', () => {
    expect(c).toContain('禁止空成功');
    expect(c).toContain('当前片段没有音频素材');
  });

  it('处理中有 busy 态（禁止重复点击）', () => {
    expect(c).toContain('denoiseBusy || !clip.assetUrl');
  });
});
});