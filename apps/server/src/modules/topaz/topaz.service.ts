import { Injectable } from '@nestjs/common';
import { spawn, spawnSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
} from 'fs';
import { join, basename, resolve } from 'path';
import { PATHS } from '../../config/app.config';
import { resolveMediaUrl } from '../../common/media-path';
import { AssetsService } from '../assets/assets.service';

const DEFAULT_GIGAPIXEL_EXE =
  process.platform === 'win32'
    ? 'C:\\Program Files\\Topaz Labs LLC\\Topaz Gigapixel AI\\gigapixel.exe'
    : 'gigapixel';
const DEFAULT_TOPAZ_VIDEO_DIR =
  process.platform === 'win32' ? 'C:\\Program Files\\Topaz Labs LLC\\Topaz Video AI' : '';

const GIGAPIXEL_MODEL: Record<string, string> = {
  Standard: 'std',
  'High Fidelity': 'fidelity',
  'Low Resolution': 'lowres',
  Recover: 'recovery',
  std: 'std',
  fidelity: 'fidelity',
  lowres: 'lowres',
  recovery: 'recovery',
};

const TOPAZ_UPSCALE = ['iris-3', 'nyx-3', 'prob-4', 'aaa-9', 'thm-2'];
const TOPAZ_FI = ['apo-8', 'chr-2', 'chf-3'];
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.bmp']);

function fileExists(p: string) {
  try {
    return Boolean(p && existsSync(p) && statSync(p).isFile());
  } catch {
    return false;
  }
}

