import { Terminal, X } from 'lucide-react';
import { useActivityLog } from '../stores/activity-log';

export function LogPanel() {
  const { lines, open, toggle, clear } = useActivityLog();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => toggle(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-ink text-white px-4 py-2 text-sm shadow-panel hover:bg-ink/90"
      >
        <Terminal size={16} />
        日志
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 h-48 bg-ink text-white/90 flex flex-col border-t border-white/10">
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
