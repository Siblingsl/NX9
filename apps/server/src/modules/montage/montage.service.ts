import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { buildTimelineFromShots, buildTimelineFromShotsV2, type TranscribeCue } from '@nx9/shared';
import { PATHS } from '../../config/app.config';
import { resolveMediaUrl } from '../../common/media-path';
import type { StoryboardShot } from '@nx9/shared';
import { detectBeats } from './beat-detection';
import {
  buildAudioDenoiseArgs,
  buildAudioDenoiseFilter,
  buildAudioDenoiseOutputName,
  normalizeAudioDenoiseParams,
} from './audio-denoise';
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
    const count = shots.length;
    if (count === 0) {
      return { ok: false, message: '联系表镜头为空，禁止空成功', shotCount: 0 };
    }
    const cellW = 320;
    const cellH = 200;
    const labelH = 36;
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

    if (!existsSync(out)) {
      return { ok: false, message: '联系表产物未写出，禁止空成功', shotCount: count };
    }

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
        message: '未检测到 FFmpeg，请安装后重试（https://ffmpeg.org），禁止空成功',
      };
    }

    const videoPath = resolveMediaUrl(body.videoUrl);
    if (!videoPath) throw new Error(`无法解析视频，禁止空成功: ${body.videoUrl}`);

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

    if (!existsSync(outPath)) {
      return { ok: false, status: 'failed', message: '单镜渲染产物未写出，禁止空成功' };
    }

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
        message: '未检测到 FFmpeg，无法整集合成，禁止空成功',
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
      return { ok: false, status: 'failed', message: '无可用视频片段，请先生成各镜头视频，禁止空成功' };
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

    if (!existsSync(outPath)) {
      return { ok: false, status: 'failed', message: '整集合成产物未写出，禁止空成功' };
    }

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
      return { ok: false, status: 'failed', message: '未检测到 FFmpeg，禁止空成功' };
    }

    const paths: string[] = [];
    for (const url of videoUrls) {
      const local = resolveMediaUrl(url);
      if (local && existsSync(local)) paths.push(local);
    }
    if (paths.length === 0) {
      return { ok: false, status: 'failed', message: '无可用视频片段，禁止空成功' };
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

    if (!existsSync(outPath)) {
      return { ok: false, status: 'failed', message: '剪辑合成产物未写出，禁止空成功' };
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
      return { ok: false, status: 'failed', message: '未检测到 FFmpeg，禁止空成功' };
    }

    const imagePath = resolveMediaUrl(body.imageUrl);
    if (!imagePath || !existsSync(imagePath)) {
      return { ok: false, status: 'failed', message: '无法读取图片，禁止空成功' };
    }

    const text = (body.text ?? '').trim();
    if (!text) return { ok: false, status: 'failed', message: '口播文本为空，禁止空成功' };

    const tts = await this.gateway.proxyTts({
      input: text,
      voice: body.voice || 'alloy',
      referenceAudioUrl: body.referenceAudioUrl,
      useLuxTts: body.useLuxTts,
      luxTtsProfileId: body.characterId,
    });
    if (!tts?.ok || !tts.url) {
      return { ok: false, status: 'failed', message: 'TTS 未返回音频，禁止空成功' };
    }
    const audioPath = resolveMediaUrl(tts.url);
    if (!audioPath || !existsSync(audioPath)) {
      return { ok: false, status: 'failed', message: 'TTS 音频文件未写出，禁止空成功' };
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

    if (!existsSync(outPath)) {
      return { ok: false, status: 'failed', message: '照片说话成片未写出，禁止空成功' };
    }

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
      return { ok: false, status: 'failed', message: '未检测到 FFmpeg，禁止空成功' };
    }
    const paths: string[] = [];
    let failedCount = 0;
    for (const url of audioUrls) {
      const local = resolveMediaUrl(url);
      if (local && existsSync(local)) paths.push(local);
      else failedCount++;
    }
    if (paths.length < 2) {
      return { ok: false, status: 'failed', message: `至少需要 2 条音频轨（${failedCount} 条不可用），禁止空成功` };
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

    if (!existsSync(outPath)) {
      return { ok: false, status: 'failed', message: '混音产物未写出，禁止空成功' };
    }

    return { ok: true, status: 'done', url: `/media/exports/${outName}`, trackCount: paths.length, failedTracks: failedCount };
  }

  /** Apply brightness/contrast/saturation via FFmpeg (video) or sharp (image). */
  async colorGrade(body: {    sourceUrl: string;
    brightness?: number;
    contrast?: number;
    saturation?: number;
  }) {
    const sourcePath = resolveMediaUrl(body.sourceUrl);
    if (!sourcePath || !existsSync(sourcePath)) {
      return { ok: false, status: 'failed', message: '无法读取源媒体，禁止空成功' };
    }

    const brightness = body.brightness ?? 0;
    const contrast = body.contrast ?? 1;
    const saturation = body.saturation ?? 1;
    const stamp = Date.now();
    const isVideo = /\.(mp4|mov|webm|mkv)$/i.test(sourcePath);

    if (isVideo) {
      const hasFfmpeg = await this.checkFfmpeg();
      if (!hasFfmpeg) {
        return { ok: false, status: 'failed', message: '未检测到 FFmpeg，禁止空成功' };
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
      if (!existsSync(outPath)) {
        return { ok: false, status: 'failed', message: '调色产物未写出，禁止空成功' };
      }
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
    if (!existsSync(outPath)) {
      return { ok: false, status: 'failed', message: '调色产物未写出，禁止空成功' };
    }
    return { ok: true, status: 'done', url: `/media/exports/${outName}`, mediaKind: 'picture' };
  }

  /**
   * 变速保音调：视频 setpts 变速 + 音频 atempo 时间伸缩（音调不变）。
   * speed 范围 0.25–4；atempo 单段仅支持 0.5–2，超出自动串联多段。
   */
  async speedPitch(body: { sourceUrl: string; speed?: number }) {
    const sourcePath = resolveMediaUrl(body.sourceUrl);
    if (!sourcePath || !existsSync(sourcePath)) {
      return { ok: false, status: 'failed', message: '无法读取源媒体，禁止空成功' };
    }
    const speed = Math.max(0.25, Math.min(4, body.speed ?? 1));
    if (Math.abs(speed - 1) < 1e-6) {
      return { ok: true, status: 'done', url: body.sourceUrl, speed, unchanged: true };
    }
    const hasFfmpeg = await this.checkFfmpeg();
    if (!hasFfmpeg) {
      return { ok: false, status: 'failed', message: '未检测到 FFmpeg，禁止空成功' };
    }
    const stamp = Date.now();
    const outName = `speed-${stamp}.mp4`;
    const outPath = join(PATHS.exports, outName);
    const atempos: string[] = [];
    let remain = speed;
    while (Math.abs(remain - 1) > 1e-6) {
      if (remain > 1) {
        atempos.push('atempo=2');
        remain /= 2;
      } else {
        atempos.push('atempo=0.5');
        remain /= 0.5;
      }
    }
    const af = atempos.length > 0 ? atempos.join(',') : null;
    const args = [
      '-y',
      '-i', sourcePath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-vf', `setpts=PTS/${speed}`,
      ...(af ? ['-af', af] : []),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '20',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outPath,
    ];
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', args);
        let stderr = '';
        proc.stderr.on('data', (d) => {
          stderr += String(d);
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.slice(-600) || `ffmpeg speed exit ${code}`));
        });
      });
      if (!existsSync(outPath)) {
        return { ok: false, status: 'failed', message: '变速产物未写出，禁止空成功' };
      }
      return { ok: true, status: 'done', url: `/media/exports/${outName}`, speed };
    } catch (e) {
      return {
        ok: false,
        status: 'failed',
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * 音频降噪：afftdn（快，默认）/ anlmdn（慢，更平滑）。
   * 滤镜与强度映射见 audio-denoise.ts（纯函数层，已单测）；失败禁止空成功。
   */
  async audioDenoise(body: { audioUrl: string; strength?: number; mode?: 'afftdn' | 'anlmdn' }) {
    const sourcePath = resolveMediaUrl(body.audioUrl);
    if (!sourcePath || !existsSync(sourcePath)) {
      return { ok: false, status: 'failed', message: '无法读取源音频，禁止空成功' };
    }
    const params = normalizeAudioDenoiseParams(body);
    const hasFfmpeg = await this.checkFfmpeg();
    if (!hasFfmpeg) {
      return { ok: false, status: 'failed', message: '未检测到 FFmpeg，禁止空成功' };
    }
    const outName = buildAudioDenoiseOutputName(Date.now(), params.mode);
    const outPath = join(PATHS.exports, outName);
    const args = buildAudioDenoiseArgs(sourcePath, outPath, params.mode, params.strength);
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', args);
        let stderr = '';
        proc.stderr.on('data', (d) => {
          stderr += String(d);
        });
        proc.on('error', reject);
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.slice(-600) || `ffmpeg denoise exit ${code}`));
        });
      });
      if (!existsSync(outPath)) {
        return { ok: false, status: 'failed', message: '降噪产物未写出，禁止空成功' };
      }
      return {
        ok: true,
        status: 'done',
        url: `/media/exports/${outName}`,
        mode: params.mode,
        strength: params.strength,
        filter: buildAudioDenoiseFilter(params.mode, params.strength),
      };
    } catch (e) {
      return {
        ok: false,
        status: 'failed',
        message: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /** Probe media duration in seconds (audio/video). */
  async probeDuration(sourceUrl: string): Promise<{ ok: boolean; durationSec: number }> {
    const local = resolveMediaUrl(sourceUrl);
    if (!local || !existsSync(local)) return { ok: false, durationSec: 0 };
    const durationSec = await this.probeAudioDurationSec(local);
    return { ok: durationSec > 0, durationSec };
  }

  /**
   * AI 深度编排：LLM 理解每个镜头的内容描述/台词/状态，
   * 输出镜头播放顺序与每镜时长（起承转合结构）。
   * 任何解析/校验失败返回 ok:false，调用方回退规则编排（不做静默降级伪装）。
   */
  async aiArrange(body: {
    shots: Array<{
      id: string;
      index: number;
      durationSec?: number;
      descriptionZh?: string;
      subtitleText?: string | null;
      status?: string;
    }>;
    targetDurationSec?: number;
  }): Promise<{
    ok: boolean;
    order?: string[];
    durations?: Record<string, number>;
    title?: string;
    notes?: string[];
    message?: string;
  }> {
    const shots = (body.shots ?? []).filter((s) => s && typeof s.id === 'string');
    if (shots.length < 2) {
      return { ok: false, message: '镜头不足（至少 2 镜），禁止空成功' };
    }
    const target = Math.max(10, Math.min(600, body.targetDurationSec ?? 60));
    const shotList = shots
      .map(
        (s, i) =>
          `#${s.index ?? i + 1} ${s.id}：${(s.descriptionZh ?? '').slice(0, 120)}${
            s.subtitleText ? `｜台词：${s.subtitleText.slice(0, 80)}` : ''
          }${s.status ? `（状态：${s.status}）` : ''}${s.durationSec ? `，原时长 ${s.durationSec}s` : ''}`,
      )
      .join('\n');

    const system = `你是专业短视频剪辑导演。根据镜头清单做「AI 自动剪辑」决策：安排镜头播放顺序并分配每镜时长，形成有起承转合的成片。
规则：
1) 所有镜头必须出现且只出现一次（order 用镜头 id 表示）；
2) 单镜时长 1–20 秒；
3) 总时长尽量接近 ${target} 秒；
4) 开场用最有吸引力的镜头，高潮镜头给足时长，结尾干脆；
5) 依据镜头描述与台词判断内容重要性，而不是按编号顺序。
只输出 JSON，不要任何其他文字，格式：
{"order":["镜头id按播放顺序"],"durations":{"镜头id":秒数},"title":"成片标题(≤20字)","notes":["1-3条剪辑思路"]}`;

    try {
      const res = (await this.gateway.proxyLlm({
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `镜头清单：\n${shotList}` },
        ],
      })) as { choices?: { message?: { content?: string } }[] };
      const content = res.choices?.[0]?.message?.content ?? '';
      const parsed = extractJsonFromLlm(content);
      if (!parsed) return { ok: false, message: 'LLM 未返回可解析的 JSON，禁止空成功' };

      const order = Array.isArray(parsed.order)
        ? parsed.order.filter((x): x is string => typeof x === 'string')
        : [];
      const idSet = new Set(shots.map((s) => s.id));
      const validOrder = order.filter((id) => idSet.has(id));
      const missing = shots.filter((s) => !validOrder.includes(s.id)).map((s) => s.id);
      const dupes = validOrder.length - new Set(validOrder).size;
      if (missing.length > 0 || dupes > 0) {
        return { ok: false, message: `LLM 顺序非法（缺 ${missing.length} 镜 / 重复 ${dupes}），禁止空成功` };
      }
      const rawDurs =
        typeof parsed.durations === 'object' && parsed.durations !== null
          ? (parsed.durations as Record<string, unknown>)
          : {};
      const durations: Record<string, number> = {};
      for (const id of validOrder) {
        const v = Number(rawDurs[id]);
        const d = Number.isFinite(v)
          ? Math.max(1, Math.min(20, Math.round(v * 10) / 10))
          : Math.max(1, Math.min(20, Math.round((target / validOrder.length) * 10) / 10));
        durations[id] = d;
      }
      const notes = Array.isArray(parsed.notes)
        ? parsed.notes.filter((n): n is string => typeof n === 'string').slice(0, 3)
        : [];
      return {
        ok: true,
        order: validOrder,
        durations,
        title: typeof parsed.title === 'string' ? parsed.title.slice(0, 30) : undefined,
        notes,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * 音频节拍分析（真·听感）：FFmpeg 解码为单声道 8k f32le PCM，
   * 能量 onset 检测输出节拍点与 BPM，供时间线踩点对齐与 beat-cut 建议使用。
   */
  async beatAnalyze(body: { audioUrl: string }): Promise<{
    ok: boolean;
    beats?: number[];
    tempo?: number;
    message?: string;
  }> {
    const local = resolveMediaUrl(body.audioUrl);
    if (!local || !existsSync(local)) {
      return { ok: false, message: '无法读取音频文件，禁止空成功' };
    }
    const hasFfmpeg = await this.checkFfmpeg();
    if (!hasFfmpeg) {
      return { ok: false, message: '未检测到 FFmpeg，禁止空成功' };
    }
    const chunks: Buffer[] = [];
    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn('ffmpeg', [
        '-v', 'error',
        '-i', local,
        '-ac', '1',
        '-ar', '8000',
        '-t', '600',
        '-f', 'f32le',
        'pipe:1',
      ]);
      proc.stdout.on('data', (d) => chunks.push(d as Buffer));
      proc.stderr.on('data', () => {
        /* 忽略 ffmpeg 日志 */
      });
      proc.on('error', () => resolve(-1));
      proc.on('close', (code) => resolve(code ?? -1));
    });
    if (exitCode !== 0 || chunks.length === 0) {
      return { ok: false, message: `音频解码失败（ffmpeg exit ${exitCode}），禁止空成功` };
    }
    const pcm = Buffer.concat(chunks);
    const samples = new Float32Array(
      pcm.buffer,
      pcm.byteOffset,
      Math.floor(pcm.byteLength / 4),
    );
    const result = detectBeats(samples, 8000);
    if (result.beats.length === 0) {
      return { ok: false, message: result.message ?? '未检测到节拍，禁止空成功' };
    }
    return {
      ok: true,
      beats: result.beats,
      ...(result.tempo ? { tempo: result.tempo } : {}),
    };
  }

  /** Luminance-derived depth + emboss normal maps for ControlNet-style workflows. */
  async generateDepthPass(body: { sourceUrl: string }) {
    const sourcePath = resolveMediaUrl(body.sourceUrl);
    if (!sourcePath || !existsSync(sourcePath)) {
      return { ok: false, status: 'failed', message: '无法读取源图像，禁止空成功' };
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

    if (!existsSync(depthPath) || !existsSync(normalPath)) {
      return { ok: false, status: 'failed', message: '深度通道产物未写出，禁止空成功' };
    }

    return {
      ok: true,
      status: 'done',
      depthUrl: `/media/exports/${depthName}`,
      normalUrl: `/media/exports/${normalName}`,
      method: 'luminance-depth-emboss-normal',
    };
  }

  /**
   * 源动作视频 → 灰度深度视频（动作锁）。
   * 可复用 API：本版由参考板深度槽调用；日后 depth-video 节点须共用。
   */
  async convertDepthVideo(body: {
    sourceUrl: string;
    maxDurationSec?: number;
  }): Promise<{
    ok: boolean;
    status: 'done' | 'failed';
    depthVideoUrl?: string;
    sourceUrl?: string;
    message?: string;
    method?: string;
    meta?: {
      durationSec: number;
      maxDurationSec: number;
      truncated: boolean;
    };
  }> {
    const maxDurationSec = Math.min(Math.max(Number(body.maxDurationSec) || 60, 1), 60);
    const sourcePath = resolveMediaUrl(body.sourceUrl);
    if (!sourcePath || !existsSync(sourcePath)) {
      return { ok: false, status: 'failed', message: '无法读取源视频，禁止空成功' };
    }

    const hasFfmpeg = await this.checkFfmpeg();
    if (!hasFfmpeg) {
      return {
        ok: false,
        status: 'failed',
        message: '未检测到 FFmpeg，无法转换深度视频。请安装 FFmpeg 后重试，禁止空成功',
      };
    }

    const probed = await this.probeDuration(body.sourceUrl);
    const durationSec = probed.ok ? probed.durationSec : 0;
    if (durationSec > 0 && durationSec > maxDurationSec + 0.5) {
      // 仍允许转换，但截断到上限并告知
    }

    if (!existsSync(PATHS.exports)) mkdirSync(PATHS.exports, { recursive: true });
    const stamp = Date.now();
    const outName = `depth-video-${stamp}.mp4`;
    const outPath = join(PATHS.exports, outName);

    try {
      await this.runDepthVideoFfmpeg(sourcePath, outPath, maxDurationSec);
    } catch (e) {
      return {
        ok: false,
        status: 'failed',
        message: `深度视频转换失败：${String(e).slice(0, 240)}`,
      };
    }

    if (!existsSync(outPath)) {
      return {
        ok: false,
        status: 'failed',
        message: '深度视频产物未写出，禁止空成功',
      };
    }

    const truncated = durationSec > maxDurationSec;
    return {
      ok: true,
      status: 'done',
      depthVideoUrl: `/media/exports/${outName}`,
      sourceUrl: body.sourceUrl,
      method: 'ffmpeg-luma-depth',
      meta: {
        durationSec: truncated ? maxDurationSec : durationSec || maxDurationSec,
        maxDurationSec,
        truncated,
      },
      message: truncated
        ? `已截断至 ${maxDurationSec}s（源片约 ${Math.round(durationSec)}s）`
        : undefined,
    };
  }

  private runDepthVideoFfmpeg(
    sourcePath: string,
    outPath: string,
    maxDurationSec: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // 灰度 + 对比度提升，近似「深度/轮廓」动作控制片；去音频
      const vf = 'format=gray,eq=contrast=1.35:brightness=0.02,hqdn3d=1.5:1.5:3:3';
      const args = [
        '-y',
        '-i',
        sourcePath,
        '-t',
        String(maxDurationSec),
        '-vf',
        vf,
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
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
        else reject(new Error(stderr.slice(-500) || `ffmpeg depth exit ${code}`));
      });
    });
  }

  async transcribeAudio(
    sourceUrl: string,
    language?: string,
  ): Promise<{ ok: boolean; srtContent: string; cues: { start: number; end: number; text: string }[] }> {
    const local = resolveMediaUrl(sourceUrl);
    if (!local || !existsSync(local)) {
      throw new ServiceUnavailableException('无法读取音频/视频文件，禁止空成功');
    }
    const apiKey = this.settings.getRaw().primaryApiKey || '';
    if (!apiKey) throw new ServiceUnavailableException('API key 未配置，禁止空成功');

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
      throw new ServiceUnavailableException(`Whisper 转写失败: ${text.slice(0, 200)}，禁止空成功`);
    }
    const srtContent = await res.text();
    if (!String(srtContent ?? '').trim()) {
      throw new ServiceUnavailableException('语音转字幕结果为空，禁止空成功');
    }

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

/** 从 LLM 输出中稳健提取 JSON 对象（剥离代码围栏；失败再尝试截取首个 {…}） */
function extractJsonFromLlm(text: string): Record<string, unknown> | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : t;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}