function findCommand(cmd: string) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(finder, [cmd], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return '';
  return (
    String(r.stdout || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? ''
  );
}

function topazVideoFfmpegFrom(value: string) {
  const text = value.trim();
  if (!text) return '';
  const normalized = resolve(text);
  const base = basename(normalized).toLowerCase();
  if (base === 'ffmpeg.exe' || base === 'ffmpeg') return normalized;
  return join(normalized, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
}

@Injectable()
export class TopazService {
  constructor(private readonly assets: AssetsService) {}

  detectStatus(opts?: {
    gigapixelPath?: string;
    topazVideoPath?: string;
  }) {
    const gigapixelCandidates = [
      opts?.gigapixelPath,
      process.env.NX9_TOPAZ_GIGAPIXEL_EXE,
      DEFAULT_GIGAPIXEL_EXE,
    ].filter(Boolean) as string[];
    let gigapixelPath = '';
    for (const p of gigapixelCandidates) {
      if (fileExists(p)) {
        gigapixelPath = resolve(p);
        break;
      }
    }
    if (!gigapixelPath) gigapixelPath = findCommand('gigapixel');

    const videoCandidates = [
      opts?.topazVideoPath,
      process.env.NX9_TOPAZ_VIDEO_FFMPEG,
      process.env.NX9_TOPAZ_VIDEO_DIR,
      DEFAULT_TOPAZ_VIDEO_DIR,
    ].filter(Boolean) as string[];
    let ffmpegPath = '';
    for (const p of videoCandidates) {
      const ff = topazVideoFfmpegFrom(p);
      if (fileExists(ff)) {
        ffmpegPath = ff;
        break;
      }
    }

    return {
      ok: true,
      gigapixel: {
        installed: Boolean(gigapixelPath),
        executablePath: gigapixelPath,
        defaultPath: DEFAULT_GIGAPIXEL_EXE,
      },
      video: {
        installed: Boolean(ffmpegPath),
        ffmpegPath,
        defaultDir: DEFAULT_TOPAZ_VIDEO_DIR,
        modelEnvReady: Boolean(
          process.env.TVAI_MODEL_DATA_DIR &&
            process.env.TVAI_MODEL_DIR &&
            existsSync(process.env.TVAI_MODEL_DATA_DIR) &&
            existsSync(process.env.TVAI_MODEL_DIR),
        ),
      },
    };
  }

  private runProcess(command: string, args: string[], timeoutMs = 3_600_000) {
    return new Promise<{ code: number; stderr: string }>((resolve, reject) => {
      let stderr = '';
      const child = spawn(command, args, { windowsHide: true });
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, timeoutMs);
      child.stderr.on('data', (c) => {
        stderr += String(c);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? 1, stderr });
      });
    });
  }

  private walkImages(dir: string, out: { path: string; mtimeMs: number; size: number }[] = []) {
    if (!existsSync(dir)) return out;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) this.walkImages(full, out);
      else if (IMAGE_EXTS.has(name.slice(name.lastIndexOf('.')).toLowerCase())) {
        out.push({ path: full, mtimeMs: st.mtimeMs, size: st.size });
      }
    }
    return out;
  }

  async runGigapixel(body: {
    sourceUrl: string;
    scale?: number;
    model?: string;
    executablePath?: string;
  }) {
    const local = resolveMediaUrl(body.sourceUrl);
    if (!local || !existsSync(local)) throw new Error('无法读取输入图像');

    const status = this.detectStatus({ gigapixelPath: body.executablePath });
    const exe = body.executablePath || status.gigapixel.executablePath;
    if (!exe) {
      throw new Error(`未检测到 Gigapixel AI，请安装后填写路径：${DEFAULT_GIGAPIXEL_EXE}`);
    }

    const outDir = join(PATHS.images, `topaz-gigapixel-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    const model = GIGAPIXEL_MODEL[body.model ?? 'std'] ?? 'std';
    const scale = Math.min(16, Math.max(1, body.scale ?? 2));
    const args = ['--scale', String(scale), '-i', local, '-o', outDir, '--model', model];

    const result = await this.runProcess(exe, args);
    if (result.code !== 0) {
      throw new Error(`Gigapixel 执行失败：${result.stderr.slice(-400)}`);
    }

    const files = this.walkImages(outDir).sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (files.length === 0) throw new Error('Gigapixel 未产生输出文件');

    const name = `topaz-${Date.now()}${basename(files[0].path).slice(files[0].path.lastIndexOf('.'))}`;
    const dest = join(PATHS.images, name);
    copyFileSync(files[0].path, dest);

    return {
      ok: true,
      url: this.assets.publicUrl('images', name),
      scale,
      model,
      command: `${exe} ${args.join(' ')}`,
    };
  }

  async runTopazVideo(body: {
    sourceUrl: string;
    upscaleModel?: string;
    upscaleFactor?: number;
    enableInterpolation?: boolean;
    interpolationModel?: string;
    inputFps?: number;
    topazVideoPath?: string;
    useGpu?: boolean;
  }) {
    const local = resolveMediaUrl(body.sourceUrl);
    if (!local || !existsSync(local)) throw new Error('无法读取输入视频');

    const status = this.detectStatus({ topazVideoPath: body.topazVideoPath });
    const ffmpeg = body.topazVideoPath
      ? topazVideoFfmpegFrom(body.topazVideoPath)
      : status.video.ffmpegPath;
    if (!ffmpeg) {
      throw new Error(`未检测到 Topaz Video AI 自带 ffmpeg：${DEFAULT_TOPAZ_VIDEO_DIR}`);
    }

    const upscaleModel = TOPAZ_UPSCALE.includes(body.upscaleModel ?? '') ? body.upscaleModel! : 'iris-3';
    const factor = upscaleModel === 'thm-2' ? 1 : Math.min(4, Math.max(1, body.upscaleFactor ?? 2));
    const filters = [
      `tvai_up=model=${upscaleModel}:scale=${factor}:estimate=8:compression=1:blend=0`,
    ];
    if (body.enableInterpolation) {
      const fiModel = TOPAZ_FI.includes(body.interpolationModel ?? '') ? body.interpolationModel! : 'apo-8';
      const fps = Math.round((body.inputFps ?? 24) * 2);
      filters.push(`tvai_fi=model=${fiModel}:fps=${fps}`);
    }

    const outName = `topaz-video-${Date.now()}.mp4`;
    const outPath = join(PATHS.videos, outName);
    if (!existsSync(PATHS.videos)) mkdirSync(PATHS.videos, { recursive: true });

    const args = [
      '-y',
      '-hide_banner',
      '-hwaccel',
      'auto',
      '-i',
      local,
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-vf',
      filters.join(','),
      '-c:v',
      body.useGpu === false ? 'mpeg4' : 'hevc_nvenc',
      '-c:a',
      'copy',
      outPath,
    ];

    let result = await this.runProcess(ffmpeg, args);
    if (result.code !== 0 && body.useGpu !== false && /nvenc|nvcuda/i.test(result.stderr)) {
      args[args.indexOf('hevc_nvenc')] = 'mpeg4';
      result = await this.runProcess(ffmpeg, args);
    }
    if (result.code !== 0) {
      throw new Error(`Topaz Video 执行失败：${result.stderr.slice(-500)}`);
    }

    return {
      ok: true,
      url: `/media/videos/${outName}`,
      filterChain: filters.join(','),
      ffmpegPath: ffmpeg,
    };
  }
}
