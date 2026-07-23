import React from 'react';

interface DonutChartProps {
  title: string;
  data: { name: string; value: number; color: string }[];
  valueFormatter?: (value: number) => string;
  /** Render chart body only — parent supplies the card shell */
  embedded?: boolean;
}

export const DonutChart: React.FC<DonutChartProps> = ({ title, data, valueFormatter, embedded = false }) => {
  const formatValue = valueFormatter ?? ((value: number) => String(value));
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  let accumulatedOffset = 0;

  const chartBody =
    total === 0 ? (
      <p className="text-sm text-siloam-text-secondary text-center py-8">Belum ada data.</p>
    ) : (
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6">
        <div className="relative w-36 h-36 shrink-0">
          <svg viewBox="0 0 120 120" className="transform -rotate-90 w-full h-full">
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
            <span
              className="text-sm font-bold text-siloam-text-primary text-center leading-tight tabular-nums"
              title={formatValue(total)}
            >
              {formatValue(total)}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 w-full md:max-w-[220px]">
          {data.map((item, index) => (
            <div key={index} className="flex items-start gap-2 text-xs min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-siloam-text-primary font-medium truncate">{item.name}</span>
              <span className="text-siloam-text-secondary ml-auto tabular-nums shrink-0">
                {(item.value / total * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    );

  if (embedded) {
    return chartBody;
  }

  if (total === 0) {
    return (
      <div className="bg-siloam-surface p-5 rounded-xl shadow-soft h-full flex flex-col border border-siloam-border/60 min-h-[360px]">
        <h3 className="text-base font-bold text-siloam-text-primary mb-4">{title}</h3>
        {chartBody}
      </div>
    );
  }

  return (
    <div className="bg-siloam-surface p-5 rounded-xl shadow-soft h-full flex flex-col border border-siloam-border/60 min-h-[360px]">
      <h3 className="text-base font-bold text-siloam-text-primary mb-4">{title}</h3>
      {chartBody}
    </div>
  );
};

DonutChart.displayName = 'DonutChart';
