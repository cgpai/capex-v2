'use client';

import React, { useEffect, useState } from 'react';
import type {
  BudgetCategoryConfig,
  FeasibilityStudy,
  HospitalUnit,
  TaskLog,
  User,
  UserRole,
} from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import * as taskService from '../../../services/taskService';
import { ProgressBar } from '../../molecules/ProgressBar/ProgressBar';
import * as configService from '../../../services/configService';
import {
  buildUnitPerformanceSummary,
  type InsightBlock,
  type UnitPerformanceSummary,
} from './unitPerformanceSummary';

interface UnitPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  hospitalUnit: HospitalUnit;
  allUsers: User[];
  allRoles: UserRole[];
  activeCategories?: BudgetCategoryConfig[];
  fsDataByProjectId?: Map<string, FeasibilityStudy>;
  periodName?: string;
}

const ProjectIcon = () => (
  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);
const CheckCircleIcon = () => (
  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const ClockIcon = () => (
  <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const ShoppingCartIcon = () => (
  <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);
const BoxIcon = () => (
  <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);
const AlertIcon = () => (
  <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const StatBox: React.FC<{
  label: string;
  value: number | string;
  icon: React.ReactNode;
  colorBg: string;
}> = ({ label, value, icon, colorBg }) => (
  <div className={`p-4 rounded-xl border border-siloam-border ${colorBg} flex flex-col justify-between h-full`}>
    <div className="flex justify-between items-start mb-2">
      <span className="text-xs font-bold uppercase text-siloam-text-secondary">{label}</span>
      {icon}
    </div>
    <div className="text-2xl font-bold text-siloam-text-primary">{value}</div>
  </div>
);

const insightToneClass: Record<InsightBlock['tone'], string> = {
  positive: 'bg-green-50 border-green-100 text-green-900',
  warning: 'bg-amber-50 border-amber-100 text-amber-900',
  critical: 'bg-red-50 border-red-100 text-red-900',
  neutral: 'bg-siloam-bg border-siloam-border text-siloam-text-primary',
};

export const UnitPerformanceModal: React.FC<UnitPerformanceModalProps> = ({
  isOpen,
  onClose,
  hospitalUnit,
  allUsers,
  allRoles,
  activeCategories = [],
  fsDataByProjectId = new Map(),
  periodName,
}) => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<UnitPerformanceSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !hospitalUnit) return;

    let cancelled = false;

    const loadSummary = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const assetIds = hospitalUnit.projects.flatMap((p) =>
          (p.assets ?? []).map((a) => String(a.id)),
        );
        const [allLogs, allStatuses, allArchetypes, allWorkflows, allHospitalUnits] =
          await Promise.all([
            taskService.getTaskLogsForAssetIds(assetIds),
            taskService.getAssetTaskStatusesForAssetIds(assetIds),
            configService.getAllArchetypesConfig(),
            configService.getAllWorkflowSets(),
            configService.getAllHospitalUnitsConfig(),
          ]);

        const huConfig = allHospitalUnits.find(
          (h) => h.name === hospitalUnit.name || h.code === hospitalUnit.code,
        );
        const archetypeConfig = huConfig
          ? allArchetypes.find((a) => a.id === huConfig.archetypeId)
          : null;

        const next = buildUnitPerformanceSummary({
          hospitalUnit,
          activeCategories,
          fsDataByProjectId,
          allUsers,
          allRoles,
          allLogs: allLogs || [],
          allStatuses,
          allWorkflows,
          archetypeName: archetypeConfig?.name ?? null,
        });

        if (!cancelled) setSummary(next);
      } catch (err) {
        console.error('Failed to load unit performance summary:', err);
        if (!cancelled) {
          setLoadError('Gagal memuat ringkasan performa unit.');
          setSummary(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [isOpen, hospitalUnit, allUsers, allRoles, activeCategories, fsDataByProjectId]);

  if (!isOpen) return null;

  const kpis = summary?.kpis;
  const utilizationPct =
    kpis && kpis.totalBudget > 0 ? (kpis.totalConsumed / kpis.totalBudget) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[90] p-4 animate-fade-in">
      <div className="bg-siloam-bg w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl border border-white/20 flex flex-col overflow-hidden">
        <div className="bg-white p-6 border-b border-siloam-border flex justify-between items-start gap-4">
          <div>
            <h2 className="text-2xl font-bold text-siloam-text-primary flex items-center gap-2">
              <span className="bg-siloam-blue text-white p-1 rounded-md">
                <ProjectIcon />
              </span>
              {hospitalUnit.name}
            </h2>
            <p className="text-siloam-text-secondary mt-1 text-sm">
              Ringkasan performa & insight berbasis data aktual
              {periodName ? ` · ${periodName}` : ''}
              {hospitalUnit.code ? ` · ${hospitalUnit.code}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition"
            aria-label="Tutup"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin h-8 w-8 border-4 border-siloam-blue border-t-transparent rounded-full" />
            </div>
          ) : loadError ? (
            <div className="text-center py-16 text-danger">{loadError}</div>
          ) : summary && kpis ? (
            <>
              <section>
                <h3 className="text-lg font-bold text-siloam-text-primary mb-3">Ringkasan Project & Asset</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <StatBox label="Total Projects" value={kpis.totalProjects} icon={<ProjectIcon />} colorBg="bg-blue-50" />
                  <StatBox label="Active" value={kpis.activeProjects} icon={<ClockIcon />} colorBg="bg-white" />
                  <StatBox label="Completed" value={kpis.completedProjects} icon={<CheckCircleIcon />} colorBg="bg-green-50" />
                  <StatBox label="Total Assets" value={kpis.totalAssets} icon={<BoxIcon />} colorBg="bg-indigo-50" />
                  <StatBox label="PO Issued" value={kpis.assetsWithPo} icon={<ShoppingCartIcon />} colorBg="bg-purple-50" />
                  <StatBox label="Not Started" value={kpis.assetsNotStarted} icon={<AlertIcon />} colorBg="bg-red-50" />
                </div>
              </section>

              <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-siloam-border shadow-sm md:col-span-2">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-siloam-text-primary">Absorpsi Anggaran</h3>
                    <span className="text-sm font-mono font-bold text-siloam-blue">
                      {utilizationPct.toFixed(1)}% terealisasi
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-siloam-text-secondary mb-1">
                    <span>Terealisasi: {formatCurrency(kpis.totalConsumed)}</span>
                    <span>Total: {formatCurrency(kpis.totalBudget)}</span>
                  </div>
                  <ProgressBar value={utilizationPct} className="h-4" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
                    <div>
                      <p className="text-siloam-text-secondary">Plan</p>
                      <p className="font-semibold">{formatCurrency(kpis.totalBudgetPlan)}</p>
                    </div>
                    <div>
                      <p className="text-siloam-text-secondary">Carry Forward</p>
                      <p className="font-semibold">{formatCurrency(kpis.totalCarryForward)}</p>
                    </div>
                    <div>
                      <p className="text-siloam-text-secondary">Dialokasikan</p>
                      <p className="font-semibold">{formatCurrency(kpis.totalAllocated)}</p>
                    </div>
                    <div>
                      <p className="text-siloam-text-secondary">FS Approved</p>
                      <p className="font-semibold">{formatCurrency(kpis.totalApproved)}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-siloam-border shadow-sm">
                  <h3 className="text-lg font-bold text-siloam-text-primary mb-4">Status FS</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-siloam-text-secondary">Approved</span>
                      <span className="font-bold text-green-700">{summary.fsSummary.approved}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-siloam-text-secondary">Pending</span>
                      <span className="font-bold text-amber-700">{summary.fsSummary.pending}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-siloam-text-secondary">Rejected</span>
                      <span className="font-bold text-red-700">{summary.fsSummary.rejected}</span>
                    </div>
                    <div className="flex justify-between border-t border-siloam-border pt-3">
                      <span className="text-siloam-text-secondary">Belum diajukan</span>
                      <span className="font-bold">{summary.fsSummary.notSubmitted}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-siloam-text-secondary">Task terbuka</span>
                      <span className="font-bold text-siloam-blue">{kpis.openTasks}</span>
                    </div>
                  </div>
                </div>
              </section>

              {summary.categoryRows.length > 0 ? (
                <section className="bg-white p-5 rounded-xl border border-siloam-border shadow-sm">
                  <h3 className="text-lg font-bold text-siloam-text-primary mb-4">Anggaran per Kategori</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {summary.categoryRows.map((row) => (
                      <div key={row.categoryId} className="bg-siloam-bg/70 rounded-lg p-4 border border-siloam-border/60">
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <p className="font-semibold text-siloam-text-primary">{row.categoryName}</p>
                          <span className="text-xs font-mono text-siloam-blue">
                            {row.utilizationPct.toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-sm text-siloam-text-secondary mb-2">
                          Total {formatCurrency(row.total)} · Terealisasi {formatCurrency(row.consumed)}
                        </p>
                        <ProgressBar value={row.utilizationPct} className="h-2" />
                        <div className="flex justify-between text-xs text-siloam-text-secondary mt-2">
                          <span>Dialokasikan: {formatCurrency(row.allocated)}</span>
                          <span>Approved: {formatCurrency(row.approved)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white p-5 rounded-xl border border-siloam-border shadow-sm">
                    <h3 className="text-lg font-bold text-siloam-text-primary mb-4">Insight & Perhatian</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {summary.insights.map((insight) => (
                        <div
                          key={insight.id}
                          className={`p-4 rounded-xl border ${insightToneClass[insight.tone]}`}
                        >
                          <p className="font-semibold text-sm mb-1">{insight.title}</p>
                          <p className="text-sm leading-relaxed">{insight.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {summary.allocationAlerts.length > 0 ? (
                    <div className="bg-white p-5 rounded-xl border border-siloam-border shadow-sm">
                      <h3 className="text-lg font-bold text-siloam-text-primary mb-3">
                        Project dengan Sisa Alokasi
                      </h3>
                      <div className="space-y-2">
                        {summary.allocationAlerts.map((alert) => (
                          <div
                            key={alert.projectCode}
                            className="flex justify-between items-center gap-3 text-sm bg-siloam-bg rounded-lg px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{alert.projectCode}</p>
                              <p className="text-siloam-text-secondary truncate">{alert.projectName}</p>
                            </div>
                            <span className="font-bold text-amber-700 whitespace-nowrap">
                              {formatCurrency(alert.remainingToAllocate)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="bg-white p-5 rounded-xl border border-siloam-border shadow-sm">
                  <h3 className="text-lg font-bold text-siloam-text-primary mb-4">Unit Team Matrix</h3>
                  <div className="overflow-x-auto max-h-[480px]">
                    <table className="w-full text-sm text-left border-collapse">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2 border-b border-gray-200">Role</th>
                          <th className="px-3 py-2 border-b border-gray-200">User</th>
                          <th className="px-3 py-2 text-center border-b border-gray-200">Done</th>
                          <th className="px-3 py-2 text-center border-b border-gray-200">Open</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {summary.teamRows.map((member) => (
                          <tr key={`${member.user.id}-${member.role}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-semibold text-siloam-blue">{member.role}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{member.user.username}</div>
                              <div className="text-xs text-gray-500">{member.source}</div>
                            </td>
                            <td className="px-3 py-2 text-center font-bold text-green-600">
                              {member.completed}
                            </td>
                            <td className="px-3 py-2 text-center font-bold text-red-500">
                              {member.pending}
                            </td>
                          </tr>
                        ))}
                        {summary.teamRows.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-4 text-center text-gray-400 italic">
                              Tidak ada user yang ter-assign ke scope unit ini.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </>
          ) : null}
        </div>

        <div className="p-4 bg-white border-t border-siloam-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-siloam-sidebar text-siloam-text-primary rounded-lg hover:bg-siloam-border font-medium"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

UnitPerformanceModal.displayName = 'UnitPerformanceModal';
