export const VIDEO_DURATION_OPTIONS = [6, 10, 15, 30] as const;

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

export function resolveVideoGenParams(data: {
  resolution?: string;
  orientation?: string;
  aspect?: string;
  durationSec?: number;
}): { size: string; aspect: string; durationSec: number; resolution: string } {
  const res = data.resolution || '720';
  const orient = data.orientation || 'landscape';
  const preset = VIDEO_SIZE_PRESETS[res]?.[orient] || '1280x720';
  const aspectMap: Record<string, string> = { landscape: '16:9', portrait: '9:16', square: '1:1' };
  return {
    size: preset,
    aspect: data.aspect || aspectMap[orient] || '16:9',
    durationSec: data.durationSec || 6,
    resolution: res,
  };
}
