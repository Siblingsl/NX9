import { memo } from 'react';
import { useStore } from '@xyflow/react';

const LANES = [
  { id: 'character', label: '角色', color: 'var(--nx9-lane-character)' },
  { id: 'scene', label: '场景', color: 'var(--nx9-lane-scene)' },
  { id: 'generate', label: '生成', color: 'var(--nx9-lane-gen)' },
  { id: 'output', label: '输出', color: 'var(--nx9-lane-output)' },
] as const;

const LANE_HEIGHT = 220;

export const LaneBackground = memo(function LaneBackground() {
  const transform = useStore((s) => s.transform);
  const [tx, ty, zoom] = transform;

  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ zIndex: 0 }}
    >
      <g transform={`translate(${tx}, ${ty}) scale(${zoom})`}>
        {LANES.map((lane, index) => {
          const y = index * LANE_HEIGHT;
          return (
            <g key={lane.id}>
              <rect
                x={56}
                y={y}
                width={4000}
                height={LANE_HEIGHT}
                fill={lane.color}
              />
              <text
                x={64}
                y={y + 28}
                fill="var(--nx9-ink)"
                fillOpacity="0.4"
                className="text-xs font-semibold"
                style={{ fontSize: 12 }}
              >
                {lane.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
});
