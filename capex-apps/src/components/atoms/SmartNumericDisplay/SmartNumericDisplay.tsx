import React, { useMemo } from 'react';
import { formatCurrency, formatScaledCurrency } from '../../../lib/formatter';

export type SmartNumericDisplayProps = {
  value: number;
  /** `scaled` = Mn/K view; `full` = always Rp full amount; `auto` = scaled (same as scaled). */
  mode?: 'scaled' | 'full' | 'auto';
};

export const SmartNumericDisplay: React.FC<SmartNumericDisplayProps> = ({
  value,
  mode = 'scaled',
}) => {
  const fullText = useMemo(() => formatCurrency(value), [value]);
  const displayText = useMemo(
    () => (mode === 'full' ? fullText : formatScaledCurrency(value)),
    [mode, value, fullText],
  );

  const isNegative = value < 0;
  const showTooltip = mode !== 'full' && displayText !== fullText;

  return (
    <div
      className={`w-full h-full px-3 py-2.5 text-right tabular-nums ${isNegative ? 'text-danger' : ''}`}
      title={showTooltip ? fullText : undefined}
    >
      {displayText}
    </div>
  );
};
SmartNumericDisplay.displayName = 'SmartNumericDisplay';
