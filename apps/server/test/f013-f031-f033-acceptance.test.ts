import { describe, it, expect } from 'vitest';
import {
  LINK_PARSER_PLATFORMS,
  detectLinkParserPlatform,
  classifyLinkParserUrl,
  mapLinkParseErrorCode,
  formatLinkParserSupportedLabel,
  planEcomPackFiles,
  ECOM_IMAGE_SPECS,
  ECOM_VIDEO_SPECS,
  ECOM_ALL_SPECS,
} from '@nx9/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('F-031 链接解析平台覆盖矩阵', () => {
  it('每个平台至少一条 sampleUrl 可识别', () => {
    expect(LINK_PARSER_PLATFORMS.length).toBeGreaterThanOrEqual(6);
    for (const p of LINK_PARSER_PLATFORMS) {
      expect(p.sampleUrls.length).toBeGreaterThan(0);
      for (const url of p.sampleUrls) {
        const hit = detectLinkParserPlatform(url);
        expect(hit?.id, `未识别 ${p.id}: ${url}`).toBe(p.id);
        const classified = classifyLinkParserUrl(url);
        expect(classified.ok).toBe(true);
        if (classified.ok) expect(classified.platform?.id).toBe(p.id);
      }
    }
  });

  it('非法协议 / 空 URL 返回 UNSUPPORTED_HOST 或 PARSE', () => {
    const bad = classifyLinkParserUrl('ftp://example.com/a');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('UNSUPPORTED_HOST');

    const empty = classifyLinkParserUrl('   ');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe('PARSE');
  });

  it('requireNamedPlatform 时未知主机拒绝', () => {
    const r = classifyLinkParserUrl('https://example.com/post/1', {
      requireNamedPlatform: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('UNSUPPORTED_HOST');
      expect(r.message).toContain(formatLinkParserSupportedLabel().split('/')[0]!);
    }
  });

  it('错误码文案覆盖全矩阵', () => {
    for (const code of ['UNSUPPORTED_HOST', 'NETWORK', 'PARSE', 'AUTH', 'TIMEOUT'] as const) {
      expect(mapLinkParseErrorCode(code).length).toBeGreaterThan(4);
    }
    expect(mapLinkParseErrorCode('UNSUPPORTED_HOST')).toContain('抖音');
  });

  it('前端工作区使用 shared 矩阵（源码守卫）', () => {
    const src = readFileSync(
      resolve(__dirname, '../../web/src/engine/stage-deck/chrome/attached-workspace/tool/LinkParserWorkspace.tsx'),
      'utf8',
    );
    expect(src).toContain('detectLinkParserPlatform');
    expect(src).toContain('mapLinkParseErrorCode');
    expect(src).not.toMatch(/PLATFORM_ADAPTERS\s*=/);
  });
});

describe('F-033 电商规格包多尺寸规划', () => {
  it('图包：多主图规格各产出文件', () => {
    const ids = ECOM_IMAGE_SPECS.map((s) => s.specId);
    const plan = planEcomPackFiles({
      selectedSpecs: ids,
      pictures: ['/media/a.jpg', '/media/b.jpg'],
      clips: [],
      prefix: 'sku',
    });
    expect(plan.skipped).toHaveLength(0);
    expect(plan.files.length).toBe(ids.length * 2);
    expect(new Set(plan.files.map((f) => f.specId)).size).toBe(ids.length);
  });

  it('视频包：多短视频规格各产出 mp4', () => {
    const ids = ECOM_VIDEO_SPECS.map((s) => s.specId);
    const plan = planEcomPackFiles({
      selectedSpecs: ids,
      pictures: ['/media/a.jpg'],
      clips: ['/media/a.mp4'],
      prefix: 'sku',
    });
    expect(plan.skipped).toHaveLength(0);
    expect(plan.files.every((f) => f.name.endsWith('.mp4'))).toBe(true);
    expect(plan.files.length).toBe(ids.length);
  });

  it('混合勾选：图规格吃图、视频规格吃片', () => {
    const plan = planEcomPackFiles({
      selectedSpecs: ['main-1-1', 'main-3-4', 'video-9-16', 'video-1-1'],
      pictures: ['/media/a.jpg'],
      clips: ['/media/a.mp4'],
      prefix: 'sku',
    });
    expect(plan.files.filter((f) => f.category === 'image')).toHaveLength(2);
    expect(plan.files.filter((f) => f.category === 'video')).toHaveLength(2);
    expect(ECOM_ALL_SPECS.length).toBe(ECOM_IMAGE_SPECS.length + ECOM_VIDEO_SPECS.length);
  });

  it('ExportPack UI/runner 接线 ecom-pack（源码守卫）', () => {
    const block = readFileSync(
      resolve(__dirname, '../../web/src/blocks/nx9/ExportPackBlock.tsx'),
      'utf8',
    );
    const runner = readFileSync(
      resolve(__dirname, '../../web/src/engine/export-pack-runner.ts'),
      'utf8',
    );
    expect(block).toContain("ecom-pack");
    expect(block).toContain('ECOM_ALL_SPECS');
    expect(runner).toContain("mode === 'ecom-pack'");
    expect(runner).toContain('planEcomPackFiles');
  });
});
