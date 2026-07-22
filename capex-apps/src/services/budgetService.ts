
import { USE_MOCK } from '../lib/config';
import { withRequestCache } from '../lib/requestCache';
import { invalidateRequestCache } from '../lib/requestCache';
import { BudgetPeriod, Archetype, HospitalUnit, Project, BudgetItem, EnrichedAsset, BudgetMultiYear, User, Asset, AssetTypeConfig, PIPELINE_ARCHETYPE_ID, BDDPriority } from '../types';
import { useBackendSession } from '../lib/auth/authConstants';
import { persistBudgetHuChangesViaBackend } from './budgetHuBackendSave';
import {
  createBudgetPeriodViaBackend,
  saveArchetypeBudgetPlansViaBackend,
  saveHuBudgetPlansViaBackend,
  saveMultiYearViaBackend,
  savePeriodCategoryPlansViaBackend,
} from './budgetMultiYearPageApi';
import {
  applyArchetypePlanEdits,
  collectArchetypePlanChanges,
} from '../lib/budgetArchetypePlanEdits';
import {
  applyHuPlanEdits,
  collectHuPlanChanges,
} from '../lib/budgetArchetypeHuPlanEdits';
import {
  findRoutineProject,
  isRoutineAssetProject,
  sumProjectConsumedBudget,
  sumRoutineCategoryConsumed,
} from '../lib/budgetCategoryAggregates';
import * as configService from './configService';
import { migrateAssetTypeUsageViaBackend, getAssetTypeUsageCountViaBackend } from './configurationCrudApi';
import * as taskService from './taskService';
import {
  readAllBudgetPeriodsWithFallback,
  readBudgetPeriodFromBackend,
  readBudgetPeriodStructureFromBackend,
  readMultiYearsFromBackend,
  readPeriodCategoryBudgetsFromBackend,
  readPeriodSummariesFromBackend,
} from './budgetServiceBackend';

// --- Service functions ---
export const isAssetTypeInUse = async (
    assetType: AssetTypeConfig,
    currentUserId?: number,
): Promise<{ inUse: boolean; count: number }> => {
    const userId =
        currentUserId ??
        (typeof window !== 'undefined' ? Number(sessionStorage.getItem('currentUserId')) : NaN);
    if (Number.isFinite(userId)) {
        const backend = await getAssetTypeUsageCountViaBackend(userId, assetType.id);
        if (backend != null) {
            return { inUse: backend.count > 0, count: backend.count };
        }
    }

    return { inUse: false, count: 0 };
};


export const migrateAssetTypesAndRecalculate = async (
    fromAssetTypeId: string,
    toAssetTypeId: string,
    currentUser: User,
): Promise<{ updatedCount: number }> => {
    const backendResult = await migrateAssetTypeUsageViaBackend(
        currentUser.id,
        fromAssetTypeId,
        toAssetTypeId,
    );
    if (backendResult != null) {
        invalidateRequestCache('budget:');
        invalidateRequestCache('app:table:');
        invalidateRequestCache('capex-project-list:');
        return backendResult;
    }

    throw new Error('Backend migration failed — use capexbe BFF.');
};


export const getAggregatedBudgetForCategory = async (categoryId: string): Promise<number> => {
    const allPeriods = await readAllBudgetPeriodsWithFallback();
    let totalValue = 0;
    for (const period of allPeriods) {
        totalValue += period.budget[categoryId]?.budgetPlan || 0;
    }
    return totalValue;
};

export const getAllMultiYears = async (): Promise<BudgetMultiYear[]> => {
    const fromBe = await readMultiYearsFromBackend();
    if (fromBe) return fromBe;
    return [];
};

export const saveMultiYear = async (multiYear: BudgetMultiYear, currentUserId?: number): Promise<void> => {
    const uid =
        currentUserId ??
        (typeof window !== 'undefined' ? Number(sessionStorage.getItem('currentUserId')) : NaN);
    if (Number.isFinite(uid)) {
        const saved = await saveMultiYearViaBackend(uid, multiYear);
        if (saved) {
            invalidateRequestCache('budget:');
            return;
        }
        if (useBackendSession()) {
            throw new Error(
                'Gagal menyimpan multi-year budget via backend (capexbe). Pastikan backend berjalan dan sesi masih aktif.',
            );
        }
    }

    throw new Error('Gagal menyimpan multi-year via backend (capexbe).');
};

