/**
 * 画布工具诚实门禁：chat-model 空回复 / clip-sink 无视频不得假成功。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ops = resolve(__dirname, '../flow-runner-ops');

describe('flow-runner 工具诚实门禁', () => {
  it('chat-model 空回复标 error，禁止空成功', () => {
    const src = readFileSync(resolve(ops, 'media-ops.ts'), 'utf8');
    const branch = src.slice(src.indexOf("if (kind === 'chat-model')"), src.indexOf("if (kind === 'sound-gen')"));
    expect(branch).toContain("status: 'error'");
    expect(branch).toContain('禁止空成功');
    expect(branch).toMatch(/!reply\.trim\(\)/);
  });

  it('clip-sink 无上游视频 throw，禁止空成功', () => {
    const src = readFileSync(resolve(ops, 'tool-ops.ts'), 'utf8');
    const branch = src.slice(src.indexOf("if (kind === 'clip-sink')"), src.indexOf("if (kind === 'style-atelier')"));
    expect(branch).toContain('禁止空成功');
    expect(branch).toContain('if (!videoUrl)');
  });

  it('style-atelier / reverse-prompt / style-lab / grid-prompt-reverse 校验 ok，禁止空成功', () => {
    const src = readFileSync(resolve(ops, 'tool-ops.ts'), 'utf8');
    expect(src).toContain("!styleRes.ok");
    expect(src).toContain("!res.ok || !res.prompt");
    expect(src).toContain('风格实验室文本为空，禁止空成功');
    expect(src).toContain('宫格反推无可用提示词');
  });

  it('picture-diff / enhanceMode=diff 禁止空成功假绿', () => {
    const src = readFileSync(resolve(ops, 'tool-ops.ts'), 'utf8');
    const diffBranch = src.slice(src.indexOf("if (kind === 'picture-diff')"), src.indexOf("if (kind === 'director-3d')"));
    expect(diffBranch).toContain('throw new Error');
    expect(diffBranch).toContain('禁止假绿');
    expect(diffBranch).not.toContain("status: 'success'");
    expect(src).toContain("mode === 'diff'");
    expect(src).toContain('像素差分实现');
  });

  it('reference-analyze / tag-atelier / 空文本 passthrough 禁止空成功', () => {
    const src = readFileSync(resolve(ops, 'tool-ops.ts'), 'utf8');
    expect(src).toContain('参考反推未解析出分镜表，禁止空成功');
    expect(src).toContain('标签工坊文本为空，禁止空成功');
    expect(src).toContain('提示词节点文本为空，禁止空成功');
    expect(src).toContain('角度可视化文本为空，禁止空成功');
    expect(src).toContain('分镜脚本文本为空，禁止空成功');
    expect(src).toContain('参考板文本为空，禁止空成功');
    expect(src).toContain('Comfy 工作流：未填写 Workflow JSON，禁止空成功');
    expect(src).toContain('无上游图片，禁止空成功');
    expect(src).toContain('需要上游视频，禁止空成功');
    expect(src).toContain('需要上游图像，禁止空成功');
    expect(src).toContain('批量缩放失败，禁止空成功');
    expect(src).toContain('批量宫格拆分失败，禁止空成功');
    expect(src).toContain('批量处理无有效产物，禁止空成功');
  });

  it('legacy-honesty-ops 混音/调色/提示词合并空前置禁止空成功', () => {
    const src = readFileSync(resolve(ops, 'legacy-honesty-ops.ts'), 'utf8');
    expect(src).toContain('至少需要 2 条音频，禁止空成功');
    expect(src).toContain('需要上游图像或视频，禁止空成功');
    expect(src).toContain('至少需要 2 路 prompt，禁止空成功');
    expect(src).toContain('混音失败，禁止空成功');
    expect(src).toContain('调色失败，禁止空成功');
    expect(src).toContain('导出未通过，禁止空成功');
  });

  it('media-ops 图处理 / ASR / 宫格 校验 ok，禁止空成功', () => {
    const src = readFileSync(resolve(ops, 'media-ops.ts'), 'utf8');
    expect(src).toContain('宫格拆分失败，禁止空成功');
    expect(src).toContain('宫格合成失败，禁止空成功');
    expect(src).toContain('缩放适配失败，禁止空成功');
    expect(src).toContain('图片合并失败，禁止空成功');
    expect(src).toContain('封面合成失败，禁止空成功');
    expect(src).toContain('语音转字幕失败或结果为空，禁止空成功');
    expect(src).toContain('放大失败，禁止空成功');
    expect(src).toContain('元数据清理失败，禁止空成功');
    expect(src).toContain('文本切分源为空，禁止空成功');
    expect(src).toContain('资产导入列表为空，禁止空成功');
    expect(src).toContain('混音失败，禁止空成功');
    expect(src).toContain('调色失败，禁止空成功');
    expect(src).toContain('抽帧失败，禁止空成功');
    expect(src).toContain('字幕烧录失败，禁止空成功');
    expect(src).toContain('照片说话失败，禁止空成功');
    expect(src).toContain('缺少 picture 输入，禁止空成功');
    expect(src).toContain('缺少视频输入，禁止空成功');
    expect(src).toContain('编排未生成时间线，禁止空成功');
    expect(src).toContain('缺少图片，禁止空成功');
  });

  it('tool-ops Topaz / ControlNet / Fal 校验 ok，禁止空成功', () => {
    const src = readFileSync(resolve(ops, 'tool-ops.ts'), 'utf8');
    expect(src).toContain('Topaz 放大失败，禁止空成功');
    expect(src).toContain('Topaz 视频处理失败，禁止空成功');
    expect(src).toContain('深度预处理失败，禁止空成功');
    expect(src).toContain('Canny 预处理失败，禁止空成功');
    expect(src).toContain('Fal 未返回图片，禁止空成功');
    expect(src).toContain('本地增强（图片）失败，禁止空成功');
    expect(src).toContain('本地增强（视频）失败，禁止空成功');
    expect(src).toContain('未知 ControlNet 模式');
    expect(src).toMatch(/未知 ControlNet 模式:[\s\S]*禁止空成功/);
    expect(src).toContain('链接解析失败或结果为空，禁止空成功');
    expect(src).toContain('字幕烧录失败，禁止空成功');
    expect(src).toContain('深度通道失败，禁止空成功');
    expect(src).toContain('缺少参考图，禁止空成功');
    expect(src).toContain('缺少视频，禁止空成功');
    expect(src).toContain('缺少图片，禁止空成功');
    expect(src).toContain('缺少宫格/分镜图，禁止空成功');
    expect(src).toContain('ControlNet 缺少上游图片，禁止空成功');
    expect(src).toContain('参考反推缺少上游视频，禁止空成功');
  });

  it('director-3d / blocking-stage 无产物禁止空成功', () => {
    const src = readFileSync(resolve(ops, 'tool-ops.ts'), 'utf8');
    expect(src).toContain('3D 导演台无可输出的机位提示或截图，禁止空成功');
    expect(src).toContain('场面调度无可输出的机位序列，禁止空成功');
  });
});
