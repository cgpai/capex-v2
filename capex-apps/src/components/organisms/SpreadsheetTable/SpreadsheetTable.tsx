import React, { useState, useRef, useCallback } from 'react';
import { SmartNumericDisplay } from '../../atoms/SmartNumericDisplay/SmartNumericDisplay';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';
import { parseGroupedNumericInput, parseNumericInput } from '../../../lib/numericInput';
import { useTableWindow } from '../../../hooks/useTableWindow';

const ESTIMATED_ROW_HEIGHT = 44;
const WINDOW_ROW_THRESHOLD = 30;

type SelectOption = string | { value: string; label: string };

export interface SpreadsheetColumn<T> {
  id?: string;
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  isEditable?: boolean | ((item: T) => boolean);
  isNumeric?: boolean;
  editorType?: 'text' | 'select' | 'date' | 'number';
  selectOptions?: SelectOption[] | ((item: T) => SelectOption[]);
  /** Keep select visible without click-to-edit (useful for per-row dropdowns). */
  alwaysShowEditor?: boolean;
  editorDisabled?: boolean | ((item: T) => boolean);
  align?: 'left' | 'right' | 'center';
  /** Default `currency` (SmartNumericDisplay). Use `plain` for counts/months (e.g. payback). */
  numericDisplay?: 'currency' | 'plain';
  formatCellDisplay?: (value: unknown, item: T) => React.ReactNode;
}

interface SpreadsheetTableProps<T> {
  data: T[];
  columns: SpreadsheetColumn<T>[];
  onDataChange: (newData: T[]) => void;
  rowHeaderAccessor: keyof T;
  className?: string;
  containerClassName?: string;
  maxHeight?: string;
  /** When `'auto'` (default), window rows when count exceeds threshold. */
  windowRows?: boolean | 'auto';
  /** When paste exceeds row count, append blank rows from this factory. */
  createRowOnPaste?: () => T;
}

