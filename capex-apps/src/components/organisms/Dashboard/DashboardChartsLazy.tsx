'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { DashboardChartsSkeleton } from './DashboardPageStates';
import type { DashboardChartsSectionProps } from './DashboardChartsSection';

const DashboardChartsSection = dynamic(
  () =>
    import('./DashboardChartsSection').then((m) => ({
      default: m.DashboardChartsSection,
    })),
  {
    ssr: false,
    loading: () => <DashboardChartsSkeleton />,
  },
);

export function DashboardChartsLazy(props: DashboardChartsSectionProps) {
  return <DashboardChartsSection {...props} />;
}
