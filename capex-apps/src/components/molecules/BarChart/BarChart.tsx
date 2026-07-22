import React from 'react';
import { formatAbbreviatedCurrency, formatCurrency } from '../../../lib/formatter';

interface BarChartData {
  name: string;
  approved: number;
  consumed: number;
}

interface BarChartProps {
  title: string;
  data: BarChartData[];
}

export const BarChart: React.FC<BarChartProps> = ({ title, data }) => {
  const maxValue = data.length > 0 ? Math.max(...data.flatMap(d => [d.approved, d.consumed])) : 0;
  
  if (maxValue === 0) {
      return (
         <div className="bg-siloam-surface p-6 rounded-xl shadow-soft animate-fade-in h-full flex flex-col">
            <h3 className="text-lg font-bold text-siloam-text-primary mb-4">{title}</h3>
            <div className="flex-1 flex items-center justify-center">
                 <p className="text-siloam-text-secondary">No data to display.</p>
            </div>
        </div>
      )
  }

  return (
    <div className="bg-siloam-surface p-6 rounded-xl shadow-soft animate-fade-in h-full flex flex-col">
      <h3 className="text-lg font-bold text-siloam-text-primary mb-4">{title}</h3>
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-end space-x-4 text-sm mb-4">
            <div className="flex items-center"><span className="w-3 h-3 bg-siloam-blue/30 mr-2 rounded-sm"></span>Budget Approved</div>
            <div className="flex items-center"><span className="w-3 h-3 bg-siloam-blue mr-2 rounded-sm"></span>Budget Consumed</div>
        </div>
         <div className="grid gap-x-4 gap-y-2 flex-1" style={{ gridTemplateColumns: `auto repeat(${data.length}, 1fr)` }}>
            {/* Y-Axis Labels */}
            <div className="text-right text-xs text-siloam-text-secondary flex flex-col justify-between">
                <span>{formatAbbreviatedCurrency(maxValue)}</span>
                <span>{formatAbbreviatedCurrency(maxValue / 2)}</span>
                <span>0</span>
            </div>
            {/* Bars */}
            {data.map((item) => (
                <div key={item.name} className="flex flex-col items-center justify-end h-full relative border-l border-siloam-border pl-2">
                    <div className="w-full h-full flex items-end justify-center gap-1">
                        {/* Approved Bar (background) */}
                        <div 
                            className="w-1/2 bg-siloam-blue/30 rounded-t-sm" 
                            style={{ height: `${(item.approved / maxValue) * 100}%`}}
                            title={`Approved: ${formatCurrency(item.approved)}`}
                        ></div>
                        {/* Consumed Bar (foreground) */}
                        <div 
                            className="w-1/2 bg-siloam-blue rounded-t-sm" 
                            style={{ height: `${(item.consumed / maxValue) * 100}%` }}
                            title={`Consumed: ${formatCurrency(item.consumed)}`}
                        ></div>
                    </div>
                </div>
            ))}
            {/* X-Axis Labels */}
            <div></div> {/* Empty cell for alignment */}
             {data.map((item) => (
                <div key={item.name} className="text-center text-xs text-siloam-text-secondary pt-1 truncate" title={item.name}>{item.name}</div>
            ))}
        </div>
      </div>
    </div>
  );
};

BarChart.displayName = 'BarChart';