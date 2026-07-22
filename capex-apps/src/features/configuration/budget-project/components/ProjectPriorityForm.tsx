'use client';

import React from 'react';
import type { ProjectPriorityConfig } from '@/types';

type ProjectPriorityFormProps = {
  draft: Partial<ProjectPriorityConfig>;
  onChange: (partial: Partial<ProjectPriorityConfig>) => void;
};

export function ProjectPriorityForm({ draft, onChange }: ProjectPriorityFormProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-siloam-text-secondary">Priority Name</label>
      <input
        type="text"
        value={draft.name || ''}
        onChange={(e) => onChange({ name: e.target.value })}
        className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
      />
    </div>
  );
}
