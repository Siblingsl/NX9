import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TopazService } from './topaz.service';

@Controller('api/topaz')
export class TopazController {
  constructor(private readonly topaz: TopazService) {}

  @Get('status')
  status(
    @Query('gigapixelPath') gigapixelPath?: string,
    @Query('topazVideoPath') topazVideoPath?: string,
  ) {
    return this.topaz.detectStatus({ gigapixelPath, topazVideoPath });
  }

  @Post('gigapixel')
  gigapixel(
    @Body()
    body: {
      sourceUrl: string;
      scale?: number;
      model?: string;
      executablePath?: string;
    },
  ) {
    return this.topaz.runGigapixel(body);
  }

  @Post('video')
  video(
    @Body()
    body: {
      sourceUrl: string;
      upscaleModel?: string;
      upscaleFactor?: number;
      enableInterpolation?: boolean;
      interpolationModel?: string;
      inputFps?: number;
      topazVideoPath?: string;
      useGpu?: boolean;
    },
  ) {
    return this.topaz.runTopazVideo(body);
  }
}
