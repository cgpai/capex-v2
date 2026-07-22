'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UserActivityMetric,
  UserMonitoringScopeSummary,
  User,
  UserRole,
  Page,
} from '../types';
import { queryKeys } from '../lib/query-keys';
import { GenericTable, Column } from '../components/organisms/GenericTable/GenericTable';
import { usePermissions } from '../hooks/usePermissions';
import { usePagedListScreen } from '../hooks/usePagedListScreen';
import { isBackendConfigured } from '../lib/backendApiClient';
import {
  fetchUserMonitoringPageBundleFromBackend,
  fetchUserMonitoringUsersPageFromBackend,
  userMonitoringFiltersCacheKey,
  type UserMonitoringListFilters,
} from '../services/userMonitoringApi';
import { useToast } from '../contexts/ToastContext';

const SEARCH_DEBOUNCE_MS = 250;
const STALE_MS = 30_000;
const REFETCH_INTERVAL_MS = 30_000;
const LIVE_TICK_MS = 30_000;

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

interface StatCardProps {
  title: string;
  value: string | number;
  hint?: string;
  accentClass: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, hint, accentClass }) => (
  <div className="bg-siloam-surface p-5 rounded-xl shadow-soft border border-siloam-border">
    <p className="text-sm text-siloam-text-secondary">{title}</p>
    <p className={`text-3xl font-bold mt-1 ${accentClass}`}>{value}</p>
    {hint ? <p className="text-xs text-siloam-text-secondary mt-1">{hint}</p> : null}
  </div>
);

interface SummaryTableProps {
  title: string;
  rows: UserMonitoringScopeSummary[];
  onSelect?: (label: string) => void;
  selectedLabel?: string | null;
}

