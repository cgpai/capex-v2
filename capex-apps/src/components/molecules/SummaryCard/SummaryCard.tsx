import React from 'react';

interface SummaryCardProps {
  title: string;
  value: string;
  // FIX: Specified a more precise type for the icon prop to allow `React.cloneElement` to pass SVG props.
  icon: React.ReactElement<React.SVGProps<SVGSVGElement>>;
  className?: string;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, icon, className }) => {
  return (
    <div className={`bg-siloam-surface p-6 rounded-xl shadow-soft flex items-center space-x-4 animate-fade-in ${className}`}>
      <div className="bg-siloam-blue/10 p-3 rounded-full">
        {/* FIX: The underlying icon components in constants.tsx were updated to accept props, fixing this cloneElement call. */}
        {React.cloneElement(icon, { className: 'h-6 w-6 text-siloam-blue' })}
      </div>
      <div>
        <p className="text-sm text-siloam-text-secondary">{title}</p>
        <p className="text-2xl font-bold text-siloam-text-primary">{value}</p>
      </div>
    </div>
  );
};

SummaryCard.displayName = 'SummaryCard';
