import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';

export const SceneGroupNode = memo(function SceneGroupNode({ data, selected }: NodeProps) {
  const label = (data?.label as string) ?? '场景组';
  const width = (data?.width as number) ?? 400;
  const height = (data?.height as number) ?? 280;

  return (
    <div
      className={`rounded-2xl border-2 border-dashed bg-brand/[0.04] ${
        selected ? 'border-brand ring-2 ring-brand/20' : 'border-brand/30'
      }`}
      style={{ width, height, minWidth: width, minHeight: height }}
    >
      <div className="px-3 py-2 text-xs font-semibold text-brand/80 cursor-grab active:cursor-grabbing">
        {label}
      </div>
    </div>
  );
});

export function computeGroupBounds(
  nodes: Array<{ position: { x: number; y: number }; width?: number; height?: number }>,
): { x: number; y: number; width: number; height: number } {
  const pad = 24;
  const header = 32;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const w = n.width ?? 220;
    const h = n.height ?? 160;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }
  return {
    x: minX - pad,
    y: minY - pad - header,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2 + header,
  };
}
