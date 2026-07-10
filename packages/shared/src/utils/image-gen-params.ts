export const IMAGE_QUALITY_OPTIONS = [
  { id: 'auto', label: '自动' },
  { id: 'high', label: '高' },
  { id: 'medium', label: '中' },
  { id: 'low', label: '低' },
] as const;

export const IMAGE_ASPECT_OPTIONS = [
  { id: '1:1', label: '1:1', w: 1024, h: 1024 },
  { id: '16:9', label: '16:9', w: 1824, h: 1024 },
  { id: '9:16', label: '9:16', w: 1024, h: 1824 },
  { id: '4:3', label: '4:3', w: 1360, h: 1024 },
  { id: '3:4', label: '3:4', w: 1024, h: 1360 },
  { id: '3:2', label: '3:2', w: 1536, h: 1024 },
  { id: '2:3', label: '2:3', w: 1024, h: 1536 },
  { id: '2k', label: '2K 2048', w: 2048, h: 2048 },
  { id: '4k', label: '4K 4096', w: 4096, h: 4096 },
] as const;

const QUALITY_BASE = { high: 2880, medium: 2048, low: 1024 } as const;

export function resolveImageRequestSize(params: {
  quality?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  snapToStep?: boolean;
}): { width: number; height: number; size: string } {
  const snapToStep = params.snapToStep ?? true;
  let w = params.width || 1024;
  let h = params.height || 1024;

  if (params.aspectRatio && params.aspectRatio !== 'custom') {
    const opt = IMAGE_ASPECT_OPTIONS.find((a) => a.id === params.aspectRatio);
    if (opt) {
      w = opt.w;
      h = opt.h;
    }
  }

  if (params.quality && params.quality !== 'auto') {
    const base = QUALITY_BASE[params.quality as keyof typeof QUALITY_BASE] ?? 2048;
    const maxSide = Math.max(w, h);
    if (maxSide > base) {
      const ratio = base / maxSide;
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
  }

  if (snapToStep) {
    w = Math.round(w / 16) * 16;
    h = Math.round(h / 16) * 16;
  }

  return { width: w, height: h, size: `${w}x${h}` };
}
