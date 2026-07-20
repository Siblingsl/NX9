import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export interface ImageLightboxItem {
  url: string;
  label?: string;
}

interface ImageLightboxProps {
  open: boolean;
  items: ImageLightboxItem[];
  index?: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}

/** 角色/素材图片全屏放大查看（支持滚轮/按钮缩放、拖拽、左右切换） */
export function ImageLightbox({
  open,
  items,
  index = 0,
  onClose,
  onIndexChange,
}: ImageLightboxProps) {
  const safeItems = useMemo(
    () => items.filter((item) => Boolean(item.url?.trim())),
    [items],
  );
  const [cursor, setCursor] = useState(index);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setCursor(Math.max(0, Math.min(index, Math.max(0, safeItems.length - 1))));
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [open, index, safeItems.length]);

  const go = useCallback(
    (next: number) => {
      if (safeItems.length === 0) return;
      const normalized = (next + safeItems.length) % safeItems.length;
      setCursor(normalized);
      setScale(1);
      setOffset({ x: 0, y: 0 });
      onIndexChange?.(normalized);
    },
    [onIndexChange, safeItems.length],
  );

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => Math.min(5, Math.max(1, Number((s + delta).toFixed(2)))));
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(cursor - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(cursor + 1);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomBy(0.25);
      } else if (e.key === '-') {
        e.preventDefault();
        zoomBy(-0.25);
      } else if (e.key === '0') {
        e.preventDefault();
        resetView();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, go, cursor, zoomBy, resetView]);

  if (!open || safeItems.length === 0) return null;

  const current = safeItems[Math.max(0, Math.min(cursor, safeItems.length - 1))];

  return createPortal(
    <div
      className="nx9-img-lightbox fixed inset-0 z-[300] flex flex-col bg-black/88 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={current.label || '图片预览'}
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{current.label || '图片预览'}</p>
          <p className="text-[11px] text-white/55">
            {cursor + 1} / {safeItems.length} · Esc 关闭 · ← → 切换 · 滚轮缩放 · 拖拽查看
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomBy(-0.25)}
            className="rounded-xl border border-white/15 p-2 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="缩小"
            title="缩小"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="min-w-[52px] rounded-xl border border-white/15 px-2 py-2 text-[11px] text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="重置缩放"
            title="重置缩放"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => zoomBy(0.25)}
            className="rounded-xl border border-white/15 p-2 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="放大"
            title="放大"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-xl border border-white/15 p-2 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="重置"
            title="重置"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 p-2 text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="关闭预览"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-4"
        onWheel={(e) => {
          e.stopPropagation();
          zoomBy(e.deltaY > 0 ? -0.15 : 0.15);
        }}
      >
        {safeItems.length > 1 ? (
          <button
            type="button"
            className="absolute left-3 z-10 rounded-full border border-white/15 bg-black/35 p-2 text-white/85 hover:bg-black/55"
            onClick={(e) => {
              e.stopPropagation();
              go(cursor - 1);
            }}
            aria-label="上一张"
          >
            <ChevronLeft size={22} />
          </button>
        ) : null}

        <div
          className="flex max-h-full max-w-full cursor-grab items-center justify-center active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            if (scale <= 1) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            const dx = e.clientX - dragRef.current.x;
            const dy = e.clientY - dragRef.current.y;
            setOffset({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy });
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (scale > 1) resetView();
            else {
              setScale(2);
              setOffset({ x: 0, y: 0 });
            }
          }}
        >
          <img
            src={current.url}
            alt={current.label || ''}
            draggable={false}
            className="max-h-[min(78vh,900px)] max-w-[min(92vw,1200px)] select-none rounded-xl object-contain shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transition: dragRef.current ? 'none' : 'transform 0.12s ease-out',
            }}
          />
        </div>

        {safeItems.length > 1 ? (
          <button
            type="button"
            className="absolute right-3 z-10 rounded-full border border-white/15 bg-black/35 p-2 text-white/85 hover:bg-black/55"
            onClick={(e) => {
              e.stopPropagation();
              go(cursor + 1);
            }}
            aria-label="下一张"
          >
            <ChevronRight size={22} />
          </button>
        ) : null}
      </div>

      {safeItems.length > 1 ? (
        <div
          className="flex gap-2 overflow-x-auto px-4 pb-4 nx9-scroll"
          onClick={(e) => e.stopPropagation()}
        >
          {safeItems.map((item, i) => (
            <button
              key={`${item.url}-${i}`}
              type="button"
              onClick={() => go(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border ${
                i === cursor ? 'border-brand ring-2 ring-brand/40' : 'border-white/15 opacity-75 hover:opacity-100'
              }`}
              title={item.label || `图 ${i + 1}`}
            >
              <img src={item.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/** 可点击放大的缩略图按钮（可单独使用） */
export function ImageThumbButton({
  url,
  label,
  className = '',
  onOpen,
}: {
  url: string;
  label?: string;
  className?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
      className={`group relative overflow-hidden ${className}`}
      title={label ? `查看：${label}` : '点击放大'}
    >
      <img src={url} alt={label || ''} className="h-full w-full object-cover" />
      <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition group-hover:bg-black/25">
        <ZoomIn size={16} className="text-white opacity-0 drop-shadow transition group-hover:opacity-100" />
      </span>
    </button>
  );
}
