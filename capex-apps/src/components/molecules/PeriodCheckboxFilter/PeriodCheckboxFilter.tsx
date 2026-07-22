import React, { useMemo } from 'react';

interface PeriodCheckboxFilterProps {
  options: string[];
  selectedPeriods: string[];
  onChange: (periods: string[]) => void;
  className?: string;
}

const checkboxClassName =
  'h-4 w-4 text-siloam-blue border-siloam-border rounded focus:ring-siloam-blue transition duration-150 ease-in-out';

export const PeriodCheckboxFilter: React.FC<PeriodCheckboxFilterProps> = ({
  options,
  selectedPeriods,
  onChange,
  className = '',
}) => {
  const normalizedOptions = useMemo(
    () => Array.from(new Set(options.map((o) => o.trim()).filter(Boolean))),
    [options],
  );

  const isAllSelected = selectedPeriods.length === 0;

  const isPeriodChecked = (period: string) =>
    isAllSelected || selectedPeriods.includes(period);

  const handleAllChange = (checked: boolean) => {
    if (checked) {
      onChange([]);
      return;
    }
    // Uncheck "Semua" → tampilkan periode terbaru saja (bukan tetap semua).
    onChange(normalizedOptions.length > 0 ? [normalizedOptions[0]] : []);
  };

  const handlePeriodChange = (period: string, checked: boolean) => {
    if (isAllSelected) {
      // Dari mode "Semua", klik periode mana pun → fokus ke periode itu saja.
      onChange([period]);
      return;
    }

    if (checked) {
      const next = [...selectedPeriods, period];
      if (next.length >= normalizedOptions.length) {
        onChange([]);
      } else {
        onChange(next);
      }
      return;
    }

    const next = selectedPeriods.filter((p) => p !== period);
    if (next.length === 0) {
      const fallback = normalizedOptions.find((p) => p !== period);
      onChange(fallback ? [fallback] : []);
      return;
    }
    onChange(next);
  };

  if (normalizedOptions.length === 0) return null;

  return (
    <div className={`flex flex-col items-end gap-1.5 ${className}`.trim()}>
      <span className="text-xs font-bold text-siloam-text-secondary uppercase tracking-wide">
        Periode Budget
      </span>
      <div className="flex flex-wrap justify-end gap-x-4 gap-y-1.5 max-w-full">
        <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={(e) => handleAllChange(e.target.checked)}
            className={checkboxClassName}
          />
          <span className={isAllSelected ? 'font-semibold text-siloam-blue' : 'text-siloam-text-primary'}>
            Semua Budget Period
          </span>
        </label>
        {normalizedOptions.map((period) => {
          const checked = isPeriodChecked(period);
          return (
            <label
              key={period}
              className="flex items-center gap-1.5 text-sm cursor-pointer select-none whitespace-nowrap"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => handlePeriodChange(period, e.target.checked)}
                className={checkboxClassName}
              />
              <span
                className={checked && !isAllSelected ? 'font-semibold text-siloam-blue' : 'text-siloam-text-primary'}
              >
                {period}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
};
