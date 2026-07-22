import React from 'react';
import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  className?: string;
  size?: number;
}

/** Decorative spinner; pair with visible button text for accessibility. */
export const Spinner: React.FC<SpinnerProps> = ({ className = '', size = 18 }) => (
  <Loader2 className={`animate-spin shrink-0 ${className}`} size={size} aria-hidden />
);
