'use client';

import React from 'react';
import type { ConfigurationDataPack } from '@/services/configurationApi';
import { MasterDataManagement } from '@/features/configuration/master-data/components/MasterDataManagement';

type MasterDataTabProps = {
  pack: Partial<ConfigurationDataPack>;
  refreshMasterData: () => void;
};

export function MasterDataTab({ pack, refreshMasterData }: MasterDataTabProps) {
  return (
    <div className="space-y-8">
      <MasterDataManagement
        archetypes={pack.archetypes ?? []}
        hospitalUnits={pack.hospitalUnits ?? []}
        regionals={pack.regionals ?? []}
        onMasterDataChange={refreshMasterData}
      />
    </div>
  );
}
