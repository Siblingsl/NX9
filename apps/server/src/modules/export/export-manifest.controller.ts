/**
 * ExportManifestController — 导出清单 API（F-015）。
 */
import { Controller, Post, Body } from '@nestjs/common';
import { ExportManifestService } from './export-manifest.service';
import type { ManifestRow } from '@nx9/shared';

@Controller('api/export/manifest')
export class ExportManifestController {
  constructor(private readonly service: ExportManifestService) {}

  @Post('csv')
  generateCsv(@Body() body: { csv: string; prefix?: string }) {
    return this.service.generateCsv(body.csv, body.prefix);
  }

  @Post('pdf')
  generatePdf(@Body() body: { rows: ManifestRow[]; prefix?: string; title?: string }) {
    return this.service.generatePdf(body.rows, body.prefix, body.title);
  }
}
