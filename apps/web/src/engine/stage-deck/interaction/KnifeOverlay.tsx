import { useEffect, useRef, useState } from 'react';
import { useReactFlow, useStore } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import { edgesHitByKnife, isKnifeModifier, type KnifePoint } from './knife-tool';

export function useKnifeTool(
  enabled: boolean,
  getEdges: () => Edge[],
  getNodePositions: () => Map<string, { x: number; y: number }>,
  onCut: (edgeIds: string[]) => void,
) {
  const { screenToFlowPosition } = useReactFlow();
  const [points, setPoints] = useState<KnifePoint[]>([]);
  const [active, setActive] = useState(false);
  const transform = useStore((s) => s.transform);
  const [tx, ty, zoom] = transform;
  const pointsRef = useRef<KnifePoint[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const toFlow = (clientX: number, clientY: number) =>
      screenToFlowPosition({ x: clientX, y: clientY });

    const onDown = (e: MouseEvent) => {
      if (!isKnifeModifier(e)) return;
      const target = e.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return;
      e.preventDefault();
      e.stopPropagation();
      setActive(true);
      const p = toFlow(e.clientX, e.clientY);
      pointsRef.current = [p];
      setPoints([p]);
    };

    const onMove = (e: MouseEvent) => {
      if (!active) return;
      const p = toFlow(e.clientX, e.clientY);
      const last = pointsRef.current[pointsRef.current.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 4) return;
      pointsRef.current = [...pointsRef.current, p];
      setPoints([...pointsRef.current]);
    };

    const onUp = () => {
      if (!active) return;
      setActive(false);
      const pts = pointsRef.current;
      pointsRef.current = [];
      setPoints([]);
      if (pts.length < 2) return;
      const ids = edgesHitByKnife(pts, getEdges(), getNodePositions());
      if (ids.length > 0) onCut(ids);
    };

    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [enabled, active, screenToFlowPosition, getEdges, getNodePositions, onCut]);

  const overlay =
    points.length >= 2 ? (
      <svg className="pointer-events-none absolute inset-0 overflow-visible" style={{ zIndex: 20 }}>
        <g transform={`translate(${tx}, ${ty}) scale(${zoom})`}>
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#b42318"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        </g>
      </svg>
    ) : null;

  return { knifeOverlay: overlay };
}