export const createMultiYear = async (name: string, startYear: number, endYear: number): Promise<{ success: boolean; message: string }> => {
    const uid =
        typeof window !== 'undefined' ? Number(sessionStorage.getItem('currentUserId')) : NaN;

    if (Number.isFinite(uid)) {
        const emptyBudgetItem: BudgetItem = {
            budgetPlan: 0,
            budgetCarryForward: 0,
            budgetAllocated: 0,
            approvedBudget: 0,
            consumedBudget: 0,
        };
        const saved = await saveMultiYearViaBackend(uid, { name, startYear, endYear, budget: emptyBudgetItem });
        if (saved) {
            invalidateRequestCache('budget:');
            return { success: true, message: 'Multi-year budget created successfully.' };
        }
        if (useBackendSession()) {
            return {
                success: false,
                message: 'Gagal membuat multi-year budget via backend (capexbe). Pastikan backend berjalan.',
            };
        }
    }

    return { success: false, message: 'Gagal membuat multi-year budget via backend (capexbe).' };
};

export const getAllBudgetPeriods = async (): Promise<BudgetPeriod[]> =>
    withRequestCache('budget:all_periods', () =>
        readAllBudgetPeriodsWithFallback(),
    20_000);

/** Hanya metadata periode (tanpa nested project/asset) — cepat untuk dropdown & startup. */
export const getBudgetPeriodSummaries = async (): Promise<BudgetPeriod[]> =>
    withRequestCache('budget:period_summaries', async () => {
        const fromBe = await readPeriodSummariesFromBackend();
        if (fromBe) return fromBe;
        return [];
    }, 60_000);

/** Periode + category budgets untuk satu multi-year (tanpa project tree). */
export const getPeriodCategoryBudgetsForMultiYear = async (multiYearName: string): Promise<BudgetPeriod[]> =>
    withRequestCache(
        `budget:my_period_budgets:${multiYearName}`,
        async () => {
            const fromBe = await readPeriodCategoryBudgetsFromBackend(multiYearName);
            if (fromBe) return fromBe;
            return [];
        },
        30_000,
    );

export const getBudgetByPeriodName = async (periodName: string): Promise<BudgetPeriod | undefined> => {
    const r = await withRequestCache(
        `budget:period:${periodName}`,
        async () => {
            const fromBe = await readBudgetPeriodFromBackend(periodName);
            if (fromBe !== undefined) return fromBe ?? null;
            return null;
        },
        15_000,
    );
    return r ?? undefined;
};

/** Siloam / Archetype screens — period-scoped tree without assets (fast first paint). */
export const getBudgetSiloamByPeriodName = async (periodName: string): Promise<BudgetPeriod | undefined> => {
    const r = await withRequestCache(
        `budget:siloam:${periodName}`,
        async () => {
            const fromBe = await readBudgetPeriodFromBackend(periodName);
            if (fromBe !== undefined) return fromBe ?? null;
            return null;
        },
        60_000,
    );
    return r ?? undefined;
};

// OPTIMIZED: Fast function to get only structure for dropdowns
export const getBudgetPeriodStructure = async (periodName: string) =>
    withRequestCache(
        `budget:period_structure:${periodName}`,
        async () => {
            const fromBe = await readBudgetPeriodStructureFromBackend(periodName);
            if (fromBe !== undefined) return fromBe;
            return null;
        },
        20_000,
    );

