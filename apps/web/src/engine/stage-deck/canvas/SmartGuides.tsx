import { memo } from 'react';
import { useStore } from '@xyflow/react';
import type { GuideLine } from '../utils/smart-guides';

interface SmartGuidesProps {
  guides: GuideLine[];
}

export const SmartGuides = memo(function SmartGuides({ guides }: SmartGuidesProps) {
  const transform = useStore((s) => s.transform);
  const [tx, ty, zoom] = transform;

  if (guides.length === 0) return null;

  return (
    <svg className="pointer-events-none absolute inset-0 overflow-visible" style={{ zIndex: 5 }}>
      <g transform={`translate(${tx}, ${ty}) scale(${zoom})`}>
        {guides.map((g, i) =>
          g.orientation === 'vertical' ? (
            <line
              key={`v-${i}`}
              x1={g.position}
              y1={-5000}
              x2={g.position}
              y2={5000}
              stroke="var(--nx9-brand)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.7}
            />
          ) : (
            <line
              key={`h-${i}`}
              x1={-5000}
              y1={g.position}
              x2={5000}
              y2={g.position}
              stroke="var(--nx9-brand)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.7}
            />
          ),
        )}
      </g>
    </svg>
  );
});
