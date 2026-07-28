/**
 * GatewayMusicController — BGM 音乐生成 API（F-014）。
 */
import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { GatewayMusicService } from './gateway-music.service';

@Controller('api/gateway/music')
export class GatewayMusicController {
  constructor(private readonly music: GatewayMusicService) {}

  @Post()
  submit(@Body() body: { prompt: string; durationSec?: number; provider?: string; apiKey?: string }) {
    return this.music.submit(body.prompt, body.durationSec ?? 30, body.provider, body.apiKey);
  }

  @Get(':taskId')
  status(@Param('taskId') taskId: string) {
    return this.music.getStatus(taskId);
  }
}
