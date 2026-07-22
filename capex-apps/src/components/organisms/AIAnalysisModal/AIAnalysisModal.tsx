
import React, { useMemo, useState, useEffect } from 'react';
import {
    EnrichedAsset,
    Project,
    TaskLog,
    WorkflowSet,
    AssetTaskStatus,
    TaskCurrentStatus,
    User,
    MOM,
} from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import { ProgressBar } from '../../molecules/ProgressBar/ProgressBar';
import * as taskService from '../../../services/taskService';

interface ProjectSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    asset: EnrichedAsset | null;
    project: Project | null;
    allWorkflows: WorkflowSet[];
    currentUser: User | null;
    onAddMom?: () => void;
    onEditMom?: (mom: MOM) => void;
}

const AlertIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

const LightningIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
    </svg>
);

const UserGroupIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
    </svg>
);

export const ProjectSummaryModal: React.FC<ProjectSummaryModalProps> = ({
    isOpen,
    onClose,
    asset,
    project,
    allWorkflows,
    currentUser,
    onAddMom,
    onEditMom,
}) => {
    const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
    const [assetStatuses, setAssetStatuses] = useState<AssetTaskStatus[]>([]);
    const [moms, setMoms] = useState<MOM[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    useEffect(() => {
        if (isOpen && asset) {
            setLoadingLogs(true);
            const id = String(asset.id);
            Promise.all([
                taskService.getTaskLogsForAsset(id),
                taskService.getAssetTaskStatusesForAsset(id),
                taskService.getMOMsForAsset(id),
            ])
                .then(([logs, statuses, momRows]) => {
                    setTaskLogs(logs);
                    setAssetStatuses(statuses);
                    setMoms(momRows as MOM[]);
                    setLoadingLogs(false);
                })
                .catch((err) => {
                    console.error('Failed to load project summary bundle:', err);
                    setLoadingLogs(false);
                });
        } else {
            setTaskLogs([]);
            setAssetStatuses([]);
            setMoms([]);
            setLoadingLogs(false);
        }
    }, [isOpen, asset?.id]);

    // --- DETERMINISTIC LOGIC ---
    // Calculate values that don't depend on asset/project being null
    const budgetUtilization = asset && asset.budgetPlan > 0 ? (asset.consumedBudget / asset.budgetPlan) * 100 : 0;
    const remainingBudget = asset ? asset.budgetPlan - asset.consumedBudget : 0;
    
    // 2. Timeline Pressure
    const today = new Date();
    const endDate = asset?.endTargetDate ? new Date(asset.endTargetDate) : new Date();
    const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const isOverdue = daysRemaining < 0;

    /** Proyeksi vs target (bukan vs hari ini): telat = merah, di depan jadwal = hijau. */
    const timeAuditVsTarget = useMemo(() => {
        const targetRaw = asset?.endTargetDate;
        const projectionRaw = asset?.projectionEndDate;
        if (!targetRaw || !projectionRaw) {
            return { hasBoth: false as const };
        }
        const target = new Date(targetRaw);
        const projection = new Date(projectionRaw);
        target.setHours(0, 0, 0, 0);
        projection.setHours(0, 0, 0, 0);
        const diffDays = Math.round((projection.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
            return { hasBoth: true as const, diffDays, status: 'late' as const };
        }
        if (diffDays < 0) {
            return { hasBoth: true as const, diffDays, status: 'early' as const };
        }
        return { hasBoth: true as const, diffDays: 0, status: 'onTime' as const };
    }, [asset?.endTargetDate, asset?.projectionEndDate]);

    const scheduleInsight = useMemo(() => {
        if (!asset || !project) {
            return {
                lastTaskDone: false,
                delayDaysVsLastTask: 0,
                delayLabel: '',
                statusLine: '',
                lastUpdateIso: null as string | null,
                latestMom: null as MOM | null,
            };
        }
        const str = (id: string | number | undefined) => (id == null ? '' : String(id));
        const workflow = allWorkflows.find((w) => str(w.id) === str(asset.workflowSetId));
        const isDone = (s: AssetTaskStatus) =>
            typeof s.status === 'string' ? s.status.toLowerCase() === 'done' : s.status === TaskCurrentStatus.Done;

        let lastTaskDone = (asset.completionRate ?? 0) >= 100;
        let lastStepTaskId: string | null = null;

        if (workflow && workflow.steps.length > 0) {
            const lastStep = workflow.steps.reduce((a, b) => (a.order >= b.order ? a : b));
            lastStepTaskId = str(lastStep.taskId);
            const stepTaskIds = new Set(workflow.steps.map((s) => str(s.taskId)));
            const doneFromStatuses = new Set(
                assetStatuses.filter(isDone).map((s) => str(s.taskId)).filter((tid) => stepTaskIds.has(tid)),
            );
            const doneFromLogs = new Set(
                taskLogs.map((l) => str(l.taskId)).filter((tid) => stepTaskIds.has(tid)),
            );
            const completed = new Set<string>([...doneFromStatuses, ...doneFromLogs]);
            lastTaskDone = lastStepTaskId ? completed.has(lastStepTaskId) : lastTaskDone;
        }

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const proj = asset.projectionEndDate ? new Date(asset.projectionEndDate) : null;
        if (proj) proj.setHours(0, 0, 0, 0);

        let delayDaysVsLastTask = 0;
        if (!lastTaskDone && proj && startOfToday.getTime() > proj.getTime()) {
            delayDaysVsLastTask = Math.ceil((startOfToday.getTime() - proj.getTime()) / (1000 * 60 * 60 * 24));
        }

        const statusLine = lastTaskDone
            ? 'Completed / Selesai'
            : delayDaysVsLastTask > 0
              ? `Terlambat (${delayDaysVsLastTask} hari dari proyeksi task terakhir)`
              : isOverdue
                ? 'Terlambat vs target akhir'
                : 'Berjalan';

        const delayLabel =
            lastTaskDone || delayDaysVsLastTask <= 0
                ? ''
                : `${delayDaysVsLastTask} hari melewati proyeksi penyelesaian task terakhir`;

        const times: number[] = [];
        for (const log of taskLogs) {
            const t = log.completedAt ? new Date(log.completedAt).getTime() : NaN;
            if (!Number.isNaN(t)) times.push(t);
        }
        for (const s of assetStatuses) {
            const t = s.completedAt ? new Date(s.completedAt).getTime() : NaN;
            if (!Number.isNaN(t)) times.push(t);
        }
        for (const m of moms) {
            const t = m.createdAt ? new Date(m.createdAt).getTime() : NaN;
            if (!Number.isNaN(t)) times.push(t);
        }
        const lastUpdateIso =
            times.length > 0 ? new Date(Math.max(...times)).toISOString() : null;

        const latestMom =
            moms.length > 0
                ? [...moms].sort(
                      (a, b) =>
                          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
                  )[0]
                : null;

        return {
            lastTaskDone,
            delayDaysVsLastTask,
            delayLabel,
            statusLine,
            lastUpdateIso,
            latestMom,
        };
    }, [asset, project, allWorkflows, taskLogs, assetStatuses, moms, isOverdue]);
    
    // 3. Task Logs Analysis
    const recentLogs = useMemo(() => {
        return taskLogs
            .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime())
            .slice(0, 5);
    }, [taskLogs]);
    
    const completedTasksCount = taskLogs.length;
    const avgCompletionTime = useMemo(() => {
        if (taskLogs.length === 0) return null;
        const completionTimes = taskLogs
            .filter(log => log.completedAt)
            .map(log => {
                // Calculate time from task start to completion if available
                // For now, use a simple calculation based on log dates
                return 1; // Placeholder - would need task start dates
            });
        return completionTimes.length > 0 ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length : null;
    }, [taskLogs]);
    
    // 4. Recommendations based on task logs
    const recommendations = useMemo(() => {
        if (!asset || !project) return [];
        const recs: Array<{ action: string; owner: string; urgency: string; deadline: string }> = [];
        
        if (completedTasksCount === 0 && daysRemaining < 30) {
            recs.push({
                action: 'Inisiasi project segera - belum ada task yang diselesaikan',
                owner: project.owner || 'Project Owner',
                urgency: 'HIGH',
                deadline: 'Dalam 3 hari'
            });
        }
        
        if (isOverdue) {
            recs.push({
                action: 'Eskalasi ke management - project telah melewati deadline',
                owner: 'Unit Head',
                urgency: 'CRITICAL',
                deadline: 'Hari ini'
            });
        }
        
        if (budgetUtilization > 90 && (asset.completionRate ?? 0) < 50) {
            recs.push({
                action: 'Review budget utilization - budget hampir habis namun progress masih rendah',
                owner: 'Finance Team',
                urgency: 'HIGH',
                deadline: 'Dalam 5 hari'
            });
        }
        
        if (daysRemaining < 14 && (asset.completionRate ?? 0) < 80) {
            recs.push({
                action: 'Akselerasi penyelesaian task - waktu tersisa terbatas',
                owner: project.owner || 'Project Owner',
                urgency: 'HIGH',
                deadline: 'Dalam 2 hari'
            });
        }
        
        if (recentLogs.length === 0 && daysRemaining > 0) {
            recs.push({
                action: 'Tidak ada aktivitas task dalam beberapa waktu terakhir - perlu follow up',
                owner: project.owner || 'Project Owner',
                urgency: 'MEDIUM',
                deadline: 'Dalam 7 hari'
            });
        }
        
        return recs;
    }, [completedTasksCount, daysRemaining, isOverdue, budgetUtilization, asset?.completionRate, recentLogs.length, project?.owner]);
    
    // 5. Predictions
    const predictions = useMemo(() => {
        if (!asset || !project) return [];
        const preds: Array<{ title: string; description: string; type: 'positive' | 'warning' | 'critical' }> = [];
        const completionRate = asset.completionRate ?? 0;

        if (completionRate > 0 && daysRemaining > 0) {
            const currentRate = completionRate;
            const daysElapsed = Math.max(1, Math.ceil((new Date(asset.endTargetDate || Date.now()).getTime() - new Date(project.targetStart || Date.now()).getTime()) / (1000 * 60 * 60 * 24)));
            const projectedCompletion = currentRate > 0 ? (currentRate / daysElapsed) * daysRemaining : 0;
            const projectedTotal = currentRate + projectedCompletion;
            
            if (projectedTotal >= 100) {
                preds.push({
                    title: 'Prediksi: Project akan selesai tepat waktu',
                    description: `Berdasarkan progress saat ini (${Math.round(currentRate)}%), project diprediksi akan selesai sebelum atau pada tanggal target.`,
                    type: 'positive'
                });
            } else if (projectedTotal >= 80) {
                preds.push({
                    title: 'Prediksi: Project berpotensi selesai dengan sedikit delay',
                    description: `Berdasarkan progress saat ini, project diprediksi akan mencapai ${Math.round(projectedTotal)}% pada tanggal target.`,
                    type: 'warning'
                });
            } else {
                preds.push({
                    title: 'Prediksi: Project berisiko tidak selesai tepat waktu',
                    description: `Berdasarkan progress saat ini, project diprediksi hanya akan mencapai ${Math.round(projectedTotal)}% pada tanggal target. Perlu akselerasi.`,
                    type: 'critical'
                });
            }
        }
        
        if (budgetUtilization > 80 && remainingBudget < asset.budgetPlan * 0.1) {
            preds.push({
                title: 'Prediksi: Budget akan habis sebelum project selesai',
                description: `Budget utilization sudah ${Math.round(budgetUtilization)}% dengan sisa ${formatCurrency(remainingBudget)}. Perlu review atau tambahan budget.`,
                type: 'warning'
            });
        }
        
        return preds;
    }, [asset?.completionRate, daysRemaining, asset?.endTargetDate, project?.targetStart, budgetUtilization, remainingBudget, asset?.budgetPlan]);
    
    // Early return AFTER all hooks
    if (!isOpen || !asset || !project) return null;

    const completionRate = asset.completionRate ?? 0;

    // 3. Performance Verdict (The "Professional" Logic)
    let verdictTitle = "ON TRACK - OPTIMAL";
    let verdictMessage = "Project is proceeding according to schedule. Maintain current momentum to ensure timely delivery.";
    let verdictColor = "bg-siloam-green";
    let urgencyLevel = "NORMAL";

    if (scheduleInsight.lastTaskDone) {
        verdictTitle = "COMPLETED / SELESAI";
        verdictMessage =
            "Seluruh task workflow pada urutan terakhir telah selesai. Proyek dapat ditutup secara administratif.";
        verdictColor = "bg-emerald-600";
        urgencyLevel = "CLOSED";
    } else if (scheduleInsight.delayDaysVsLastTask > 0) {
        verdictTitle = "PROJECT TERLAMBAT (TASK TERAKHIR)";
        verdictMessage =
            scheduleInsight.delayLabel ||
            `Keterlambatan dihitung dari proyeksi penyelesaian task terakhir: ${scheduleInsight.delayDaysVsLastTask} hari.`;
        verdictColor = "bg-danger";
        urgencyLevel = "CRITICAL";
    } else if (isOverdue) {
        verdictTitle = "CRITICAL DELAY - OFF TRACK";
        verdictMessage = `Project has exceeded the deadline by ${Math.abs(daysRemaining)} days. Immediate executive intervention is required to mitigate further slippage.`;
        verdictColor = "bg-danger";
        urgencyLevel = "CRITICAL";
    } else if (daysRemaining < 14 && completionRate < 80) {
        verdictTitle = "AT RISK - ATTENTION REQUIRED";
        verdictMessage = `Only ${daysRemaining} days remaining with ${Math.round(completionRate)}% completion. High risk of delay without resource escalation.`;
        verdictColor = "bg-orange-600";
        urgencyLevel = "HIGH";
    } else if (completionRate === 0 && daysRemaining < 30) {
        verdictTitle = "OPERATIONAL STALL";
        verdictMessage = "Project has not commenced despite approaching deadline. Immediate initiation or cancellation decision required.";
        verdictColor = "bg-red-700";
        urgencyLevel = "IMMEDIATE";
    } else if (completionRate > 90) {
        verdictTitle = "PENDING FINALIZATION";
        verdictMessage = "Project is nearing completion. Ensure administrative closure is not delayed.";
        verdictColor = "bg-blue-600";
        urgencyLevel = "NORMAL";
    }

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[90] p-4 animate-fade-in">
            <div className="bg-siloam-bg rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col border-2 border-white/20 overflow-hidden">
                
                {/* DRAMATIC HEADER */}
                <div className={`${verdictColor} p-6 flex justify-between items-center text-white shadow-lg z-10`}>
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 rounded-full animate-pulse">
                            <AlertIcon />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black tracking-wider uppercase">{verdictTitle}</h2>
                            <p className="text-white/90 font-medium text-sm mt-1 max-w-2xl">
                                {verdictMessage}
                            </p>
                        </div>
                    </div>
                    <div className="text-right hidden md:block">
                        <p className="text-xs uppercase opacity-75 font-bold tracking-widest">Urgency Level</p>
                        <p className="text-3xl font-black tracking-tighter">{urgencyLevel}</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        
                        {/* LEFT COLUMN: ACTION DEMANDS (The Enforcer) */}
                        <div className="lg:col-span-1 space-y-6">
                            {/* Responsibility Card */}
                            <div className="bg-white p-5 rounded-xl border-l-4 border-danger shadow-sm">
                                <div className="flex items-center gap-2 mb-3 text-danger">
                                    <UserGroupIcon />
                                    <h4 className="font-bold uppercase tracking-wide text-sm">Potential Bottleneck</h4>
                                </div>
                                <div className="space-y-4">
                                    <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                                        <p className="text-xs text-red-600 font-bold uppercase mb-1">Key Operational Owner</p>
                                        <p className="text-lg font-black text-gray-800">{project.owner || 'UNASSIGNED OWNER'}</p>
                                        <p className="text-xs text-gray-500 mt-1">Must ensure task progression today.</p>
                                    </div>
                                    <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                                        <p className="text-xs text-red-600 font-bold uppercase mb-1">Execution Site</p>
                                        <p className="text-lg font-black text-gray-800">{asset.huName}</p>
                                    </div>
                                </div>
                                <button className="w-full mt-4 bg-danger hover:bg-red-700 text-white font-bold py-3 rounded-lg text-sm transition-all shadow-md active:scale-95 uppercase tracking-wide">
                                    ⚠️ Contact Stakeholder
                                </button>
                            </div>

                            {/* Acceleration Card (The Accelerator) */}
                            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 rounded-xl text-white shadow-md">
                                <div className="flex items-center gap-2 mb-3">
                                    <LightningIcon />
                                    <h4 className="font-bold uppercase tracking-wide text-sm">Acceleration Opportunity</h4>
                                </div>
                                <p className="text-sm opacity-90 leading-relaxed mb-4">
                                    Resolving <strong>{(asset.actionableTaskCount ?? 0) > 0 ? asset.actionableTaskCount : '1'} pending task(s)</strong> immediately could advance the completion projection by <strong>2-3 days</strong>.
                                </p>
                                <div className="bg-white/10 p-3 rounded-lg backdrop-blur-sm">
                                    <div className="flex justify-between text-xs font-bold uppercase opacity-75 mb-1">
                                        <span>Time Efficiency</span>
                                        <span>Execution Velocity</span>
                                    </div>
                                    <div className="w-full bg-black/20 rounded-full h-2">
                                        <div className="bg-yellow-400 h-2 rounded-full" style={{ width: '85%' }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: DATA DETAILS (The Evidence) */}
                        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            {/* CARD 1: DETAILED ASSET INFO */}
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm col-span-1 md:col-span-2">
                                <h4 className="font-bold text-gray-800 mb-4 border-b pb-2 flex justify-between">
                                    <span>DETAILED PROJECT INFORMATION</span>
                                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-500">{asset.assetCode}</span>
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-8 text-sm">
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">Asset Name</p>
                                        <p className="font-bold text-gray-900">{asset.assetName}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">Asset Type</p>
                                        <p className="font-semibold text-gray-800">{asset.assetTypeGroupName || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">Budget Category</p>
                                        <p className="font-semibold text-gray-800 truncate" title={asset.budgetCategoryId}>
                                            {asset.budgetCategoryId === 'cat-rev-main' ? 'Revenue Maintenance' : 
                                             asset.budgetCategoryId === 'cat-new-rev-gen' ? 'New Revenue Generating' : 'Strategic'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">PO Number</p>
                                        <p className={`font-mono font-bold ${asset.poNumber ? 'text-blue-600' : 'text-red-500'}`}>
                                            {asset.poNumber || 'NO PO ISSUED'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">Goods Receipt (GR)</p>
                                        <p className={`font-bold ${asset.isGoodsReceived ? 'text-green-600' : 'text-orange-500'}`}>
                                            {asset.isGoodsReceived ? 'RECEIVED' : 'NOT RECEIVED'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">BDD Priority</p>
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                            asset.bddPriority === 'Medium 1' ? 'bg-red-100 text-red-800' : 
                                            asset.bddPriority === 'Medium 2' ? 'bg-orange-100 text-orange-800' : 
                                            asset.bddPriority ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                            {asset.bddPriority || 'Standard'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* CARD 2: FINANCIAL AUDIT */}
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <h4 className="font-bold text-gray-800 mb-4 text-sm uppercase text-center">Financial Audit</h4>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end border-b border-dashed pb-2">
                                        <span className="text-gray-500 text-xs">Budget Plan (Pagu)</span>
                                        <span className="font-bold text-gray-900">{formatCurrency(asset.budgetPlan)}</span>
                                    </div>
                                    <div className="flex justify-between items-end border-b border-dashed pb-2">
                                        <span className="text-gray-500 text-xs">Realization (PO Issued)</span>
                                        <span className="font-bold text-blue-600">{formatCurrency(asset.consumedBudget)}</span>
                                    </div>
                                    <div className="flex justify-between items-end bg-gray-50 p-2 rounded">
                                        <span className="text-gray-600 text-xs font-bold">Remaining Budget</span>
                                        <span className={`font-black ${remainingBudget < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {formatCurrency(remainingBudget)}
                                        </span>
                                    </div>
                                    <div className="pt-2">
                                        <div className="flex justify-between text-xs mb-1">
                                            <span>Budget Utilization</span>
                                            <span className="font-bold">{budgetUtilization.toFixed(1)}%</span>
                                        </div>
                                        <ProgressBar value={budgetUtilization} className="h-3" />
                                    </div>
                                </div>
                            </div>

                            {/* CARD 3: TIME AUDIT — selisih proyeksi vs target */}
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <h4 className="font-bold text-gray-800 mb-4 text-sm uppercase text-center">Time Audit</h4>
                                <div className="flex flex-col items-center justify-center py-2">
                                    {timeAuditVsTarget.hasBoth ? (
                                        <>
                                            <div
                                                className={`text-5xl font-black mb-2 ${
                                                    timeAuditVsTarget.status === 'late'
                                                        ? 'text-red-600'
                                                        : timeAuditVsTarget.status === 'early'
                                                          ? 'text-green-600'
                                                          : 'text-gray-600'
                                                }`}
                                            >
                                                {timeAuditVsTarget.status === 'onTime'
                                                    ? '0'
                                                    : Math.abs(timeAuditVsTarget.diffDays)}
                                            </div>
                                            <div
                                                className={`text-sm font-bold uppercase tracking-widest mb-1 text-center ${
                                                    timeAuditVsTarget.status === 'late'
                                                        ? 'text-red-600'
                                                        : timeAuditVsTarget.status === 'early'
                                                          ? 'text-green-600'
                                                          : 'text-gray-600'
                                                }`}
                                            >
                                                {timeAuditVsTarget.status === 'late'
                                                    ? 'Hari terlambat vs target'
                                                    : timeAuditVsTarget.status === 'early'
                                                      ? 'Hari lebih cepat vs target'
                                                      : 'Tepat dengan target'}
                                            </div>
                                            <p className="text-xs text-gray-500 mb-6 text-center px-1">
                                                {timeAuditVsTarget.status === 'late'
                                                    ? 'Tanggal proyeksi selesai setelah tanggal target.'
                                                    : timeAuditVsTarget.status === 'early'
                                                      ? 'Tanggal proyeksi selesai sebelum tanggal target.'
                                                      : 'Tanggal proyeksi sama dengan tanggal target.'}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-3xl font-black mb-2 text-gray-300">—</div>
                                            <div className="text-sm font-semibold text-gray-500 mb-6 text-center">
                                                Isi Target dan Proyeksi untuk perbandingan
                                            </div>
                                        </>
                                    )}

                                    <div className="w-full space-y-3">
                                        <div className="flex justify-between text-xs border-b border-gray-100 pb-1">
                                            <span className="text-gray-500">Target Completion</span>
                                            <span className="font-mono font-bold text-gray-800">
                                                {asset.endTargetDate ? new Date(asset.endTargetDate).toLocaleDateString('id-ID') : 'N/A'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs border-b border-gray-100 pb-1">
                                            <span className="text-gray-500">Forecasted Completion</span>
                                            <span
                                                className={`font-mono font-bold ${
                                                    timeAuditVsTarget.hasBoth && timeAuditVsTarget.status === 'late'
                                                        ? 'text-red-600'
                                                        : timeAuditVsTarget.hasBoth && timeAuditVsTarget.status === 'early'
                                                          ? 'text-green-600'
                                                          : timeAuditVsTarget.hasBoth && timeAuditVsTarget.status === 'onTime'
                                                            ? 'text-gray-700'
                                                            : 'text-blue-600'
                                                }`}
                                            >
                                                {asset.projectionEndDate
                                                    ? new Date(asset.projectionEndDate).toLocaleDateString('id-ID')
                                                    : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                    
                    {/* NEW SECTION: Recommendations & Predictions */}
                    <div className="lg:col-span-3 mt-6 space-y-6">
                        {/* Recommendations Section */}
                        {recommendations.length > 0 && (
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <h4 className="font-bold text-gray-800 mb-4 text-lg flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                    </svg>
                                    Rekomendasi Strategis
                                </h4>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-gray-200">
                                                <th className="text-left py-2 px-3 font-bold text-gray-700">Action Item</th>
                                                <th className="text-left py-2 px-3 font-bold text-gray-700">PIC / Owner</th>
                                                <th className="text-left py-2 px-3 font-bold text-gray-700">Priority</th>
                                                <th className="text-left py-2 px-3 font-bold text-gray-700">Deadline</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recommendations.map((rec, idx) => (
                                                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="py-3 px-3 text-gray-800">{rec.action}</td>
                                                    <td className="py-3 px-3 text-gray-700 font-medium">{rec.owner}</td>
                                                    <td className="py-3 px-3">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                            rec.urgency === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                                                            rec.urgency === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                                                            'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                            {rec.urgency}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-gray-700">{rec.deadline}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        
                        {/* Predictions Section */}
                        {predictions.length > 0 && (
                            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                <h4 className="font-bold text-gray-800 mb-4 text-lg flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                    </svg>
                                    Prediksi & Analisis
                                </h4>
                                <div className="space-y-3">
                                    {predictions.map((pred, idx) => (
                                        <div key={idx} className={`p-4 rounded-lg border-l-4 ${
                                            pred.type === 'positive' ? 'bg-green-50 border-green-500' :
                                            pred.type === 'warning' ? 'bg-yellow-50 border-yellow-500' :
                                            'bg-red-50 border-red-500'
                                        }`}>
                                            <h5 className="font-bold text-gray-800 mb-1">{pred.title}</h5>
                                            <p className="text-sm text-gray-700">{pred.description}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {/* Task Logs Summary */}
                        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-800 mb-4 text-lg flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                </svg>
                                Ringkasan Task Logs
                            </h4>
                            {loadingLogs ? (
                                <div className="text-center py-4 text-gray-500">Loading task logs...</div>
                            ) : taskLogs.length > 0 ? (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="bg-blue-50 p-3 rounded-lg">
                                            <p className="text-xs text-gray-600 mb-1">Total Task Completed</p>
                                            <p className="text-2xl font-bold text-blue-600">{completedTasksCount}</p>
                                        </div>
                                        <div className="bg-green-50 p-3 rounded-lg">
                                            <p className="text-xs text-gray-600 mb-1">Completion Rate</p>
                                            <p className="text-2xl font-bold text-green-600">{Math.round(completionRate)}%</p>
                                        </div>
                                        <div className="bg-purple-50 p-3 rounded-lg">
                                            <p className="text-xs text-gray-600 mb-1">Recent Activity</p>
                                            <p className="text-2xl font-bold text-purple-600">{recentLogs.length}</p>
                                        </div>
                                        <div className="bg-orange-50 p-3 rounded-lg">
                                            <p className="text-xs text-gray-600 mb-1">Days Remaining</p>
                                            <p className={`text-2xl font-bold ${isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
                                                {Math.abs(daysRemaining)}
                                            </p>
                                        </div>
                                    </div>
                                    {recentLogs.length > 0 && (
                                        <div className="mt-4">
                                            <p className="text-sm font-bold text-gray-700 mb-2">Aktivitas Terakhir:</p>
                                            <div className="space-y-2">
                                                {recentLogs.map((log, idx) => (
                                                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                                                        <span className="text-gray-700">{log.completedByUsername || 'System'}</span>
                                                        <span className="text-gray-500 text-xs">
                                                            {log.completedAt ? new Date(log.completedAt).toLocaleDateString('id-ID') : '-'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-4 text-gray-500">Belum ada task yang diselesaikan</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Ringkasan proyek — status, pembaruan terakhir, MOM, aksi */}
                <div className="px-6 pb-4 bg-gray-50">
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <h4 className="font-bold text-gray-800 text-lg border-b pb-2">Ringkasan proyek</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-semibold">Status proyek</p>
                                <p className="font-bold text-gray-900 mt-1">{scheduleInsight.statusLine}</p>
                                {scheduleInsight.delayLabel ? (
                                    <p className="text-xs text-red-600 mt-1">{scheduleInsight.delayLabel}</p>
                                ) : null}
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-semibold">Last update</p>
                                <p className="font-mono font-semibold text-gray-900 mt-1">
                                    {scheduleInsight.lastUpdateIso
                                        ? new Date(scheduleInsight.lastUpdateIso).toLocaleString('id-ID')
                                        : loadingLogs
                                          ? 'Memuat…'
                                          : '—'}
                                </p>
                            </div>
                            <div className="md:col-span-2">
                                <p className="text-xs text-gray-500 uppercase font-semibold">Last MOM log</p>
                                {scheduleInsight.latestMom ? (
                                    <div className="mt-1 p-3 bg-gray-50 rounded-lg border border-gray-100 text-gray-800 text-sm max-h-28 overflow-y-auto whitespace-pre-wrap">
                                        <span className="text-xs text-gray-500 block mb-1">
                                            {scheduleInsight.latestMom.createdAt
                                                ? new Date(scheduleInsight.latestMom.createdAt).toLocaleString('id-ID')
                                                : ''}{' '}
                                            · {scheduleInsight.latestMom.createdByUsername || '—'}
                                        </span>
                                        {scheduleInsight.latestMom.content}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 mt-1 text-sm">Belum ada MOM untuk aset ini.</p>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                            {currentUser && onAddMom ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onAddMom();
                                    }}
                                    className="px-4 py-2 rounded-lg bg-siloam-blue text-white text-sm font-semibold hover:bg-blue-700"
                                >
                                    Add MOM
                                </button>
                            ) : null}
                            {currentUser && onEditMom && scheduleInsight.latestMom ? (
                                <button
                                    type="button"
                                    onClick={() => onEditMom(scheduleInsight.latestMom!)}
                                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 text-sm font-semibold hover:bg-gray-50"
                                >
                                    Edit MOM
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>

                {/* Footer Action */}
                <div className="bg-white p-4 border-t border-gray-200 flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

interface AIAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    analysis: string;
    isLoading: boolean;
    assetName: string;
}

export const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({ isOpen, onClose, analysis, isLoading, assetName }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4 animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-siloam-border">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 flex justify-between items-center text-white flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.25 21.75l-.648-1.178a3.375 3.375 0 00-2.456-2.456L12 17.25l1.178-.648a3.375 3.375 0 002.456-2.456L16.25 13.5l.648 1.178a3.375 3.375 0 002.456 2.456L20.25 18l-1.178.648a3.375 3.375 0 00-2.456 2.456z" /></svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">AI Analysis Result</h2>
                            <p className="text-blue-100 text-sm">{assetName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/80 hover:text-white transition">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-4">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-gray-500 font-medium animate-pulse">Generating strategic insights...</p>
                        </div>
                    ) : (
                        <div className="prose max-w-none text-gray-800 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                            {analysis ? analysis : "No analysis data available."}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-white border-t border-gray-200 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
