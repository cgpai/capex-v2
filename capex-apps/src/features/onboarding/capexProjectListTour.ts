import type { PageTourStep } from './types';

export const CAPEX_PROJECT_LIST_TOUR_ID = 'capex-project-list-v1';
export const CAPEX_PROJECT_LIST_TOUR_VERSION = 1;

export type CapexProjectListTourContext = {
  hasPeriodFilter: boolean;
  canManageTasks: boolean;
};

export function buildCapexProjectListTourSteps(ctx: CapexProjectListTourContext): PageTourStep[] {
  const steps: PageTourStep[] = [
    {
      id: 'intro',
      target: 'cpl-page-intro',
      title: 'Capex Project List',
      description:
        'Halaman ini menampilkan daftar asset capex beserta progress workflow, filter lanjutan, dan panel detail saat Anda memilih baris.',
      placement: 'bottom',
    },
  ];

  if (ctx.hasPeriodFilter) {
    steps.push({
      id: 'filters',
      target: 'cpl-asset-filters',
      title: 'Pencarian & Filter Semua',
      description:
        'Cari asset, project, atau HU. Buka Filter Semua untuk budget period, Network, Asset Type Group, Hospital Unit, priority, dan filter lainnya dalam satu panel.',
      placement: 'bottom',
    });
  } else {
    steps.push({
      id: 'filters',
      target: 'cpl-asset-filters',
      title: 'Pencarian & Filter Semua',
      description:
        'Cari asset, project, atau HU. Buka Filter Semua untuk Network, Hospital Unit, priority, budget category, completion rate, dan filter lainnya.',
      placement: 'bottom',
    });
  }

  steps.push(
    {
      id: 'table',
      target: 'cpl-asset-table',
      title: 'Daftar Asset',
      description:
        'Tabel utama menampilkan asset dengan completion, last task, dan timing project. Badge biru menandakan task yang perlu tindakan Anda.',
      placement: 'top',
    },
    {
      id: 'export',
      target: 'cpl-export',
      title: 'Export Excel',
      description:
        'Unduh semua baris sesuai filter aktif ke Excel — berguna untuk reporting dan analisis offline.',
      placement: 'top',
      optional: true,
    },
    {
      id: 'detail',
      title: 'Panel Detail Asset',
      description: ctx.canManageTasks
        ? 'Klik baris asset untuk membuka panel detail: timeline workflow, Ringkasan Proyek, Add MOM, Add Adhoc Task, dan menu Aksi (edit project/asset).'
        : 'Klik baris asset untuk membuka panel detail berisi timeline workflow dan ringkasan proyek.',
      placement: 'center',
    },
    {
      id: 'done',
      title: 'Selesai',
      description:
        'Anda siap menggunakan Capex Project List. Klik Panduan kapan saja di atas daftar untuk membuka walkthrough ini lagi.',
      placement: 'center',
    },
  );

  return steps;
}
