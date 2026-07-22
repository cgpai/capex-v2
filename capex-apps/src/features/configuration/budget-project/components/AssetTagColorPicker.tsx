'use client';

import React from 'react';
import { ASSET_TAG_COLOR_OPTIONS } from '@/features/configuration/budget-project/utils/assetTagUtils';
import type { AssetTagConfig } from '@/types';

type AssetTagColorPickerProps = {
  value: string | undefined;
  onChange: (color: string) => void;
};

export function AssetTagColorPicker({ value, onChange }: AssetTagColorPickerProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-siloam-text-secondary">Color</label>
      <div className="flex gap-2 mt-1 flex-wrap">
        {ASSET_TAG_COLOR_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`w-8 h-8 rounded-full border-2 ${option.value.split(' ')[0]} ${
              value === option.value ? 'border-black' : 'border-transparent hover:border-gray-300'
            }`}
            title={option.label}
          />
        ))}
      </div>
    </div>
  );
}

type AssetTagFormProps = {
  draft: Partial<AssetTagConfig>;
  onChange: (partial: Partial<AssetTagConfig>) => void;
};

export function AssetTagForm({ draft, onChange }: AssetTagFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-siloam-text-secondary">Priority Name</label>
        <input
          type="text"
          value={draft.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
          className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
        />
      </div>
      <AssetTagColorPicker value={draft.color} onChange={(color) => onChange({ color })} />
    </div>
  );
}
