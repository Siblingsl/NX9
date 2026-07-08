import { Body, Controller, Post } from '@nestjs/common';
import { ImageOpsService } from './image-ops.service';

@Controller('api/image-ops')
export class ImageOpsController {
  constructor(private readonly imageOps: ImageOpsService) {}

  @Post('resize')
  resize(
    @Body()
    body: {
      sourceUrl: string;
      width?: number;
      height?: number;
      fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    },
  ) {
    return this.imageOps.resizeImage(
      body.sourceUrl,
      body.width ?? 1024,
      body.height ?? 1024,
      body.fit ?? 'cover',
    );
  }

  @Post('merge')
  merge(
    @Body()
    body: {
      imageUrls: string[];
      direction?: 'horizontal' | 'vertical' | 'grid';
      cols?: number;
    },
  ) {
    return this.imageOps.mergeImages(body.imageUrls ?? [], body.direction ?? 'horizontal', body.cols);
  }

  @Post('upscale')
  upscale(@Body() body: { sourceUrl: string; scale?: number }) {
    return this.imageOps.upscaleImage(body.sourceUrl, body.scale ?? 2);
  }

  @Post('strip-metadata')
  stripMetadata(@Body() body: { sourceUrl: string }) {
    return this.imageOps.stripMetadata(body.sourceUrl);
  }
}
