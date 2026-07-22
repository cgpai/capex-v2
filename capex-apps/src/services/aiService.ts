import { GoogleGenAI, Schema, Type } from "@google/genai";
import { EnrichedAsset, Project, TimelineItem, TaskCurrentStatus, GlobalAnalyticsResponse, BudgetPeriod, TaskLog, UserRole, HospitalUnit, BudgetItem, OfflineDataItem } from '../types';
import { formatCurrency } from '../lib/formatter';

/** Gemini — server-only. Never read NEXT_PUBLIC_* (would embed key in client bundle). */
function getApiKey(): string | null {
  if (typeof window !== 'undefined') return null;
  const key = process.env.GEMINI_API_KEY ?? process.env.API_KEY;
  const s = key != null ? String(key).trim() : '';
  return s.length > 0 ? s : null;
}

const SYSTEM_PROMPT = `
You are the "CAPEX Project Analysis Assistant" for Siloam Hospitals.

Your task is to analyze a specific CAPEX project based on the provided structured data.
Your output must be **actionable**, **accurate**, and written in **formal executive English** suitable for top management review.

Your Responsibilities:
- Predict if the project will be completed on time (Forecast).
- Identify positive progress indicators.
- Highlight bottlenecks, overdue tasks, dependency risks, or approval delays.
- Provide a brief diagnostic section explaining the root cause of delays or acceleration.
- List responsible stakeholders and their current engagement status.
- Provide a set of clear **Strategic Recommendations** with an Owner and Urgency level.
- DO NOT fabricate data. If data is missing, state: "Data unavailable."

---

### RULES:
1. NEVER hallucinate. Use only the provided data.
2. All insights must be based on real numbers, statuses, variances, SLA metrics, procurement status, or workflow logs.
3. If there is a delay, estimate the projected slippage based on pending workflow duration, vendor lead times, and progress variance.
4. Keep the output concise (< 300 words).
5. Formatting must strictly follow the structure below.
6. Recommendations must include the role/owner name and a deadline expectation (e.g., "Within 24 hours").

---

### OUTPUT FORMAT (MUST FOLLOW EXACTLY):

📌 **Executive Summary**
- Project Name: {{projectName}}
- Status: {{On Track / At Risk / Critical Delay}}
- Completion Forecast: {{prediction}}
- Current Progress: {{actualProgressPercent}}%
- Target Date: {{targetDate}}

📊 **Progress Snapshot**
- Variance: {{Behind Schedule / Ahead of Schedule / On Schedule}}
- Key Milestone Note: {{Brief statement}}

🟢 **Positive Indicators**
- Brief bullet list of positive progress.

🔴 **Risks & Bottlenecks**
- Brief bullet list of risks: overdue tasks, vendor issues, missing approvals, workflow delays, budget gaps, etc.

🧠 **Root Cause Analysis**
(2–4 sentences explaining WHY the project is slow or fast based on the data)

👥 **Stakeholder Map**
(Summarize key stakeholders and their roles: Active / Pending / Blocking / Unassigned)

📌 **Strategic Recommendations**
| Action Item | PIC / Owner | Priority | Deadline |
|-------------|-------------|----------|----------|

🔁 **Next System Trigger**
(What will happen next automatically — if applicable. E.g., automated escalation, system reminder, or procurement lock.)
`;

