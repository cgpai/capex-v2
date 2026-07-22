import React from 'react';

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, className }) => {
  const getColor = () => {
    if (value < 40) return 'bg-danger';
    if (value < 80) return 'bg-warning';
    return 'bg-siloam-green';
  };

  return (
    <div className={`w-full bg-gray-200 rounded-full h-2.5 ${className}`}>
      <div
        className={`h-2.5 rounded-full ${getColor()}`}
        style={{ width: `${value}%` }}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        role="progressbar"
      ></div>
    </div>
  );
};

ProgressBar.displayName = 'ProgressBar';
