import React from 'react';

interface DonutChartProps {
  title: string;
  data: { name: string; value: number; color: string }[];
  valueFormatter?: (value: number) => string;
}

export const DonutChart: React.FC<DonutChartProps> = ({ title, data, valueFormatter }) => {
  const formatValue = valueFormatter ?? ((value: number) => String(value));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  let accumulatedOffset = 0;

  if (total === 0) {
    return (
       <div className="bg-siloam-surface p-6 rounded-xl shadow-soft animate-fade-in h-full flex flex-col items-center justify-center">
            <h3 className="text-lg font-bold text-siloam-text-primary mb-4 self-start">{title}</h3>
            <p className="text-siloam-text-secondary">No data available.</p>
        </div>
    );
  }

  return (
    <div className="bg-siloam-surface p-6 rounded-xl shadow-soft animate-fade-in h-full flex flex-col">
      <h3 className="text-lg font-bold text-siloam-text-primary mb-4">{title}</h3>
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-6">
        <div className="relative w-40 h-40">
          <svg viewBox="0 0 120 120" className="transform -rotate-90">
            {data.map((item, index) => {
              const dasharray = (item.value / total) * circumference;
              const strokeDashoffset = accumulatedOffset;
              accumulatedOffset += dasharray;

              return (
                <circle
                  key={index}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth="20"
                  strokeDasharray={`${dasharray} ${circumference - dasharray}`}
                  strokeDashoffset={-strokeDashoffset}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center px-2">
             <span className="text-sm font-bold text-siloam-text-primary text-center leading-tight tabular-nums" title={formatValue(total)}>
               {formatValue(total)}
             </span>
          </div>
        </div>
        <div className="flex flex-col space-y-2">
          {data.map((item, index) => (
            <div key={index} className="flex items-center text-sm">
              <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></span>
              <span className="text-siloam-text-primary font-medium">{item.name}:</span>
              <span className="text-siloam-text-secondary ml-1 tabular-nums">
                {formatValue(item.value)} ({(item.value / total * 100).toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

DonutChart.displayName = 'DonutChart';
