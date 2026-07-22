'use client';

import React from 'react';

type ConfigActiveStatusBadgeProps = {
  isActive: boolean;
};

export function ConfigActiveStatusBadge({ isActive }: ConfigActiveStatusBadgeProps) {
  return (
    <span
      className={`px-2 py-1 text-xs font-semibold rounded-full ${
        isActive ? 'bg-siloam-green/10 text-siloam-green' : 'bg-gray-200 text-gray-600'
      }`}
    >
      {isActive ? 'Active' : 'Hidden'}
    </span>
  );
}
