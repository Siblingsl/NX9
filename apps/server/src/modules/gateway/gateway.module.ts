import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { UsageModule } from '../usage/usage.module';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { LuxTtsAdapter } from './luxtts.adapter';
import { VoiceboxAdapter } from './voicebox.adapter';

@Module({
  imports: [SettingsModule, UsageModule],
  controllers: [GatewayController],
  providers: [GatewayService, VoiceboxAdapter, LuxTtsAdapter],
  exports: [GatewayService],
})
export class GatewayModule {}
