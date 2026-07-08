import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { LIMITS, PATHS } from '../../config/app.config';
import { AssetsService } from './assets.service';

@Controller('api/assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get('uploads')
  list() {
    return this.assets.listUploads();
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: PATHS.uploads,
        filename: (_req, file, cb) => {
          const stamp = Date.now();
          const ext = extname(file.originalname) || '.bin';
          cb(null, `${stamp}-${Math.random().toString(36).slice(2, 6)}${ext}`);
        },
      }),
      limits: { fileSize: LIMITS.uploadMb * 1024 * 1024 },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error('No file');
    const url = this.assets.publicUrl('uploads', file.filename);
    let thumbUrl: string | null = null;
    if (/\.(jpe?g|png|webp|gif)$/i.test(file.filename)) {
      thumbUrl = await this.assets.enqueueThumb(file.path, `t-${file.filename}.jpg`);
    }
    return { ok: true, filename: file.filename, url, thumbUrl, size: file.size };
  }

  @Get('thumb')
  async thumb(@Query('file') file: string, @Res() res: Response) {
    const name = `t-${file}.jpg`;
    const path = this.assets.resolveUploadPath(name.replace(/^t-/, ''));
    const thumbPath = `${PATHS.thumbs}/${name}`;
    if (existsSync(thumbPath)) {
      return res.sendFile(thumbPath);
    }
    if (existsSync(path)) {
      const url = await this.assets.enqueueThumb(path, name);
      if (url) return res.sendFile(thumbPath);
    }
    return res.status(404).json({ ok: false });
  }
}
