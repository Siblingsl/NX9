import { Controller, Get, Query } from '@nestjs/common';
import { UsageService } from './usage.service';

@Controller('api/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('summary')
  summary(
    @Query('days') days?: string,
    @Query('userId') userId?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    return this.usage.summary(Number(days) || 7, userId, workspaceId);
  }

  @Get('recent')
  recent(
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    return this.usage.recent(Number(limit) || 50, userId, workspaceId);
  }

  /** F-009: 按日聚合，供折线/柱状图 */
  @Get('daily')
  daily(
    @Query('days') days?: string,
    @Query('userId') userId?: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    return this.usage.daily(Number(days) || 7, userId, workspaceId);
  }
}
