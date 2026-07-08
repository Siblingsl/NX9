import { Body, Controller, Get, Post } from '@nestjs/common';
import type { AppSettings } from '@nx9/shared';
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

  @Post()
  update(@Body() body: AppSettings) {
    return this.settings.update(body);
  }
}
