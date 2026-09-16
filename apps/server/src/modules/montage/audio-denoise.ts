/**
 * 音频降噪（audio-denoise）· 纯函数层
 *
 * 只负责「参数 → ffmpeg 滤镜 / 命令行」的可测构造，不执行进程；
 * 执行（spawn ffmpeg / 写出产物）在 montage.service，与 mix-audio / speed-pitch 同口径。
 *
 * 滤镜与强度的映射是**经验映射**（非厂商规格），已在文档 NX9-AUDIO-DENOISE.md 说明：
 * - afftdn（快，默认）：nr（降噪量 dB，12–97）随强度上升；nf（噪声底 dB，-20 ~ -80）随强度下沉
 * - anlmdn（慢、更平滑）：s（降噪强度，0.5–2.0）随强度上升
 *
 * 本模块零依赖（不 import 任何模块），可在共享包 barrel 缺陷存在时独立单测。
 */

export type AudioDenoiseMode = 'afftdn' | 'anlmdn';

export const AUDIO_DENOISE_MODES: readonly AudioDenoiseMode[] = ['afftdn', 'anlmdn'] as const;

export const AUDIO_DENOISE_MIN_STRENGTH = 0;
export const AUDIO_DENOISE_MAX_STRENGTH = 1;
export const AUDIO_DENOISE_DEFAULT_STRENGTH = 0.6;

/** afftdn 的 nr（降噪量，dB）：ffmpeg 允许 0.01–97，这里取 12 起步避免几乎无效的弱降噪 */
export const AUDIO_DENOISE_AFFTdn_NR_MIN = 12;
export const AUDIO_DENOISE_AFFTdn_NR_MAX = 97;
/** afftdn 的 nf（噪声底，dB）：ffmpeg 允许 -80 ~ -20；强度越高噪声底越低 */
export const AUDIO_DENOISE_AFFTdn_NF_MAX = -20;
export const AUDIO_DENOISE_AFFTdn_NF_MIN = -80;
/** anlmdn 的 s（降噪强度）：0.5 起步避免几乎无效 */
export const AUDIO_DENOISE_ANLMDN_S_MIN = 0.5;
export const AUDIO_DENOISE_ANLMDN_S_MAX = 2;

export interface AudioDenoiseParams {
  mode: AudioDenoiseMode;
  strength: number;
  /** 归一化后的合法性说明（供 UI 与日志展示） */
  noteZh?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 归一化强度：接受 0–1；越界截断；非数值（NaN/Infinity/字符串数字以外的垃圾）回落默认值。
 * 字符串数字（如 "0.7"）会被接受——UI 下拉/滑杆可能以字符串提交。
 */
export function normalizeDenoiseStrength(raw: unknown): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return AUDIO_DENOISE_DEFAULT_STRENGTH;
    return clamp(raw, AUDIO_DENOISE_MIN_STRENGTH, AUDIO_DENOISE_MAX_STRENGTH);
  }
  if (typeof raw === 'string') {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed)) {
      return clamp(parsed, AUDIO_DENOISE_MIN_STRENGTH, AUDIO_DENOISE_MAX_STRENGTH);
    }
  }
  return AUDIO_DENOISE_DEFAULT_STRENGTH;
}

/** 归一化降噪模式：非法值回落 afftdn（快、默认）。 */
export function normalizeDenoiseMode(raw: unknown): AudioDenoiseMode {
  return raw === 'anlmdn' ? 'anlmdn' : 'afftdn';
}

export function normalizeAudioDenoiseParams(
  raw: { mode?: unknown; strength?: unknown } | undefined | null,
): AudioDenoiseParams {
  const mode = normalizeDenoiseMode(raw?.mode);
  const strength = round2(normalizeDenoiseStrength(raw?.strength));
  return { mode, strength };
}

/**
 * 构造滤镜串。
 * - afftdn: `afftdn=nr=<nr>:nf=<nf>`
 * - anlmdn: `anlmdn=s=<s>`
 * 空输入/非法值一律回落默认参数，不抛异常。
 */
export function buildAudioDenoiseFilter(
  mode: AudioDenoiseMode | string | undefined | null,
  strength: number | string | undefined | null,
): string {
  const m = normalizeDenoiseMode(mode);
  const s = normalizeDenoiseStrength(strength);
  if (m === 'anlmdn') {
    const sv = round2(
      AUDIO_DENOISE_ANLMDN_S_MIN +
        (s - AUDIO_DENOISE_MIN_STRENGTH) /
          (AUDIO_DENOISE_MAX_STRENGTH - AUDIO_DENOISE_MIN_STRENGTH) *
          (AUDIO_DENOISE_ANLMDN_S_MAX - AUDIO_DENOISE_ANLMDN_S_MIN),
    );
    return 'anlmdn=s=' + sv;
  }
  const nr = Math.round(
    AUDIO_DENOISE_AFFTdn_NR_MIN +
      (s - AUDIO_DENOISE_MIN_STRENGTH) /
        (AUDIO_DENOISE_MAX_STRENGTH - AUDIO_DENOISE_MIN_STRENGTH) *
        (AUDIO_DENOISE_AFFTdn_NR_MAX - AUDIO_DENOISE_AFFTdn_NR_MIN),
  );
  const nf = Math.round(
    AUDIO_DENOISE_AFFTdn_NF_MAX +
      (s - AUDIO_DENOISE_MIN_STRENGTH) /
        (AUDIO_DENOISE_MAX_STRENGTH - AUDIO_DENOISE_MIN_STRENGTH) *
        (AUDIO_DENOISE_AFFTdn_NF_MIN - AUDIO_DENOISE_AFFTdn_NF_MAX),
  );
  return 'afftdn=nr=' + nr + ':nf=' + nf;
}

/** 产物文件名（写入 exports 目录，前端经 /media/exports/<name> 取用）。 */
export function buildAudioDenoiseOutputName(stamp: number, mode: AudioDenoiseMode): string {
  const safeStamp = Number.isFinite(stamp) ? Math.max(0, Math.floor(stamp)) : 0;
  return 'denoise-' + mode + '-' + safeStamp + '.m4a';
}

/**
 * 构造 ffmpeg 参数（音频-only：-vn 丢弃可能存在的视频轨）。
 * 与 montage.service.speedPitch 的写法保持一致（-y / -i / -af / -c:a aac 192k）。
 */
export function buildAudioDenoiseArgs(
  sourcePath: string,
  outPath: string,
  mode: AudioDenoiseMode | string | undefined | null,
  strength: number | string | undefined | null,
): string[] {
  const filter = buildAudioDenoiseFilter(mode, strength);
  return [
    '-y',
    '-i', sourcePath,
    '-vn',
    '-af', filter,
    '-c:a', 'aac',
    '-b:a', '192k',
    outPath,
  ];
}

/** 人类可读的参数说明（中文，供 toast / 日志 / 文档复用）。 */
export function describeAudioDenoiseParams(
  mode: AudioDenoiseMode | string | undefined | null,
  strength: number | string | undefined | null,
): string {
  const m = normalizeDenoiseMode(mode);
  const s = normalizeDenoiseStrength(strength);
  const label = m === 'anlmdn' ? 'anlmdn（慢，更平滑）' : 'afftdn（快，默认）';
  return '降噪模式 ' + label + ' · 强度 ' + s.toFixed(2);
}