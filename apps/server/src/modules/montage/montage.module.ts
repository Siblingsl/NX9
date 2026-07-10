import { Module } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { SettingsModule } from '../settings/settings.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { AnalyzeService } from './analyze.service';
import { MontageController } from './montage.controller';
import { MontageService } from './montage.service';
import { HyperframesService } from './hyperframes.service';

@Module({
  imports: [GatewayModule, SettingsModule, WorkspaceModule],
  controllers: [MontageController],
  providers: [MontageService, AnalyzeService, HyperframesService],
  exports: [MontageService, AnalyzeService, HyperframesService],
})
export class MontageModule {}
