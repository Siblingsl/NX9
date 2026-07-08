import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { buildTimelineFromShots } from '@nx9/shared';
import { PATHS } from '../../config/app.config';
import { resolveMediaUrl } from '../../common/media-path';
import type { StoryboardShot } from '@nx9/shared';
import { GatewayService } from '../gateway/gateway.service';

@Injectable()
export class MontageService {
  private ffmpegAvailable: boolean | null = null;

  constructor(private readonly gateway: GatewayService) {}

  async checkFfmpeg(): Promise<boolean> {
    if (this.ffmpegAvailable !== null) return this.ffmpegAvailable;
    return new Promise((resolve) => {
      const proc = spawn('ffmpeg', ['-version']);
      proc.on('error', () => {
        this.ffmpegAvailable = false;
        resolve(false);
      });
      proc.on('close', (code) => {
        this.ffmpegAvailable = code === 0;
        resolve(this.ffmpegAvailable);
      });
    });
  }

  async createContactSheet(
    shots: Pick<StoryboardShot, 'index' | 'descriptionZh' | 'firstFrameAssetId'>[],
    cols = 3,
  ) {
    const cellW = 320;
    const cellH = 200;
    const labelH = 36;
    const count = shots.length;
    const rows = Math.ceil(count / cols) || 1;
    const canvasW = cols * cellW;
    const canvasH = rows * (cellH + labelH);

    const composites: sharp.OverlayOptions[] = [];

    for (let i = 0; i < count; i++) {
      const shot = shots[i];
      const r = Math.floor(i / cols);
      const c = i % cols;
      const left = c * cellW;
      const top = r * (cellH + labelH);

      let cellBuf: Buffer;
      const imgPath = shot.firstFrameAssetId ? resolveMediaUrl(shot.firstFrameAssetId) : null;
      if (imgPath && existsSync(imgPath)) {
        cellBuf = await sharp(imgPath)
          .resize(cellW, cellH, { fit: 'cover' })
          .toBuffer();
      } else {
        cellBuf = await sharp({
          create: { width: cellW, height: cellH, channels: 3, background: '#E6E6E6' },
        })
          .jpeg()
          .toBuffer();
      }
      composites.push({ input: cellBuf, left, top });

      const label = `#${shot.index} ${(shot.descriptionZh || '').slice(0, 12)}`;
      const labelSvg = Buffer.from(
        `<svg width="${cellW}" height="${labelH}"><rect width="100%" height="100%" fill="#FAFAF8"/><text x="8" y="22" font-family="sans-serif" font-size="14" fill="#222222">${label.replace(/[<>&"]/g, '')}</text></svg>`,
      );
      composites.push({ input: labelSvg, left, top: top + cellH });
    }

    const name = `contact-${Date.now()}.png`;
    const out = join(PATHS.exports, name);
    await sharp({
      create: { width: canvasW, height: canvasH, channels: 3, background: '#FAFAF8' },
    })
      .composite(composites)
      .png()
      .toFile(out);

    return { ok: true, url: `/media/exports/${name}`, shotCount: count };
  }

  async renderShot(body: {
    videoUrl: string;
    audioUrl?: string;
    subtitle?: string;
    durationSec?: number;
  }) {
    const hasFfmpeg = await this.checkFfmpeg();
    if (!hasFfmpeg) {
      return {
        ok: false,
        status: 'failed',
        message: '未检测到 FFmpeg，请安装后重试（https://ffmpeg.org）',
      };
    }

    const videoPath = resolveMediaUrl(body.videoUrl);
    if (!videoPath) throw new Error(`无法解析视频: ${body.videoUrl}`);

    const stamp = Date.now();
    const outName = `shot-${stamp}.mp4`;
    const outPath = join(PATHS.exports, outName);
    const audioPath = body.audioUrl ? resolveMediaUrl(body.audioUrl) : null;

    let srtPath: string | undefined;
    if (body.subtitle?.trim()) {
      srtPath = join(PATHS.exports, `shot-${stamp}.srt`);
      const dur = body.durationSec ?? 4;
      writeFileSync(
        srtPath,
        `1\n00:00:00,000 --> 00:00:${String(dur).padStart(2, '0')},000\n${body.subtitle}\n`,
      );
    }

    await this.runFfmpeg(videoPath, audioPath, srtPath, outPath);

    return { ok: true, url: `/media/exports/${outName}`, status: 'done' };
  }