const SummaryTable: React.FC<SummaryTableProps> = ({ title, rows, onSelect, selectedLabel }) => (
  <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border overflow-hidden">
    <div className="px-4 py-3 border-b border-siloam-border">
      <h3 className="text-sm font-bold text-siloam-text-primary">{title}</h3>
    </div>
    <div className="max-h-[280px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-siloam-bg text-xs uppercase text-siloam-text-secondary">
          <tr>
            <th className="text-left px-4 py-2">Nama</th>
            <th className="text-right px-2 py-2">Online</th>
            <th className="text-right px-2 py-2">Aktif</th>
            <th className="text-right px-2 py-2">Dormant</th>
            <th className="text-right px-4 py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row) => {
              const selected = selectedLabel === row.label;
              const clickable = Boolean(onSelect);
              return (
                <tr
                  key={row.key}
                  onClick={clickable ? () => onSelect!(row.label) : undefined}
                  className={`border-t border-siloam-border ${
                    clickable ? 'cursor-pointer hover:bg-siloam-bg' : ''
                  } ${selected ? 'bg-siloam-blue/5' : ''}`}
                >
                  <td className="px-4 py-2 font-medium text-siloam-text-primary">{row.label}</td>
                  <td className="text-right px-2 py-2 text-emerald-600 font-semibold">{row.online}</td>
                  <td className="text-right px-2 py-2 text-siloam-green">{row.active}</td>
                  <td className="text-right px-2 py-2 text-yellow-700">{row.dormant}</td>
                  <td className="text-right px-4 py-2 text-siloam-text-secondary">{row.total}</td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-siloam-text-secondary">
                Tidak ada data ringkasan.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

function formatLastActive(value: string | null, isOnline?: boolean): string {
  if (isOnline) return 'Sedang aktif';
  if (!value) return 'Belum pernah';
  return new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatInactiveDuration(value: string | null, isOnline?: boolean, nowMs = Date.now()): string {
  if (isOnline) return '—';
  if (!value) return '-';
  const diff = nowMs - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days} hari lalu`;
  if (hours > 0) return `${hours} jam lalu`;
  if (minutes > 0) return `${minutes} menit lalu`;
  return 'Baru saja';
}

interface UserMonitoringPageProps {
  currentUser: User;
  allRoles?: UserRole[];
}

export const UserMonitoringPage: React.FC<UserMonitoringPageProps> = ({
  currentUser,
  allRoles = [],
}) => {
  const { showToast } = useToast();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.UserMonitoring, 'view');

  const [statusFilter, setStatusFilter] = useState<UserMonitoringListFilters['status']>('all');
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());

  const {
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    isSearchStaging,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    pageRangeLabel,
    goToPreviousPage,
    goToNextPage,
    totalPages: calcTotalPages,
  } = usePagedListScreen({
    filterResetKey: `${statusFilter}\u0001${selectedUnit ?? ''}`,
    initialPageSize: 25,
    searchDebounceMs: SEARCH_DEBOUNCE_MS,
  });

  const listFilters = useMemo<UserMonitoringListFilters>(
    () => ({
      search: debouncedSearch,
      status: statusFilter,
      archetypeName: null,
      unitName: selectedUnit,
    }),
    [debouncedSearch, statusFilter, selectedUnit],
  );

  const filtersKey = useMemo(
    () => userMonitoringFiltersCacheKey(listFilters),
    [listFilters],
  );

  React.useEffect(() => {
    const timer = window.setInterval(() => setLiveNowMs(Date.now()), LIVE_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const bundleQuery = useQuery({
    queryKey: queryKeys.userMonitoring.bundle(currentUser.id),
    queryFn: () => fetchUserMonitoringPageBundleFromBackend(currentUser.id),
    enabled: canView && isBackendConfigured(),
    staleTime: STALE_MS,
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const tableQuery = useQuery({
    queryKey: queryKeys.userMonitoring.table(currentUser.id, filtersKey, currentPage, itemsPerPage),
    queryFn: async () => {
      const fromBe = await fetchUserMonitoringUsersPageFromBackend({
        userId: currentUser.id,
        page: currentPage,
        pageSize: itemsPerPage,
        ...listFilters,
      });
      if (fromBe) return fromBe;
      if (isBackendConfigured()) {
        throw new Error('Gagal memuat daftar pengguna dari backend.');
      }
      return { rows: [], page: currentPage, pageSize: itemsPerPage, totalCount: 0 };
    },
    enabled: canView,
    staleTime: STALE_MS,
    refetchInterval: REFETCH_INTERVAL_MS,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: true,
  });

  const tableRows = tableQuery.data?.rows ?? [];
  const totalCount = tableQuery.data?.totalCount ?? 0;

  React.useEffect(() => {
    if (!tableQuery.isError) return;
    const msg = tableQuery.error instanceof Error ? tableQuery.error.message : 'Gagal memuat daftar pengguna.';
    showToast(msg, 'error');
  }, [tableQuery.isError, tableQuery.error, showToast]);

  const summary = bundleQuery.data?.summary ?? {
    totalUsers: totalCount,
    onlineNow: tableRows.filter((r) => r.isOnline).length,
    activeUsers: tableRows.filter((r) => r.status === 'Active').length,
    dormantUsers: tableRows.filter((r) => r.status === 'Dormant').length,
    inactiveUsers: tableRows.filter((r) => r.status === 'Inactive').length,
  };

  const unitOptions = useMemo(
    () => (bundleQuery.data?.hospitalUnits ?? []).map((hu) => hu.name).filter(Boolean),
    [bundleQuery.data?.hospitalUnits],
  );

  const handleUnitPick = useCallback((unitName: string) => {
    setSelectedUnit((prev) => (prev === unitName ? null : unitName));
  }, []);

  const userColumns: Column<UserActivityMetric>[] = useMemo(
    () => [
      {
        header: 'Pengguna',
        accessor: (user) => (
          <div className="flex items-center gap-2">
            {user.isOnline ? (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" title="Sedang online" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-siloam-border shrink-0" title="Offline" />
            )}
            <div>
              <p className="font-semibold text-siloam-text-primary">{user.username}</p>
              <p className="text-xs text-siloam-text-secondary">{user.email}</p>
            </div>
          </div>
        ),
      },
      { header: 'Role', accessor: 'roleName' },
      {
        header: 'Scope Network',
        accessor: (user) => {
          const names = user.archetypeNames ?? [];
          const label = names.length > 0 ? names.join(', ') : '—';
          return (
            <span className="text-xs text-siloam-text-secondary" title={label !== '—' ? label : undefined}>
              {names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : label}
            </span>
          );
        },
      },
      {
        header: 'Scope Unit',
        accessor: (user) => {
          const names = user.unitNames ?? [];
          const label = names.length > 0 ? names.join(', ') : '—';
          return (
            <span className="text-xs text-siloam-text-secondary" title={label !== '—' ? label : undefined}>
              {names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : label}
            </span>
          );
        },
      },
      {
        header: 'Status',
        accessor: (user) => {
          const color =
            user.isOnline
              ? 'bg-emerald-100 text-emerald-700'
              : user.status === 'Active'
                ? 'bg-siloam-green/10 text-siloam-green'
                : user.status === 'Dormant'
                  ? 'bg-warning/10 text-yellow-700'
                  : 'bg-gray-100 text-gray-500';
          const label = user.isOnline ? 'Online' : user.status;
          return <span className={`px-2 py-1 rounded text-xs font-bold ${color}`}>{label}</span>;
        },
      },
      {
        header: 'Terakhir Aktif',
        accessor: (user) => formatLastActive(user.lastActiveAt, user.isOnline),
      },
      {
        header: 'Durasi Nonaktif',
        accessor: (user) => formatInactiveDuration(user.lastActiveAt, user.isOnline, liveNowMs),
      },
    ],
    [liveNowMs],
  );

  const totalPages = calcTotalPages(totalCount);
  const range = pageRangeLabel(totalCount);
  const isInitialLoading = tableQuery.isPending && tableRows.length === 0;
  const isFilterRefreshing =
    isSearchStaging || (tableQuery.isFetching && !tableQuery.isPending);

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">
        Anda tidak memiliki izin untuk melihat halaman ini.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-siloam-text-primary">User Monitoring</h1>
          <p className="text-sm text-siloam-text-secondary">
            Data diperbarui otomatis setiap 30 detik dari sesi login & aktivitas aplikasi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void bundleQuery.refetch();
            void tableQuery.refetch();
          }}
          className="self-start p-2 bg-siloam-surface border border-siloam-border rounded-lg hover:bg-siloam-bg text-siloam-text-secondary"
          title="Refresh"
        >
          <RefreshIcon />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Pengguna" value={summary.totalUsers} accentClass="text-siloam-blue" />
        <StatCard
          title="Sedang Online"
          value={summary.onlineNow}
          hint="Aktif dalam 15 menit terakhir"
          accentClass="text-emerald-600"
        />
        <StatCard
          title="Aktif (30 Hari)"
          value={summary.activeUsers}
          accentClass="text-siloam-green"
        />
        <StatCard title="Dormant" value={summary.dormantUsers} accentClass="text-yellow-700" />
        <StatCard title="Inactive" value={summary.inactiveUsers} accentClass="text-danger" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SummaryTable
          title="Ringkasan per Network"
          rows={bundleQuery.data?.archetypeSummary ?? []}
        />
        <SummaryTable
          title="Ringkasan per Unit"
          rows={bundleQuery.data?.unitSummary ?? []}
          onSelect={handleUnitPick}
          selectedLabel={selectedUnit}
        />
      </div>

      <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border overflow-hidden">
        <div className="px-4 py-3 border-b border-siloam-border flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as UserMonitoringListFilters['status'])}
              className="px-3 py-2 border border-siloam-border rounded-lg text-sm bg-siloam-bg focus:ring-2 focus:ring-siloam-blue outline-none"
            >
              <option value="all">Semua status</option>
              <option value="online">Sedang online</option>
              <option value="Active">Aktif (30 hari)</option>
              <option value="Dormant">Dormant</option>
              <option value="Inactive">Inactive</option>
            </select>

            <select
              value={selectedUnit ?? ''}
              onChange={(e) => setSelectedUnit(e.target.value || null)}
              className="px-3 py-2 border border-siloam-border rounded-lg text-sm bg-siloam-bg focus:ring-2 focus:ring-siloam-blue outline-none max-w-[220px]"
            >
              <option value="">Semua unit</option>
              {unitOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            placeholder="Cari nama, email, role, unit..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full lg:w-72 px-3 py-2 border border-siloam-border rounded-lg text-sm focus:ring-2 focus:ring-siloam-blue outline-none"
          />
        </div>

        <div className="relative">
          {isInitialLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-siloam-surface/80">
              <p className="text-sm text-siloam-text-secondary">Memuat daftar pengguna…</p>
            </div>
          ) : null}
          {isFilterRefreshing && tableRows.length > 0 ? (
            <div className="absolute inset-x-0 top-0 z-20 flex justify-center bg-siloam-surface/90 py-1">
              <p className="text-xs text-siloam-text-secondary">
                {isSearchStaging ? 'Mencari…' : 'Memfilter…'}
              </p>
            </div>
          ) : null}

          <GenericTable columns={userColumns} data={tableRows} className="max-h-[520px]" />
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-t border-siloam-border">
          <div className="text-sm text-siloam-text-secondary">
            Menampilkan {range.from} - {range.to} dari {totalCount} pengguna
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-siloam-text-secondary">Per halaman:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 border border-siloam-border rounded bg-siloam-bg text-sm focus:outline-none focus:ring-2 focus:ring-siloam-blue"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg hover:bg-siloam-surface disabled:opacity-50 text-sm"
                >
                  Previous
                </button>
                <span className="text-sm text-siloam-text-secondary">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => goToNextPage(totalCount)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg hover:bg-siloam-surface disabled:opacity-50 text-sm"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

UserMonitoringPage.displayName = 'UserMonitoringPage';
