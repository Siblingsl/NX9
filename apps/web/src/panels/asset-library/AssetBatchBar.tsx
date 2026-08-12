import { Lock, Unlock, Trash2, X } from 'lucide-react';

export function AssetBatchBar({
  count,
  totalSelectable,
  canDelete,
  onSelectAll,
  onClear,
  onLock,
  onUnlock,
  onDelete,
}: {
  count: number;
  totalSelectable: number;
  canDelete: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onDelete: () => void;
}) {
  if (count <= 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2">
      <span className="text-[11px] font-medium text-brand">
        已选 {count}
        {totalSelectable > 0 ? ` / ${totalSelectable}` : ''}
      </span>
      <button
        type="button"
        onClick={onSelectAll}
        className="rounded-lg border border-line px-2 py-1 text-[10px] text-ink/60 hover:border-brand/40"
      >
        全选当前
      </button>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-0.5 rounded-lg border border-line px-2 py-1 text-[10px] text-ink/60 hover:border-brand/40"
      >
        <X size={10} />
        清除
      </button>
      <span className="mx-0.5 h-3 w-px bg-line" aria-hidden />
      <button
        type="button"
        onClick={onLock}
        className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[10px] text-ink/70 hover:border-brand/40"
      >
        <Lock size={11} />
        批量锁定
      </button>
      <button
        type="button"
        onClick={onUnlock}
        className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[10px] text-ink/70 hover:border-brand/40"
      >
        <Unlock size={11} />
        批量解锁
      </button>
      {canDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded-lg border border-red-500/35 px-2 py-1 text-[10px] text-red-500 hover:bg-red-500/10"
        >
          <Trash2 size={11} />
          移入回收站
        </button>
      ) : null}
    </div>
  );
}