const HU_ANALYSIS_PROMPT = `
You are the "Hospital Performance Consultant" for Siloam Hospitals.
Your task is to analyze the CAPEX performance for a specific Hospital Unit based on the provided data.

Input Data:
- Unit Name & Budget Period.
- Budget Summary (Plan vs Approved vs Consumed) per category.
- List of ongoing Projects with status, type, and progress.

Analysis Tasks:
1. **Executive Summary**: Provide a high-level overview of this unit's health. Are they aggressive in spending or lagging? Are projects running smoothly?
2. **Budget Health**: Evaluate budget utilization. Is it under-utilized or over-budget? Which category is the most efficient or wasteful? Compare Plan vs Consumed.
3. **Portfolio Analysis**: 
   - Identify "Big Ticket" projects (large budget) and their status.
   - Are there many stalled (delayed) projects?
   - Is the pipeline of new projects healthy?
4. **Risks & Findings**: Mention specific risks (e.g., high number of "At Risk" projects, very low IT budget absorption, etc.).
5. **Managerial Recommendations**: Provide 3-5 tactical and strategic recommendations for the Unit Head (CEO) or Unit Finance Head for the remainder of the period.

Output Format (Markdown):
Use **Professional Corporate English**. Use bold for key points.
Structure:
## Unit Performance Analysis: {{Unit Name}}
### 1. Executive Summary
(Brief paragraph)

### 2. Budget Health
(Analysis of Plan vs Consumed, mention figures/percentages if relevant)

### 3. Project Portfolio Status
- **Total Projects:** {{count}}
- **Status Breakdown:** {{X}} On Track, {{Y}} At Risk, {{Z}} Off Track
- **Highlighted Projects:** (Mention 1-2 major projects and their status)

### 4. Key Risks
- (Bullet points)

### 5. Strategic Recommendations
| Recommendation | Owner | Urgensi |
|----------------|-------|---------|
| (Fill table)   | ...   | ...     |
`;

const GLOBAL_ANALYTICS_PROMPT = `
You are the "AI Control Tower Analytics System" for Siloam Hospitals CAPEX Tracking.
Your task is to analyze a large dataset of projects, units, and budgets to provide strategic insights.

Input Data:
Aggregate JSON containing project summaries, Hospital Unit (HU) performance, role performance, and budget statistics.

Analysis Tasks:
1.  **Executive Overview:** Calculate the overall portfolio health.
2.  **Dimensional Analysis:**
    *   Projects: Which are the most critical/problematic?
    *   Units: Which units are lagging in budget absorption or project completion?
    *   Roles: Which role is a bottleneck (frequent delays/overdue tasks)?
3.  **Risk Detection:** Detect systemic patterns (e.g., Vendor X is always late, Director-level approval is always stuck).
4.  **Recommendations:** Provide strategic advice (not item-level tactics), e.g., "Conduct training for Unit Admin SHKJ", "Escalate IT budget approval".

Output Format JSON (Must be Valid JSON):
{
  "executiveSummary": {
    "totalActiveProjects": number,
    "projectsAtRisk": number,
    "overallProgress": number,
    "budgetUtilization": number,
    "topBottleneck": string,
    "bestPerformingArea": string
  },
  "dimensionalAnalysis": {
    "projects": [{ "name": string, "status": string, "trend": string }],
    "units": [{ "name": string, "performance": string, "issue": string }],
    "roles": [{ "name": string, "workload": string, "avgDelay": string }]
  },
  "risks": [{ "description": string, "impact": string, "severity": "High" | "Medium" | "Low" }],
  "recommendations": [{ "action": string, "owner": string, "urgency": "High" | "Medium" | "Low", "systemTrigger": string }],
  "narrative": string (Executive summary paragraph in Professional English),
  "lastUpdated": string (ISO Date)
}
`;

const SMART_PROCESS_PROMPT = `
You are an "Intelligent Data Cleaner" for Siloam Hospitals' CAPEX system.
You will receive a list of raw data rows (JSON) from an Excel import.
Your job is to normalize and map these fields to our standard schema:
- projectName (string)
- budgetPlan (number)
- targetStart (YYYY-MM-DD)
- endDate (YYYY-MM-DD)
- owner (string)
- huName (string)

Rules:
1. Infer the meaning of columns (e.g., "Nama Proyek", "Judul", "Project" -> projectName).
2. Clean numeric strings (e.g., "Rp 100.000.000", "100jt" -> 100000000).
3. Format dates to ISO 8601 (YYYY-MM-DD). If unclear, leave blank.
4. If a field is missing, omit it or set null.
5. Return a JSON array of objects.
`;

