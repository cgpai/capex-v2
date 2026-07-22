'use client';

import React, { Suspense, lazy } from 'react';
import type { ConfigurationDataPack } from '@/services/configurationApi';
import { ConfigurationTabSkeleton } from '@/features/configuration/core/ConfigurationPageShell';
import { CatalogueEditorModal } from '@/features/configuration/pipeline/components/CatalogueEditorModal';
import { RoomEditorModal } from '@/features/configuration/pipeline/components/RoomEditorModal';
import { VendorEditorModal } from '@/components/organisms/VendorEditorModal/VendorEditorModal';
import { usePipelineEntitySave } from '@/features/configuration/pipeline/hooks/usePipelineEntitySave';

const MasterCatalogueManagement = lazy(() =>
  import('@/components/organisms/MasterCatalogueManagement/MasterCatalogueManagement').then((m) => ({
    default: m.MasterCatalogueManagement,
  })),
);
const RoomManagement = lazy(() =>
  import('@/components/organisms/RoomManagement/RoomManagement').then((m) => ({
    default: m.RoomManagement,
  })),
);
const VendorManagement = lazy(() =>
  import('@/components/organisms/VendorManagement/VendorManagement').then((m) => ({
    default: m.VendorManagement,
  })),
);

const LazyTabFallback = () => <ConfigurationTabSkeleton rows={4} />;

type PipelineTabProps = {
  pack: Partial<ConfigurationDataPack>;
  refreshMasterCatalogue: () => void;
  refreshRooms: () => void;
  refreshVendors: () => void;
};

export function PipelineTab({
  pack,
  refreshMasterCatalogue,
  refreshRooms,
  refreshVendors,
}: PipelineTabProps) {
  const pipeline = usePipelineEntitySave(refreshMasterCatalogue, refreshRooms, refreshVendors);

  return (
    <>
      <div className="space-y-8">
        <Suspense fallback={<LazyTabFallback />}>
          <MasterCatalogueManagement
            catalogue={pack.masterCatalogue ?? []}
            onConfigChange={refreshMasterCatalogue}
            onOpenModal={pipeline.openCatalogueModal}
            onDelete={pipeline.handleDeleteCatalogueItem}
          />
          <RoomManagement
            rooms={pack.rooms ?? []}
            onConfigChange={refreshRooms}
            onOpenModal={pipeline.openRoomModal}
            onDelete={pipeline.handleDeleteRoom}
          />
          <VendorManagement
            vendors={pack.vendors ?? []}
            onConfigChange={refreshVendors}
            onOpenModal={pipeline.openVendorModal}
            onDelete={pipeline.handleDeleteVendor}
          />
        </Suspense>
      </div>
      <CatalogueEditorModal
        isOpen={pipeline.catalogueModalState.isOpen}
        onClose={pipeline.closeCatalogueModal}
        onSave={pipeline.handleSaveCatalogueItem}
        item={pipeline.catalogueModalState.item}
        isSaving={pipeline.isSaving}
      />
      <RoomEditorModal
        isOpen={pipeline.roomModalState.isOpen}
        onClose={pipeline.closeRoomModal}
        onSave={pipeline.handleSaveRoom}
        room={pipeline.roomModalState.room}
        isSaving={pipeline.isSaving}
      />
      <VendorEditorModal
        isOpen={pipeline.vendorModalState.isOpen}
        onClose={pipeline.closeVendorModal}
        onSave={pipeline.handleSaveVendor}
        item={pipeline.vendorModalState.item}
        isSaving={pipeline.isSaving}
      />
    </>
  );
}
