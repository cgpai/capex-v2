
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';

interface DropdownProps {
  label?: string;
  options: string[];
  selectedValue: string;
  onSelect: (value: string) => void;
  onOptionHover?: (value: string) => void;
  className?: string;
  placeholder?: string;
}

const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

export const Dropdown: React.FC<DropdownProps> = ({ label, options, selectedValue, onSelect, onOptionHover, className, placeholder = "Select..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((option: string) => {
    onSelect(option);
    setIsOpen(false);
  }, [onSelect]);
  
  // Memoize options to prevent unnecessary re-renders
  const memoizedOptions = useMemo(() => options, [options]);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {label && <label className="text-xs font-bold text-siloam-text-secondary uppercase mb-1 block">{label}</label>}
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
            w-full flex items-center justify-between text-left 
            border rounded-lg px-3 py-2 text-sm transition-all duration-200
            ${isOpen ? 'border-siloam-blue ring-1 ring-siloam-blue bg-siloam-surface' : 'border-siloam-border bg-siloam-surface hover:border-siloam-blue/50'}
            ${!memoizedOptions.length ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
        disabled={!memoizedOptions.length && !selectedValue}
      >
        <span className={`truncate mr-2 ${!selectedValue ? 'text-siloam-text-secondary' : 'text-siloam-text-primary font-medium'}`}>
          {selectedValue || placeholder}
        </span>
        <span className={`transition-transform duration-200 text-siloam-text-secondary ${isOpen ? 'transform rotate-180' : ''}`}>
            <ChevronDownIcon />
        </span>
      </button>

      {isOpen && memoizedOptions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full min-w-[150px] max-w-[90vw] bg-siloam-surface border border-siloam-border rounded-lg shadow-xl animate-fade-in origin-top-right overflow-hidden">
          <ul className="max-h-60 overflow-y-auto py-1 custom-scrollbar">
            {memoizedOptions.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  onMouseEnter={() => onOptionHover?.(option)}
                  onFocus={() => onOptionHover?.(option)}
                  onClick={() => handleSelect(option)}
                  className={`
                    w-full text-left px-4 py-2.5 text-sm transition-colors
                    ${option === selectedValue 
                        ? 'bg-siloam-blue/10 text-siloam-blue font-semibold border-l-4 border-siloam-blue' 
                        : 'text-siloam-text-primary hover:bg-siloam-bg border-l-4 border-transparent'
                    }
                  `}
                >
                  {option}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

Dropdown.displayName = 'Dropdown';