const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        executiveSummary: {
            type: Type.OBJECT,
            properties: {
                totalActiveProjects: { type: Type.NUMBER },
                projectsAtRisk: { type: Type.NUMBER },
                overallProgress: { type: Type.NUMBER },
                budgetUtilization: { type: Type.NUMBER },
                topBottleneck: { type: Type.STRING },
                bestPerformingArea: { type: Type.STRING }
            }
        },
        dimensionalAnalysis: {
            type: Type.OBJECT,
            properties: {
                projects: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            status: { type: Type.STRING },
                            trend: { type: Type.STRING }
                        }
                    }
                },
                units: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            performance: { type: Type.STRING },
                            issue: { type: Type.STRING }
                        }
                    }
                },
                roles: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            workload: { type: Type.STRING },
                            avgDelay: { type: Type.STRING }
                        }
                    }
                }
            }
        },
        risks: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    description: { type: Type.STRING },
                    impact: { type: Type.STRING },
                    severity: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] }
                }
            }
        },
        recommendations: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    action: { type: Type.STRING },
                    owner: { type: Type.STRING },
                    urgency: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
                    systemTrigger: { type: Type.STRING }
                }
            }
        },
        narrative: { type: Type.STRING },
        lastUpdated: { type: Type.STRING }
    }
};

const smartDataSchema: Schema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            projectName: { type: Type.STRING },
            budgetPlan: { type: Type.NUMBER },
            targetStart: { type: Type.STRING },
            endDate: { type: Type.STRING },
            owner: { type: Type.STRING },
            huName: { type: Type.STRING },
        }
    }
};

export const analyzeProject = async (
    asset: EnrichedAsset, 
    project: Project, 
    timeline: TimelineItem[]
): Promise<string> => {
    try {
        const apiKey = getApiKey();
        if (!apiKey) return 'Fitur AI tidak tersedia. Untuk production, gunakan backend yang menyimpan API key dengan aman.';
        const ai = new GoogleGenAI({ apiKey });
        // Prepare data payload
        const dataPayload = {
            projectName: `${project.projectName} - ${asset.assetName}`,
            status: project.status, // 0=OnTrack, 1=AtRisk, 2=OffTrack
            actualProgressPercent: asset.completionRate,
            targetDate: asset.endTargetDate,
            budget: {
                plan: asset.budgetPlan,
                consumed: asset.consumedBudget,
                isBudgetApproved: project.approvedBudget > 0
            },
            procurement: {
                poNumber: asset.poNumber,
                isGoodsReceived: asset.isGoodsReceived
            },
            timelineSnapshot: timeline.map(t => {
                if (t.type === 'workflow') {
                    return {
                        taskName: t.task.name,
                        status: t.statusInfo.status,
                        slaDays: t.step.slaToComplete,
                        assignedRoles: t.step.roleIds,
                        startDate: t.statusInfo.startDate,
                        completedAt: t.statusInfo.completedAt,
                        completedBy: t.log?.completedByUsername,
                        isSystemTriggered: t.task.isSystemTriggered
                    };
                }
                return null;
            }).filter(Boolean)
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `INPUT DATA (JSON below):\n${JSON.stringify(dataPayload, null, 2)}`,
            config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0.4, // Keep it factual
            }
        });

        return response.text || "Analysis could not be generated.";
    } catch (error) {
        console.error("AI Analysis Failed:", error);
        throw new Error("Failed to generate AI analysis. Please check your API key or try again later.");
    }
};

export const analyzeHospitalUnit = async (
    hu: HospitalUnit,
    projects: Project[],
    periodName: string
): Promise<string> => {
    try {
        const apiKey = getApiKey();
        if (!apiKey) return 'Fitur AI tidak tersedia. Untuk production, gunakan backend yang menyimpan API key dengan aman.';
        const ai = new GoogleGenAI({ apiKey });
        const budgetSummary = Object.entries(hu.budget).map(([catId, item]) => ({
            categoryId: catId,
            plan: formatCurrency(item.budgetPlan),
            approved: formatCurrency(item.approvedBudget),
            consumed: formatCurrency(item.consumedBudget),
            percentConsumed: item.budgetPlan > 0 ? ((item.consumedBudget / item.budgetPlan) * 100).toFixed(1) + '%' : '0%'
        }));

        const projectSummary = projects.map(p => ({
            name: p.projectName,
            status: p.status === 0 ? "On Track" : p.status === 1 ? "At Risk" : "Off Track",
            budgetPlan: formatCurrency(p.budgetPlan),
            consumed: formatCurrency(p.consumedBudget),
            progress: p.completionRate + '%'
        }));

        const dataPayload = {
            unitName: hu.name,
            period: periodName,
            budgetSummary,
            projects: projectSummary.slice(0, 20) // Limit to top 20 to save tokens
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `UNIT DATA (JSON):\n${JSON.stringify(dataPayload, null, 2)}`,
            config: {
                systemInstruction: HU_ANALYSIS_PROMPT,
                temperature: 0.5,
            }
        });

        return response.text || "Unit analysis generation failed.";

    } catch (error) {
        console.error("HU Analysis Failed:", error);
        throw new Error("Failed to generate Unit Analysis. Check connection or API Key.");
    }
};

