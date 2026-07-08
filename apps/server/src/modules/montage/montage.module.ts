import { Module } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { AnalyzeService } from './analyze.service';
import { MontageController } from './montage.controller';
import { MontageService } from './montage.service';

@Module({
  imports: [GatewayModule],
  controllers: [MontageController],
  providers: [MontageService, AnalyzeService],
  exports: [MontageService, AnalyzeService],
})
export class MontageModule {}
