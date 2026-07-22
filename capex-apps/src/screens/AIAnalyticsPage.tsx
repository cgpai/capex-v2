
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User } from '../types';
import { queryKeys } from '../lib/query-keys';
import { fetchGlobalAnalyticsFromBackend } from '../services/aiAnalyticsApi';

const ANALYTICS_STALE_MS = 120_000;

const BrainIconLarge = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 text-white opacity-80">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.25 21.75l-.648-1.178a3.375 3.375 0 00-2.456-2.456L12 17.25l1.178-.648a3.375 3.375 0 002.456-2.456L16.25 13.5l.648 1.178a3.375 3.375 0 00-2.456 2.456L20.25 18l-1.178.648a3.375 3.375 0 00-2.456 2.456z" />
    </svg>
);

const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend.includes('up') || trend.includes('improve') || trend.includes('baik')) return <span className="text-siloam-green">↗</span>;
    if (trend.includes('down') || trend.includes('wors') || trend.includes('buruk')) return <span className="text-danger">↘</span>;
    return <span className="text-siloam-text-secondary">→</span>;
};

const SeverityBadge = ({ level }: { level: string }) => {
    let color = 'bg-gray-100 text-gray-800';
    if (level === 'High') color = 'bg-red-100 text-red-800';
    if (level === 'Medium') color = 'bg-yellow-100 text-yellow-800';
    if (level === 'Low') color = 'bg-green-100 text-green-800';
    return <span className={`px-2 py-1 rounded text-xs font-bold ${color}`}>{level}</span>;
};

interface AIAnalyticsPageProps {
    currentUser: User;
}

