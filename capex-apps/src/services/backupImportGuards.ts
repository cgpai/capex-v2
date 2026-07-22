import {
  MASTER_CONFIG_IMPORT_CONFIRM_PHRASE,
} from '@/lib/dataProtection';

export type BackupImportUserChoice = {
  proceed: boolean;
  restoreMasterConfig: boolean;
};

/** UI guardrails for full backup import — master config preserved unless explicitly confirmed. */
export function resolveBackupImportUserChoice(): BackupImportUserChoice {
  const proceed = window.confirm(
    'Import akan menimpa data operasional (projects, assets, budget periods, PO/GR, dll.).\n\n' +
      'Master configuration (budget rules, archetype, HU, workflow, users/roles, dll.) akan DIPERTAHANKAN.\n\n' +
      'Lanjutkan import?',
  );
  if (!proceed) {
    return { proceed: false, restoreMasterConfig: false };
  }

  const alsoMaster = window.confirm(
    'Juga timpa SEMUA master configuration dari file backup?\n\n' +
      'Pilih OK hanya jika file backup memang berisi konfigurasi terbaru yang ingin Anda pulihkan.',
  );
  if (!alsoMaster) {
    return { proceed: true, restoreMasterConfig: false };
  }

  const typed = window.prompt(
    `Ketik persis "${MASTER_CONFIG_IMPORT_CONFIRM_PHRASE}" untuk menimpa master configuration:`,
  );
  if (typed?.trim() !== MASTER_CONFIG_IMPORT_CONFIRM_PHRASE) {
    window.alert('Konfirmasi master config dibatalkan. Import akan mempertahankan master configuration saat ini.');
    return { proceed: true, restoreMasterConfig: false };
  }

  return { proceed: true, restoreMasterConfig: true };
}
