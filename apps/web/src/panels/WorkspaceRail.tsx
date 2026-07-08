import { Plus, Trash2, Pencil } from 'lucide-react';
import type { WorkspaceSummary } from '@nx9/shared';

interface WorkspaceRailProps {
  items: WorkspaceSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function WorkspaceRail({
  items,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: WorkspaceRailProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-line bg-white overflow-x-auto nx9-scroll">
      {items.map((ws) => {
        const active = ws.id === activeId;
        return (
          <div
            key={ws.id}
            className={`group flex items-center gap-1 rounded-full border px-3 py-1.5 shrink-0 transition-colors ${
              active
                ? 'border-brand bg-brand/5 text-brand'
                : 'border-line text-ink/70 hover:border-accent/30'
            }`}
          >
            <button type="button" onClick={() => onSelect(ws.id)} className="text-sm font-medium">
              {ws.title}
            </button>
            <span className="text-[10px] text-ink/40">{ws.blockCount}</span>
            <button
              type="button"
              title="重命名"
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-brand"
              onClick={() => {
                const title = window.prompt('工作区名称', ws.title);
                if (title) onRename(ws.id, title);
              }}
            >
              <Pencil size={12} />
            </button>
            {items.length > 1 && (
              <button
                type="button"
                title="删除"
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-warn"
                onClick={() => {
                  if (window.confirm(`删除工作区「${ws.title}」？`)) onDelete(ws.id);
                }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1.5 text-sm text-ink/60 hover:border-brand hover:text-brand shrink-0"
      >
        <Plus size={14} />
        新建
      </button>
    </div>
  );
}
