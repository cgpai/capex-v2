import React, { memo, Suspense, useCallback, useState } from 'react';
import { User } from '../types';
import { useToast } from '../contexts/ToastContext';

const SmartMigrationWizard = React.lazy(() =>
  import('../components/organisms/SmartMigrationWizard/SmartMigrationWizard').then((m) => ({
    default: m.SmartMigrationWizard,
  })),
);

const DataMigrationLegacyPanel = React.lazy(() =>
  import('../components/organisms/DataMigrationLegacyPanel/DataMigrationLegacyPanel').then((m) => ({
    default: m.DataMigrationLegacyPanel,
  })),
);

const SpreadsheetMigrationPanel = React.lazy(() =>
  import('../components/organisms/SpreadsheetMigrationPanel/SpreadsheetMigrationPanel').then((m) => ({
    default: m.SpreadsheetMigrationPanel,
  })),
);

interface DataMigrationPageProps {
  currentUser: User;
}

type ActiveTool = 'smart' | 'spreadsheet' | 'legacy';

function PanelFallback() {
  return (
    <div className="bg-siloam-surface rounded-xl border border-siloam-border p-8 animate-pulse">
      <div className="h-6 w-48 bg-siloam-border rounded mb-4" />
      <div className="h-4 w-full max-w-md bg-siloam-border/70 rounded mb-6" />
      <div className="h-32 bg-siloam-bg rounded-xl border border-dashed border-siloam-border" />
    </div>
  );
}

function DataMigrationPageInner({ currentUser }: DataMigrationPageProps) {
  const { showToast } = useToast();
  const [activeTool, setActiveTool] = useState<ActiveTool>('smart');

  const handleMigrationComplete = useCallback(() => {
    showToast('Sesi migrasi selesai.', 'success');
  }, [showToast]);

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-siloam-text-primary">Data Migration Center</h1>
          <p className="text-siloam-text-secondary mt-1">
            Centralized hub for importing, exporting, and processing data.
          </p>
        </div>

        <div className="bg-siloam-surface p-1 rounded-lg border border-siloam-border flex shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTool('smart')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTool === 'smart'
                ? 'bg-siloam-blue text-white shadow'
                : 'text-siloam-text-secondary hover:text-siloam-text-primary'
            }`}
          >
            Smart Migration
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('spreadsheet')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTool === 'spreadsheet'
                ? 'bg-siloam-blue text-white shadow'
                : 'text-siloam-text-secondary hover:text-siloam-text-primary'
            }`}
          >
            Spreadsheet Mode
          </button>
          <button
            type="button"
            onClick={() => setActiveTool('legacy')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTool === 'legacy'
                ? 'bg-siloam-blue text-white shadow'
                : 'text-siloam-text-secondary hover:text-siloam-text-primary'
            }`}
          >
            Utilities & Backups
          </button>
        </div>
      </div>

      {activeTool === 'smart' && (
        <Suspense fallback={<PanelFallback />}>
          <SmartMigrationWizard currentUser={currentUser} onComplete={handleMigrationComplete} />
        </Suspense>
      )}

      {activeTool === 'spreadsheet' && (
        <Suspense fallback={<PanelFallback />}>
          <SpreadsheetMigrationPanel
            currentUser={currentUser}
            onComplete={handleMigrationComplete}
          />
        </Suspense>
      )}

      {activeTool === 'legacy' && (
        <Suspense fallback={<PanelFallback />}>
          <DataMigrationLegacyPanel />
        </Suspense>
      )}
    </div>
  );
}

export const DataMigrationPage = memo(DataMigrationPageInner);
