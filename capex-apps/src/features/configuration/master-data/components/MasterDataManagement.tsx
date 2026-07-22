'use client';

import React from 'react';
import type { ArchetypeConfig, HospitalUnitConfig, RegionalConfig } from '@/types';
import { useMasterDataCrud } from '@/features/configuration/master-data/hooks/useMasterDataCrud';
import { MasterDataColumn } from './MasterDataColumn';
import { MasterDataEditorModal } from './MasterDataEditorModal';

export const MasterDataManagement: React.FC<{
  archetypes: ArchetypeConfig[];
  hospitalUnits: HospitalUnitConfig[];
  regionals: RegionalConfig[];
  onMasterDataChange: () => void;
}> = ({ archetypes, hospitalUnits, regionals, onMasterDataChange }) => {
  const { modalState, openModal, closeModal, save, remove } = useMasterDataCrud(onMasterDataChange);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MasterDataColumn
          title="Regional"
          type="regional"
          items={regionals}
          archetypes={archetypes}
          regionals={regionals}
          onNew={() => openModal('regional')}
          onEdit={(item) => openModal('regional', item)}
          onDelete={(id) => remove('regional', id)}
        />
        <MasterDataColumn
          title="Network"
          type="archetype"
          items={archetypes}
          archetypes={archetypes}
          regionals={regionals}
          onNew={() => openModal('archetype')}
          onEdit={(item) => openModal('archetype', item)}
          onDelete={(id) => remove('archetype', id)}
        />
        <MasterDataColumn
          title="Hospital Unit"
          type="hu"
          items={hospitalUnits}
          archetypes={archetypes}
          regionals={regionals}
          onNew={() => openModal('hu')}
          onEdit={(item) => openModal('hu', item)}
          onDelete={(id) => remove('hu', id)}
        />
      </div>
      {modalState.type && (
        <MasterDataEditorModal
          isOpen={modalState.isOpen}
          onClose={closeModal}
          onSave={(item) =>
            save(item as unknown as RegionalConfig | ArchetypeConfig | HospitalUnitConfig)
          }
          item={modalState.data as Record<string, unknown> | null}
          type={modalState.type}
          allArchetypes={archetypes}
          allRegionals={regionals}
        />
      )}
    </>
  );
};
