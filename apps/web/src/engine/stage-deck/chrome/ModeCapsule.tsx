import type { ViewMode } from '@nx9/shared';
import { useViewMode } from '../stores/view-mode';

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'explore', label: '探索' },
  { id: 'produce', label: '生产' },
  { id: 'review', label: '审片' },
];

export function ModeCapsule() {
  const mode = useViewMode((s) => s.mode);
  const setMode = useViewMode((s) => s.setMode);

  return (
    <div className="flex items-center rounded-full border border-line bg-surface/80 p-0.5 text-xs nx9-mode-capsule">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => setMode(m.id)}
          className={`px-3 py-1 rounded-full transition-all duration-300 ${
            mode === m.id ? 'bg-brand text-white shadow-sm' : 'text-ink/60 hover:text-ink'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
