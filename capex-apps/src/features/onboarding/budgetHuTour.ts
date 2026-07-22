import type { PageTourStep } from './types';

export const BUDGET_HU_TOUR_ID = 'budget-hu-v1';
export const BUDGET_HU_TOUR_VERSION = 1;

export type BudgetHuTourContext = {
  canSave: boolean;
  canCreateProject: boolean;
  showRoutineAsset: boolean;
};

export function buildBudgetHuTourSteps(ctx: BudgetHuTourContext): PageTourStep[] {
  const steps: PageTourStep[] = [
    {
      id: 'filters',
      target: 'header-budget-filters',
      title: 'Filter Data',
      description:
        'Pilih Budget Period, Network, dan Hospital Unit di header atas. Data di halaman ini mengikuti filter yang Anda pilih.',
      placement: 'bottom',
      optional: true,
    },
    {
      id: 'overview',
      target: 'budget-hu-header',
      title: 'Overview Budget HU',
      description:
        'Halaman ini menampilkan ringkasan dan detail budget untuk Hospital Unit yang dipilih, termasuk project strategis dan asset rutin.',
      placement: 'bottom',
    },
  ];

  if (ctx.canSave) {
    steps.push({
      id: 'save',
      target: 'budget-hu-save-actions',
      title: 'Simpan Perubahan',
      description:
        'Setelah mengedit project atau asset, klik Save Changes untuk menyimpan. Cancel mengembalikan data ke versi terakhir yang tersimpan.',
      placement: 'bottom',
    });
  }

  steps.push(
    {
      id: 'performance',
      target: 'budget-hu-unit-performance',
      title: 'Unit Performance',
      description:
        'Buka analitik kinerja unit — tren budget, realisasi, dan insight untuk HU yang sedang dipilih.',
      placement: 'bottom',
      optional: true,
    },
    {
      id: 'summary',
      target: 'budget-hu-summary',
      title: 'Budget Summary',
      description:
        'Ringkasan budget per kategori: plan, allocated, approved, dan consumed. Klik kartu untuk memperluas detail.',
      placement: 'bottom',
    },
  );

  if (ctx.showRoutineAsset) {
    steps.push({
      id: 'routine',
      target: 'budget-hu-routine-assets',
      title: 'Routine Assets',
      description:
        'Kelola asset rutin HU dan alokasi budget per kategori. Klik Manage Assets untuk menambah atau mengedit asset.',
      placement: 'top',
    });
  }

  steps.push(
    {
      id: 'projects',
      target: 'budget-hu-projects-section',
      title: 'Strategic Projects',
      description:
        'Tabel utama project strategis. Edit langsung pada sel yang diizinkan, atau buka project untuk mengelola asset.',
      placement: 'top',
    },
    {
      id: 'search',
      target: 'budget-hu-search',
      title: 'Pencarian',
      description: 'Cari project dan asset berdasarkan kode, nama project, atau deskripsi.',
      placement: 'bottom',
    },
  );

  if (ctx.canCreateProject) {
    steps.push({
      id: 'create',
      target: 'budget-hu-project-actions',
      title: 'Tambah & Kelola Project',
      description:
        '+ New Project menambah project strategis baru. Bulk Manage Projects untuk operasi massal (tambah, edit, hapus sekaligus).',
      placement: 'bottom',
      optional: true,
    });
  }

  steps.push({
    id: 'export',
    target: 'budget-hu-export',
    title: 'Export Excel',
    description: 'Unduh semua project HU (data lengkap dari server) ke file Excel untuk analisis offline.',
    placement: 'top',
    optional: true,
  });

  steps.push({
    id: 'done',
    title: 'Selesai',
    description:
      'Anda siap menggunakan Budget HU. Klik Panduan kapan saja di pojok kanan atas halaman untuk membuka walkthrough ini lagi.',
    placement: 'center',
  });

  return steps;
}