/** Opsi untuk menyimpan periode anggaran (migrasi massal memakai `persistOnly` + finalisasi terpisah). */
export interface UpdateBudgetPeriodOptions {
    /**
     * Hanya persist ke DB (upsert project/asset massal) tanpa trigger workflow
     * dan tanpa recalc status tugas — untuk chunk migrasi Smart Migration.
     */
    persistOnly?: boolean;
    /**
     * Jika diisi: hanya asset ID ini yang di-recalculate status tugasnya.
     * Array kosong = lewati recalc sama sekali. Tidak diisi = semua asset di periode (perilaku lama).
     */
    recalculateTaskStatusesForAssetIds?: string[];
    /** Skip triggerSystemTask checks (digunakan untuk percepatan Smart Migration massal). */
    skipSystemTaskTriggers?: boolean;
    /** Untuk migrasi project saja: lewati proses compare/save asset agar lebih cepat. */
    projectsOnly?: boolean;
    /**
     * Saat save incremental (limitToProjectIds): tetap persist agregat anggaran periode
     * (category / archetype / HU) setelah recalculateBudgets — dipakai finalisasi Smart Migration.
     */
    saveBudgetAggregates?: boolean;
    /** Snapshot lokal — hindari getBudgetByPeriodName penuh saat save incremental HU. */
    compareAgainst?: BudgetPeriod;
    /** Hanya proses project ID ini (task trigger + persist). */
    changedProjectIds?: string[];
    huId?: string;
    deletedProjectIds?: string[];
}

export const updateBudgetPeriod = async (
    updatedPeriod: BudgetPeriod,
    currentUser: User,
    options?: UpdateBudgetPeriodOptions
): Promise<void> => {
    const persistChanges = async (originalPeriod?: BudgetPeriod | null) => {
        const backendSaved = await persistBudgetHuChangesViaBackend(
            currentUser.id,
            updatedPeriod,
            originalPeriod ?? options?.compareAgainst ?? null,
            {
                huId: options?.huId,
                changedProjectIds: options?.changedProjectIds,
                deletedProjectIds: options?.deletedProjectIds,
                touchedAssetIds: options?.recalculateTaskStatusesForAssetIds,
            },
        );
        if (backendSaved) return;

        throw new Error(
            'Gagal menyimpan perubahan anggaran via backend (capexbe). Pastikan backend berjalan dan sesi masih aktif.',
        );
    };

    if (options?.persistOnly) {
        await persistChanges(options?.compareAgainst ?? null);
        return;
    }

    const originalPeriod =
        options?.compareAgainst ??
        (await getBudgetByPeriodName(updatedPeriod.periodName));

    const changedProjectIdSet = options?.changedProjectIds?.length
        ? new Set(options.changedProjectIds)
        : null;

    if (originalPeriod && !options?.skipSystemTaskTriggers) {
        const allUpdatedProjects = updatedPeriod.archetypes.flatMap(a => a.units.flatMap(u => u.projects));
        const projectsForTriggers = changedProjectIdSet
            ? allUpdatedProjects.filter(p => changedProjectIdSet.has(p.id))
            : allUpdatedProjects;
        const allOriginalProjects = originalPeriod.archetypes.flatMap(a => a.units.flatMap(u => u.projects));
        const originalProjectMap = new Map<string, Project>(allOriginalProjects.map(p => [p.id, p]));
        const originalAssetMap = new Map<string, Asset>(allOriginalProjects.flatMap(p => p.assets).map(a => [a.id, a]));

        for (const updatedProject of projectsForTriggers) {
            const originalProject = originalProjectMap.get(updatedProject.id);

            if (originalProject && originalProject.approvedBudget === 0 && updatedProject.approvedBudget > 0) {
                for (const asset of updatedProject.assets) {
                    await taskService.triggerSystemTask(asset.id, 'BUDGET_APPROVED', currentUser);
                }
            }

            for (const updatedAsset of updatedProject.assets) {
                const originalAsset = originalAssetMap.get(updatedAsset.id);

                if (!originalAsset) {
                    await taskService.triggerSystemTask(updatedAsset.id, 'ASSET_CREATED', currentUser);
                    if (updatedProject.approvedBudget > 0) {
                        await taskService.triggerSystemTask(updatedAsset.id, 'BUDGET_APPROVED', currentUser);
                    }
                } else {
                    if (originalAsset.budgetPlan === 0 && updatedAsset.budgetPlan > 0) {
                        await taskService.triggerSystemTask(updatedAsset.id, 'ASSET_BUDGET_PLAN_FILLED', currentUser);
                    }

                    const poNumberWasEmpty = !originalAsset.poNumber || originalAsset.poNumber.trim() === '';
                    const poNumberNowHasValue = updatedAsset.poNumber && updatedAsset.poNumber.trim() !== '';
                    const consumedBudgetChanged = originalAsset.consumedBudget === 0 && updatedAsset.consumedBudget > 0;
                    const poNumberChanged = poNumberWasEmpty && poNumberNowHasValue;

                    if (consumedBudgetChanged || poNumberChanged) {
                        await taskService.triggerSystemTask(updatedAsset.id, 'PO_CREATED', currentUser, {
                            completedAt: updatedAsset.poDate
                                ? new Date(`${String(updatedAsset.poDate).slice(0, 10)}T12:00:00`).toISOString()
                                : undefined,
                        });
                    }

                    const originalQty = originalAsset.qty || 1;
                    const originalReceivedQty = originalAsset.receivedQty || 0;
                    const updatedQty = updatedAsset.qty || 1;
                    const updatedReceivedQty = updatedAsset.receivedQty || 0;

                    const wasFullyReceived = originalReceivedQty === originalQty && originalQty > 0;
                    const isNowFullyReceived = updatedReceivedQty === updatedQty && updatedQty > 0;

                    if (!wasFullyReceived && isNowFullyReceived) {
                        await taskService.triggerSystemTask(updatedAsset.id, 'PO_GOODS_RECEIVED', currentUser);
                    } else if (!originalAsset.isGoodsReceived && updatedAsset.isGoodsReceived) {
                        await taskService.triggerSystemTask(updatedAsset.id, 'PO_GOODS_RECEIVED', currentUser);
                    }
                }
            }
        }
    }

    await persistChanges(originalPeriod);
    invalidateRequestCache('budget:');

    const allAssetIds = updatedPeriod.archetypes.flatMap(a =>
        a.units.flatMap(u => u.projects.flatMap(p => p.assets.map(asset => asset.id)))
    );
    const recalcIds =
        options?.recalculateTaskStatusesForAssetIds !== undefined
            ? options.recalculateTaskStatusesForAssetIds
            : allAssetIds;

    if (recalcIds.length === 0) {
        return;
    }

    const BATCH = 40;
    for (let i = 0; i < recalcIds.length; i += BATCH) {
        const batch = recalcIds.slice(i, i + BATCH);
        await Promise.all(batch.map(assetId => taskService.recalculateAssetTaskStatuses(assetId).catch(() => null)));
    }
};

