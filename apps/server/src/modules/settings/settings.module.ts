import { Module } from '@nestjs/common';
import { JsonStoreService } from '../../common/json-store.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, JsonStoreService],
  exports: [SettingsService],
})
export class SettingsModule {}
