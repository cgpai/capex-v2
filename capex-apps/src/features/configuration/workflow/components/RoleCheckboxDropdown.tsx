'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { UserRole } from '@/types';

type RoleCheckboxDropdownProps = {
  roles: UserRole[];
  selectedIds: number[];
  onChange: (nextIds: number[]) => void;
  disabled?: boolean;
};

export function RoleCheckboxDropdown({
  roles,
  selectedIds,
  onChange,
  disabled,
}: RoleCheckboxDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selectedLabels = roles.filter((r) => selectedIds.includes(r.id)).map((r) => r.roleName);
  const summary =
    selectedLabels.length === 0
      ? 'Pilih role…'
      : selectedLabels.length <= 2
        ? selectedLabels.join(', ')
        : `${selectedLabels.length} role dipilih`;

  const toggle = (roleId: number, checked: boolean) => {
    if (checked) {
      onChange([...new Set([...selectedIds, roleId])]);
      return;
    }
    onChange(selectedIds.filter((id) => id !== roleId));
  };

  return (
    <div ref={rootRef} className="relative w-full min-w-[9rem]" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-1 px-2 py-2 text-xs text-left bg-transparent hover:bg-siloam-bg/80 disabled:opacity-50 rounded"
      >
        <span className="truncate text-siloam-text-primary">{summary}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-40 top-full left-0 mt-1 min-w-[12rem] max-w-[16rem] max-h-52 overflow-y-auto bg-white border border-siloam-border shadow-lg rounded-lg p-2 space-y-0.5">
          {roles.length === 0 ? (
            <p className="text-xs text-siloam-text-secondary px-1 py-1">Tidak ada role.</p>
          ) : (
            roles.map((role) => (
              <label
                key={role.id}
                className="flex items-start gap-2 text-xs text-siloam-text-primary px-1 py-1.5 rounded hover:bg-siloam-bg cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(role.id)}
                  onChange={(e) => toggle(role.id, e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 text-siloam-blue border-siloam-border rounded focus:ring-siloam-blue"
                />
                <span>{role.roleName}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
