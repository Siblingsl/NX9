import type { Node } from '@xyflow/react';
import { findOpenPosition } from './spawn-placement';

const COLS = 3;
const COL_W = 280;
const ROW_H = 260;
const PREVIEW_SIZE = { w: COL_W, h: ROW_H };

export function buildPreviewOutputNodes(
  sourceNode: Node,
  imageUrls: string[],
  nextBlockIndex: number,
  existingNodes: Node[] = [],
): { nodes: Node[]; nextIndex: number } {
  const myW = sourceNode.width ?? 320;
  const preferred = {
    x: sourceNode.position.x + myW + 80,
    y: sourceNode.position.y,
  };
  const origin = findOpenPosition(existingNodes, { preferred, size: PREVIEW_SIZE });
  const ts = Date.now();
  let idx = nextBlockIndex;

  const nodes = imageUrls.map((url, i) => {
    const node: Node = {
      id: `blk-preview-auto-${sourceNode.id}-${ts}-${i}`,
      type: 'preview-sink',
      position: {
        x: origin.x + (i % COLS) * COL_W,
        y: origin.y + Math.floor(i / COLS) * ROW_H,
      },
      data: {
        blockIndex: idx++,
        previewPictures: [url],
        previewUrl: url,
        assetUrl: url,
        status: 'done',
      },
      selected: i === 0,
    };
    return node;
  });

  return { nodes, nextIndex: idx };
}
