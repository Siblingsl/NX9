import type { StoryboardPreviewFrame } from '@nx9/shared';

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export interface StoryboardPreviewTimelineProps {
  frames: StoryboardPreviewFrame[];
  totalDurationSec: number;
  selectedFrameId?: string | null;
  onSelect: (frameId: string) => void;
}

export function StoryboardPreviewTimeline({
  frames,
  totalDurationSec,
  selectedFrameId,
  onSelect,
}: StoryboardPreviewTimelineProps) {
  const sorted = [...frames].sort((a, b) => a.order - b.order);
  const maxSec = Math.max(totalDurationSec, sorted.at(-1)?.endSec ?? 0, 1);
  const ticks = Array.from({ length: Math.min(8, Math.ceil(maxSec / 5) + 1) }, (_, i) => i * 5).filter(
    (t) => t <= maxSec,
  );

  if (sorted.length === 0) return null;

  return (
    <div className="kp-tl nodrag nopan" onMouseDown={stop}>
      <div className="kp-tl__ticks">
        {ticks.map((sec) => (
          <button
            key={sec}
            type="button"
            className="kp-tl__tick"
            onClick={() => {
              const hit = sorted.find((f) => sec >= f.startSec && sec < f.endSec);
              if (hit) onSelect(hit.id);
            }}
          >
            {sec}s
          </button>
        ))}
      </div>
      <div className="kp-tl__track">
        {sorted.map((frame) => {
          const left = (frame.startSec / maxSec) * 100;
          const width = Math.max(4, ((frame.endSec - frame.startSec) / maxSec) * 100);
          return (
            <button
              key={frame.id}
              type="button"
              title={`${frame.label} · ${frame.startSec}–${frame.endSec}s`}
              onClick={() => onSelect(frame.id)}
              className={`kp-tl__clip ${selectedFrameId === frame.id ? 'is-on' : ''}`}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              {frame.imageUrl ? (
                <img src={frame.imageUrl} alt="" />
              ) : (
                <span className="kp-tl__clip-empty" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
