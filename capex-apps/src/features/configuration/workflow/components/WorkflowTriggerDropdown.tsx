'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Task } from '@/types';

type WorkflowTriggerDropdownProps = {
  options: Task[];
  selectedIds: string[];
  onChange: (nextIds: string[]) => void;
  disabled?: boolean;
};

export function WorkflowTriggerDropdown({
  options,
  selectedIds,
  onChange,
  disabled,
}: WorkflowTriggerDropdownProps) {
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

  if (options.length === 0) {
    return (
      <span className="block px-2 py-2 text-xs text-siloam-text-secondary italic">
        Tambah task di grup ini dulu
      </span>
    );
  }

  const selectedLabels = options.filter((t) => selectedIds.includes(t.id)).map((t) => t.name);
  const summary =
    selectedLabels.length === 0
      ? 'Pilih trigger…'
      : selectedLabels.length <= 2
        ? selectedLabels.join(', ')
        : `${selectedLabels.length} trigger dipilih`;

  const toggle = (taskId: string, checked: boolean) => {
    if (checked) {
      onChange([...new Set([...selectedIds, taskId])]);
      return;
    }
    onChange(selectedIds.filter((id) => id !== taskId));
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
        <div className="absolute z-40 top-full left-0 mt-1 min-w-[12rem] max-w-[18rem] max-h-52 overflow-y-auto bg-white border border-siloam-border shadow-lg rounded-lg p-2 space-y-0.5">
          {options.map((task) => (
            <label
              key={task.id}
              className="flex items-start gap-2 text-xs text-siloam-text-primary px-1 py-1.5 rounded hover:bg-siloam-bg cursor-pointer"
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={selectedIds.includes(task.id)}
                onChange={(e) => toggle(task.id, e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 text-siloam-blue border-siloam-border rounded focus:ring-siloam-blue disabled:opacity-50"
              />
              <span className="leading-snug">{task.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
