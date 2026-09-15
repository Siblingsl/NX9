import { describe, expect, it } from 'vitest';
import {
  heartPolygonPoints,
  diamondPolygonPoints,
  toClipPathPolygon,
  toSvgPolygonPoints,
  polygonFeatherMask,
  isPolygonMaskKind,
} from '@nx9/shared';

describe('遮罩羽化（菱形/心形渲染层接入）', () => {
  it('心形拟合多边形精确落在 w×h 百分比盒内', () => {
    const pts = heartPolygonPoints(50, 50, 80, 80);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(10 - 0.01);
      expect(p.x).toBeLessThanOrEqual(90 + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(10 - 0.01);
      expect(p.y).toBeLessThanOrEqual(90 + 0.01);
    }
    // 左右对称（心形曲线关于 x 轴对称）
    const xs = pts.map((p) => p.x);
    expect(Math.max(...xs)).toBeCloseTo(90, 0);
    expect(Math.min(...xs)).toBeCloseTo(10, 0);
    // 底部尖点存在（y 接近 90 且 x 居中）
    const tip = pts.find((p) => p.y > 89);
    expect(tip).toBeDefined();
    expect(Math.abs((tip as { x: number }).x - 50)).toBeLessThan(2);
  });

  it('菱形多边形与既有 clip-path 几何一致并收边', () => {
    const pts = diamondPolygonPoints(50, 50, 80, 80);
    expect(toClipPathPolygon(pts)).toBe('50.00% 10.00%, 90.00% 50.00%, 50.00% 90.00%, 10.00% 50.00%');
    const clamped = diamondPolygonPoints(5, 5, 80, 80);
    for (const p of clamped) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('SVG 羽化蒙版：blur 按画布长宽比分摊，data URI 可用', () => {
    const pts = diamondPolygonPoints(50, 50, 80, 80);
    const mask = polygonFeatherMask(pts, 5, 1920, 1080);
    expect(mask).toBeDefined();
    // feather 5 = 画布短边 5% → 半宽羽化 27px；sx = 27/(1920/100)=1.406, sy = 27/(1080/100)=2.5
    const svg = decodeURIComponent(
      ((mask as { maskImage: string }).maskImage.match(/data:image\/svg\+xml,([^"]+)/) as string[])[1],
    );
    expect(svg).toContain("stdDeviation='1.406 2.500'");
    expect(svg).toContain(toSvgPolygonPoints(pts));
    expect((mask as { maskImage: string }).maskImage.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect((mask as { maskSize: string }).maskSize).toBe('100% 100%');

    expect(polygonFeatherMask(pts, 0, 1920, 1080)).toBeUndefined();
  });

  it('isPolygonMaskKind 仅对 diamond/heart 为真', () => {
    expect(isPolygonMaskKind('diamond')).toBe(true);
    expect(isPolygonMaskKind('heart')).toBe(true);
    expect(isPolygonMaskKind('rect')).toBe(false);
    expect(isPolygonMaskKind('ellipse')).toBe(false);
    expect(isPolygonMaskKind('cinematic')).toBe(false);
  });
});
