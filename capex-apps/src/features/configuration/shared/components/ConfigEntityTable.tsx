'use client';

import React from 'react';

export type ConfigEntityTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
};

type ConfigEntityTableProps<T extends { id: string }> = {
  columns: ConfigEntityTableColumn<T>[];
  rows: T[];
  renderActions: (row: T) => React.ReactNode;
};

export function ConfigEntityTable<T extends { id: string }>({
  columns,
  rows,
  renderActions,
}: ConfigEntityTableProps<T>) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar sticky top-0 z-10">
        <tr>
          {columns.map((col) => (
            <th key={col.key} className="px-4 py-3">
              {col.header}
            </th>
          ))}
          <th className="px-4 py-3">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="bg-siloam-surface border-b border-siloam-border hover:bg-siloam-bg">
            {columns.map((col) => (
              <td key={col.key} className="px-4 py-3">
                {col.render(row)}
              </td>
            ))}
            <td className="px-4 py-3 space-x-2">{renderActions(row)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
