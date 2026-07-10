import { Terminal, X } from 'lucide-react';
import { useActivityLog } from '../stores/activity-log';

export function LogDockButton() {
  const { open, toggle } = useActivityLog();

  return (
    <button
      type="button"
      title="活动日志"
      aria-label="活动日志"
      onClick={() => toggle()}
      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
        open ? 'bg-brand/10 text-brand' : 'hover:bg-surface text-ink/60'
      }`}
    >
      <Terminal size={18} />
    </button>
  );
}

export function LogPanel() {
  const { lines, open, toggle, clear } = useActivityLog();

  if (!open) return null;

  return (
    <div
      className="fixed bottom-0 z-40 h-48 bg-ink text-white/90 flex flex-col border-t border-white/10"
      style={{ left: 'var(--nx9-dock-width)', right: 'var(--nx9-rail-width)' }}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <span className="text-xs font-mono uppercase tracking-wider text-white/60">Activity Log</span>
        <div className="flex gap-2">
          <button type="button" onClick={clear} className="text-xs text-white/60 hover:text-white">
            清空
          </button>
          <button type="button" onClick={() => toggle(false)} className="hover:text-brand">
            <X size={16} />
          </button>
        </div>
      </div>
      <pre className="flex-1 overflow-auto nx9-scroll px-4 py-2 text-xs font-mono leading-relaxed">
        {lines.length === 0 ? '暂无日志' : lines.join('\n')}
      </pre>
    </div>
  );
}
