import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import { Response } from 'express';
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

  @Post('llm/stream')
  async proxyLlmStream(
    @Body() body: { messages: { role: string; content: string }[]; model?: string },
    @Headers('x-nx9-user-id') userId?: string,
    @Res() res?: Response,
  ) {
    if (!res) return;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const full = await this.gateway.proxyLlmStream(
      body.messages || [],
      userId,
      (text: string) => { res.write(`data: ${JSON.stringify({ text })}\n\n`); },
    );
    res.write(`data: ${JSON.stringify({ done: true, full })}\n\n`);
    res.end();
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

  @Post('providers/probe')
  probeProviders() {
    return this.gateway.probeProviders();
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
