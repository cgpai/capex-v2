
import React from 'react';

interface MultiSegmentProgressBarProps {
  total: number;
  consumed: number;
  approved: number;
  allocated: number;
  className?: string;
}

export const MultiSegmentProgressBar: React.FC<MultiSegmentProgressBarProps> = ({
  total,
  consumed,
  approved,
  allocated,
  className,
}) => {
  // Determine the maximum value to set the scale of the progress bar.
  // This allows bars to go "over" the 100% mark of the total budget.
  const scaleMax = Math.max(total, consumed, approved, allocated);

  // If scaleMax is 0, all values are 0, so render an empty bar.
  if (scaleMax === 0) {
    return <div className={`relative w-full bg-siloam-border rounded-full h-2.5 ${className}`} />;
  }

  // Calculate percentages based on the dynamic scaleMax
  const allocatedPercent = (allocated / scaleMax) * 100;
  const approvedPercent = (approved / scaleMax) * 100;
  const consumedPercent = (consumed / scaleMax) * 100;

  // Calculate the position of the "budget plan" marker
  const budgetMarkerPercent = (total / scaleMax) * 100;

  return (
    <div
      className={`relative w-full bg-siloam-border rounded-full h-2.5 ${className}`}
    >
      {/* Allocated Bar (Yellow) */}
      <div
        className="absolute top-0 left-0 h-2.5 rounded-full bg-warning"
        style={{ width: `${Math.min(100, allocatedPercent)}%` }}
        title={`Allocated: ${(allocated / total * 100 || 0).toFixed(1)}%`}
      />
      {/* Approved Bar (Green) */}
      <div
        className="absolute top-0 left-0 h-2.5 rounded-full bg-siloam-green"
        style={{ width: `${Math.min(100, approvedPercent)}%` }}
        title={`Approved: ${(approved / total * 100 || 0).toFixed(1)}%`}
      />
      {/* Consumed Bar (Blue) */}
      <div
        className="absolute top-0 left-0 h-2.5 rounded-full bg-siloam-blue"
        style={{ width: `${Math.min(100, consumedPercent)}%` }}
         title={`Consumed: ${(consumed / total * 100 || 0).toFixed(1)}%`}
      />
      
      {/* Budget Plan Marker */}
      {total > 0 && budgetMarkerPercent <= 100 && (
         <div
            className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-purple-500 z-10"
            style={{ left: `calc(${budgetMarkerPercent}% - 1px)` }}
            title="Budget Plan"
        />
      )}
    </div>
  );
};

MultiSegmentProgressBar.displayName = 'MultiSegmentProgressBar';
