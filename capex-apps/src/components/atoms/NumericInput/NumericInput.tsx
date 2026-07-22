import React, { useCallback, useState, useEffect } from 'react';
import {
  clampNumericValue,
  formatNumericForInputMode,
  normalizeNumericTyping,
  parseGroupedNumericInput,
  parseNumericInput,
  parseNumericInputMode,
} from '../../../lib/numericInput';

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onValueChange: (value: number) => void;
  allowDecimal?: boolean;
  /** Show Indonesian thousand separators while typing (e.g. 1.000.000.000). */
  groupThousands?: boolean;
  align?: 'left' | 'right' | 'center';
}

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onValueChange,
  allowDecimal = true,
  groupThousands = false,
  align = 'right',
  className = '',
  disabled,
  min,
  max,
  onFocus,
  onBlur,
  ...rest
}) => {
  const [text, setText] = useState(() => formatNumericForInputMode(value, groupThousands));
  const [isFocused, setIsFocused] = useState(false);

  const minNum = min !== undefined ? Number(min) : undefined;
  const maxNum = max !== undefined ? Number(max) : undefined;
  const useGroupedIntegers = groupThousands && !allowDecimal;

  useEffect(() => {
    if (!isFocused) {
      setText(formatNumericForInputMode(value, useGroupedIntegers));
    }
  }, [value, isFocused, useGroupedIntegers]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let next = e.target.value;
      if (useGroupedIntegers) {
        next = next.replace(/[^\d-]/g, '');
      } else if (!allowDecimal) {
        next = next.replace(/[^\d-]/g, '');
      } else {
        next = next.replace(/[^\d.-]/g, '');
      }
      if (!useGroupedIntegers) {
        next = normalizeNumericTyping(next);
      }
      const parsed = clampNumericValue(
        useGroupedIntegers ? parseGroupedNumericInput(next) : parseNumericInput(next),
        minNum,
        maxNum,
      );
      onValueChange(parsed);
      setText(
        useGroupedIntegers ? formatNumericForInputMode(parsed, true) : next,
      );
    },
    [allowDecimal, maxNum, minNum, onValueChange, useGroupedIntegers],
  );

  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
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
        const parsed = clampNumericValue(parseNumericInputMode(text, useGroupedIntegers), minNum, maxNum);
        onValueChange(parsed);
        setText(formatNumericForInputMode(parsed, useGroupedIntegers));
        onBlur?.(e);
      }}
      className={`${alignClass} ${className}`.trim()}
    />
  );
};

NumericInput.displayName = 'NumericInput';
