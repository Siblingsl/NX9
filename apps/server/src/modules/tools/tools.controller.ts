import { Body, Controller, Post } from '@nestjs/common';
import { LinkParserService } from './link-parser.service';
import { VisionToolsService } from './vision-tools.service';

@Controller('api/tools')
export class ToolsController {
  constructor(
    private readonly linkParser: LinkParserService,
    private readonly vision: VisionToolsService,
  ) {}

  @Post('parse-link')
  parseLink(@Body() body: { url: string; hint?: string }) {
    return this.linkParser.parseLink(body.url ?? '', body.hint);
  }

  @Post('reverse-prompt')
  reversePrompt(@Body() body: { imageUrl: string }) {
    return this.vision.reversePrompt(body.imageUrl ?? '');
  }

  @Post('extract-style')
  extractStyle(@Body() body: { imageUrl: string }) {
    return this.vision.extractStyle(body.imageUrl ?? '');
  }

  @Post('quick-montage')
  quickMontage(@Body() body: { topic: string; durationSec?: number }) {
    return this.vision.quickMontage(body.topic ?? '', body.durationSec ?? 30);
  }

  @Post('replicate-video')
  replicateVideo(@Body() body: { url: string; notes?: string }) {
    return this.vision.replicateVideoPlan(body.url ?? '', body.notes);
  }
}
