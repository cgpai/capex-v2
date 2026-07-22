'use client';

import React from 'react';

type ConfigListHeaderProps = {
  title: string;
  newButtonLabel: string;
  onNew: () => void;
};

export function ConfigListHeader({ title, newButtonLabel, onNew }: ConfigListHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-4">
      <h3 className="text-lg font-bold text-siloam-text-primary">{title}</h3>
      <button
        type="button"
        onClick={onNew}
        className="bg-siloam-blue text-white px-4 py-2 rounded-xl hover:bg-siloam-blue/90 transition shadow-soft"
      >
        {newButtonLabel}
      </button>
    </div>
  );
}
