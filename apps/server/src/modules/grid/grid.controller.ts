import { Body, Controller, Post } from '@nestjs/common';
import { GridService } from './grid.service';

@Controller('api/grid')
export class GridController {
  constructor(private readonly grid: GridService) {}

  @Post('split')
  split(@Body() body: { sourceUrl: string; rows?: number; cols?: number }) {
    return this.grid.splitGrid(body.sourceUrl, body.rows ?? 3, body.cols ?? 3);
  }

  @Post('compose')
  compose(@Body() body: { imageUrls: string[]; rows: number; cols: number }) {
    return this.grid.composeGrid(body.imageUrls, body.rows, body.cols);
  }

  @Post('generate')
  generate(@Body() body: { prompt: string; rows?: number; cols?: number; style?: 'cinematic' | 'line-art' }) {
    return this.grid.generateStoryGrid(body.prompt, body.rows ?? 3, body.cols ?? 3, body.style ?? 'cinematic');
  }

  @Post('shot-sketch')
  shotSketch(
    @Body()
    body: {
      descriptionZh: string;
      promptEn?: string;
      shotType?: string;
      artStylePrompt?: string;
    },
  ) {
    return this.grid.generateShotSketch(body);
  }

  @Post('reverse-prompts')
  reversePrompts(
    @Body()
    body: { sourceUrl: string; rows?: number; cols?: number; storyPrompt?: string },
  ) {
    return this.grid.reverseGridPrompts(
      body.sourceUrl,
      body.rows ?? 3,
      body.cols ?? 3,
      body.storyPrompt,
    );
  }
}
