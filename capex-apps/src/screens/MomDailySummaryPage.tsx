import React, { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DailyMOMSummaryRow, User, UserRole } from '../types';
import { Page } from '../types';
import * as taskService from '../services/taskService';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../contexts/ToastContext';
import { queryKeys } from '../lib/query-keys';

interface MomDailySummaryPageProps {
  currentUser: User | null;
  allRoles: UserRole[];
  periodName: string;
}

const todayYyyyMmDd = () => new Date().toLocaleDateString('en-CA');

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function rowToPlainText(r: DailyMOMSummaryRow): string {
  return [
    `Project: ${r.projectName} (${r.projectCode})`,
    `Asset: ${r.assetName} (${r.assetCode})`,
    `Oleh: ${r.mom.createdByUsername}`,
    `Waktu: ${formatDateTime(r.mom.createdAt)}`,
    '',
    r.mom.content.trim(),
  ].join('\n');
}

export const MomDailySummaryPage: React.FC<MomDailySummaryPageProps> = ({
  currentUser,
  allRoles,
  periodName,
}) => {
  const { showToast } = useToast();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.DailyMOMSummary, 'view');
  const [summaryDate, setSummaryDate] = useState(todayYyyyMmDd);
  const scopesKey = useMemo(() => JSON.stringify(permissions.userScopes ?? []), [permissions.userScopes]);

  const {
    data: rows = [],
    isFetching: loading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.momDailySummary.rows(
      currentUser?.id ?? 0,
      periodName,
      summaryDate,
      scopesKey,
    ),
    queryFn: async () => {
      if (!currentUser || !periodName.trim()) return [];
      try {
        return await taskService.getDailyMOMSummaryRows(
          periodName,
          summaryDate,
          permissions.userScopes,
          currentUser.id,
        );
      } catch (e) {
        console.error(e);
        showToast('Gagal memuat ringkasan MOM.', 'error', { title: 'Daily MOM Summary' });
        return [];
      }
    },
    enabled: !!currentUser && !!periodName.trim() && canView,
    staleTime: 120_000,
  });

  const uniqueProjects = useMemo(() => new Set(rows.map((r) => r.projectCode)).size, [rows]);

  const copyAllMOMText = useCallback(async () => {
    if (rows.length === 0) {
      showToast('Tidak ada MOM untuk disalin.', 'error');
      return;
    }
    const header = `Ringkasan MOM — ${summaryDate} — Periode: ${periodName}\nTotal entri: ${rows.length}\n\n---\n\n`;
    const body = rows.map((r, i) => `### ${i + 1}\n${rowToPlainText(r)}`).join('\n\n---\n\n');
    const text = header + body;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Semua MOM disalin ke clipboard.', 'success');
    } catch {
      showToast('Clipboard tidak tersedia.', 'error');
    }
  }, [rows, summaryDate, periodName, showToast]);

  const copyOne = useCallback(
    async (r: DailyMOMSummaryRow) => {
      try {
        await navigator.clipboard.writeText(rowToPlainText(r));
        showToast('MOM disalin.', 'success');
      } catch {
        showToast('Clipboard tidak tersedia.', 'error');
      }
    },
    [showToast],
  );

  const exportExcel = useCallback(async () => {
    if (rows.length === 0) {
      showToast('Tidak ada data untuk diekspor.', 'error');
      return;
    }
    const XLSX = await import('xlsx');
    const sheetData = rows.map((r) => ({
      TanggalWaktu: formatDateTime(r.mom.createdAt),
      KodeProject: r.projectCode,
      NamaProject: r.projectName,
      KodeAsset: r.assetCode,
      NamaAsset: r.assetName,
      Network: r.archetypeName,
      HU: r.huName,
      DibuatOleh: r.mom.createdByUsername,
      MOM: r.mom.content,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, 'MOM Harian');
    const safeDate = summaryDate.replace(/-/g, '');
    XLSX.writeFile(wb, `mom-harian-${safeDate}-${periodName.replace(/\s+/g, '_')}.xlsx`);
    showToast('Excel berhasil diunduh.', 'success');
  }, [rows, summaryDate, periodName, showToast]);

  if (!currentUser) {
    return (
      <div className="text-siloam-text-secondary text-sm">Silakan login untuk melihat ringkasan MOM.</div>
    );
  }

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-siloam-text-primary">Daily MOM Summary</h1>
        <p className="mt-1 text-sm text-siloam-text-secondary max-w-3xl">
          Ringkasan Minutes of Meeting per hari untuk proyek pada periode anggaran yang dipilih di header. Data
          mencakup kode asset, nama project, nama asset, dan isi MOM yang sebelumnya dicatat dari layar proyek.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-4">
        <div>
          <label htmlFor="mom-summary-date" className="block text-sm font-medium text-siloam-text-secondary">
            Tanggal ringkasan
          </label>
          <input
            id="mom-summary-date"
            type="date"
            value={summaryDate}
            onChange={(e) => setSummaryDate(e.target.value)}
            className="mt-1 block rounded-xl border border-siloam-border bg-siloam-surface px-3 py-2 text-siloam-text-primary focus:outline-none focus:ring-2 focus:ring-siloam-blue"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={loading}
            className="rounded-xl bg-siloam-blue px-4 py-2 text-sm font-medium text-white hover:bg-siloam-blue/90 disabled:opacity-50"
          >
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
          <button
            type="button"
            onClick={() => void copyAllMOMText()}
            disabled={rows.length === 0}
            className="rounded-xl border border-siloam-border bg-white px-4 py-2 text-sm font-medium text-siloam-text-primary hover:bg-siloam-surface disabled:opacity-50"
          >
            Salin semua MOM
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={rows.length === 0}
            className="rounded-xl border border-siloam-border bg-white px-4 py-2 text-sm font-medium text-siloam-text-primary hover:bg-siloam-surface disabled:opacity-50"
          >
            Ekspor Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-siloam-border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">Total MOM</p>
          <p className="mt-1 text-2xl font-bold text-siloam-text-primary">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-siloam-border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">Project (unik)</p>
          <p className="mt-1 text-2xl font-bold text-siloam-text-primary">{uniqueProjects}</p>
        </div>
        <div className="rounded-xl border border-siloam-border bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">Periode</p>
          <p className="mt-1 text-lg font-semibold text-siloam-text-primary truncate" title={periodName}>
            {periodName || '—'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-siloam-border bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-siloam-surface border-b border-siloam-border text-left text-siloam-text-secondary">
                <th className="px-4 py-3 font-medium whitespace-nowrap">Waktu</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Kode asset</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Nama project</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Nama asset</th>
                <th className="px-4 py-3 font-medium">MOM</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Oleh</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-siloam-text-secondary">
                    Memuat data…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-siloam-text-secondary">
                    Tidak ada MOM pada tanggal ini untuk cakupan Anda, atau belum ada catatan pada periode ini.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r) => (
                  <tr key={r.mom.id} className="border-b border-siloam-border/80 hover:bg-siloam-surface/50">
                    <td className="px-4 py-3 text-siloam-text-secondary whitespace-nowrap align-top">
                      {formatDateTime(r.mom.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs align-top">{r.assetCode || '—'}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-siloam-text-primary">{r.projectName || '—'}</div>
                      <div className="text-xs text-siloam-text-secondary">{r.projectCode}</div>
                    </td>
                    <td className="px-4 py-3 align-top">{r.assetName || '—'}</td>
                    <td className="px-4 py-3 text-siloam-text-primary align-top max-w-md">
                      <p className="whitespace-pre-wrap break-words">{r.mom.content}</p>
                    </td>
                    <td className="px-4 py-3 text-siloam-text-secondary align-top whitespace-nowrap">
                      {r.mom.createdByUsername}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <button
                        type="button"
                        onClick={() => void copyOne(r)}
                        className="text-siloam-blue text-sm font-medium hover:underline"
                      >
                        Salin
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
