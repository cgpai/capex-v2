import React from 'react';

/** Dua huruf: inisial dari dua kata pertama, atau dua huruf pertama nama/email. */
export function getUserInitials(displayName: string, email?: string): string {
  const trimmed = displayName.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0][0] ?? '';
      const b = parts[1][0] ?? '';
      return (a + b).toUpperCase();
    }
    if (parts.length === 1) {
      const w = parts[0];
      if (w.length >= 2) return w.slice(0, 2).toUpperCase();
      return w.toUpperCase();
    }
  }
  const local = (email?.split('@')[0] || '?').trim();
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  return local.toUpperCase().slice(0, 2) || '?';
}

const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-24 h-24 text-2xl',
};

export interface UserAvatarProps {
  username: string;
  email?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  'aria-label'?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  username,
  email,
  size = 'sm',
  className = '',
  'aria-label': ariaLabel,
}) => {
  const initials = getUserInitials(username, email);
  const label = ariaLabel ?? `${username} avatar`;

  return (
    <div
      role="img"
      aria-label={label}
      className={`rounded-full bg-siloam-blue text-white flex items-center justify-center font-bold flex-shrink-0 select-none ${sizeClasses[size]} ${className}`}
    >
      {initials}
    </div>
  );
};

UserAvatar.displayName = 'UserAvatar';
