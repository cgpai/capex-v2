import { useCallback, useEffect, useState, type RefObject } from 'react';

export type TableWindowRange = {
  start: number;
  end: number;
  paddingTop: number;
  paddingBottom: number;
  totalHeight: number;
};

const DEFAULT_OVERSCAN = 6;

/**
 * Lightweight row windowing for scroll containers — no external virtualizer dependency.
 * Renders only rows in [start, end) plus spacer padding for off-screen height.
 */
export function useTableWindow(
  rowCount: number,
  scrollRef: RefObject<HTMLElement | null>,
  estimatedRowHeight: number,
  enabled: boolean,
  overscan = DEFAULT_OVERSCAN,
): TableWindowRange {
  const computeRange = useCallback((): TableWindowRange => {
    if (!enabled || rowCount <= 0) {
      return { start: 0, end: rowCount, paddingTop: 0, paddingBottom: 0, totalHeight: 0 };
    }
    const el = scrollRef.current;
    const rowH = Math.max(estimatedRowHeight, 1);
    const totalHeight = rowCount * rowH;
    if (!el) {
      const end = Math.min(rowCount, overscan * 2 + 12);
      return { start: 0, end, paddingTop: 0, paddingBottom: Math.max(0, totalHeight - end * rowH), totalHeight };
    }
    const scrollTop = el.scrollTop;
    const viewHeight = el.clientHeight;
    const start = Math.max(0, Math.floor(scrollTop / rowH) - overscan);
    const visibleCount = Math.ceil(viewHeight / rowH) + overscan * 2;
    const end = Math.min(rowCount, start + visibleCount);
    const paddingTop = start * rowH;
    const paddingBottom = Math.max(0, totalHeight - end * rowH);
    return { start, end, paddingTop, paddingBottom, totalHeight };
  }, [enabled, rowCount, scrollRef, estimatedRowHeight, overscan]);

  const [range, setRange] = useState<TableWindowRange>(() => computeRange());

  useEffect(() => {
    setRange(computeRange());
  }, [computeRange, rowCount, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setRange((prev) => {
          const next = computeRange();
          return prev.start === next.start && prev.end === next.end ? prev : next;
        });
      });
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : null;
    el.addEventListener('scroll', onScroll, { passive: true });
    ro?.observe(el);
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [enabled, scrollRef, computeRange]);

  return range;
}
