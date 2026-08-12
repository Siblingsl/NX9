import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

/** 全页编辑态：本 Tab 内快速切换条目（UX-R05） */
export function AssetEditQuickJump({
  items,
  currentId,
  onJump,
}: {
  items: Array<{ id: string; label: string }>;
  currentId: string;
  onJump: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return items
      .filter((i) => i.id !== currentId && i.label.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [items, currentId, q]);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-surface/40 px-4 py-1.5">
      <Search size={12} className="shrink-0 text-ink/35" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="本 Tab 快速切换…"
        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] text-ink outline-none focus:border-brand/40"
      />
      {matches.map((m) => (
        <button
          key={m.id}
          type="button"
          className="max-w-[7rem] truncate rounded-full border border-line px-2 py-0.5 text-[10px] text-ink/65 hover:border-brand/40 hover:text-brand"
          title={m.label}
          onClick={() => {
            onJump(m.id);
            setQ('');
          }}
        >
          {m.label || m.id}
        </button>
      ))}
    </div>
  );
}
