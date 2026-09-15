import type { TimelineClipMask } from '../types/timeline';

export interface MaskPoint {
  x: number;
  y: number;
}

/**
 * 经典心形曲线 → 拟合多边形（百分比坐标，与 rect/ellipse 同一 w/h 百分比语义）。
 * 曲线先按采样包围盒归一到 0..1，再映射到 cx±w/2、cy±h/2，保证形状精确占满 w×h。
 */
export function heartPolygonPoints(
  cx: number,
  cy: number,
  w: number,
  h: number,
  steps = 28,
): MaskPoint[] {
  const raw: [number, number][] = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    raw.push([
      16 * Math.sin(t) ** 3,
      13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
    ]);
  }
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return raw.map(([hx, hy]) => ({
    x: cx + ((hx - minX) / (maxX - minX) - 0.5) * w,
    y: cy + (0.5 - (hy - minY) / (maxY - minY)) * h,
  }));
}

/** 菱形多边形（百分比坐标，与既有 clip-path 几何一致，含 0..100 收边） */
export function diamondPolygonPoints(
  cx: number,
  cy: number,
  w: number,
  h: number,
): MaskPoint[] {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return [
    { x: clamp(cx), y: clamp(cy - h / 2) },
    { x: clamp(cx + w / 2), y: clamp(cy) },
    { x: clamp(cx), y: clamp(cy + h / 2) },
    { x: clamp(cx - w / 2), y: clamp(cy) },
  ];
}

/** MaskPoint[] → CSS clip-path polygon 字符串 */
export function toClipPathPolygon(points: MaskPoint[]): string {
  return points.map((p) => `${p.x.toFixed(2)}% ${p.y.toFixed(2)}%`).join(', ');
}

/** MaskPoint[] → SVG polygon points 字符串（viewBox 0..100 空间） */
export function toSvgPolygonPoints(points: MaskPoint[]): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

/**
 * 多边形羽化蒙版（SVG feGaussianBlur，data URI）。
 * feather 单位为画布短边百分比（0–10）；blur 各轴 stdDeviation 按画布长宽比分摊，
 * 保证视觉羽化宽度在长短轴上一致。preserveAspectRatio='none' + mask-size 100% 100%
 * 让 0..100 viewBox 精确铺到元素上，与 clip-path 百分比几何对齐。
 */
export function polygonFeatherMask(
  points: MaskPoint[],
  feather: number,
  canvasW: number,
  canvasH: number,
): { maskImage: string; maskSize: string; maskRepeat: string } | undefined {
  const base = Math.min(canvasW, canvasH);
  const blurPx = ((Math.max(0, feather) / 100) * base) / 2;
  if (blurPx <= 0 || canvasW <= 0 || canvasH <= 0) return undefined;
  const sx = blurPx / (canvasW / 100);
  const sy = blurPx / (canvasH / 100);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>` +
    `<filter id='b' x='-30%' y='-30%' width='160%' height='160%'>` +
    `<feGaussianBlur stdDeviation='${sx.toFixed(3)} ${sy.toFixed(3)}'/>` +
    `</filter>` +
    `<polygon points='${toSvgPolygonPoints(points)}' fill='black' filter='url(#b)'/>` +
    `</svg>`;
  return {
    maskImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    maskSize: '100% 100%',
    maskRepeat: 'no-repeat',
  };
}

/** 是否为需要 SVG 羽化的多边形形状（rect/ellipse/cinematic 仍走渐变蒙版） */
export function isPolygonMaskKind(kind: TimelineClipMask['kind']): boolean {
  return kind === 'diamond' || kind === 'heart';
}
