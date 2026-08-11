import { useCallback, useEffect, useRef, type ReactNode } from 'react';

/** 单行 chip 横滑：无滚动条、无箭头；按住拖拽即可滑动 */
export function ShotFilterChipScroller({
  children,
  deps,
}: {
  children: ReactNode;
  /** 选项变化时预留（兼容调用方） */
  deps?: unknown;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startLeft: number;
    moved: boolean;
  } | null>(null);

  // deps 仅用于调用方在选项变化时强制 remount 感知；此处无需逻辑
  void deps;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      // 竖向滚轮转为横滑，便于桌面鼠标操作
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startLeft: el.scrollLeft,
      moved: false,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 5) return;
    if (!d.moved) {
      d.moved = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      el.classList.add('cursor-grabbing');
    }
    el.scrollLeft = d.startLeft - dx;
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const wasDrag = d.moved;
    drag.current = null;
    el?.classList.remove('cursor-grabbing');
    try {
      el?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    // 拖拽后吞掉随后的 click，避免误点选 chip
    if (wasDrag) {
      const swallow = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      el?.addEventListener('click', swallow, { capture: true, once: true });
    }
  }, []);

  return (
    <div
      ref={ref}
      className="flex min-w-0 flex-1 cursor-grab items-center gap-1 overflow-x-auto nx9-scroll select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {children}
    </div>
  );
}
