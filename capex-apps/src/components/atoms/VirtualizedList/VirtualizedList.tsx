'use client';

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';

type VirtualizedListProps<T> = {
  items: T[];
  itemHeight: number;
  height: number;
  overscan?: number;
  className?: string;
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => React.ReactNode;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
};

/**
 * Lightweight windowed list for large config tables (fixed row height).
 */
export function VirtualizedList<T>({
  items,
  itemHeight,
  height,
  overscan = 4,
  className,
  getKey,
  renderItem,
  onScroll,
}: VirtualizedListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(height / itemHeight) + overscan * 2;
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex],
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
      onScroll?.(e);
    },
    [onScroll],
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    setScrollTop(scrollRef.current.scrollTop);
  }, [items.length]);

  return (
    <div
      ref={scrollRef}
      className={className}
      style={{ height, overflowY: 'auto' }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item, i) => {
          const index = startIndex + i;
          return (
            <div
              key={getKey(item, index)}
              style={{
                position: 'absolute',
                top: index * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight,
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
