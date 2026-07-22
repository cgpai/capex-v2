'use client';

import React, { memo } from 'react';
import { DonutChart } from '@/components/molecules/DonutChart/DonutChart';
import { BarChart } from '@/components/molecules/BarChart/BarChart';
import { SankeyDiagram } from '@/components/molecules/SankeyDiagram/SankeyDiagram';
import type { DashboardStats } from '@/lib/dashboard/types';

export type DashboardChartsSectionProps = Pick<
  DashboardStats,
  'projectStatusData' | 'budgetByCategory' | 'sankeyData'
>;

export const DashboardChartsSection = memo(function DashboardChartsSection({
  projectStatusData,
  budgetByCategory,
  sankeyData,
}: DashboardChartsSectionProps) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DonutChart title="Project Status" data={projectStatusData} />
        <BarChart title="Budget by Category" data={budgetByCategory} />
      </div>
      <div>
        <SankeyDiagram title="Budget Flow" data={sankeyData} />
      </div>
    </>
  );
});