export const AIAnalyticsPage: React.FC<AIAnalyticsPageProps> = ({ currentUser }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'dimensions' | 'risks'>('overview');
    const [fetchEnabled, setFetchEnabled] = useState(false);

    const analyticsQuery = useQuery({
        queryKey: queryKeys.aiAnalytics.global(currentUser.id),
        queryFn: async () => {
            const fromBe = await fetchGlobalAnalyticsFromBackend(currentUser.id);
            if (!fromBe) {
                throw new Error('Backend unavailable. Please ensure CAPEXBE is configured and running.');
            }
            return fromBe;
        },
        enabled: fetchEnabled,
        staleTime: ANALYTICS_STALE_MS,
    });

    const analyticsData = analyticsQuery.data ?? null;
    const loading = fetchEnabled && analyticsQuery.isFetching;
    const error =
        analyticsQuery.isError && analyticsQuery.error instanceof Error
            ? analyticsQuery.error.message
            : analyticsQuery.isError
              ? 'Failed to generate AI analysis. Please ensure API key is valid.'
              : null;

    const handleGenerateAnalysis = () => {
        if (!fetchEnabled) {
            setFetchEnabled(true);
        } else {
            void analyticsQuery.refetch();
        }
    };

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-6 animate-pulse">
                <div className="bg-siloam-blue p-6 rounded-full shadow-lg">
                    <BrainIconLarge />
                </div>
                <h2 className="text-2xl font-bold text-siloam-text-primary">AI Control Tower Analysis in Progress...</h2>
                <p className="text-siloam-text-secondary">Connecting data points across projects, units, and budgets.</p>
            </div>
        );
    }

    if (!analyticsData) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-8 rounded-2xl shadow-xl mb-8 transform hover:scale-105 transition-transform duration-300">
                    <BrainIconLarge />
                </div>
                <h1 className="text-3xl font-bold text-siloam-text-primary mb-4">AI Control Tower</h1>
                <p className="text-siloam-text-secondary max-w-lg mb-8">
                    Gain strategic insights, detect hidden risks, and receive intelligent recommendations across your entire CAPEX portfolio using Gemini AI.
                </p>
                {error && <div className="mb-4 p-4 bg-red-100 text-red-800 rounded-lg max-w-md">{error}</div>}
                <button
                    onClick={handleGenerateAnalysis}
                    className="bg-siloam-blue text-white px-8 py-3 rounded-xl font-bold shadow-soft hover:bg-siloam-blue/90 hover:shadow-lg transition-all"
                >
                    Generate Global Analysis
                </button>
            </div>
        );
    }

    const { executiveSummary, dimensionalAnalysis, risks, recommendations, narrative, lastUpdated } = analyticsData;

    return (
        <div className="space-y-6 pb-12">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-siloam-border shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-siloam-text-primary flex items-center gap-2">
                        <span className="text-siloam-blue">AI Control Tower</span>
                        <span className="text-xs bg-siloam-blue/10 text-siloam-blue px-2 py-1 rounded-full">BETA</span>
                    </h1>
                    <p className="text-sm text-siloam-text-secondary mt-1">Last Updated: {new Date(lastUpdated).toLocaleString()}</p>
                </div>
                <button
                    onClick={handleGenerateAnalysis}
                    className="bg-siloam-sidebar text-siloam-text-primary px-4 py-2 rounded-lg text-sm font-medium hover:bg-siloam-border transition flex items-center gap-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Refresh Analysis
                </button>
            </div>

            {/* Narrative Box */}
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-6 rounded-xl border border-blue-100 shadow-sm">
                <h3 className="text-lg font-bold text-indigo-900 mb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                    Executive Insights
                </h3>
                <p className="text-indigo-800 leading-relaxed text-sm md:text-base">{narrative}</p>
            </div>

            {/* Executive Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-siloam-border shadow-sm">
                    <p className="text-xs text-siloam-text-secondary uppercase font-bold">Active Projects</p>
                    <p className="text-3xl font-bold text-siloam-text-primary mt-2">{executiveSummary.totalActiveProjects}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-siloam-border shadow-sm">
                    <p className="text-xs text-siloam-text-secondary uppercase font-bold">At Risk</p>
                    <p className="text-3xl font-bold text-danger mt-2">{executiveSummary.projectsAtRisk}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-siloam-border shadow-sm">
                    <p className="text-xs text-siloam-text-secondary uppercase font-bold">Budget Utilization</p>
                    <p className="text-3xl font-bold text-siloam-blue mt-2">{executiveSummary.budgetUtilization}%</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-siloam-border shadow-sm">
                    <p className="text-xs text-siloam-text-secondary uppercase font-bold">Avg. Progress</p>
                    <p className="text-3xl font-bold text-siloam-green mt-2">{executiveSummary.overallProgress}%</p>
                </div>
            </div>

            {/* Highlights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-4">
                    <div className="bg-red-100 p-2 rounded-lg text-red-600 font-bold">⚠️</div>
                    <div>
                        <h4 className="font-bold text-red-900">Top Bottleneck</h4>
                        <p className="text-sm text-red-800 mt-1">{executiveSummary.topBottleneck}</p>
                    </div>
                </div>
                <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex items-start gap-4">
                    <div className="bg-green-100 p-2 rounded-lg text-green-600 font-bold">🏆</div>
                    <div>
                        <h4 className="font-bold text-green-900">Top Performance</h4>
                        <p className="text-sm text-green-800 mt-1">{executiveSummary.bestPerformingArea}</p>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="border-b border-siloam-border">
                <nav className="-mb-px flex space-x-8">
                    {['overview', 'dimensions', 'risks'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === tab
                                    ? 'border-siloam-blue text-siloam-blue'
                                    : 'border-transparent text-siloam-text-secondary hover:text-siloam-text-primary hover:border-gray-300'
                            }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab Content */}
            <div className="animate-fade-in">
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl shadow-soft overflow-hidden border border-siloam-border">
                            <div className="px-6 py-4 border-b border-siloam-border bg-gray-50">
                                <h3 className="font-bold text-siloam-text-primary">Strategic Recommendations</h3>
                            </div>
                            <table className="min-w-full divide-y divide-siloam-border">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-siloam-text-secondary uppercase tracking-wider">Action</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-siloam-text-secondary uppercase tracking-wider">PIC / Owner</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-siloam-text-secondary uppercase tracking-wider">Urgency</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-siloam-text-secondary uppercase tracking-wider">System Trigger</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-siloam-border">
                                    {recommendations.map((rec, idx) => (
                                        <tr key={idx}>
                                            <td className="px-6 py-4 text-sm text-siloam-text-primary">{rec.action}</td>
                                            <td className="px-6 py-4 text-sm text-siloam-text-secondary">{rec.owner}</td>
                                            <td className="px-6 py-4 whitespace-nowrap"><SeverityBadge level={rec.urgency} /></td>
                                            <td className="px-6 py-4 text-xs font-mono text-siloam-blue">{rec.systemTrigger || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'dimensions' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="bg-white p-4 rounded-xl border border-siloam-border shadow-sm">
                            <h3 className="font-bold mb-4">Project Analysis</h3>
                            <ul className="space-y-3">
                                {dimensionalAnalysis.projects.map((p, i) => (
                                    <li key={i} className="text-sm flex justify-between items-center p-2 bg-gray-50 rounded">
                                        <span className="font-medium truncate max-w-[60%]" title={p.name}>{p.name}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500">{p.status}</span>
                                            <TrendIcon trend={p.trend} />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-siloam-border shadow-sm">
                            <h3 className="font-bold mb-4">Unit Analysis (HU)</h3>
                            <ul className="space-y-3">
                                {dimensionalAnalysis.units.map((u, i) => (
                                    <li key={i} className="text-sm p-3 bg-gray-50 rounded border-l-4 border-blue-400">
                                        <div className="flex justify-between font-medium">
                                            <span>{u.name}</span>
                                            <span className="text-xs bg-white px-2 py-0.5 rounded border">{u.performance}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{u.issue}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-siloam-border shadow-sm">
                            <h3 className="font-bold mb-4">Role Analysis</h3>
                            <ul className="space-y-3">
                                {dimensionalAnalysis.roles.map((r, i) => (
                                    <li key={i} className="text-sm p-3 bg-gray-50 rounded">
                                        <div className="flex justify-between font-medium mb-1">
                                            <span>{r.name}</span>
                                            <span className="text-xs text-siloam-text-secondary">{r.workload} Tasks</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-500">Avg. Delay:</span>
                                            <span className="font-bold text-danger">{r.avgDelay}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {activeTab === 'risks' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {risks.map((risk, idx) => (
                            <div key={idx} className="bg-white p-6 rounded-xl border border-siloam-border shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-3">
                                    <h4 className="font-bold text-siloam-text-primary pr-4">{risk.description}</h4>
                                    <SeverityBadge level={risk.severity} />
                                </div>
                                <p className="text-sm text-siloam-text-secondary mb-4">
                                    <span className="font-semibold text-gray-700">Impact:</span> {risk.impact}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
