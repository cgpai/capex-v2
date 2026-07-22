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
    className="bg-siloam-surface rounded-xl shadow-soft overflow-hidden flex flex-col h-full border-t-4"
    style={{ borderColor: colorClass }}
  >
    <div className="p-4 flex-1">
      <div className="text-xs font-bold text-siloam-text-secondary uppercase tracking-wider mb-2">{title}</div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span
          className={`font-bold text-siloam-text-primary tabular-nums tracking-tight break-words ${
            isCurrency ? 'text-xl xl:text-2xl leading-snug' : 'text-4xl'
          }`}
          title={displayValue}
        >
          {displayValue}
        </span>
        {subValue != null && <span className="text-lg font-semibold text-siloam-text-secondary shrink-0">/ {subValue}</span>}
      </div>
      {subText && (
        <div className={`text-sm mt-1 font-medium tabular-nums ${subTextClassName ?? 'text-siloam-text-primary'}`}>{subText}</div>
      )}
      {footerText && <div className="text-[11px] text-siloam-text-secondary mt-2 border-t border-siloam-border pt-2">{footerText}</div>}
    </div>
  </div>
  );
};
