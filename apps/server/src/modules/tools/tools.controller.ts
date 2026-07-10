import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PATHS } from '../../config/app.config';
import { extractUrlFromText, fetchRemote } from '../../common/url-utils';
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

  @Post('capture-url')
  async captureUrl(@Body() body: { url: string }) {
    let src: string;
    try {
      src = extractUrlFromText(body.url ?? '');
    } catch (e) {
      throw new HttpException(String(e), HttpStatus.BAD_REQUEST);
    }

    let res: Response;
    try {
      res = await fetchRemote(src);
    } catch (e) {
      throw new HttpException(String(e), HttpStatus.BAD_GATEWAY);
    }
    if (!res.ok) throw new HttpException(`下载失败: ${res.status}`, HttpStatus.SERVICE_UNAVAILABLE);

    const contentType = res.headers.get('content-type') ?? '';
    if (/text\/html/i.test(contentType)) {
      const url = body.url ?? '';
      let platformHint = '';
      if (/douyin\.com|t\.cn/i.test(url)) platformHint = '抖音分享页请先用「解析链接」提取视频直链';
      else if (/bilibili\.com|b23\.tv/i.test(url)) platformHint = 'B站视频请先用「解析链接」提取直链';
      else if (/xiaohongshu\.com|xhslink\.com/i.test(url)) platformHint = '小红书链接请先用「解析链接」提取素材';
      else if (/weibo\.com/i.test(url)) platformHint = '微博链接请先用「解析链接」提取图片/视频';
      else platformHint = '该链接是网页而非直链素材，请使用「解析链接」功能';
      throw new HttpException(platformHint, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);

    let folder: string;
    let ext: string;
    let servePrefix: string;

    if (/image/.test(contentType)) {
      folder = PATHS.images;
      ext = 'png';
      servePrefix = '/media/images';
    } else if (/video/.test(contentType)) {
      folder = PATHS.videos;
      ext = 'mp4';
      servePrefix = '/media/videos';
    } else if (/audio/.test(contentType)) {
      folder = PATHS.audio;
      ext = 'mp3';
      servePrefix = '/media/audio';
    } else {
      folder = PATHS.uploads;
      ext = 'bin';
      servePrefix = '/media/uploads';
    }

    if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
    const name = `capture-${stamp}-${rand}.${ext}`;
    writeFileSync(join(folder, name), buf);

    return { ok: true, url: `${servePrefix}/${encodeURIComponent(name)}`, filename: name, sourceUrl: src };
  }

  @Post('proxy-download')
  async proxyDownload(@Body() body: { url: string }) {
    let src: string;
    try {
      src = extractUrlFromText(body.url ?? '');
    } catch (e) {
      throw new HttpException(String(e), HttpStatus.BAD_REQUEST);
    }

    let res: Response;
    try {
      res = await fetchRemote(src);
    } catch (e) {
      throw new HttpException(String(e), HttpStatus.BAD_GATEWAY);
    }
    if (!res.ok) throw new HttpException(`下载失败: ${res.status}`, HttpStatus.SERVICE_UNAVAILABLE);

    const contentType = res.headers.get('content-type') ?? '';
    const buf = Buffer.from(await res.arrayBuffer());
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 6);

    let ext = 'bin';
    if (/image/.test(contentType)) ext = 'png';
    else if (/video/.test(contentType)) ext = 'mp4';
    else if (/audio/.test(contentType)) ext = 'mp3';

    if (!existsSync(PATHS.exports)) mkdirSync(PATHS.exports, { recursive: true });
    const name = `proxy-${stamp}-${rand}.${ext}`;
    writeFileSync(join(PATHS.exports, name), buf);

    return { ok: true, url: `/media/exports/${encodeURIComponent(name)}`, filename: name };
  }

  @Post('import-prompt-package')
  async importPromptPackage(@Body() body: { url: string }) {
    let src: string;
    try {
      src = extractUrlFromText(body.url ?? '');
    } catch (e) {
      throw new HttpException(String(e), HttpStatus.BAD_REQUEST);
    }

    let res: Response;
    try {
      res = await fetchRemote(src);
    } catch (e) {
      throw new HttpException(String(e), HttpStatus.BAD_GATEWAY);
    }
    if (!res.ok) throw new HttpException(`拉取失败: ${res.status}`, HttpStatus.SERVICE_UNAVAILABLE);

    const json = (await res.json()) as Record<string, unknown>;
    const items = Array.isArray(json) ? json : (json.items as unknown[]) ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpException('Prompt 包格式无效：需要 JSON 数组或 {items: [...]}', HttpStatus.BAD_REQUEST);
    }

    const parsed = items.map((item: unknown) => {
      const r = item as Record<string, unknown>;
      return {
        id: (r.id as string) ?? `gh-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        label: (r.label as string) || (r.name as string) || '远程模板',
        kind: (r.kind as string) || (r.type as string) || 'prompt',
        prompt: (r.prompt as string) ?? '',
        tags: (r.tags as string[]) ?? ['github-import'],
      };
    });

    return { ok: true, count: parsed.length, items: parsed.slice(0, 100) };
  }
}
