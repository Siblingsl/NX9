import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AgentService } from './agent.service';
import { GatewayService } from '../gateway/gateway.service';

@Controller('api/agent')
export class AgentController {
  constructor(
    private readonly agent: AgentService,
    private readonly gateway: GatewayService,
  ) {}

  @Post('shot-script')
  shotScript(@Body() body: { text?: string }, @Headers('x-nx9-user-id') userId?: string) {
    return this.agent.shotScriptFromText(body?.text ?? '', userId);
  }

  @Post('dialogue-parse')
  dialogueParse(@Body() body: { text?: string }, @Headers('x-nx9-user-id') userId?: string) {
    return this.agent.dialogueFromText(body?.text ?? '', userId);
  }

  @Post('script/skeleton')
  scriptSkeleton(@Body() body: { sourceText?: string }, @Headers('x-nx9-user-id') userId?: string) {
    return this.agent.scriptSkeleton(body?.sourceText ?? '', userId);
  }

  @Post('script/adaptation')
  adaptation(@Body() body: { sourceText?: string }, @Headers('x-nx9-user-id') userId?: string) {
    return this.agent.adaptation(body?.sourceText ?? '', userId);
  }

  @Post('script/screenplay')
  screenplay(@Body() body: { sourceText?: string }, @Headers('x-nx9-user-id') userId?: string) {
    return this.agent.screenplay(body?.sourceText ?? '', userId);
  }

  @Post('production/director-plan')
  directorPlan(@Body() body: { sourceText?: string }, @Headers('x-nx9-user-id') userId?: string) {
    return this.agent.directorPlan(body?.sourceText ?? '', userId);
  }

  @Post('production/storyboard-table')
  storyboardTable(@Body() body: { sourceText?: string }, @Headers('x-nx9-user-id') userId?: string) {
    return this.agent.storyboardTable(body?.sourceText ?? '', userId);
  }

  @Post('production/materialize-shots')
  materializeShots(@Body() body: { table?: import('@nx9/shared').StoryboardTableRow[] }) {
    return this.agent.materializeShots(body?.table ?? []);
  }

  @Post('extract-assets')
  extractAssets(@Body() body: { sourceText?: string }, @Headers('x-nx9-user-id') userId?: string) {
    return this.agent.extractAssets(body?.sourceText ?? '', userId);
  }

  @Post('scene-split')
  sceneSplit(@Body() body: { sourceText?: string; mode?: 'llm' | 'rule' }, @Headers('x-nx9-user-id') userId?: string) {
    return this.agent.sceneSplit(body?.sourceText ?? '', body?.mode ?? 'llm', userId);
  }

  @Post('extract-environments')
  extractEnvironments(@Body() body: { sourceText?: string; scenes?: import('@nx9/shared').SceneSplitRecord[] }, @Headers('x-nx9-user-id') userId?: string) {
    return this.agent.extractEnvironments(body, userId);
  }

  @Post('novel-events')
  novelEvents(@Body() body: { sourceText?: string }, @Headers('x-nx9-user-id') userId?: string) {
    return this.agent.novelEvents(body?.sourceText ?? '', userId);
  }

  @Post('script/chat')
  async scriptChat(
    @Body() body: { message: string; history?: { role: string; content: string }[] },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const messages = [
      { role: 'system', content: '你是专业编剧助手。帮助用户完成剧本创作。回答简洁专业。' },
      ...(body.history ?? []),
      { role: 'user', content: body.message },
    ];
    try {
      await this.gateway.proxyLlmStream(messages, undefined, (chunk: string) => {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      });
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: (e as Error).message })}\n\n`);
    }
    res.end();
  }
}
