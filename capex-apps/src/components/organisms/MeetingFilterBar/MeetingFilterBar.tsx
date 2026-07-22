
import React, { useState, useEffect } from 'react';
import { ArchetypeConfig, AssetTypeGroupConfig } from '../../../types';
import * as configService from '../../../services/configService';
import { SlicerPanel } from '../SlicerPanel/SlicerPanel';

interface MeetingFilterBarProps {
  onFilterChange: (filters: { archetype: string | null; assetTypeGroup: string | null }) => void;
  /** Controlled slicer state (sync with parent / localStorage). */
  selectedArchetype?: string | null;
  selectedAssetTypeGroup?: string | null;
  /** When set, only these archetypes are shown (user scope). Omit to load all from config. */
  archetypeOptions?: string[];
  /** When set, slicer labels match parent master maps (active types only). */
  assetTypeGroupOptions?: string[];
  variant?: 'card' | 'flat';
  showAssetGroupFilter?: boolean;
}

export const MeetingFilterBar: React.FC<MeetingFilterBarProps> = ({
  onFilterChange,
  selectedArchetype: selectedArchetypeProp = null,
  selectedAssetTypeGroup: selectedAssetTypeGroupProp = null,
  archetypeOptions,
  assetTypeGroupOptions,
  variant = 'card',
  showAssetGroupFilter = true,
}) => {
  const [archetypes, setArchetypes] = useState<ArchetypeConfig[]>([]);
  const [assetTypeGroups, setAssetTypeGroups] = useState<AssetTypeGroupConfig[]>([]);

  const selectedArchetype = selectedArchetypeProp;
  const selectedAssetTypeGroup = selectedAssetTypeGroupProp;

  const archetypeNames = archetypeOptions ?? archetypes.map((a) => a.name);
  const assetGroupNames = assetTypeGroupOptions ?? assetTypeGroups.map((g) => g.name);

  useEffect(() => {
    const fetchData = async () => {
      const fetches: Promise<unknown>[] = [];
      if (!archetypeOptions) {
        fetches.push(configService.getAllArchetypesConfig().then(setArchetypes));
      }
      if (showAssetGroupFilter && !assetTypeGroupOptions) {
        fetches.push(configService.getAllAssetTypeGroups().then(setAssetTypeGroups));
      }
      await Promise.all(fetches);
    };
    void fetchData();
  }, [archetypeOptions, assetTypeGroupOptions, showAssetGroupFilter]);
  
  const setSelectedArchetype = (value: string | null) => {
    onFilterChange({ archetype: value, assetTypeGroup: selectedAssetTypeGroup });
  };
  const setSelectedAssetTypeGroup = (value: string | null) => {
    onFilterChange({ archetype: selectedArchetype, assetTypeGroup: value });
  };

  const containerClasses = variant === 'card'
    ? "bg-siloam-surface p-4 rounded-xl shadow-soft mb-6 space-y-4"
    : "bg-siloam-surface p-4 border-b border-siloam-border space-y-4";

  return (
    <div className={containerClasses}>
      <SlicerPanel
        title="Filter by Network"
        options={archetypeNames}
        selectedOption={selectedArchetype}
        onSelectOption={(v) => setSelectedArchetype(v)}
      />
      {showAssetGroupFilter && (
        <SlicerPanel
          title="Filter by Asset Type Group"
          options={assetGroupNames}
          selectedOption={selectedAssetTypeGroup}
          onSelectOption={(v) => setSelectedAssetTypeGroup(v)}
        />
      )}
    </div>
  );
};
