import type { Edge } from '@xyflow/react';

export interface KnifePoint {
  x: number;
  y: number;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const lx = x1 + t * dx;
  const ly = y1 + t * dy;
  return Math.hypot(px - lx, py - ly);
}

function polylineHitsSegment(
  points: KnifePoint[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  threshold = 8,
): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (distToSegment(x1, y1, a.x, a.y, b.x, b.y) <= threshold) return true;
    if (distToSegment(x2, y2, a.x, a.y, b.x, b.y) <= threshold) return true;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    if (distToSegment(midX, midY, a.x, a.y, b.x, b.y) <= threshold) return true;
  }
  return false;
}

/** Find edge ids whose endpoints are cut by the knife polyline */
export function edgesHitByKnife(
  points: KnifePoint[],
  edges: Edge[],
  nodePositions: Map<string, { x: number; y: number }>,
): string[] {
  if (points.length < 2) return [];
  const hit: string[] = [];
  for (const edge of edges) {
    const src = nodePositions.get(edge.source);
    const tgt = nodePositions.get(edge.target);
    if (!src || !tgt) continue;
    if (polylineHitsSegment(points, src.x, src.y, tgt.x, tgt.y)) {
      hit.push(edge.id);
    }
  }
  return hit;
}

export function isKnifeModifier(e: { shiftKey: boolean }): boolean {
  return e.shiftKey;
}
