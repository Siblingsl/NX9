export const VIDEO_DURATION_OPTIONS = [5, 6, 10, 15, 30] as const;

export const VIDEO_RESOLUTION_OPTIONS = [
  { id: '480', label: '480p' },
  { id: '720', label: '720p' },
  { id: '1080', label: '1080p' },
] as const;

export const VIDEO_ORIENTATION_OPTIONS = [
  { id: 'landscape', label: '横屏 16:9', w: 1280, h: 720 },
  { id: 'portrait', label: '竖屏 9:16', w: 720, h: 1280 },
  { id: 'square', label: '方屏 1:1', w: 1024, h: 1024 },
] as const;

export const VIDEO_SIZE_PRESETS: Record<string, Record<string, string>> = {
  '720': { landscape: '1280x720', portrait: '720x1280', square: '1024x1024' },
  '1080': { landscape: '1920x1080', portrait: '1080x1920', square: '1080x1080' },
  '480': { landscape: '854x480', portrait: '480x854', square: '480x480' },
};

/** VG-24: 由画幅反推横竖屏，避免只写 aspect 时 size 仍走横屏默认 */
export function orientationFromAspect(aspect?: string): 'landscape' | 'portrait' | 'square' | undefined {
  const a = (aspect || '').trim().replace('/', ':');
  if (a === '9:16') return 'portrait';
  if (a === '1:1') return 'square';
  if (a === '16:9' || a === '4:3' || a === '21:9') return 'landscape';
  return undefined;
}

export function resolveVideoGenParams(data: {
  resolution?: string;
  orientation?: string;
  aspect?: string;
  durationSec?: number;
}): { size: string; aspect: string; durationSec: number; resolution: string } {
  const res = data.resolution || '720';
  const orient =
    orientationFromAspect(data.aspect) ||
    (data.orientation as 'landscape' | 'portrait' | 'square' | undefined) ||
    'landscape';
  const preset = VIDEO_SIZE_PRESETS[res]?.[orient] || '1280x720';
  const aspectMap: Record<string, string> = { landscape: '16:9', portrait: '9:16', square: '1:1' };
  return {
    size: preset,
    aspect: data.aspect || aspectMap[orient] || '16:9',
    durationSec: data.durationSec || 5,
    resolution: res,
  };
}

/**
 * VG-42: 校验 Provider 参数文本（JSON 对象或 key=value 列表）。
 * 与网关 parseModelParams 同口径：无法解析的输入会被静默丢弃，这里提前报错。
 */
export function validateVideoModelParams(raw: string): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? null
        : 'Provider 参数需为 JSON 对象或 key=value 列表';
    } catch {
      return 'Provider 参数 JSON 解析失败';
    }
  }
  for (const pair of text.split(/[,;\n]+/)) {
    const idx = pair.indexOf('=');
    if (idx > 0 && pair.slice(0, idx).trim()) return null;
  }
  return 'Provider 参数需为 JSON 对象或 key=value 列表';
}
