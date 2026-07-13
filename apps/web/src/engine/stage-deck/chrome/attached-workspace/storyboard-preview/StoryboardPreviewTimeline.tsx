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

  return (
    <div className="shrink-0 px-3 pt-2 pb-1 border-b border-line/25 nodrag nopan" onMouseDown={stop}>
      <div className="flex items-end gap-2 mb-1">
        {ticks.map((sec) => (
          <button
            key={sec}
            type="button"
            className="text-[9px] text-ink/35 hover:text-brand tabular-nums"
            onClick={() => {
              const hit = sorted.find((f) => sec >= f.startSec && sec < f.endSec);
              if (hit) onSelect(hit.id);
            }}
          >
            {sec}s
          </button>
        ))}
      </div>
      <div className="relative h-12 rounded-lg bg-surface/50 overflow-hidden">
        {sorted.map((frame) => {
          const left = (frame.startSec / maxSec) * 100;
          const width = Math.max(4, ((frame.endSec - frame.startSec) / maxSec) * 100);
          return (
            <button
              key={frame.id}
              type="button"
              title={`${frame.label} · ${frame.startSec}~${frame.endSec}s`}
              onClick={() => onSelect(frame.id)}
              className={`absolute top-1 bottom-1 rounded-md border overflow-hidden transition-all ${
                selectedFrameId === frame.id
                  ? 'border-brand ring-1 ring-brand/30 z-10'
                  : 'border-line/50 hover:border-brand/40'
              }`}
              style={{ left: `${left}%`, width: `${width}%` }}
            >
              {frame.imageUrl ? (
                <img src={frame.imageUrl} alt="" className="w-full h-full object-cover opacity-90" />
              ) : (
                <span className="block w-full h-full bg-ink/5" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
