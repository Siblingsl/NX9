import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { planEcomPackFiles } from '@nx9/shared';

const webSrc = resolve(__dirname, '..');

function readEngine(rel: string) {
  return readFileSync(resolve(webSrc, rel), 'utf8');
}

describe('TOOL-02 电商包诚实规划', () => {
  it('视频规格不用图片填充 .mp4', () => {
    const plan = planEcomPackFiles({
      selectedSpecs: ['main-1-1', 'video-9-16'],
      pictures: ['/media/a.jpg'],
      clips: [],
      prefix: 'sku',
    });
    expect(plan.files.every((f) => f.category === 'image')).toBe(true);
    expect(plan.files.some((f) => f.name.endsWith('.mp4'))).toBe(false);
    expect(plan.skipped.some((s) => s.specId === 'video-9-16')).toBe(true);
  });

  it('无媒资时 files 为空', () => {
    const plan = planEcomPackFiles({
      selectedSpecs: ['main-1-1', 'video-9-16'],
      pictures: [],
      clips: [],
      prefix: 'sku',
    });
    expect(plan.files).toHaveLength(0);
    expect(plan.skipped.length).toBeGreaterThan(0);
  });

  it('视频规格只吃 clips', () => {
    const plan = planEcomPackFiles({
      selectedSpecs: ['video-9-16'],
      pictures: ['/media/a.jpg'],
      clips: ['/media/a.mp4'],
      prefix: 'sku',
    });
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]?.name.endsWith('.mp4')).toBe(true);
    expect(plan.files[0]?.sourceUrl).toBe('/media/a.mp4');
  });
});

describe('TOOL-02/03 export-pack-runner 源码守卫', () => {
  it('空 zip / 空电商包不得 ok', () => {
    const src = readEngine('export-pack-runner.ts');
    expect(src).toContain("message: '无可导出的媒资，禁止空成功'");
    expect(src).toContain('电商包无有效文件');
    expect(src).toContain('禁止空成功');
    expect(src).toContain('planEcomPackFiles');
    expect(src).toMatch(/hyperframes-episode[\s\S]*?exportReady:\s*false/);
    expect(src).toContain('成片未返回 URL，禁止空成功');
    expect(src).toContain('Remotion 工程包无文件，禁止空成功');
    expect(src).toContain('HyperFrames 提交失败，禁止空成功');
    expect(src).toContain('电商包下载全部失败');
    expect(src).toContain('无有效时间线（请先在智能剪辑编排并同步，clips≥1），禁止空成功');
    expect(src).toContain('无连接链镜表，无法导出成片，禁止空成功');
    expect(src).toContain('请选择至少一个电商规格，禁止空成功');
    expect(src).toContain('代理下载失败');
    expect(src).toContain('无法下载');
    expect(src).toMatch(/代理下载失败[\s\S]*禁止空成功/);
    expect(src).toMatch(/无法下载[\s\S]*禁止空成功/);
  });

  it('simpleConcatExport 无 URL 禁止假绿 success', () => {
    const src = readEngine('core-pipeline-runner.ts');
    expect(src).toContain('成片未返回 URL，禁止空成功');
    expect(src).toContain('!res.ok || !res.url');
  });
});

describe('TOOL-01 flow-runner export-pack 链隔离', () => {
  it('不再读全局 activeEpisodeShots', () => {
    const src = readEngine('flow-runner-ops/legacy-honesty-ops.ts');
    const branch = src.slice(src.indexOf("if (kind === 'export-pack')"), src.indexOf("if (kind === 'audio-mix'"));
    expect(branch).toContain('resolveShotsForBlock');
    expect(branch).not.toContain('useWorkspaceDocument.getState().storyboard');
    expect(branch).toContain('pollMontageTaskUntilDone');
    expect(branch).toContain('exportReady: false');
  });

  it('ExportPackBlock UI 失败路径 toastError', () => {
    const src = readFileSync(resolve(webSrc, '../blocks/nx9/ExportPackBlock.tsx'), 'utf8');
    expect(src).toMatch(/清单 CSV 生成失败[\s\S]*toastError/);
    expect(src).toMatch(/清单 PDF 生成失败[\s\S]*toastError/);
    expect(src).toMatch(/导出失败:[\s\S]*toastError/);
    expect(src).toMatch(/单集合成：无连接链镜表[\s\S]*toastError/);
    expect(src).toMatch(/HF 渲染失败[\s\S]*toastError/);
  });
});
