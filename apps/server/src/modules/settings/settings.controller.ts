import { Body, Controller, Get, Post } from '@nestjs/common';
import type { AppSettings, ConnectionStatus } from '@nx9/shared';
import { SettingsService } from './settings.service';

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.getMasked();
  }

  @Get('raw')
  getRaw() {
    return this.settings.getRaw();
  }

  @Get('connection-status')
  getConnectionStatus(): ConnectionStatus {
    return this.settings.getConnectionStatus();
  }

  @Post()
  update(@Body() body: AppSettings) {
    return this.settings.update(body);
  }
}
