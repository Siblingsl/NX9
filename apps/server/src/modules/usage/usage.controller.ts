import { Controller, Get, Query } from '@nestjs/common';
import { UsageService } from './usage.service';

@Controller('api/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('summary')
  summary(@Query('days') days?: string, @Query('userId') userId?: string) {
    return this.usage.summary(Number(days) || 7, userId);
  }

  @Get('recent')
  recent(@Query('limit') limit?: string, @Query('userId') userId?: string) {
    return this.usage.recent(Number(limit) || 50, userId);
  }
}