export const updateAssetBddPriority = async (assetId: string, priority: BDDPriority, currentUser: User): Promise<void> => {
    const allPeriods = await getAllBudgetPeriods();
    
    let periodToUpdate: BudgetPeriod | null = null;
    let assetFound = false;

    for (const period of allPeriods) {
        for (const arch of period.archetypes) {
            for (const unit of arch.units) {
                for (const project of unit.projects) {
                    const assetIndex = project.assets.findIndex(a => a.id === assetId);
                    if (assetIndex !== -1) {
                        project.assets[assetIndex].bddPriority = priority;
                        assetFound = true;
                        periodToUpdate = period;
                        break;
                    }
                }
                if (assetFound) break;
            }
            if (assetFound) break;
        }
        if (assetFound) break;
    }

    if (assetFound && periodToUpdate) {
        await updateBudgetPeriod(periodToUpdate, currentUser);
    }
};

/**
 * Recalculates all budget aggregate fields throughout the hierarchy.
 * This function performs a bottom-up calculation based on the corrected business logic:
 * `budgetAllocated` at level N is the SUM of `budgetPlan` from all children at level N+1.
 * Other fields like `consumedBudget` are aggregated from the very bottom.
 * @param period - The budget period object to recalculate.
 * @returns A new, recalculated budget period object.
 */
