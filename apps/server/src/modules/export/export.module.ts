/**
 * ExportModule — 导出模块（F-015：导出清单 PDF/CSV + 历史）。
 */
import { Module } from '@nestjs/common';
import { ExportManifestController } from './export-manifest.controller';
import { ExportManifestService } from './export-manifest.service';

@Module({
  controllers: [ExportManifestController],
  providers: [ExportManifestService],
})
export class ExportModule {}
