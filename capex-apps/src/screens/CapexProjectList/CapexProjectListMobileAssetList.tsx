'use client';

import React, { memo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { EnrichedAsset } from '@/types';
import { AssetCard } from '@/components/molecules/AssetCard/AssetCard';
import { normAssetKey } from '@/lib/assetKeys';

const ESTIMATED_CARD_HEIGHT = 132;
const VIRTUALIZE_THRESHOLD = 8;

export type CapexProjectListMobileAssetListProps = {
  assets: EnrichedAsset[];
  selectedAssetId?: string | number | null;
  onRowClick: (asset: EnrichedAsset) => void;
  onRowHover: (asset: EnrichedAsset) => void;
  hasActiveFilters: boolean;
};

function CapexProjectListMobileAssetListInner({
  assets,
  selectedAssetId,
  onRowClick,
  onRowHover,
  hasActiveFilters,
}: CapexProjectListMobileAssetListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const useVirtualization = assets.length >= VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: useVirtualization ? assets.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: 4,
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1
        ? (element) => element?.getBoundingClientRect().height
        : undefined,
  });

  if (assets.length === 0) {
    return (
      <div className="text-center py-12 text-siloam-text-secondary">
        {hasActiveFilters ? 'No assets found matching the filters.' : 'No assets found.'}
      </div>
    );
  }

  if (!useVirtualization) {
    return (
      <div className="space-y-4">
        {assets.map((asset) => (
          <AssetCard
            key={normAssetKey(asset.id)}
            asset={asset}
            isSelected={selectedAssetId === asset.id}
            onClick={() => onRowClick(asset)}
            onMouseEnter={() => onRowHover(asset)}
          />
        ))}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto">
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const asset = assets[virtualRow.index];
          return (
            <div
              key={normAssetKey(asset.id)}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full px-0"
              style={{ transform: `translateY(${virtualRow.start}px)`, paddingBottom: 16 }}
            >
              <AssetCard
                asset={asset}
                isSelected={selectedAssetId === asset.id}
                onClick={() => onRowClick(asset)}
                onMouseEnter={() => onRowHover(asset)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const CapexProjectListMobileAssetList = memo(CapexProjectListMobileAssetListInner);
CapexProjectListMobileAssetList.displayName = 'CapexProjectListMobileAssetList';