export const recalculateBudgets = (period: BudgetPeriod): BudgetPeriod => {
    const newPeriod = JSON.parse(JSON.stringify(period));
    const emptyBudgetItem = (): BudgetItem => ({
        budgetPlan: 0,
        budgetCarryForward: 0,
        budgetAllocated: 0,
        approvedBudget: 0,
        consumedBudget: 0,
    });

    // Collect every category id present anywhere so HU/summary rollups are never skipped
    // when period.budget keys are incomplete (scoped load / partial cache).
    const categoryIdSet = new Set<string>(Object.keys(newPeriod.budget ?? {}));
    newPeriod.archetypes.forEach((arch: Archetype) => {
        Object.keys(arch.budget ?? {}).forEach((id) => categoryIdSet.add(id));
        arch.units.forEach((hu: HospitalUnit) => {
            Object.keys(hu.budget ?? {}).forEach((id) => categoryIdSet.add(id));
            hu.projects.forEach((p: Project) => {
                if (p.budgetCategoryId) categoryIdSet.add(p.budgetCategoryId);
                Object.keys(p.categoryBudgetPlan ?? {}).forEach((id) => categoryIdSet.add(id));
                (p.assets ?? []).forEach((a) => {
                    if (a.budgetCategoryId) categoryIdSet.add(a.budgetCategoryId);
                });
            });
        });
    });
    const categoryIds = Array.from(categoryIdSet);

    // --- LEVEL: Project (from Assets) ---
    // First, calculate project-level aggregates from their assets.
    newPeriod.archetypes.forEach((arch: Archetype) => {
        arch.units.forEach((hu: HospitalUnit) => {
            hu.projects.forEach((p: Project) => {
                const assets = p.assets;
                if (assets && assets.length > 0) {
                    p.consumedBudget = assets.reduce(
                        (sum, asset) => sum + (Number(asset.consumedBudget) || 0),
                        0,
                    );
                    p.budgetAllocated = assets.reduce(
                        (sum, asset) => sum + (Number(asset.budgetPlan) || 0),
                        0,
                    );
                } else {
                    p.consumedBudget = Number(p.consumedBudget) || 0;
                    p.budgetAllocated = Number(p.budgetAllocated) || 0;
                }

                // SPECIAL RULE: Only for Routine Asset Aggregator projects, Approved Budget must equal Budget Plan.
                if (isRoutineAssetProject(p)) {
                    // Routine plan is the sum of per-category plans when present.
                    const categoryPlanSum = Object.values(p.categoryBudgetPlan ?? {}).reduce(
                        (s, v) => s + (Number(v) || 0),
                        0,
                    );
                    if (categoryPlanSum > 0) {
                        p.budgetPlan = categoryPlanSum;
                    }
                    p.approvedBudget = p.budgetPlan;
                }
            });
        });
    });

    // --- LEVEL: Hospital Unit (from Projects) ---
    newPeriod.archetypes.forEach((arch: Archetype) => {
        arch.units.forEach((hu: HospitalUnit) => {
            if (!hu.budget) hu.budget = {};
            categoryIds.forEach(catId => {
                const prevPlan = Number(hu.budget[catId]?.budgetPlan) || 0;
                if (!hu.budget[catId]) hu.budget[catId] = emptyBudgetItem();
                // Preserve manually configured unit plan (Budget Archetype); only refresh aggregates.
                hu.budget[catId].budgetPlan = prevPlan;

                const regularCatProjects = hu.projects.filter(
                    (proj) => !isRoutineAssetProject(proj) && proj.budgetCategoryId === catId,
                );
                const routineProject = findRoutineProject(hu);

                const routineConsumed = sumRoutineCategoryConsumed(routineProject, catId);
                hu.budget[catId].consumedBudget =
                    regularCatProjects.reduce((s, p) => s + sumProjectConsumedBudget(p), 0) +
                    routineConsumed;

                const routineApproved = routineProject?.categoryBudgetPlan?.[catId] || 0;
                hu.budget[catId].approvedBudget =
                    regularCatProjects.reduce((s, p) => s + (Number(p.approvedBudget) || 0), 0) +
                    routineApproved;

                hu.budget[catId].budgetCarryForward = regularCatProjects.reduce(
                    (s, p) => s + (Number(p.budgetCarryForward) || 0),
                    0,
                );

                const routinePlan = routineProject?.categoryBudgetPlan?.[catId] || 0;
                hu.budget[catId].budgetAllocated =
                    regularCatProjects.reduce((s, p) => s + (Number(p.budgetPlan) || 0), 0) +
                    routinePlan;
            });
        });
    });

    // --- LEVEL: Archetype (from HUs) ---
    newPeriod.archetypes.forEach((arch: Archetype) => {
        if (!arch.budget) arch.budget = {};
        categoryIds.forEach(catId => {
            const prevPlan = Number(arch.budget[catId]?.budgetPlan) || 0;
            if (!arch.budget[catId]) arch.budget[catId] = emptyBudgetItem();
            arch.budget[catId].budgetPlan = prevPlan;
            // Aggregate consumed, approved, carry forward from HUs.
            arch.budget[catId].consumedBudget = arch.units.reduce((s, u) => s + (u.budget[catId]?.consumedBudget || 0), 0);
            arch.budget[catId].approvedBudget = arch.units.reduce((s, u) => s + (u.budget[catId]?.approvedBudget || 0), 0);
            arch.budget[catId].budgetCarryForward = arch.units.reduce((s, u) => s + (u.budget[catId]?.budgetCarryForward || 0), 0);

            // In Archetype context, allocated means distribution to HU budget plan.
            arch.budget[catId].budgetAllocated = arch.units.reduce((s, u) => s + (u.budget[catId]?.budgetPlan || 0), 0);
        });
    });

    // --- LEVEL: Siloam (from Archetypes) ---
    if (!newPeriod.budget) newPeriod.budget = {};
    categoryIds.forEach(catId => {
        const prevPlan = Number(newPeriod.budget[catId]?.budgetPlan) || 0;
        if (!newPeriod.budget[catId]) newPeriod.budget[catId] = emptyBudgetItem();
        newPeriod.budget[catId].budgetPlan = prevPlan;
        // Aggregate consumed, approved, carry forward from Archetypes.
        newPeriod.budget[catId].consumedBudget = newPeriod.archetypes.reduce(
            (s: number, a: Archetype) => s + (a.budget[catId]?.consumedBudget || 0),
            0
        );
        newPeriod.budget[catId].approvedBudget = newPeriod.archetypes.reduce(
            (s: number, a: Archetype) => s + (a.budget[catId]?.approvedBudget || 0),
            0
        );
        newPeriod.budget[catId].budgetCarryForward = newPeriod.archetypes.reduce(
            (s: number, a: Archetype) => s + (a.budget[catId]?.budgetCarryForward || 0),
            0
        );

        // At Siloam level, allocated follows archetype budget plan distribution.
        newPeriod.budget[catId].budgetAllocated = newPeriod.archetypes.reduce(
            (s: number, a: Archetype) => s + (a.budget[catId]?.budgetPlan || 0),
            0
        );
    });

    return newPeriod;
};


