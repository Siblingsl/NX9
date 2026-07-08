import type { Node } from '@xyflow/react';

export interface GuideLine {
  orientation: 'vertical' | 'horizontal';
  position: number;
}

export interface SmartSnapResult {
  x: number;
  y: number;
  guides: GuideLine[];
}

const FALLBACK = { w: 220, h: 160 };
const THRESHOLD = 6;

function rectOf(node: Node) {
  const w = node.width ?? FALLBACK.w;
  const h = node.height ?? FALLBACK.h;
  return {
    x: node.position.x,
    y: node.position.y,
    w,
    h,
    cx: node.position.x + w / 2,
    cy: node.position.y + h / 2,
    right: node.position.x + w,
    bottom: node.position.y + h,
  };
}

/** Snap dragging node to nearby alignment targets (<6px) */
export function computeSmartSnap(
  dragging: Node,
  others: Node[],
  threshold = THRESHOLD,
): SmartSnapResult {
  const drag = rectOf(dragging);
  let snapX = drag.x;
  let snapY = drag.y;
  const guides: GuideLine[] = [];

  for (const other of others) {
    if (other.id === dragging.id) continue;
    const o = rectOf(other);

    const xPairs: [number, number, number][] = [
      [drag.x, o.x, o.x],
      [drag.x, o.cx, o.cx - drag.w / 2],
      [drag.x, o.right, o.right - drag.w],
      [drag.right, o.x, o.x - drag.w],
      [drag.right, o.right, o.right - drag.w],
      [drag.cx, o.cx, o.cx - drag.w / 2],
    ];
    for (const [a, b, target] of xPairs) {
      if (Math.abs(a - b) <= threshold) {
        snapX = target;
        guides.push({ orientation: 'vertical', position: b });
      }
    }

    const yPairs: [number, number, number][] = [
      [drag.y, o.y, o.y],
      [drag.y, o.cy, o.cy - drag.h / 2],
      [drag.y, o.bottom, o.bottom - drag.h],
      [drag.bottom, o.y, o.y - drag.h],
      [drag.bottom, o.bottom, o.bottom - drag.h],
      [drag.cy, o.cy, o.cy - drag.h / 2],
    ];
    for (const [a, b, target] of yPairs) {
      if (Math.abs(a - b) <= threshold) {
        snapY = target;
        guides.push({ orientation: 'horizontal', position: b });
      }
    }
  }

  return { x: snapX, y: snapY, guides };
}
