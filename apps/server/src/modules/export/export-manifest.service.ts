/**
 * ExportManifestService — 导出清单 CSV/HTML/PDF 生成（F-015）。
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { PATHS } from '../../config/app.config';
import { type ManifestRow, manifestToPdf } from '@nx9/shared';

@Injectable()
export class ExportManifestService {
  private getOutDir(): string {
    const dir = join(PATHS.data, 'export-manifests');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  async generateCsv(csvContent: string, prefix = 'manifest'): Promise<{ url: string }> {
    const trimmed = csvContent.trim();
    if (!trimmed) {
      throw new BadRequestException('CSV 内容为空，拒绝生成空文件');
    }
    const filename = `${prefix}-${Date.now()}.csv`;
    const filepath = join(this.getOutDir(), filename);
    writeFileSync(filepath, trimmed, 'utf-8');
    return { url: `/media/export-manifests/${filename}` };
  }

  async generateHtml(htmlContent: string, prefix = 'manifest'): Promise<{ url: string }> {
    const trimmed = htmlContent.trim();
    if (!trimmed) {
      throw new BadRequestException('HTML 内容为空，拒绝生成空文件');
    }
    const filename = `${prefix}-${Date.now()}.html`;
    const filepath = join(this.getOutDir(), filename);
    writeFileSync(filepath, trimmed, 'utf-8');
    return { url: `/media/export-manifests/${filename}` };
  }

  async generatePdf(rows: ManifestRow[], prefix = 'manifest', title?: string): Promise<{ url: string }> {
    if (!rows || rows.length === 0) {
      throw new BadRequestException('镜头清单为空，拒绝生成空 PDF');
    }
    const pdfBuffer = manifestToPdf(rows, title);
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new BadRequestException('PDF 生成失败：输出为空');
    }
    const filename = `${prefix}-${Date.now()}.pdf`;
    const filepath = join(this.getOutDir(), filename);
    writeFileSync(filepath, Buffer.from(pdfBuffer));
    return { url: `/media/export-manifests/${filename}` };
  }
}
