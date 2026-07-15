import { Plus, X, Pencil } from 'lucide-react';
import type { WorkspaceSummary } from '@nx9/shared';

interface WorkspaceRailProps {
  items: WorkspaceSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onClose: (id: string) => void;
}

export function WorkspaceRail({
  items,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onClose,
}: WorkspaceRailProps) {
  return (
    <div className="nx9-workspace-rail flex items-center gap-1.5 px-4 py-1.5 border-b border-line/60 bg-white/90 backdrop-blur-md overflow-x-auto nx9-scroll">
      <span className="text-[10px] font-medium text-ink/35 uppercase tracking-wider shrink-0 pr-1 hidden sm:inline">
        工作区
      </span>
      {items.map((ws) => {
        const active = ws.id === activeId;
        return (
          <div
            key={ws.id}
            className={`group flex items-center gap-1 rounded-lg px-2.5 py-1 shrink-0 transition-all ${
              active
                ? 'bg-white border border-brand/25 text-brand shadow-sm'
                : 'border border-transparent text-ink/60 hover:bg-white/70 hover:text-ink/80'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(ws.id)}
              className="text-[12px] font-medium leading-none"
            >
              {ws.title}
            </button>
            <span className="text-[10px] text-ink/30 tabular-nums">{ws.blockCount}</span>
            <button
              type="button"
              title="重命名"
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-brand transition-opacity"
              onClick={() => {
                const title = window.prompt('工作区名称', ws.title);
                if (title) onRename(ws.id, title);
              }}
            >
              <Pencil size={11} />
            </button>
            {items.length > 1 && (
              <button
                type="button"
                title="从工作区栏关闭"
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-warn transition-opacity"
                onClick={() => {
                  if (
                    window.confirm(
                      `从工作区栏关闭「${ws.title}」？\n画布标签会移除，但项目素材仍保留在素材库中。`,
                    )
                  ) {
                    onClose(ws.id);
                  }
                }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-1 rounded-lg border border-dashed border-line/80 px-2.5 py-1 text-[12px] text-ink/45 hover:border-brand/40 hover:text-brand hover:bg-white/60 shrink-0 transition-colors"
      >
        <Plus size={13} />
        新建
      </button>
    </div>
  );
}
