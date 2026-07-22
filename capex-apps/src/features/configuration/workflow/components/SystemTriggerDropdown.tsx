'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SYSTEM_TRIGGER_EVENTS, type SystemTriggerEvent } from '@/types';

type SystemTriggerDropdownProps = {
  selected: SystemTriggerEvent[];
  onChange: (next: SystemTriggerEvent[]) => void;
  disabled?: boolean;
};

export function SystemTriggerDropdown({
  selected,
  onChange,
  disabled,
}: SystemTriggerDropdownProps) {
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

  const selectedLabels = SYSTEM_TRIGGER_EVENTS.filter((e) => selected.includes(e.value)).map(
    (e) => e.label,
  );
  const summary =
    selectedLabels.length === 0
      ? 'Pilih trigger event…'
      : selectedLabels.length <= 1
        ? selectedLabels[0]
        : `${selectedLabels.length} event dipilih`;

  const toggle = (value: SystemTriggerEvent, checked: boolean) => {
    if (checked) {
      onChange([...new Set([...selected, value])]);
      return;
    }
    onChange(selected.filter((v) => v !== value));
  };

  return (
    <div ref={rootRef} className="relative w-full min-w-[10rem]" onClick={(e) => e.stopPropagation()}>
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
        <div className="absolute z-40 top-full left-0 mt-1 min-w-[14rem] max-w-[20rem] max-h-52 overflow-y-auto bg-white border border-siloam-border shadow-lg rounded-lg p-2 space-y-0.5">
          {SYSTEM_TRIGGER_EVENTS.map((event) => (
            <label
              key={event.value}
              className="flex items-start gap-2 text-xs text-siloam-text-primary px-1 py-1.5 rounded hover:bg-siloam-bg cursor-pointer"
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.includes(event.value)}
                onChange={(e) => toggle(event.value, e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 text-siloam-blue border-siloam-border rounded focus:ring-siloam-blue disabled:opacity-50"
              />
              <span className="leading-snug">{event.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
