import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { buildTimelineFromShots, buildTimelineFromShotsV2, type TranscribeCue } from '@nx9/shared';
import { PATHS } from '../../config/app.config';
import { resolveMediaUrl } from '../../common/media-path';
import type { StoryboardShot } from '@nx9/shared';
import { GatewayService } from '../gateway/gateway.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class MontageService {
  private ffmpegAvailable: boolean | null = null;

  constructor(
    private readonly gateway: GatewayService,
    private readonly settings: SettingsService,
  ) {}

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
    lineArt = false,
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

    if (lineArt) {
      const watermarkSvg = Buffer.from(
        `<svg width="${canvasW}" height="48"><rect width="100%" height="100%" fill="rgba(0,0,0,0.6)"/><text x="${canvasW / 2}" y="32" font-family="sans-serif" font-size="22" fill="white" text-anchor="middle" font-weight="bold">LINE ART — 线稿分镜</text></svg>`,
      );
      composites.push({ input: watermarkSvg, left: 0, top: canvasH });
    }

    const finalH = lineArt ? canvasH + 48 : canvasH;

    const name = `contact-${Date.now()}.png`;
    const out = join(PATHS.exports, name);
    await sharp({
      create: { width: canvasW, height: finalH, channels: 3, background: '#FAFAF8' },
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
      const raw = body.subtitle.trim();
      const dur = body.durationSec ?? 4;
      if (/^\d+\n\d{2}:\d{2}:\d{2},\d{3} -->/.test(raw)) {
        writeFileSync(srtPath, raw + '\n');
      } else {
        const paragraphs = raw.split(/\n\s*\n/).filter(Boolean);
        if (paragraphs.length > 1) {
          const blockDur = dur / paragraphs.length;
          const lines = paragraphs.map((p, i) => {
            const start = i * blockDur;
            const end = (i + 1) * blockDur;
            const fmt = (s: number) => {
              const h = Math.floor(s / 3600);
              const m = Math.floor((s % 3600) / 60);
              const ss = Math.floor(s % 60);
              const ms = Math.round((s % 1) * 1000);
              return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
            };
            return `${i + 1}\n${fmt(start)} --> ${fmt(end)}\n${p}`;
          });
          writeFileSync(srtPath, lines.join('\n\n') + '\n');
        } else {
          writeFileSync(srtPath, `1\n00:00:00,000 --> 00:00:${String(dur).padStart(2, '0')},000\n${raw}\n`);
        }
      }
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

  validateReviewGate(shots: StoryboardShot[], gateMode?: string): { ok: boolean; pending: number[] } {
    const pending = gateMode === 'keyframe'
      ? shots.filter((s) => (s.keyframeStatus ?? 'draft') !== 'approved').map((s) => s.index)
      : shots.filter((s) => (s.videoStatus ?? 'draft') !== 'approved').map((s) => s.index);
    return { ok: pending.length === 0, pending };
  }

  exportTimeline(
    shots: StoryboardShot[],
    title?: string,
    transcribeCues?: { start: number; end: number; text: string }[],
  ) {
    const cuesInSec: TranscribeCue[] | undefined = transcribeCues?.map((c) => ({
      startSec: c.start / 1000,
      endSec: c.end / 1000,
      text: c.text,
    }));
    const result = buildTimelineFromShotsV2(shots, title, { transcribeCues: cuesInSec });
    const name = `timeline-${Date.now()}.json`;
    const out = join(PATHS.exports, name);
    writeFileSync(out, JSON.stringify(result, null, 2));
    return { ok: true, timeline: result, url: `/media/exports/${name}` };
  }

  async concatEpisode(
    shots: StoryboardShot[],
    opts?: { requireApproved?: boolean; title?: string; audioUrl?: string },
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
    const rawName = `episode-raw-${stamp}.mp4`;
    const rawPath = join(PATHS.exports, rawName);
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
        rawPath,
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

    const audioUrl = opts?.audioUrl?.trim();
    const audioLocal = audioUrl ? resolveMediaUrl(audioUrl) : null;
    const verticalVf =
      'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:(0,0,0),setsar=1';

    await new Promise<void>((resolve, reject) => {
      const args: string[] = ['-y', '-i', rawPath];
      if (audioLocal && existsSync(audioLocal)) {
        args.push('-i', audioLocal);
        args.push(
          '-filter_complex',
          `[0:v]${verticalVf}[v]`,
          '-map',
          '[v]',
          '-map',
          '1:a:0',
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-c:a',
          'aac',
          '-shortest',
        );
      } else {
        args.push('-vf', verticalVf, '-c:v', 'libx264', '-preset', 'fast', '-c:a', 'copy');
      }
      args.push(outPath);
      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += String(d);
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.slice(-500) || `ffmpeg episode exit ${code}`));
      });
    });

    return {
      ok: true,
      status: 'done',
      url: `/media/exports/${outName}`,
      segmentCount: segments.length,
      vertical: true,
      title: opts?.title ?? '整集导出',
    };
  }

  /** Concat arbitrary local /media video clips (canvas clip-editor). */
  async concatClips(videoUrls: string[], title?: string, transition?: string) {
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
    const outName = `clips-${stamp}.mp4`;
    const outPath = join(PATHS.exports, outName);

    if (transition && paths.length >= 2) {
      // 带转场的拼接：使用 xfade filter
      const xfadeMap: Record<string, string> = {
        dissolve: 'dissolve',
        fade: 'fade',
        wipe: 'wipeleft',
        'match-cut': 'fadeblack',
      };
      const xfade = xfadeMap[transition] ?? 'dissolve';
      const filterParts: string[] = [];
      for (let i = 0; i < paths.length; i++) {
        filterParts.push(`[${i}:v]`);
      }
      let filter = '';
      let prev = '';
      for (let i = 0; i < paths.length; i++) {
        if (i === 0) {
          prev = `v${i}`;
          filter = `[0:v]setpts=PTS-STARTPTS[v0];`;
        } else {
          filter += `[${i}:v]setpts=PTS-STARTPTS[v${i}];`;
        }
      }
      for (let i = 0; i < paths.length - 1; i++) {
        const next = `v${i + 1}`;
        filter += `[${prev}][${next}]xfade=transition=${xfade}:duration=0.5:offset=0[vout${i}];`;
        prev = `vout${i}`;
      }
      filter = filter.replace(/;vout\d\]$/, ']');

      const inputs: string[] = [];
      for (const p of paths) {
        inputs.push('-i', p);
      }

      await new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', [
          '-y',
          ...inputs,
          '-filter_complex', filter,
          '-map', `[${prev}]`,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '22',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          outPath,
        ]);
        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += String(d); });
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.slice(-500) || `ffmpeg xfade exit ${code}`));
        });
      });
    } else {
      const listFile = join(PATHS.exports, `clips-${stamp}.txt`);
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
        proc.stderr.on('data', (d) => { stderr += String(d); });
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.slice(-500) || `ffmpeg concat exit ${code}`));
        });
      });
    }

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
    let failedCount = 0;
    for (const url of audioUrls) {
      const local = resolveMediaUrl(url);
      if (local && existsSync(local)) paths.push(local);
      else failedCount++;
    }
    if (paths.length < 2) {
      return { ok: false, status: 'failed', message: `至少需要 2 条音频轨（${failedCount} 条不可用）` };
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

    return { ok: true, status: 'done', url: `/media/exports/${outName}`, trackCount: paths.length, failedTracks: failedCount };
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

  async transcribeAudio(
    sourceUrl: string,
    language?: string,
  ): Promise<{ ok: boolean; srtContent: string; cues: { start: number; end: number; text: string }[] }> {
    const local = resolveMediaUrl(sourceUrl);
    if (!local || !existsSync(local)) {
      throw new ServiceUnavailableException('无法读取音频/视频文件');
    }
    const apiKey = this.settings.getRaw().primaryApiKey || '';
    if (!apiKey) throw new ServiceUnavailableException('API key 未配置');

    const form = new FormData();
    const blob = new Blob([readFileSync(local)], { type: 'audio/mpeg' }) as Blob & { name?: string };
    blob.name = 'audio.mp3';
    form.append('file', blob as unknown as Blob);
    form.append('model', 'whisper-1');
    form.append('response_format', 'srt');
    if (language) form.append('language', language);

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(`Whisper 转写失败: ${text.slice(0, 200)}`);
    }
    const srtContent = await res.text();

    const cues: { start: number; end: number; text: string }[] = [];
    const blockRegex = /(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n([\s\S]*?)(?=\n\n|\n*$)/g;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(srtContent)) !== null) {
      cues.push({
        start: srtToMs(match[2]),
        end: srtToMs(match[3]),
        text: match[4].trim(),
      });
    }

    return { ok: true, srtContent, cues };
  }
}

function srtToMs(timestamp: string): number {
  const [h, m, s] = timestamp.split(':');
  const [sec, ms] = s!.split(',');
  return Number(h) * 3600000 + Number(m) * 60000 + Number(sec) * 1000 + Number(ms);
}