export const generateGlobalAnalytics = async (
    periods: BudgetPeriod[],
    taskLogs: TaskLog[],
    allRoles: UserRole[]
): Promise<GlobalAnalyticsResponse> => {
    const apiKey = getApiKey();
    if (!apiKey) {
        const now = new Date().toISOString();
        return {
            executiveSummary: {
                totalActiveProjects: 0,
                projectsAtRisk: 0,
                overallProgress: 0,
                budgetUtilization: 0,
                topBottleneck: '',
                bestPerformingArea: '',
            },
            dimensionalAnalysis: { projects: [], units: [], roles: [] },
            risks: [],
            recommendations: [],
            narrative: '',
            lastUpdated: now,
        };
    }
    const ai = new GoogleGenAI({ apiKey });
    // 1. Pre-process and aggregate data to save context window tokens
    const projectSummary = periods.flatMap(p => p.archetypes.flatMap(a => a.units.flatMap(u => u.projects.map(proj => ({
        name: proj.projectName,
        hu: u.name,
        status: proj.status, // 0, 1, 2
        progress: proj.assets.reduce((sum, a) => sum + (a.budgetAllocated > 0 ? 100 : 0), 0) / Math.max(1, proj.assets.length), // Crude progress
        budget: { plan: proj.budgetPlan, consumed: proj.consumedBudget }
    })))));

    const huSummary = periods.flatMap(p => p.archetypes.flatMap(a => a.units.map(u => ({
        name: u.name,
        archetype: a.name,
        totalBudget: Object.values(u.budget).reduce((sum, b) => sum + b.budgetPlan, 0),
        totalConsumed: Object.values(u.budget).reduce((sum, b) => sum + b.consumedBudget, 0),
    }))));

    // Calculate role bottlenecks from task logs (mock logic for AI input)
    const roleStats: Record<string, { count: number }> = {};
    taskLogs.forEach(log => {
        if(log.completedByUserRole) {
            if(!roleStats[log.completedByUserRole]) roleStats[log.completedByUserRole] = { count: 0 };
            roleStats[log.completedByUserRole].count++;
        }
    });

    const dataPayload = {
        totalProjects: projectSummary.length,
        projectsSample: projectSummary.slice(0, 30), // Limit samples
        huStats: huSummary.slice(0, 20), // Limit samples
        roleActivityCounts: roleStats,
        timestamp: new Date().toISOString()
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `GLOBAL DATA INPUT (Summary):\n${JSON.stringify(dataPayload)}`,
            config: {
                systemInstruction: GLOBAL_ANALYTICS_PROMPT,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            }
        });

        const text = response.text || "{}";
        return JSON.parse(text) as GlobalAnalyticsResponse;
    } catch (error) {
        console.error("Global AI Analysis Failed:", error);
        throw error;
    }
}

export const smartProcessData = async (rawRows: any[]): Promise<any[]> => {
    try {
        const apiKey = getApiKey();
        if (!apiKey) return rawRows;
        const ai = new GoogleGenAI({ apiKey });
        // Only take the first 30 rows to save tokens, or chunk it. For this demo, simple slice.
        const sampleRows = rawRows.slice(0, 30); 

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `RAW DATA INPUT:\n${JSON.stringify(sampleRows)}`,
            config: {
                systemInstruction: SMART_PROCESS_PROMPT,
                responseMimeType: "application/json",
                responseSchema: smartDataSchema,
                temperature: 0.1 // Deterministic
            }
        });

        const text = response.text || "[]";
        return JSON.parse(text);
    } catch (error) {
        console.error("Smart Process Failed:", error);
        throw error;
    }
};
