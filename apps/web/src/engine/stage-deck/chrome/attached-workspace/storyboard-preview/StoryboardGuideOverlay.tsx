import {
  STORYBOARD_GUIDE_COLORS,
  type StoryboardGuideArrow,
  type StoryboardGuideOverlay,
} from '@nx9/shared';

function arrowPath(a: StoryboardGuideArrow): string {
  const x1 = a.x1 * 100;
  const y1 = a.y1 * 100;
  const x2 = a.x2 * 100;
  const y2 = a.y2 * 100;
  if (!a.curve) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * a.curve * 40;
  const ny = (dx / len) * a.curve * 40;
  return `M ${x1} ${y1} Q ${mx + nx} ${my + ny} ${x2} ${y2}`;
}

export interface StoryboardGuideOverlayViewProps {
  overlay: StoryboardGuideOverlay;
  className?: string;
  /** 是否显示箭头旁短标签 */
  showLabels?: boolean;
}

/** 叠在干净首帧上的导引层（不写入像素；出片另合成引导图） */
export function StoryboardGuideOverlayView({
  overlay,
  className = '',
  showLabels = true,
}: StoryboardGuideOverlayViewProps) {
  if (!overlay.arrows.length && !overlay.marks.length) return null;

  return (
    <svg
      className={`sb-guide-overlay ${className}`.trim()}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        {(Object.keys(STORYBOARD_GUIDE_COLORS) as Array<keyof typeof STORYBOARD_GUIDE_COLORS>).map(
          (kind) => (
            <marker
              key={kind}
              id={`sb-guide-ah-${kind}`}
              markerWidth="5"
              markerHeight="5"
              refX="4.2"
              refY="2.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L5,2.5 L0,5 Z" fill={STORYBOARD_GUIDE_COLORS[kind]} />
            </marker>
          ),
        )}
      </defs>

      {overlay.arrows.map((a) => {
        const color = STORYBOARD_GUIDE_COLORS[a.kind];
        const midX = ((a.x1 + a.x2) / 2) * 100;
        const midY = ((a.y1 + a.y2) / 2) * 100;
        return (
          <g key={a.id}>
            <path
              d={arrowPath(a)}
              fill="none"
              stroke={color}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              markerEnd={`url(#sb-guide-ah-${a.kind})`}
              opacity={0.95}
            />
            {showLabels && a.label && (
              <text
                x={midX}
                y={midY - 2.2}
                fill={color}
                fontSize={3.2}
                fontWeight={700}
                textAnchor="middle"
                style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.85)', strokeWidth: 0.6 }}
              >
                {a.label}
              </text>
            )}
          </g>
        );
      })}

      {overlay.marks.map((m) => {
        const color = STORYBOARD_GUIDE_COLORS[m.kind];
        const anchor = m.align === 'end' ? 'end' : m.align === 'middle' ? 'middle' : 'start';
        return (
          <text
            key={m.id}
            x={m.x * 100}
            y={m.y * 100}
            fill={color}
            fontSize={m.kind === 'label' ? 3.4 : 3.1}
            fontWeight={m.kind === 'label' ? 700 : 600}
            textAnchor={anchor}
            style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,0.88)', strokeWidth: 0.55 }}
          >
            {m.text}
          </text>
        );
      })}
    </svg>
  );
}
