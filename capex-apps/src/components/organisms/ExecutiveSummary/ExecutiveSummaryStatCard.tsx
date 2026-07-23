import React from 'react';

interface ExecutiveSummaryStatCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  subText?: string;
  subTextClassName?: string;
  colorClass: string;
  footerText?: string;
}

export const ExecutiveSummaryStatCard: React.FC<ExecutiveSummaryStatCardProps> = ({
  title,
  value,
  subValue,
  subText,
  subTextClassName,
  colorClass,
  footerText,
}) => {
  const displayValue = typeof value === 'number' ? String(value) : value;
  const isCurrency = typeof displayValue === 'string' && displayValue.trim().startsWith('Rp');

  return (
    <div
      className="bg-siloam-surface rounded-xl shadow-soft overflow-hidden flex flex-col h-full min-h-[140px] border-t-4"
      style={{ borderColor: colorClass }}
    >
    <div className="p-4 flex-1 flex flex-col">
      <div className="text-[11px] font-bold text-siloam-text-secondary uppercase tracking-wider mb-2 leading-snug">{title}</div>
      <div className="flex items-baseline gap-2 min-w-0 flex-1">
        <span
          className={`font-bold text-siloam-text-primary tabular-nums tracking-tight break-all ${
            isCurrency ? 'text-lg xl:text-xl leading-snug' : 'text-3xl'
          }`}
          title={displayValue}
        >
          {displayValue}
        </span>
        {subValue != null && <span className="text-base font-semibold text-siloam-text-secondary shrink-0">/ {subValue}</span>}
      </div>
      {subText && (
        <div className={`text-xs mt-2 leading-snug tabular-nums ${subTextClassName ?? 'text-siloam-text-secondary'}`}>{subText}</div>
      )}
      {footerText && <div className="text-[11px] text-siloam-text-secondary mt-2 border-t border-siloam-border pt-2">{footerText}</div>}
    </div>
  </div>
  );
};
