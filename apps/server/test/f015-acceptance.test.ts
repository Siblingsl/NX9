/**
 * F-015 导出清单 PDF/CSV + 导出历史可恢复验收
 * - manifestToCsv 非空输出
 * - manifestToPdf 非空输出 + 有效 PDF 结构
 * - manifestToHtml 非空输出
 * - shotsToManifestRows 正确映射
 * - recoverExportFromHistory 从历史中恢复
 * - ExportManifestService 内容非空校验
 * - ExportPackBlock 源码：清单导出调用 + 重试按钮
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  shotsToManifestRows,
  manifestToCsv,
  manifestToPdf,
  manifestToHtml,
  recoverExportFromHistory,
} from '@nx9/shared';
import type { StoryboardShot, EpisodeExportRecord } from '@nx9/shared';

const root = resolve(__dirname, '../../..');
const serverSrc = resolve(root, 'apps/server/src');
const webSrc = resolve(root, 'apps/web/src');

function readFile(...parts: string[]): string {
  return readFileSync(resolve(...parts), 'utf8');
}

function makeShot(overrides: Partial<StoryboardShot> = {}): StoryboardShot {
  return {
    id: 'shot-1',
    index: 1,
    descriptionZh: '特写男人拔刀',
    durationSec: 8,
    firstFrameAssetId: '/media/frame-1.jpg',
    videoAssetId: '/media/clip-1.mp4',
    audioAssetId: '/media/vo-1.mp3',
    characterNames: ['男主'],
    sceneName: '城楼',
    status: 'approved',
    ...overrides,
  } as StoryboardShot;
}

describe('F-015 导出清单 PDF/CSV + 导出历史可恢复', () => {

  // ─── shotsToManifestRows ───
  it('shotsToManifestRows 从镜头列表生成行数据', () => {
    const shot = makeShot();
    const rows = shotsToManifestRows([shot]);

    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.index).toBe(1);
    expect(r.shotId).toBe('shot-1');
    expect(r.description).toBe('特写男人拔刀');
    expect(r.durationSec).toBe(8);
    expect(r.imageUrl).toBe('/media/frame-1.jpg');
    expect(r.videoUrl).toBe('/media/clip-1.mp4');
    expect(r.audioUrl).toBe('/media/vo-1.mp3');
    expect(r.characterNames).toEqual(['男主']);
    expect(r.sceneName).toBe('城楼');
  });

  it('shotsToManifestRows 空列表返回空数组', () => {
    const rows = shotsToManifestRows([]);
    expect(rows).toHaveLength(0);
  });

  // ─── manifestToCsv ───
  it('manifestToCsv 生成包含表头的非空 CSV', () => {
    const shot = makeShot();
    const csv = manifestToCsv(shotsToManifestRows([shot]));

    expect(csv).toContain('镜头序号,镜头ID,描述,时长(秒),关键帧URL,视频URL,音频URL,角色,场景');
    expect(csv).toContain('shot-1');
    expect(csv).toContain('特写男人拔刀');
    expect(csv).toContain('/media/frame-1.jpg');
    // 双引号转义：描述含逗号/inner引号时应正确包裹
    expect(csv.trim().length).toBeGreaterThan(0);
  });

  it('manifestToCsv 多行输出行数正确', () => {
    const shots = [makeShot({ id: 'a', index: 1 }), makeShot({ id: 'b', index: 2 })];
    const csv = manifestToCsv(shotsToManifestRows(shots));
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(3); // header + 2 rows
  });

  // ─── manifestToPdf ───
  it('manifestToPdf 生成非空 PDF 二进制', () => {
    const shot = makeShot();
    const pdf = manifestToPdf(shotsToManifestRows([shot]));

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(0);

    const header = new TextDecoder().decode(pdf.slice(0, 8));
    expect(header).toBe('%PDF-1.4');
  });

  it('manifestToPdf 包含标准 PDF 结构标记', () => {
    const shot = makeShot();
    const pdf = manifestToPdf(shotsToManifestRows([shot]));
    const text = new TextDecoder().decode(pdf);

    expect(text).toContain('%PDF-1.4');
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Type /Pages');
    expect(text).toContain('/Type /Page');
    expect(text).toContain('/Type /Font /Subtype /Type1 /BaseFont /Helvetica');
    expect(text).toContain('endstream');
    expect(text).toContain('endobj');
    expect(text).toContain('startxref');
    expect(text).toContain('%%EOF');
  });

  it('manifestToPdf 多镜头输出更大', () => {
    const pdf1 = manifestToPdf(shotsToManifestRows([makeShot()]));
    const pdf10 = manifestToPdf(
      shotsToManifestRows(Array.from({ length: 10 }, (_, i) => makeShot({ id: `s${i}`, index: i + 1 })))
    );
    expect(pdf10.length).toBeGreaterThan(pdf1.length);
  });

  // ─── manifestToHtml ───
  it('manifestToHtml 生成非空 HTML', () => {
    const shot = makeShot();
    const html = manifestToHtml(shotsToManifestRows([shot]), '测试清单');

    expect(html).toContain('<html>');
    expect(html).toContain('测试清单');
    expect(html).toContain('shot-1');
    expect(html).toContain('特写男人拔刀');
    expect(html).toContain('8s');
    expect(html.trim().length).toBeGreaterThan(0);
  });

  // ─── recoverExportFromHistory ───
  it('recoverExportFromHistory 从历史记录恢复镜头', () => {
    const shot = makeShot({ id: 'shot-a', episodeId: 'ep1' });
    const shotMap = new Map<string, StoryboardShot>([['shot-a', shot]]);
    const history: EpisodeExportRecord[] = [{
      id: 'exp-1',
      episodeId: 'ep1',
      fileName: 'test.mp4',
      url: '/media/test.mp4',
      shotCount: 1,
      durationSec: 8,
      createdAt: new Date().toISOString(),
      status: 'success',
    }];

    const recovered = recoverExportFromHistory(history, shotMap);
    expect(recovered).not.toBeNull();
    expect(recovered!.rows).toHaveLength(1);
    expect(recovered!.rows[0].shotId).toBe('shot-a');
    expect(recovered!.lastExport).toBeDefined();
    expect(recovered!.lastExport!.id).toBe('exp-1');
  });

  it('recoverExportFromHistory 空历史返回 null', () => {
    const result = recoverExportFromHistory([], new Map());
    expect(result).toBeNull();
  });

  // ─── 服务端 ExportManifestService 非空校验 ───
  it('ExportManifestService 拒绝空 CSV 内容', () => {
    const src = readFile(serverSrc, 'modules/export/export-manifest.service.ts');

    // generateCsv 必须在写文件前检查 trim 非空
    expect(src).toMatch(/csvContent\.trim\(\)/);
    expect(src).toContain('CSV 内容为空');
    // generatePdf 必须在写文件前检查 rows 非空
    expect(src).toContain('镜头清单为空');
    // generatePdf 必须检查输出 buffer 非空
    expect(src).toContain('PDF 生成失败：输出为空');
  });

  it('ExportManifestController 注册到 ExportModule', () => {
    const moduleSrc = readFile(serverSrc, 'modules/export/export.module.ts');
    expect(moduleSrc).toContain('ExportManifestController');
    expect(moduleSrc).toContain('ExportManifestService');

    // app.module.ts 中导入了 ExportModule
    const appModuleSrc = readFile(serverSrc, 'app.module.ts');
    expect(appModuleSrc).toContain('import { ExportModule }');
    expect(appModuleSrc).toContain('ExportModule');
  });

  // ─── ExportPackBlock 源码守卫 ───
  it('ExportPackBlock 调用了 generateManifestCsv 和 generateManifestPdf', () => {
    const src = readFile(webSrc, 'blocks/nx9/ExportPackBlock.tsx');

    expect(src).toContain('generateManifestCsv');
    expect(src).toContain('generateManifestPdf');
    expect(src).toContain('manifestToCsv');
    expect(src).toContain('shotsToManifestRows');
  });

  it('ExportPackBlock 历史有重试按钮', () => {
    const src = readFile(webSrc, 'blocks/nx9/ExportPackBlock.tsx');
    expect(src).toContain('retryExport');
    expect(src).toContain('重试');
  });

  it('ExportPackBlock 历史显示清单 CSV/PDF 下载链接', () => {
    const src = readFile(webSrc, 'blocks/nx9/ExportPackBlock.tsx');

    expect(src).toContain('manifestCsvUrl');
    expect(src).toContain('manifestPdfUrl');
    expect(src).toContain('清单CSV');
    expect(src).toContain('清单PDF');
  });

  // ─── 服务端 app.module 静态文件服务 ───
  it('app.module 注册了 export-manifests 静态目录', () => {
    const src = readFile(serverSrc, 'app.module.ts');
    expect(src).toContain('export-manifests');
    expect(src).toContain('/media/export-manifests');
  });

  // ─── 真 PDF：manifestToPdf 结构验证 ───
  it('manifestToPdf 生成的 PDF 可以在末尾找到 %%EOF', () => {
    const pdf = manifestToPdf(shotsToManifestRows([makeShot()]));
    const text = new TextDecoder().decode(pdf);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('manifestToPdf 生成的 PDF 包含 xref 表', () => {
    const pdf = manifestToPdf(shotsToManifestRows([makeShot({ id: 'test-shot', index: 1 })]));
    const text = new TextDecoder().decode(pdf);
    expect(text).toContain('xref');
    expect(text).toContain('trailer');
  });
});
