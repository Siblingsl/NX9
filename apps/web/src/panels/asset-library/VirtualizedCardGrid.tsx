/**
 * 轻量虚拟网格：大量卡片时只挂载可视行 + overscan。
 * 不引入第三方依赖；条目 ≤ threshold 时退化为普通 CSS grid。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const DEFAULT_THRESHOLD = 48;

function resolveColumns(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 640) return 3;
  return 2;
}

function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

export function VirtualizedCardGrid<T>({
  items,
  estimateCardHeight,
  gap = 12,
  threshold = DEFAULT_THRESHOLD,
  gridClassName = 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4',
  renderItem,
  getKey,
}: {
  items: T[];
  /** 单卡预估高度（含底栏，不含 gap）；按列宽动态更佳时可传函数 */
  estimateCardHeight: number | ((cardWidth: number) => number);
  gap?: number;
  threshold?: number;
  gridClassName?: string;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(800);
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const parent = findScrollParent(root);
    setScrollParent(parent);

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? root.clientWidth;
      setWidth(w);
    });
    ro.observe(root);

    const onScroll = () => {
      if (!parent) return;
      setScrollTop(parent.scrollTop);
      setViewportH(parent.clientHeight);
    };
    onScroll();
    parent?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      ro.disconnect();
      parent?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [items.length]);

  const columns = useMemo(() => resolveColumns(width || 640), [width]);
  const cardWidth = width > 0 ? (width - gap * (columns - 1)) / columns : 180;
  const cardH =
    typeof estimateCardHeight === 'function'
      ? estimateCardHeight(cardWidth)
      : estimateCardHeight;
  const rowH = cardH + gap;
  const rowCount = Math.ceil(items.length / columns) || 0;

  const offsetTop = useCallback(() => {
    const root = rootRef.current;
    const parent = scrollParent;
    if (!root || !parent) return 0;
    // root 相对 scrollParent 内容顶部的偏移
    let top = 0;
    let node: HTMLElement | null = root;
    while (node && node !== parent) {
      top += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return top;
  }, [scrollParent]);

  const shouldVirtualize = items.length > threshold && width > 0;

  const range = useMemo(() => {
    if (!shouldVirtualize) {
      return { startRow: 0, endRow: Math.max(0, rowCount - 1), padTop: 0, padBottom: 0 };
    }
    const relTop = Math.max(0, scrollTop - offsetTop());
    const overscan = 2;
    const startRow = Math.max(0, Math.floor(relTop / rowH) - overscan);
    const visibleRows = Math.ceil(viewportH / rowH) + overscan * 2;
    const endRow = Math.min(rowCount - 1, startRow + visibleRows);
    return {
      startRow,
      endRow,
      padTop: startRow * rowH,
      padBottom: Math.max(0, (rowCount - 1 - endRow) * rowH),
    };
  }, [shouldVirtualize, scrollTop, offsetTop, rowH, viewportH, rowCount]);

  if (items.length === 0) return null;

  if (!shouldVirtualize) {
    return (
      <div ref={rootRef} className={gridClassName}>
        {items.map((item, i) => (
          <div key={getKey(item, i)}>{renderItem(item, i)}</div>
        ))}
      </div>
    );
  }

  const visible: Array<{ item: T; index: number }> = [];
  for (let row = range.startRow; row <= range.endRow; row++) {
    for (let col = 0; col < columns; col++) {
      const index = row * columns + col;
      if (index >= items.length) break;
      visible.push({ item: items[index]!, index });
    }
  }

  return (
    <div ref={rootRef} style={{ paddingTop: range.padTop, paddingBottom: range.padBottom }}>
      <div
        className={gridClassName}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {visible.map(({ item, index }) => (
          <div key={getKey(item, index)} style={{ minHeight: cardH }}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
