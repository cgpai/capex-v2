'use client';

import React, { memo } from 'react';
import { SmartNumericDisplay } from '../../atoms/SmartNumericDisplay/SmartNumericDisplay';
import type { Column } from './GenericTable';

type GenericTableRowProps<T extends object> = {
  item: T;
  index: number;
  columns: Column<T>[];
  rowKey: React.Key;
  isSelected: boolean;
  hasRowClick: boolean;
  onRowClick?: (item: T) => void;
  onRowMouseEnter?: (item: T) => void;
  measureRef?: (node: Element | null) => void;
  dataIndex?: number;
};

function GenericTableRowInner<T extends object>({
  item,
  columns,
  rowKey,
  isSelected,
  hasRowClick,
  onRowClick,
  onRowMouseEnter,
  measureRef,
  dataIndex,
}: GenericTableRowProps<T>) {
  return (
    <tr
      ref={measureRef}
      data-index={dataIndex}
      className={`border-b border-siloam-border transition-shadow duration-150 ${hasRowClick ? 'cursor-pointer hover:bg-siloam-bg' : ''} ${isSelected ? 'bg-siloam-blue/5 shadow-lg z-10 relative' : 'bg-siloam-surface'}`}
      onClick={() => onRowClick?.(item)}
      onMouseEnter={() => onRowMouseEnter?.(item)}
    >
      {columns.map((col, colIndex) => {
        const value =
          typeof col.accessor === 'function' ? col.accessor(item) : item[col.accessor as keyof T];
        const isFirstColumn = colIndex === 0;
        const isLastColumn = colIndex === columns.length - 1;

        if (col.isNumeric) {
          const numericValue = typeof value === 'number' ? value : 0;
          return (
            <td
              key={`${String(rowKey)}-${colIndex}`}
              className={`relative p-0 ${isFirstColumn && isSelected ? 'border-l-4 border-siloam-blue' : ''} ${isLastColumn ? 'sticky right-0 bg-siloam-surface border-l border-siloam-border' : ''}`}
            >
              <SmartNumericDisplay value={numericValue} />
            </td>
          );
        }

        return (
          <td
            key={`${String(rowKey)}-${colIndex}`}
            className={`relative p-0 text-siloam-text-primary ${isFirstColumn && isSelected ? 'border-l-4 border-siloam-blue' : ''} ${isLastColumn ? 'sticky right-0 bg-siloam-surface border-l border-siloam-border' : ''}`}
          >
            <div className="px-4 py-3 whitespace-normal break-words">{value as React.ReactNode}</div>
          </td>
        );
      })}
    </tr>
  );
}

export const GenericTableRow = memo(GenericTableRowInner, (prev, next) => {
  return (
    prev.item === next.item &&
    prev.isSelected === next.isSelected &&
    prev.columns === next.columns &&
    prev.hasRowClick === next.hasRowClick &&
    prev.onRowClick === next.onRowClick &&
    prev.onRowMouseEnter === next.onRowMouseEnter
  );
}) as typeof GenericTableRowInner;