  private runFfmpeg(
    videoPath: string,
    audioPath: string | null,
    srtPath: string | undefined,
    outPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['-y', '-i', videoPath];
      if (audioPath && existsSync(audioPath)) args.push('-i', audioPath);

      if (srtPath && existsSync(srtPath)) {
        args.push('-vf', `subtitles=${srtPath.replace(/\\/g, '/')}`);
      }

      if (audioPath && existsSync(audioPath)) {
        args.push('-c:v', 'copy', '-c:a', 'aac', '-shortest', outPath);
      } else {
        args.push('-c:v', 'copy', outPath);
      }

      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += String(d);
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.slice(-500) || `ffmpeg exit ${code}`));
      });
    });
  }

  validateReviewGate(shots: StoryboardShot[]): { ok: boolean; pending: number[] } {
    const pending = shots.filter((s) => s.status !== 'approved').map((s) => s.index);
    return { ok: pending.length === 0, pending };
  }

  exportTimeline(shots: StoryboardShot[], title?: string) {
    const timeline = buildTimelineFromShots(shots, title);
    const name = `timeline-${Date.now()}.json`;
    const out = join(PATHS.exports, name);
    writeFileSync(out, JSON.stringify(timeline, null, 2));
    return { ok: true, timeline, url: `/media/exports/${name}` };
  }

  async concatEpisode(
    shots: StoryboardShot[],
    opts?: { requireApproved?: boolean; title?: string },
  ) {
    const sorted = [...shots].sort((a, b) => a.index - b.index);
    if (opts?.requireApproved !== false) {
      const gate = this.validateReviewGate(sorted);
      if (!gate.ok) {
        return {
          ok: false,
          status: 'blocked',
          message: `审阅门控：镜头 ${gate.pending.join(', ')} 尚未通过`,
          pending: gate.pending,
        };
      }
    }

    const hasFfmpeg = await this.checkFfmpeg();
    if (!hasFfmpeg) {
      return {
        ok: false,
        status: 'failed',
        message: '未检测到 FFmpeg，无法整集合成',
      };
    }

    const segments: { path: string; shotIndex: number }[] = [];
    for (const shot of sorted) {
      const url = shot.videoAssetId;
      if (!url) continue;
      const local = resolveMediaUrl(url);
      if (local && existsSync(local)) segments.push({ path: local, shotIndex: shot.index });
    }

    if (segments.length === 0) {
      return { ok: false, status: 'failed', message: '无可用视频片段，请先生成各镜头视频' };
    }

    const stamp = Date.now();
    const listFile = join(PATHS.exports, `concat-${stamp}.txt`);
    const outName = `episode-${stamp}.mp4`;
    const outPath = join(PATHS.exports, outName);

    const listContent = segments
      .map((s) => `file '${s.path.replace(/'/g, "'\\''")}'`)
      .join('\n');
    writeFileSync(listFile, listContent);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-c',
        'copy',
        outPath,
      ]);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += String(d);
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.slice(-500) || `ffmpeg concat exit ${code}`));
      });
    });

    return {
      ok: true,
      status: 'done',
      url: `/media/exports/${outName}`,
      segmentCount: segments.length,
      title: opts?.title ?? '整集导出',
    };
  }

  /** Concat arbitrary local /media video clips (canvas clip-editor). */
  async concatClips(videoUrls: string[], title?: string) {
    const hasFfmpeg = await this.checkFfmpeg();
    if (!hasFfmpeg) {
      return { ok: false, status: 'failed', message: '未检测到 FFmpeg' };
    }

    const paths: string[] = [];
    for (const url of videoUrls) {
      const local = resolveMediaUrl(url);
      if (local && existsSync(local)) paths.push(local);
    }
    if (paths.length === 0) {
      return { ok: false, status: 'failed', message: '无可用视频片段' };
    }

    const stamp = Date.now();
    const listFile = join(PATHS.exports, `clips-${stamp}.txt`);
    const outName = `clips-${stamp}.mp4`;
    const outPath = join(PATHS.exports, outName);
    writeFileSync(
      listFile,
      paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
    );

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listFile,
        '-c',
        'copy',
        outPath,
      ]);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += String(d);
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.slice(-500) || `ffmpeg concat exit ${code}`));
      });
    });

    return {
      ok: true,
      status: 'done',
      url: `/media/exports/${outName}`,
      segmentCount: paths.length,
      title: title ?? '剪辑合成',
    };
  }

  private probeAudioDurationSec(audioPath: string): Promise<number> {
    return new Promise((resolve) => {
      const proc = spawn('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        audioPath,
      ]);
      let out = '';
      proc.stdout.on('data', (d) => {
        out += String(d);
      });
      proc.on('error', () => resolve(5));
      proc.on('close', () => {
        const n = parseFloat(out.trim());
        resolve(Number.isFinite(n) && n > 0 ? n : 5);
      });
    });
  }

  /**
   * 照片说话 / 轻量数字人：静态图 + TTS → 带 Ken Burns 的口播视频（小云雀思路，本地 FFmpeg）。
   */
  async createPhotoSpeak(body: {
    imageUrl: string;
    text: string;
    voice?: string;
    resolution?: string;
    referenceAudioUrl?: string;
    useLuxTts?: boolean;
    characterId?: string;
  }) {
    const hasFfmpeg = await this.checkFfmpeg();
    if (!hasFfmpeg) {
      return { ok: false, status: 'failed', message: '未检测到 FFmpeg' };
    }

    const imagePath = resolveMediaUrl(body.imageUrl);
    if (!imagePath || !existsSync(imagePath)) {
      return { ok: false, status: 'failed', message: '无法读取图片' };
    }

    const text = (body.text ?? '').trim();
    if (!text) return { ok: false, status: 'failed', message: '口播文本为空' };

    const tts = await this.gateway.proxyTts({
      input: text,
      voice: body.voice || 'alloy',
      referenceAudioUrl: body.referenceAudioUrl,
      useLuxTts: body.useLuxTts,
      luxTtsProfileId: body.characterId,
    });
    const audioPath = resolveMediaUrl(tts.url);
    if (!audioPath || !existsSync(audioPath)) {
      return { ok: false, status: 'failed', message: 'TTS 生成失败' };
    }

    const duration = await this.probeAudioDurationSec(audioPath);
    const stamp = Date.now();
    const outName = `photo-speak-${stamp}.mp4`;
    if (!existsSync(PATHS.videos)) mkdirSync(PATHS.videos, { recursive: true });
    const outPath = join(PATHS.videos, outName);
    const size = body.resolution || '1280:720';
    const fps = 25;
    const frames = Math.ceil(duration * fps);
    const vf = `scale=${size}:force_original_aspect_ratio=decrease,pad=${size}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0012,1.06)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${size}:fps=${fps}`;

    await new Promise<void>((resolve, reject) => {
      const args = [
        '-y',
        '-loop',
        '1',
        '-i',
        imagePath,
        '-i',
        audioPath,
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-tune',
        'stillimage',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-pix_fmt',
        'yuv420p',
        '-shortest',
        '-t',
        String(duration + 0.3),
        outPath,
      ];
      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += String(d);
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.slice(-600) || `ffmpeg exit ${code}`));
      });
    });

    return {
      ok: true,
      status: 'done',
      url: `/media/videos/${outName}`,
      audioUrl: tts.url,
      ttsProvider: tts.provider,
      ttsFallback: tts.fallback,
      durationSec: duration,
      message: '照片说话视频已生成',
    };
  }

  /** Mix multiple audio tracks (ducking-lite via amix). */
  async mixAudio(audioUrls: string[], opts?: { normalize?: boolean }) {
    const hasFfmpeg = await this.checkFfmpeg();
    if (!hasFfmpeg) {
      return { ok: false, status: 'failed', message: '未检测到 FFmpeg' };
    }
    const paths: string[] = [];
    for (const url of audioUrls) {
      const local = resolveMediaUrl(url);
      if (local && existsSync(local)) paths.push(local);
    }
    if (paths.length < 2) {
      return { ok: false, status: 'failed', message: '至少需要 2 条音频轨' };
    }

    const stamp = Date.now();
    const outName = `mix-${stamp}.mp3`;
    if (!existsSync(PATHS.exports)) mkdirSync(PATHS.exports, { recursive: true });
    const outPath = join(PATHS.exports, outName);
    const inputs = paths.flatMap((p) => ['-i', p]);
    const normalize = opts?.normalize !== false ? 1 : 0;
    const filter = `amix=inputs=${paths.length}:duration=longest:normalize=${normalize}`;

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', ['-y', ...inputs, '-filter_complex', filter, '-c:a', 'libmp3lame', '-b:a', '192k', outPath]);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += String(d);
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.slice(-600) || `ffmpeg amix exit ${code}`));
      });
    });

    return { ok: true, status: 'done', url: `/media/exports/${outName}`, trackCount: paths.length };
  }

  /** Apply brightness/contrast/saturation via FFmpeg (video) or sharp (image). */
  async colorGrade(body: {
    sourceUrl: string;
    brightness?: number;
    contrast?: number;
    saturation?: number;
  }) {
    const sourcePath = resolveMediaUrl(body.sourceUrl);
    if (!sourcePath || !existsSync(sourcePath)) {
      return { ok: false, status: 'failed', message: '无法读取源媒体' };
    }

    const brightness = body.brightness ?? 0;
    const contrast = body.contrast ?? 1;
    const saturation = body.saturation ?? 1;
    const stamp = Date.now();
    const isVideo = /\.(mp4|mov|webm|mkv)$/i.test(sourcePath);

    if (isVideo) {
      const hasFfmpeg = await this.checkFfmpeg();
      if (!hasFfmpeg) {
        return { ok: false, status: 'failed', message: '未检测到 FFmpeg' };
      }
      const outName = `grade-${stamp}.mp4`;
      const outPath = join(PATHS.exports, outName);
      const vf = `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`;
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', ['-y', '-i', sourcePath, '-vf', vf, '-c:a', 'copy', outPath]);
        let stderr = '';
        proc.stderr.on('data', (d) => {
          stderr += String(d);
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.slice(-600) || `ffmpeg eq exit ${code}`));
        });
      });
      return { ok: true, status: 'done', url: `/media/exports/${outName}`, mediaKind: 'clip' };
    }

    const outName = `grade-${stamp}.jpg`;
    const outPath = join(PATHS.exports, outName);
    const modBright = 1 + brightness * 0.5;
    await sharp(sourcePath)
      .modulate({
        brightness: modBright,
        saturation,
      })
      .linear(contrast, -(128 * (contrast - 1)))
      .jpeg({ quality: 92 })
      .toFile(outPath);
    return { ok: true, status: 'done', url: `/media/exports/${outName}`, mediaKind: 'picture' };
  }

  /** Probe media duration in seconds (audio/video). */
  async probeDuration(sourceUrl: string): Promise<{ ok: boolean; durationSec: number }> {
    const local = resolveMediaUrl(sourceUrl);
    if (!local || !existsSync(local)) return { ok: false, durationSec: 0 };
    const durationSec = await this.probeAudioDurationSec(local);
    return { ok: durationSec > 0, durationSec };
  }

  /** Luminance-derived depth + emboss normal maps for ControlNet-style workflows. */
  async generateDepthPass(body: { sourceUrl: string }) {
    const sourcePath = resolveMediaUrl(body.sourceUrl);
    if (!sourcePath || !existsSync(sourcePath)) {
      return { ok: false, status: 'failed', message: '无法读取源图像' };
    }

    const stamp = Date.now();
    if (!existsSync(PATHS.exports)) mkdirSync(PATHS.exports, { recursive: true });
    const depthName = `depth-${stamp}.png`;
    const normalName = `normal-${stamp}.png`;
    const depthPath = join(PATHS.exports, depthName);
    const normalPath = join(PATHS.exports, normalName);

    const pipeline = sharp(sourcePath).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true });

    await pipeline.clone().greyscale().normalize().png().toFile(depthPath);

    await pipeline
      .clone()
      .greyscale()
      .convolve({
        width: 3,
        height: 3,
        kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
      })
      .normalize()
      .png()
      .toFile(normalPath);

    return {
      ok: true,
      status: 'done',
      depthUrl: `/media/exports/${depthName}`,
      normalUrl: `/media/exports/${normalName}`,
      method: 'luminance-depth-emboss-normal',
    };
  }
}
