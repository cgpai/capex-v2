
import React, { useState, useRef, useCallback, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GenericTableRow } from './GenericTableRow';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  isNumeric?: boolean;
  sortable?: boolean;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: () => void;
}

interface GenericTableProps<T> {
  data: T[];
  columns: Column<T>[];
  className?: string;
  onRowClick?: (item: T) => void;
  onRowMouseEnter?: (item: T) => void;
  selectedRowId?: string | number | null;
  /** Virtualize rows when data exceeds threshold (default 25). */
  virtualizeRows?: boolean | 'auto';
  estimatedRowHeight?: number;
  virtualizeThreshold?: number;
}

const DEFAULT_ROW_HEIGHT = 52;
const DEFAULT_VIRTUAL_THRESHOLD = 25;

function getRowKey<T extends object>(item: T, index: number): React.Key {
  if (item && typeof item === 'object') {
    if ('id' in item && (item as { id?: string | number }).id) return (item as { id: string | number }).id;
    if ('versionName' in item && (item as { versionName?: string }).versionName) {
      return (item as { versionName: string }).versionName;
    }
    if ('type' in item && (item as { type?: string }).type) return (item as { type: string }).type;
  }
  return `row-${index}`;
}

function GenericTableInner<T extends object>({
  data,
  columns,
  className,
  onRowClick,
  onRowMouseEnter,
  selectedRowId,
  virtualizeRows = 'auto',
  estimatedRowHeight = DEFAULT_ROW_HEIGHT,
  virtualizeThreshold = DEFAULT_VIRTUAL_THRESHOLD,
}: GenericTableProps<T>) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const activeResizer = useRef<string | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const useVirtualization =
    virtualizeRows === true || (virtualizeRows === 'auto' && data.length >= virtualizeThreshold);

  const rowVirtualizer = useVirtualizer({
    count: useVirtualization ? data.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 8,
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
  });

  const onMouseDown = useCallback((e: React.MouseEvent, header: string) => {
    activeResizer.current = header;
    startX.current = e.clientX;
    const th = (e.target as HTMLElement).closest('th');
    startWidth.current = th ? th.offsetWidth : 0;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!activeResizer.current) return;
      const width = startWidth.current + moveEvent.clientX - startX.current;
      if (width > 60) {
        setColumnWidths((prev) => ({ ...prev, [activeResizer.current!]: width }));
      }
    };

    const onMouseUp = () => {
      activeResizer.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  const virtualRows = useVirtualization ? rowVirtualizer.getVirtualItems() : [];
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  const renderRow = (item: T, dataIndex: number, measureRef?: (node: Element | null) => void) => {
    const rowKey = getRowKey(item, dataIndex);
    const isSelected =
      selectedRowId != null && 'id' in item && (item as { id?: string | number }).id === selectedRowId;
    return (
      <GenericTableRow
        key={rowKey}
        item={item}
        index={dataIndex}
        columns={columns}
        rowKey={rowKey}
        isSelected={isSelected}
        hasRowClick={Boolean(onRowClick)}
        onRowClick={onRowClick}
        onRowMouseEnter={onRowMouseEnter}
        measureRef={measureRef}
        dataIndex={dataIndex}
      />
    );
  };

  return (
    <div ref={scrollRef} className={`overflow-auto ${className ?? ''}`}>
      <table className="w-full text-left text-sm table-fixed border-collapse">
        <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar sticky top-0 z-20 shadow-sm">
          <tr>
            {columns.map((col, index) => (
              <th
                key={String(col.header)}
                scope="col"
                className={`px-4 py-3 font-semibold relative select-none whitespace-normal border-b border-siloam-border bg-siloam-sidebar ${index === columns.length - 1 ? 'sticky right-0 border-l border-siloam-border' : ''}`}
                style={{ width: columnWidths[col.header] || 'auto' }}
              >
                <div className="flex items-center gap-1 pr-2 min-w-0">
                  <span className="truncate">{col.header}</span>
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        col.onSort?.();
                      }}
                      className="inline-flex shrink-0 flex-col items-center justify-center -space-y-1 rounded p-0.5 text-siloam-text-secondary hover:bg-siloam-border/60 hover:text-siloam-text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-siloam-blue"
                      aria-label={`Urutkan ${col.header}`}
                      title={
                        col.sortDirection === 'desc'
                          ? `${col.header}: Z–A (klik untuk A–Z)`
                          : `${col.header}: A–Z (klik untuk Z–A)`
                      }
                    >
                      <span
                        className={`text-[9px] leading-none ${
                          col.sortDirection === 'asc' ? 'text-siloam-blue' : 'opacity-35'
                        }`}
                        aria-hidden
                      >
                        ▲
                      </span>
                      <span
                        className={`text-[9px] leading-none ${
                          col.sortDirection === 'desc' ? 'text-siloam-blue' : 'opacity-35'
                        }`}
                        aria-hidden
                      >
                        ▼
                      </span>
                    </button>
                  ) : null}
                </div>
                <div
                  className="absolute top-0 right-0 h-full w-2 cursor-col-resize"
                  onMouseDown={(e) => onMouseDown(e, col.header)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {useVirtualization && paddingTop > 0 ? (
            <tr aria-hidden>
              <td colSpan={columns.length} style={{ height: paddingTop, padding: 0, border: 'none' }} />
            </tr>
          ) : null}
          {useVirtualization
            ? virtualRows.map((virtualRow) => {
                const item = data[virtualRow.index];
                return renderRow(item, virtualRow.index, rowVirtualizer.measureElement);
              })
            : data.map((item, index) => renderRow(item, index))}
          {useVirtualization && paddingBottom > 0 ? (
            <tr aria-hidden>
              <td colSpan={columns.length} style={{ height: paddingBottom, padding: 0, border: 'none' }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

GenericTableInner.displayName = 'GenericTable';

export const GenericTable = memo(GenericTableInner) as typeof GenericTableInner;