function cellAlignClass(align: SpreadsheetColumn<unknown>['align'], isNumeric?: boolean): string {
  if (align === 'right' || (align === undefined && isNumeric)) return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

function resolveColumnSelectOptions<T>(col: SpreadsheetColumn<T>, item: T): SelectOption[] {
  if (!col.selectOptions) return [];
  return typeof col.selectOptions === 'function' ? col.selectOptions(item) : col.selectOptions;
}

function renderNumericCell(value: number, display: SpreadsheetColumn<unknown>['numericDisplay']) {
  if (display === 'plain') {
    return (
      <div className="w-full h-full px-3 py-2.5 text-right tabular-nums">
        {Number.isFinite(value) ? value : '—'}
      </div>
    );
  }
  return <SmartNumericDisplay value={value} />;
}

export const SpreadsheetTable = <T extends Record<string, any>>({
  data,
  columns,
  onDataChange,
  rowHeaderAccessor,
  className,
  containerClassName,
  maxHeight,
  windowRows = 'auto',
  createRowOnPaste,
}: SpreadsheetTableProps<T>) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const windowingEnabled =
    windowRows === true ||
    (windowRows === 'auto' && data.length > WINDOW_ROW_THRESHOLD);
  const { start, end, paddingTop, paddingBottom } = useTableWindow(
    data.length,
    scrollRef,
    ESTIMATED_ROW_HEIGHT,
    windowingEnabled,
  );
  const visibleData = windowingEnabled ? data.slice(start, end) : data;
  const rowOffset = windowingEnabled ? start : 0;

  // Using absolute indices: row index in data array, col index in columns array
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const activeResizer = useRef<string | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent, header: string) => {
      activeResizer.current = header;
      startX.current = e.clientX;
      const th = (e.target as HTMLElement).closest('th');
      startWidth.current = th ? th.offsetWidth : 0;
      
      const onMouseMove = (moveEvent: MouseEvent) => {
          if (!activeResizer.current) return;
          const width = startWidth.current + moveEvent.clientX - startX.current;
          if (width > 60) {
              setColumnWidths(prev => ({ ...prev, [activeResizer.current!]: width }));
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

  const handleValueChange = (rowIndex: number, accessor: keyof T, value: any) => {
    const newData = [...data];
    // Preserve semua field yang ada, hanya update field yang diubah
    newData[rowIndex] = { ...newData[rowIndex], [accessor]: value };
    onDataChange(newData);
  };

  const handleBlur = () => {
    setActiveCell(null);
  };
  
  const handlePaste = (e: React.ClipboardEvent) => {
    if (!activeCell) return;

    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    const rows = pasteData.split('\n').map(row => row.split('\t'));
    
    const startRow = activeCell.row;
    const startColIndex = activeCell.col;

    const newData = [...data];
    let dataChanged = false;

    const trimmedRows = rows[rows.length - 1]?.every((cell) => !cell.trim()) ? rows.slice(0, -1) : rows;
    const requiredRows = startRow + trimmedRows.length;
    if (createRowOnPaste && requiredRows > newData.length) {
      while (newData.length < requiredRows) {
        newData.push(createRowOnPaste());
      }
    }
    
    trimmedRows.forEach((row, rowIndex) => {
      const currentRowIndex = startRow + rowIndex;
      if (currentRowIndex >= newData.length) return;

      row.forEach((cellValue, colOffset) => {
        const currentColIndex = startColIndex + colOffset;
        if (currentColIndex >= columns.length) return;
        
        const column = columns[currentColIndex];
        const currentItem = newData[currentRowIndex];

        const isEditable = typeof column.isEditable === 'function' 
            ? column.isEditable(currentItem) 
            : column.isEditable;
        const allowPaste =
          typeof column.accessor === 'string' &&
          (isEditable ||
            (column.alwaysShowEditor && column.editorType === 'select'));

        if (allowPaste) {
           const accessorKey = column.accessor as keyof T & string;
           const useGrouped = column.isNumeric && column.numericDisplay !== 'plain';
           const finalValue = column.isNumeric
             ? (useGrouped ? parseGroupedNumericInput(cellValue) : parseNumericInput(cellValue.replace(/[^0-9.-]+/g, '')))
             : cellValue;
           newData[currentRowIndex] = { ...newData[currentRowIndex], [accessorKey]: finalValue };
           dataChanged = true;
        }
      });
    });

    if (dataChanged) {
        onDataChange(newData);
    }
  };

  const colKey = (col: SpreadsheetColumn<T>, index: number) => col.id ?? (col.header || `col-${index}`);

  const renderSelectDisplay = (col: SpreadsheetColumn<T>, rawValue: unknown, item: T) => {
    if (col.formatCellDisplay) {
      return col.formatCellDisplay(rawValue, item);
    }
    const options = resolveColumnSelectOptions(col, item);
    const opt = options.find((o) => (typeof o === 'object' ? o.value : o) === rawValue);
    return typeof opt === 'object' ? opt.label : opt;
  };

  const renderCellContent = (
    col: SpreadsheetColumn<T>,
    rawValue: unknown,
    value: unknown,
    item: T,
  ): React.ReactNode => {
    if (col.isNumeric && typeof value === 'number') {
      return renderNumericCell(value, col.numericDisplay);
    }
    if (col.formatCellDisplay) {
      return col.formatCellDisplay(rawValue, item);
    }
    if (col.editorType === 'select') {
      return renderSelectDisplay(col, rawValue, item);
    }
    return value as React.ReactNode;
  };

  return (
    <div
      ref={scrollRef}
      className={`overflow-auto border border-siloam-border rounded-xl shadow-soft ${containerClassName ?? ''} ${className ?? ''}`}
      style={maxHeight ? { maxHeight } : undefined}
      onPaste={handlePaste}
    >
      <table className="w-full text-sm table-auto min-w-full border-collapse">
        <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar sticky top-0 z-20 border-b border-siloam-border">
          <tr>
            {columns.map((col, index) => {
              const isLastColumn = index === columns.length - 1;
              const alignCls = cellAlignClass(col.align, col.isNumeric);
              return (
              <th
                key={colKey(col, index)}
                scope="col"
                className={`px-3 py-2.5 font-semibold relative select-none whitespace-nowrap ${alignCls} ${isLastColumn ? 'sticky right-0 bg-siloam-sidebar border-l border-siloam-border z-20' : ''}`}
                style={{ width: columnWidths[col.header] || undefined }}
              >
                {col.header}
                 <div
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize"
                    onMouseDown={(e) => onMouseDown(e, col.header)}
                />
              </th>
            );
            })}
          </tr>
        </thead>
        <tbody>
          {windowingEnabled && paddingTop > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={columns.length} style={{ height: paddingTop, padding: 0, border: 'none' }} />
            </tr>
          ) : null}
          {visibleData.map((item, localIndex) => {
            const rowIndex = rowOffset + localIndex;
            return (
            <tr
              key={item.id || rowIndex}
              className="bg-siloam-surface border-b border-siloam-border last:border-b-0 transition-colors hover:bg-siloam-blue/[0.04] group"
            >
              {columns.map((col, colIndex) => {
                 const isLastColumn = colIndex === columns.length - 1;
                 const rawValue = typeof col.accessor === 'function' ? col.accessor(item) : item[col.accessor];
                 const value = rawValue;
                 const isNegative = typeof value === 'number' && value < 0;
                 const alignCls = cellAlignClass(col.align, col.isNumeric);

                 const isEditable = typeof col.isEditable === 'function' ? col.isEditable(item) : col.isEditable;
                 const isCellActive = activeCell?.row === rowIndex && activeCell?.col === colIndex;
                 const showAlwaysSelect =
                   typeof col.accessor === 'string' &&
                   col.editorType === 'select' &&
                   col.alwaysShowEditor;

                 if (showAlwaysSelect) {
                   const accessorKey = col.accessor as keyof T & string;
                   const rowSelectOptions = resolveColumnSelectOptions(col, item);
                   const editorDisabled =
                     !isEditable ||
                     (typeof col.editorDisabled === 'function'
                       ? col.editorDisabled(item)
                       : col.editorDisabled);
                   return (
                     <td
                       key={String(col.accessor)}
                       className={`p-0 border-r border-siloam-border last:border-r-0 ${isLastColumn ? 'sticky right-0 bg-siloam-surface border-l border-siloam-border' : ''}`}
                       onClick={(e) => e.stopPropagation()}
                     >
                       <select
                         value={(item[accessorKey] as string) || ''}
                         disabled={editorDisabled}
                         onChange={(e) => handleValueChange(rowIndex, accessorKey, e.target.value)}
                         className="w-full h-full px-3 py-2.5 bg-transparent border-none outline-none focus:ring-2 focus:ring-inset focus:ring-siloam-blue disabled:cursor-not-allowed disabled:opacity-50"
                       >
                         {rowSelectOptions.map((opt) => {
                           const val = typeof opt === 'object' ? opt.value : opt;
                           const label = typeof opt === 'object' ? opt.label : opt;
                           return (
                             <option key={val} value={val}>
                               {label}
                             </option>
                           );
                         })}
                       </select>
                     </td>
                   );
                 }

                 if (isEditable && typeof col.accessor === 'string') {
                   const accessorKey = col.accessor;

                   if (isCellActive) {
                       if (col.editorType === 'select') {
                         const rowSelectOptions = resolveColumnSelectOptions(col, item);
                         return (
                           <td
                             key={String(col.accessor)}
                             className={`p-0 border-r border-siloam-border last:border-r-0 ${isLastColumn ? 'sticky right-0 bg-siloam-surface border-l border-siloam-border' : ''}`}
                           >
                             <select
                               value={item[accessorKey] || ''}
                               onChange={(e) => handleValueChange(rowIndex, accessorKey, e.target.value)}
                               onBlur={handleBlur}
                               className="w-full h-full px-4 py-3 bg-transparent border-none outline-none focus:ring-2 focus:ring-inset focus:ring-siloam-blue"
                               autoFocus
                             >
                               {rowSelectOptions.map((opt) => {
                                 const val = typeof opt === 'object' ? opt.value : opt;
                                 const label = typeof opt === 'object' ? opt.label : opt;
                                 return (
                                   <option key={val} value={val}>
                                     {label}
                                   </option>
                                 );
                               })}
                             </select>
                           </td>
                         );
                       }
                       if (col.isNumeric) {
                           const groupThousands = col.numericDisplay !== 'plain';
                           return (
                               <td key={String(col.accessor)} className={`p-0 border-r border-siloam-border last:border-r-0 ${isLastColumn ? 'sticky right-0 bg-siloam-surface border-l border-siloam-border' : ''}`}>
                                   <NumericInput
                                       value={typeof item[accessorKey] === 'number' ? item[accessorKey] : 0}
                                       onValueChange={(val) => handleValueChange(rowIndex, accessorKey, val)}
                                       onBlur={handleBlur}
                                       groupThousands={groupThousands}
                                       allowDecimal={!groupThousands}
                                       className="w-full h-full px-4 py-3 bg-transparent border-none outline-none focus:ring-2 focus:ring-inset focus:ring-siloam-blue"
                                       autoFocus
                                   />
                               </td>
                           );
                       }
                      return (
                        <td key={String(col.accessor)} className={`p-0 border-r border-siloam-border last:border-r-0 ${isLastColumn ? 'sticky right-0 bg-siloam-surface border-l border-siloam-border' : ''}`}>
                          {(col.editorType === 'number' || col.isNumeric) ? (
                            <NumericInput
                              value={typeof item[accessorKey] === 'number' ? item[accessorKey] : 0}
                              onValueChange={(val) => handleValueChange(rowIndex, accessorKey, val)}
                              onBlur={handleBlur}
                              groupThousands={col.isNumeric && col.numericDisplay !== 'plain'}
                              allowDecimal={!(col.isNumeric && col.numericDisplay !== 'plain')}
                              className="w-full h-full px-4 py-3 bg-transparent border-none outline-none focus:ring-2 focus:ring-inset focus:ring-siloam-blue"
                              autoFocus
                            />
                          ) : (
                          <input
                            type={col.editorType === 'date' ? 'date' : 'text'}
                            value={item[accessorKey] ?? ''}
                            onFocus={(e) => {
                                if (col.editorType !== 'date') {
                                    e.target.select();
                                }
                            }}
                            onChange={(e) => handleValueChange(rowIndex, accessorKey, e.target.value)}
                            onBlur={handleBlur}
                            className={`w-full h-full px-4 py-3 bg-transparent border-none outline-none focus:ring-2 focus:ring-inset focus:ring-siloam-blue`}
                            autoFocus
                          />
                          )}
                        </td>
                      );
                   } else {
                     // Render display view of editable cell
                     return (
                       <td
                         key={String(accessorKey)}
                         onClick={() => setActiveCell({ row: rowIndex, col: colIndex })}
                         className={`p-0 border-r border-siloam-border last:border-r-0 cursor-pointer ${alignCls} ${isLastColumn ? 'sticky right-0 bg-siloam-surface group-hover:bg-siloam-blue/[0.04] border-l border-siloam-border' : ''}`}
                       >
                         {col.isNumeric ? (
                            renderNumericCell(typeof value === 'number' ? value : 0, col.numericDisplay)
                         ) : (
                            <div className={`px-3 py-2.5 whitespace-normal break-words ${alignCls}`}>
                                {col.editorType === 'select'
                                  ? renderSelectDisplay(col, item[accessorKey], item)
                                  : typeof value === 'number'
                                    ? String(value)
                                    : value}
                            </div>
                         )}
                       </td>
                     );
                   }
                }

                // Non-editable cells
                return (
                  <td
                    key={`${rowIndex}-${colIndex}`}
                    className={`p-0 text-siloam-text-primary border-r border-siloam-border last:border-r-0 ${alignCls} ${isNegative ? 'text-danger' : ''} ${isLastColumn ? 'sticky right-0 bg-siloam-surface group-hover:bg-siloam-blue/[0.04] border-l border-siloam-border' : ''}`}
                  >
                    <div className={`px-3 py-2.5 whitespace-normal break-words ${alignCls}`}>
                      {renderCellContent(col, rawValue, value, item)}
                    </div>
                  </td>
                );
              })}
            </tr>
          );
          })}
          {windowingEnabled && paddingBottom > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={columns.length} style={{ height: paddingBottom, padding: 0, border: 'none' }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
};

SpreadsheetTable.displayName = 'SpreadsheetTable';