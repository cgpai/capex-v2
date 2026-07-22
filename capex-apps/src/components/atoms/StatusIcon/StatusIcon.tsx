import React from 'react';
// FIX: Corrected import path for types
import { ProjectStatus } from '../../../types';

interface StatusIconProps {
  status: ProjectStatus;
  className?: string;
}

export const StatusIcon: React.FC<StatusIconProps> = ({ status, className }) => {
  const baseClasses = "w-4 h-4 rounded-full";
  let colorClass = '';

  switch (status) {
    case ProjectStatus.OnTrack:
      colorClass = 'bg-green-500'; // Using Tailwind default color for better compatibility
      break;
    case ProjectStatus.AtRisk:
      colorClass = 'bg-yellow-500'; // Using Tailwind default color
      break;
    case ProjectStatus.OffTrack:
      colorClass = 'bg-red-500'; // Using Tailwind default color
      break;
    default:
      colorClass = 'bg-gray-300';
  }

  // Use custom properties if they are defined in tailwind.config.js, otherwise use defaults.
  // Assuming 'siloam-green', 'warning', 'danger' are custom colors.
  switch (status) {
    case ProjectStatus.OnTrack:
      colorClass = 'bg-siloam-green';
      break;
    case ProjectStatus.AtRisk:
      colorClass = 'bg-warning';
      break;
    case ProjectStatus.OffTrack:
      colorClass = 'bg-danger';
      break;
    default:
      colorClass = 'bg-gray-300';
  }

  return <div className={`${baseClasses} ${colorClass} ${className}`} />;
};

StatusIcon.displayName = 'StatusIcon';
