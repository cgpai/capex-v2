import React, { useCallback, useEffect, useState } from 'react';
import { formatCurrency, parseCurrency } from '../../../lib/formatter';
import { clampNumericValue } from '../../../lib/numericInput';

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onValueChange: (value: number) => void;
  align?: 'left' | 'right' | 'center';
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onValueChange,
  align = 'right',
  className = '',
  disabled,
  min,
  max,
  onFocus,
  onBlur,
  ...rest
}) => {
  const [text, setText] = useState(() => formatCurrency(value));
  const [isFocused, setIsFocused] = useState(false);

  const minNum = min !== undefined ? Number(min) : undefined;
  const maxNum = max !== undefined ? Number(max) : undefined;

  useEffect(() => {
    if (!isFocused) {
      setText(formatCurrency(value));
    }
  }, [value, isFocused]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value.replace(/[^\dRp.\s-]/gi, '');
      setText(next);
      const parsed = clampNumericValue(parseCurrency(next), minNum, maxNum);
      onValueChange(parsed);
      // Keep raw text while focused — immediate formatCurrency() resets partial input (e.g. "5000000").
    },
    [maxNum, minNum, onValueChange],
  );

  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={text}
      disabled={disabled}
      onChange={handleChange}
      onFocus={(e) => {
        setIsFocused(true);
        e.target.select();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        const parsed = clampNumericValue(parseCurrency(text), minNum, maxNum);
        onValueChange(parsed);
        setText(formatCurrency(parsed));
        onBlur?.(e);
      }}
      className={`${alignClass} ${className}`.trim()}
    />
  );
};

CurrencyInput.displayName = 'CurrencyInput';