export const savePeriodCategoryPlans = async (
    period: BudgetPeriod,
    currentUserId?: number,
    categoryIds?: string[],
): Promise<void> => {
    const uid =
        currentUserId ??
        (typeof window !== 'undefined' ? Number(sessionStorage.getItem('currentUserId')) : NaN);
    if (Number.isFinite(uid)) {
        const saved = await savePeriodCategoryPlansViaBackend(uid, period, categoryIds);
        if (saved) {
            invalidateRequestCache('budget:');
            return;
        }
    }

    throw new Error(
        'Gagal menyimpan rencana budget periode via backend (capexbe). Pastikan backend berjalan dan sesi masih aktif.',
    );
};

export const saveArchetypeBudgetPlans = async (
    updatedPeriod: BudgetPeriod,
    originalPeriod: BudgetPeriod,
    currentUserId?: number,
    categoryIds?: string[],
): Promise<void> => {
    const uid =
        currentUserId ??
        (typeof window !== 'undefined' ? Number(sessionStorage.getItem('currentUserId')) : NaN);
    const catIds = categoryIds?.length ? categoryIds : Object.keys(updatedPeriod.budget ?? {});
    const rows = collectArchetypePlanChanges(originalPeriod, updatedPeriod, catIds);
    if (!rows.length) {
        throw new Error('Tidak ada perubahan budget network untuk disimpan.');
    }

    if (Number.isFinite(uid)) {
        const saved = await saveArchetypeBudgetPlansViaBackend(uid, updatedPeriod.periodName, rows);
        if (saved) {
            invalidateRequestCache('budget:');
            invalidateRequestCache('budget-siloam:');
            return;
        }
    }

    throw new Error(
        'Gagal menyimpan rencana budget network via backend (capexbe). Pastikan backend berjalan dan sesi masih aktif.',
    );
};

