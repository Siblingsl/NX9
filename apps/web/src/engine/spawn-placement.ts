import type { Node } from '@xyflow/react';
import { PERF } from '@nx9/shared';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FALLBACK_SIZE = { w: 320, h: 240 };
const DEFAULT_GAP = 48;

function roundToGrid(value: number): number {
  const step = PERF.gridStep || 20;
  return Math.round(value / step) * step;
}

export function nodeRect(node: Node): Rect {
  const data = (node.data || {}) as Record<string, unknown>;
  const rawW =
    (node as Node & { measured?: { width?: number } }).measured?.width ||
    node.width ||
    (typeof data.width === 'number' ? data.width : 0) ||
    FALLBACK_SIZE.w;
  const rawH =
    (node as Node & { measured?: { height?: number } }).measured?.height ||
    node.height ||
    (typeof data.height === 'number' ? data.height : 0) ||
    FALLBACK_SIZE.h;
  return {
    x: node.position?.x ?? 0,
    y: node.position?.y ?? 0,
    w: Math.ceil(rawW),
    h: Math.ceil(rawH),
  };
}

function unionBounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function overlaps(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

function collidesWithAny(candidate: Rect, others: Rect[], gap: number): boolean {
  return others.some((o) => overlaps(candidate, o, gap));
}

function defaultSpawnAnchor(existingRects: Rect[], gap: number): { x: number; y: number } {
  if (existingRects.length === 0) {
    return { x: 120, y: 100 };
  }
  const bounds = unionBounds(existingRects)!;
  return {
    x: roundToGrid(bounds.x + bounds.w + gap),
    y: roundToGrid(bounds.y),
  };
}

export interface SpawnPlacementOptions {
  preferred?: { x: number; y: number };
  size?: { w: number; h: number };
  gap?: number;
}

/** 拖放落点：仅对齐网格，不做碰撞避让 */
export function exactDropPosition(preferred: { x: number; y: number }): { x: number; y: number } {
  return {
    x: roundToGrid(preferred.x),
    y: roundToGrid(preferred.y),
  };
}

/** 在已有节点旁找不重叠的位置；preferred 作为搜索起点（如点击/菜单坐标） */
export function findOpenPosition(
  existing: Node[],
  options: SpawnPlacementOptions = {},
): { x: number; y: number } {
  const size = options.size ?? FALLBACK_SIZE;
  const gap = options.gap ?? DEFAULT_GAP;
  const existingRects = existing.map(nodeRect);
  const seed = options.preferred ?? defaultSpawnAnchor(existingRects, gap);
  let x = roundToGrid(seed.x);
  let y = roundToGrid(seed.y);

  const candidateAt = (px: number, py: number): Rect => ({
    x: px,
    y: py,
    w: size.w,
    h: size.h,
  });

  if (!collidesWithAny(candidateAt(x, y), existingRects, gap)) {
    return { x, y };
  }

  const stepX = size.w + gap;
  const stepY = size.h + gap;
  for (let ring = 1; ring <= 16; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const px = roundToGrid(x + dx * stepX);
        const py = roundToGrid(y + dy * stepY);
        if (!collidesWithAny(candidateAt(px, py), existingRects, gap)) {
          return { x: px, y: py };
        }
      }
    }
  }

  const bounds = unionBounds(existingRects);
  if (bounds) {
    return {
      x: roundToGrid(bounds.x),
      y: roundToGrid(bounds.y + bounds.h + gap),
    };
  }
  return { x, y };
}

/** 将一组新节点整体平移到不与已有节点重叠的区域（用于模板追加） */
export function relocateNodeGroup(incoming: Node[], existing: Node[], gap = DEFAULT_GAP): Node[] {
  if (incoming.length === 0) return incoming;

  const incomingRects = incoming.map(nodeRect);
  const groupBounds = unionBounds(incomingRects)!;
  const existingRects = existing.map(nodeRect);
  const anchor = defaultSpawnAnchor(existingRects, gap);

  let totalDx = anchor.x - groupBounds.x;
  let totalDy = anchor.y - groupBounds.y;

  const shiftGroup = (offsetX: number, offsetY: number) =>
    incoming.map((n) => ({
      ...n,
      position: {
        x: n.position.x + offsetX,
        y: n.position.y + offsetY,
      },
    }));

  let shifted = shiftGroup(totalDx, totalDy);
  let attempts = 0;
  while (
    shifted.some((n) => collidesWithAny(nodeRect(n), existingRects, gap)) &&
    attempts < 24
  ) {
    totalDy += groupBounds.h + gap;
    shifted = shiftGroup(totalDx, totalDy);
    attempts++;
  }

  return shifted;
}
