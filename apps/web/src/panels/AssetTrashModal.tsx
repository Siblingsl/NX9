/**
 * AssetTrashModal — 项目内资产回收站独立弹层（F-010）。
 * 入口：画布顶栏设置左侧图标 / 命令面板 / 素材库内切换。
 */
import { Suspense, lazy, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2 } from 'lucide-react';
import { useAssetTrashModalUi } from '../stores/asset-trash-modal-ui';

const AssetTrashPanel = lazy(() =>
  import('./AssetTrashPanel').then((m) => ({ default: m.AssetTrashPanel })),
);

export function AssetTrashModal() {
  const open = useAssetTrashModalUi((s) => s.open);
  const setOpen = useAssetTrashModalUi((s) => s.setOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, setOpen]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="资产回收站">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={() => setOpen(false)}
        aria-label="关闭回收站"
      />
      <div
        className="relative z-10 flex w-full max-w-3xl max-h-[min(860px,92vh)] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-warn/10 text-warn">
              <Trash2 size={16} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">资产回收站</h2>
              <p className="text-[10px] text-ink/40">删除的素材保留 30 天，到期自动清理</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-ink/40 hover:bg-surface hover:text-ink"
            title="关闭 (Esc)"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto nx9-scroll p-4">
          <Suspense fallback={<div className="py-12 text-center text-[11px] text-ink/40">加载中…</div>}>
            <AssetTrashPanel defaultScope="private" variant="modal" />
          </Suspense>
        </div>
      </div>
    </div>,
    document.body,
  );
}