export const saveHuBudgetPlans = async (
    updatedPeriod: BudgetPeriod,
    originalPeriod: BudgetPeriod,
    archetypeId: string,
    currentUserId?: number,
    categoryIds?: string[],
): Promise<void> => {
    const uid =
        currentUserId ??
        (typeof window !== 'undefined' ? Number(sessionStorage.getItem('currentUserId')) : NaN);
    const catIds = categoryIds?.length ? categoryIds : Object.keys(updatedPeriod.budget ?? {});
    const rows = collectHuPlanChanges(originalPeriod, updatedPeriod, catIds, archetypeId);
    if (!rows.length) {
        throw new Error('Tidak ada perubahan budget HU untuk disimpan.');
    }

    if (Number.isFinite(uid)) {
        const saved = await saveHuBudgetPlansViaBackend(uid, updatedPeriod.periodName, rows);
        if (saved) {
            invalidateRequestCache('budget:');
            invalidateRequestCache('budget-siloam:');
            return;
        }
    }

    throw new Error(
        'Gagal menyimpan rencana budget HU via backend (capexbe). Pastikan backend berjalan dan sesi masih aktif.',
    );
};

export const createBudgetPeriod = async (periodName: string, startDate: string, endDate: string, multiYearName: string): Promise<{ success: boolean; message: string }> => {
    const uid =
        typeof window !== 'undefined' ? Number(sessionStorage.getItem('currentUserId')) : NaN;
    if (Number.isFinite(uid)) {
        const created = await createBudgetPeriodViaBackend(uid, periodName, startDate, endDate, multiYearName);
        if (created) {
            invalidateRequestCache('budget:');
            return { success: true, message: 'Budget period created successfully.' };
        }
    }
    return {
        success: false,
        message: 'Gagal membuat budget period via backend (capexbe). Pastikan backend berjalan.',
    };
};

export const getAllProjectsByPeriod = async (periodName: string): Promise<Project[]> => {
    const fromBe = await import('./poApi').then((m) => m.fetchProjectsForPeriodFromBackend(periodName));
    if (fromBe !== undefined) return fromBe;
    const period = await getBudgetByPeriodName(periodName);
    if (!period) return [];
    return period.archetypes.flatMap((archetype) =>
        archetype.units.flatMap((unit) => unit.projects),
    );
};

export const getAllProjects = async (periodName?: string): Promise<Project[]> => {
    const cacheKey = periodName ? `budget:all_projects:${periodName}` : 'budget:all_projects:*';
    const fetcher = async (): Promise<Project[]> => {
        if (periodName) {
            const fromBe = await import('./poApi').then((m) =>
                m.fetchProjectsForPeriodFromBackend(periodName),
            );
            return fromBe ?? [];
        }

        const periodSummaries = await readAllBudgetPeriodsWithFallback();
        if (!periodSummaries.length) return [];

        const allProjects: Project[] = [];
        const poApi = await import('./poApi');
        for (const period of periodSummaries) {
            const pn = period.periodName?.trim();
            if (!pn) continue;
            const fromBe = await poApi.fetchProjectsForPeriodFromBackend(pn);
            if (fromBe !== undefined) allProjects.push(...fromBe);
        }
        return allProjects;
    };
    return withRequestCache(cacheKey, fetcher, 15_000);
};

export const getAllEnrichedAssets = async (
    _completionRates?: Map<string, number>,
    _periodName?: string,
): Promise<EnrichedAsset[]> => {
    throw new Error(
        'getAllEnrichedAssets removed from FE — use capexbe page bundles (capex-project-list / bdd-construction).',
    );
};
