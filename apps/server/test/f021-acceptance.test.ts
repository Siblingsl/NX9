/**
 * F-021 README / 视觉叙事同步验收
 * - README 无「60+ 模块」误导
 * - 视觉描述匹配当前 Desk 双主题
 * - 品牌色匹配 desk-palette（A67C4A，非 0F766E）
 * - 模块计数与 BLOCK_CATALOG 一致
 * - 管线描述与核心模板对齐
 * - 文档无陈旧表述
 * - 关键源文件引用可解析
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BLOCK_CATALOG } from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const readmePath = resolve(root, 'README.md');

function readREADME(): string {
  return readFileSync(readmePath, 'utf8');
}

describe('F-021 README / 视觉叙事同步', () => {

  // ═══════════ 基本存在性 ═══════════
  it('README.md 存在且非空', () => {
    expect(existsSync(readmePath)).toBe(true);
    const content = readREADME();
    expect(content.length).toBeGreaterThan(500);
  });

  // ═══════════ 无「60+ 模块」误导 ═══════════
  it('README 不含 60+ 模块字样', () => {
    const content = readREADME();
    expect(content).not.toMatch(/60\+/);
    expect(content).not.toMatch(/60\s*个模块/);
    expect(content).not.toMatch(/60\s*种模块/);
  });

  // ═══════════ 模块计数与 BLOCK_CATALOG 一致 ═══════════
  it('README 的模块数描述与 BLOCK_CATALOG 匹配', () => {
    const content = readREADME();

    const nativeCount = BLOCK_CATALOG.filter((b) => b.nx9Native).length;
    const totalCount = BLOCK_CATALOG.length;

    expect(content).toContain(`${totalCount} 种`);
    expect(content).toContain(`${nativeCount} 个 NX9`);
  });

  // ═══════════ 品牌色匹配 desk-palette（非旧 0F766E） ═══════════
  it('品牌主色为 #A67C4A 古铜金，非 #0F766E', () => {
    const content = readREADME();

    expect(content).toContain('#A67C4A');
    expect(content).not.toContain('#0F766E');
    expect(content).not.toContain('青绿');
  });

  // ═══════════ 双主题配色 ═══════════
  it('配色表包含浅色和深色双列', () => {
    const content = readREADME();

    // 浅色列
    expect(content).toContain('#E8E4DB');
    expect(content).toContain('#F7F4EE');
    // 深色列
    expect(content).toContain('#0C0E12');
    expect(content).toContain('#161719');
    // 品牌色双列
    expect(content).toContain('#C4A574');
  });

  it('配色表来源引用 desk-palette.css + tokens.css + tailwind.config.js', () => {
    const content = readREADME();

    expect(content).toContain('desk-palette.css');
    expect(content).toContain('tokens.css');
    expect(content).toContain('tailwind.config.js');
    expect(content).toContain('CSS 变量');
    expect(content).toContain('深浅主题');
  });

  // ═══════════ 核心 6 步管线 ═══════════
  it('README 描述核心 6 步管线', () => {
    const content = readREADME();

    expect(content).toContain('核心 6 步管线');
    expect(content).toContain('编剧台');
    expect(content).toContain('分镜台');
    expect(content).toContain('导演台');
    expect(content).toContain('智能剪辑');
    expect(content).toContain('交付打包');
  });

  // ═══════════ 技术栈与实际一致 ═══════════
  it('技术栈包含 Remotion / HyperFrames / FFmpeg 多渲染引擎', () => {
    const content = readREADME();

    expect(content).toContain('Remotion');
    expect(content).toContain('HyperFrames');
    expect(content).toContain('FFmpeg');
  });

  it('技术栈包含 Director3d 自研引擎', () => {
    const content = readREADME();
    expect(content).toContain('Director3d');
  });

  it('技术栈前端为 React 19 + Vite', () => {
    const content = readREADME();
    expect(content).toContain('React 19');
    expect(content).toContain('Vite');
  });

  it('技术栈后端为 NestJS', () => {
    const content = readREADME();
    expect(content).toContain('NestJS');
  });

  // ═══════════ 无陈旧表述 ═══════════
  it('README 不含"逐个替换 GenericBlock"等陈旧表述', () => {
    const content = readREADME();
    expect(content).not.toMatch(/逐个替换\s*GenericBlock/);
  });

  it('README 不含 60+ 模块误导（二次确认）', () => {
    const content = readREADME();
    expect(content).not.toMatch(/60\s*\+\s*(个|种|款)/);
  });

  it('README 不含"全模块注册表"泛词', () => {
    const content = readREADME();
    // 特性区应为具体描述，非泛化"全模块注册表"
    expect(content).not.toContain('全模块注册表');
  });

  // ═══════════ 引用链可解析 ═══════════
  it('README 引用的 desk-palette.css 存在', () => {
    const p = resolve(root, 'apps/web/src/styles/desk-palette.css');
    expect(existsSync(p)).toBe(true);
  });

  it('README 引用的 tokens.css 存在', () => {
    const p = resolve(root, 'apps/web/src/styles/tokens.css');
    expect(existsSync(p)).toBe(true);
  });

  it('README 引用的 tailwind.config.js 存在', () => {
    const p = resolve(root, 'apps/web/tailwind.config.js');
    expect(existsSync(p)).toBe(true);
  });

  it('README 引用的缺陷台账地址存在', () => {
    const p = resolve(root, 'docs/NX9-PROJECT-DEFECT-ANALYSIS.md');
    expect(existsSync(p)).toBe(true);
  });

  // ═══════════ 视觉叙事完整 ═══════════
  it('README 含双主题 Desk 描述', () => {
    const content = readREADME();
    expect(content).toContain('双主题');
    expect(content).toContain('卡片式');
  });

  it('README 含 FlowSurface 引擎描述', () => {
    const content = readREADME();
    expect(content).toContain('FlowSurface');
  });

  it('README 后续扩展引用当前完成数', () => {
    const content = readREADME();
    expect(content).toContain('21 项已完成');
    expect(content).toContain('缺陷台账');
  });
});
