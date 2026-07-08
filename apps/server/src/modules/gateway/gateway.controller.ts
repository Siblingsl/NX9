import { Body, Controller, Headers, Post } from '@nestjs/common';
import { GatewayService } from './gateway.service';

@Controller('api/gateway')
export class GatewayController {
  constructor(private readonly gateway: GatewayService) {}

  @Post('llm')
  proxyLlm(
    @Body() body: Record<string, unknown>,
    @Headers('x-nx9-user-id') userId?: string,
  ) {
    return this.gateway.proxyLlm(body, userId);
  }

  @Post('image')
  proxyImage(
    @Body() body: Record<string, unknown>,
    @Headers('x-nx9-user-id') userId?: string,
  ) {
    return this.gateway.proxyImage(body, userId);
  }

  @Post('video')
  proxyVideo(
    @Body() body: Record<string, unknown>,
    @Headers('x-nx9-user-id') userId?: string,
  ) {
    return this.gateway.proxyVideo(body, userId);
  }

  @Post('tts')
  proxyTts(
    @Body() body: Record<string, unknown>,
    @Headers('x-nx9-user-id') userId?: string,
  ) {
    return this.gateway.proxyTts(body, userId);
  }

  @Post('video/poll')
  pollVideo(
    @Body() body: { taskId: string; baseUrl?: string },
    @Headers('x-nx9-user-id') userId?: string,
  ) {
    return this.gateway.pollVideo(body.taskId, body.baseUrl, userId);
  }

  @Post('voicebox/probe')
  probeVoicebox(@Body() body?: { baseUrl?: string }) {
    return this.gateway.probeVoicebox(body?.baseUrl);
  }

  @Post('luxtts/probe')
  probeLuxTts(@Body() body?: { baseUrl?: string }) {
    return this.gateway.probeLuxTts(body?.baseUrl);
  }

  @Post('fal')
  proxyFal(
    @Body() body: { model: string; input: Record<string, unknown> },
    @Headers('x-nx9-user-id') userId?: string,
  ) {
    return this.gateway.proxyFal(body, userId);
  }

  @Post('comfy')
  proxyComfy(
    @Body() body: { workflow: Record<string, unknown>; baseUrl?: string; prompt?: string },
    @Headers('x-nx9-user-id') userId?: string,
  ) {
    return this.gateway.proxyComfy(body, userId);
  }
}
