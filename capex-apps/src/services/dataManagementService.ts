const _log = (..._args: unknown[]) => {};
const _warn = (..._args: unknown[]) => {};

import { getAccessTokenForBackend } from '../lib/authSession';
import { authenticatedFetch } from '../lib/auth/authenticatedFetch';
import { useBackendSession } from '../lib/auth/authConstants';
import { capexBeRequestUrl, postToCapexBe } from '../lib/capexBeClient';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';
import { invalidateRequestCache } from '../lib/requestCache';
import { 
    ArchetypeConfig, HospitalUnitConfig, RegionalConfig, UserRole, User, Task, 
    WorkflowSet, WorkflowStep, BudgetPeriod, Project, Asset, ProjectStatus, 
    ProjectType, UserAssignment, PIPELINE_ARCHETYPE_ID, MasterCatalogueItem, 
    RoomConfig, Vendor, BudgetItem, AuditLog, TaskLog, AssetTaskStatus, TaskCurrentStatus,
    BudgetCategoryConfig, ProjectPriorityConfig, AssetTypeConfig, MOM, FeasibilityStudy, EnrichedAsset
} from '../types';
import { LEGACY_NETWORK_HEADER_TO_FIELD_KEY } from '../lib/terminology';
import * as XLSX from 'xlsx';

// --- Types ---
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

const toLocalDateString = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

/** Parse nilai tanggal Excel (serial / string / Date) ke YYYY-MM-DD untuk kolom DATE di DB. */
const parseExcelDateValue = (value: unknown): string | null => {
    if (value === undefined || value === null || value === '') return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return toLocalDateString(value);
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const ms = EXCEL_EPOCH_UTC_MS + Math.round(value * 86400000);
        const d = new Date(ms);
        if (!Number.isNaN(d.getTime())) return toLocalDateString(d);
    }

    const raw = String(value).trim();
    if (!raw) return null;

    // Numeric-like string from Excel serial (e.g. "45610")
    if (/^\d+(\.\d+)?$/.test(raw)) {
        const numeric = Number(raw);
        if (Number.isFinite(numeric) && numeric > 1000) {
            const ms = EXCEL_EPOCH_UTC_MS + Math.round(numeric * 86400000);
            const d = new Date(ms);
            if (!Number.isNaN(d.getTime())) return toLocalDateString(d);
        }
    }

    // Prefer dd/mm/yyyy[ hh:mm[:ss]] style to avoid locale ambiguity.
    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
        const day = Number(m[1]);
        const month = Number(m[2]);
        const yearRaw = Number(m[3]);
        const year = yearRaw < 100 ? (2000 + yearRaw) : yearRaw;
        const hour = Number(m[4] || 0);
        const minute = Number(m[5] || 0);
        const second = Number(m[6] || 0);
        const d = new Date(year, month - 1, day, hour, minute, second, 0);
        if (!Number.isNaN(d.getTime())) return toLocalDateString(d);
    }

    const fallback = new Date(raw);
    if (!Number.isNaN(fallback.getTime())) return toLocalDateString(fallback);
    return null;
};

/** Placeholder kosong dari Excel: –, —, -, N/A, dll. */
const EMPTY_MIGRATION_CELL_PATTERN = /^[\s.\u2010-\u2015\u2212\-–—―]*$|^#N\/A$|^N\/A$|^na$/i;

const isEmptyMigrationCellValue = (value: unknown): boolean => {
    if (value === undefined || value === null) return true;
    if (typeof value === 'number' && !Number.isFinite(value)) return true;
    const raw = String(value).trim();
    if (!raw) return true;
    return EMPTY_MIGRATION_CELL_PATTERN.test(raw);
};

const normalizeMigrationTaskName = (value: unknown): string =>
    String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();

const parseOptionalMigrationDate = (value: unknown): string | null => {
    if (isEmptyMigrationCellValue(value)) return null;
    return parseExcelDateValue(value);
};

const parseMigrationCompletionIso = (value: unknown, fallback: Date = new Date()): string => {
    if (isEmptyMigrationCellValue(value)) return fallback.toISOString();

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const ms = EXCEL_EPOCH_UTC_MS + Math.round(value * 86400000);
        const d = new Date(ms);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
    }

    const raw = String(value).trim();

    if (/^\d+(\.\d+)?$/.test(raw)) {
        const numeric = Number(raw);
        if (Number.isFinite(numeric) && numeric > 1000) {
            const ms = EXCEL_EPOCH_UTC_MS + Math.round(numeric * 86400000);
            const d = new Date(ms);
            if (!Number.isNaN(d.getTime())) return d.toISOString();
        }
    }

    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
        const day = Number(m[1]);
        const month = Number(m[2]);
        const yearRaw = Number(m[3]);
        const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
        const hour = Number(m[4] || 0);
        const minute = Number(m[5] || 0);
        const second = Number(m[6] || 0);
        const d = new Date(year, month - 1, day, hour, minute, second, 0);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
    }

    const dateOnly = parseExcelDateValue(value);
    if (dateOnly) {
        const d = new Date(`${dateOnly}T12:00:00`);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
    }

    const fallbackParsed = new Date(raw);
    if (!Number.isNaN(fallbackParsed.getTime())) return fallbackParsed.toISOString();

    throw new Error(`Invalid completion date: ${raw}`);
};

export type MigrationTarget = 
    'Projects' | 
    'Assets' | 
    'Vendors' | 
    'MasterCatalogue' | 
    'Rooms' | 
    'BudgetCategories' | 
    'ProjectPriorities' | 
    'HospitalUnits' | 
    'Archetypes' | 
    'Regionals' | 
    'AssetTypes' | 
    'BudgetPeriod' | 
    'BudgetArchetype' | 
    'BudgetHospitalUnit' | 
    'TaskUpdates' | 
    'Users' |
    'MOMNotes' |
    'FeasibilityStudies' |
    'PoUpdates' |
    'FsUpdates';

export interface MigrationField {
    key: string;
    label: string;
    type: 'string' | 'number' | 'date';
    required: boolean;
    description?: string;
}

// --- Schema Definitions ---

export const getMigrationSchema = (target: MigrationTarget): MigrationField[] => {
    switch (target) {
        case 'Projects':
            return [
                { key: 'projectCode', label: 'Project Code', type: 'string', required: false, description: 'Optional. If empty, system auto-generates.' },
                { key: 'projectName', label: 'Project Name', type: 'string', required: true },
                { key: 'axCode', label: 'AX Code', type: 'string', required: false, description: 'Optional. AX Code for integration with AX system.' },
                { key: 'huCode', label: 'Hospital Unit Code', type: 'string', required: true, description: 'Must match an existing HU Code.' },
                { key: 'budgetPlan', label: 'Budget Plan', type: 'number', required: true },
                { key: 'budgetCarryForward', label: 'Carry Forward', type: 'number', required: false },
                { key: 'approvedBudget', label: 'Approved Budget', type: 'number', required: false },
                { key: 'categoryName', label: 'Budget Category', type: 'string', required: true },
                { key: 'priorityName', label: 'Project Priority', type: 'string', required: false, description: 'Optional. Must match an existing Priority Name. Defaults to first available priority if empty.' },
            ];
        case 'Assets':
            return [
                { key: 'projectCode', label: 'Project Code', type: 'string', required: true, description: 'Used to link asset to project.' },
                { key: 'assetCode', label: 'Asset Code', type: 'string', required: false, description: 'Optional. Harus unik di seluruh periode (semua project). Jika kosong, sistem buat otomatis.' },
                { key: 'assetName', label: 'Asset Name', type: 'string', required: true },
                { key: 'description', label: 'Deskripsi', type: 'string', required: false, description: 'Optional. Deskripsi atau keterangan tambahan tentang asset.' },
                { key: 'budgetPlan', label: 'Budget Plan', type: 'number', required: true },
                { key: 'consumedBudget', label: 'Consumed Budget', type: 'number', required: false },
                { key: 'workflowName', label: 'Workflow/Asset Type', type: 'string', required: false, description: 'Optional. Asset Type akan menggunakan pilihan di Setup jika tidak diisi.' },
                { key: 'endTargetDate', label: 'Target Date Time', type: 'date', required: false, description: 'Mendukung format Excel date/time, dd/mm/yyyy hh:mm, dan serial date.' },
            ];
        case 'Vendors':
            return [
                { key: 'name', label: 'Vendor Name', type: 'string', required: true },
                { key: 'address', label: 'Address', type: 'string', required: true },
                { key: 'contactPerson', label: 'Contact Person', type: 'string', required: true },
                { key: 'email', label: 'Email', type: 'string', required: true },
                { key: 'phone', label: 'Phone', type: 'string', required: false },
                { key: 'npwp', label: 'NPWP', type: 'string', required: false },
            ];
        case 'MasterCatalogue':
            return [
                { key: 'rdsCode', label: 'RDS Code', type: 'string', required: true },
                { key: 'name', label: 'Item Name', type: 'string', required: true },
                { key: 'category', label: 'Category', type: 'string', required: true },
                { key: 'price', label: 'Price', type: 'number', required: true },
            ];
        case 'TaskUpdates':
            return [
                { key: 'assetCode', label: 'Asset Code', type: 'string', required: true, description: 'Must match existing Asset Code' },
                { key: 'taskName', label: 'Task Name', type: 'string', required: true, description: 'Must match Task Name in Workflow' },
                { key: 'completionDate', label: 'Completion Date Time', type: 'date', required: false, description: 'Defaults to today if empty. Mendukung format date/time dari Excel.' },
                { key: 'rescheduleDate', label: 'Reschedule', type: 'date', required: false, description: 'Optional. New target date when the task was rescheduled. Supports Excel date/time formats.' },
                { key: 'remark', label: 'Remark', type: 'string', required: false },
            ];
        case 'Rooms':
            return [
                { key: 'name', label: 'Room Name', type: 'string', required: true },
            ];
        case 'BudgetCategories':
            return [
                { key: 'name', label: 'Category Name', type: 'string', required: true },
                { key: 'isActive', label: 'Is Active', type: 'string', required: false, description: 'true/false. Defaults to true.' },
            ];
        case 'ProjectPriorities':
            return [
                { key: 'name', label: 'Priority Name', type: 'string', required: true },
                { key: 'isActive', label: 'Is Active', type: 'string', required: false, description: 'true/false. Defaults to true.' },
            ];
        case 'HospitalUnits':
            return [
                { key: 'name', label: 'Hospital Unit Name', type: 'string', required: true },
                { key: 'code', label: 'Hospital Unit Code', type: 'string', required: true },
                { key: 'archetypeCode', label: 'Network Code', type: 'string', required: true, description: 'Must match an existing Network Code.' },
                { key: 'regionalCode', label: 'Regional Code', type: 'string', required: false, description: 'Optional. Must match an existing Regional Code if provided.' },
                { key: 'huNumber', label: 'HU Number', type: 'string', required: false },
            ];
        case 'Archetypes':
            return [
                { key: 'name', label: 'Network Name', type: 'string', required: true },
                { key: 'code', label: 'Network Code', type: 'string', required: true },
            ];
        case 'Regionals':
            return [
                { key: 'name', label: 'Regional Name', type: 'string', required: true },
                { key: 'code', label: 'Regional Code', type: 'string', required: true },
            ];
        case 'AssetTypes':
            return [
                { key: 'name', label: 'Asset Type Name', type: 'string', required: true },
                { key: 'groupId', label: 'Asset Type Group ID', type: 'string', required: false, description: 'Optional. Must match an existing Asset Type Group ID.' },
                { key: 'workflowSetId', label: 'Workflow Set ID', type: 'string', required: false, description: 'Optional. Must match an existing Workflow Set ID.' },
                { key: 'isActive', label: 'Is Active', type: 'string', required: false, description: 'true/false. Defaults to true.' },
            ];
        case 'BudgetPeriod':
            return [
                { key: 'periodName', label: 'Period Name', type: 'string', required: true, description: 'Must match an existing Budget Period name.' },
                { key: 'categoryName', label: 'Budget Category Name', type: 'string', required: true, description: 'Must match an existing Budget Category name.' },
                { key: 'budgetPlan', label: 'Budget Plan', type: 'number', required: true },
                { key: 'budgetCarryForward', label: 'Budget Carry Forward', type: 'number', required: false },
                { key: 'budgetAllocated', label: 'Budget Allocated', type: 'number', required: false },
                { key: 'approvedBudget', label: 'Approved Budget', type: 'number', required: false },
                { key: 'consumedBudget', label: 'Consumed Budget', type: 'number', required: false },
                { key: 'assetCount', label: 'Asset Count', type: 'number', required: false },
                { key: 'noBudgetAssetCount', label: 'No Budget Asset Count', type: 'number', required: false },
            ];
        case 'BudgetArchetype':
            return [
                { key: 'periodName', label: 'Period Name', type: 'string', required: true, description: 'Must match an existing Budget Period name.' },
                { key: 'archetypeName', label: 'Network Name', type: 'string', required: true, description: 'Must match an existing Network Name.' },
                { key: 'categoryName', label: 'Budget Category Name', type: 'string', required: true, description: 'Must match an existing Budget Category name.' },
                { key: 'budgetPlan', label: 'Budget Plan', type: 'number', required: true },
            ];
        case 'BudgetHospitalUnit':
            return [
                { key: 'periodName', label: 'Period Name', type: 'string', required: true, description: 'Must match an existing Budget Period name.' },
                { key: 'hospitalUnitCode', label: 'Hospital Unit Code', type: 'string', required: true, description: 'Must match an existing Hospital Unit Code.' },
                { key: 'categoryName', label: 'Budget Category Name', type: 'string', required: true, description: 'Must match an existing Budget Category name.' },
                { key: 'budgetPlan', label: 'Budget Plan', type: 'number', required: true },
            ];
        case 'MOMNotes':
            return [
                { key: 'assetCode', label: 'Asset Code', type: 'string', required: true, description: 'Must match existing Asset Code in the system.' },
                { key: 'content', label: 'MOM Content / Note', type: 'string', required: true, description: 'Content of the MOM note.' },
                { key: 'createdAt', label: 'Date/Time', type: 'date', required: false, description: 'Optional. Defaults to now if empty. Supports Excel date/time formats.' },
                { key: 'createdByUsername', label: 'Created By', type: 'string', required: false, description: 'Optional. Defaults to current logged-in user.' },
            ];
        case 'PoUpdates':
            return [
                { key: 'assetCode', label: 'Asset Code', type: 'string', required: true, description: 'Must match existing Asset Code in the system.' },
                { key: 'cprId', label: 'CPR ID', type: 'string', required: false, description: 'Capex Purchase Request identifier.' },
                { key: 'poNumber', label: 'PO Number', type: 'string', required: false, description: 'Purchase order number.' },
                { key: 'poDate', label: 'Tgl PO', type: 'date', required: false, description: 'PO issue/update date. Used as completion date for PO-related tasks.' },
                { key: 'consumedBudget', label: 'PO Value', type: 'number', required: false, description: 'PO value / consumed budget amount.' },
            ];
        case 'FsUpdates':
            return [
                { key: 'projectCode', label: 'Project Code', type: 'string', required: true, description: 'Must match existing Project Code in the selected budget period.' },
                { key: 'axCode', label: 'AX Code', type: 'string', required: false, description: 'AX integration code for the project.' },
                { key: 'approvedBudget', label: 'Approved Budget', type: 'number', required: false, description: 'Approved budget amount for the project.' },
                { key: 'targetBudgetStart', label: 'Target Budget Start', type: 'date', required: false, description: 'Target date for budget start. Supports Excel date formats.' },
                { key: 'budgetRevenuePermonth', label: 'Budget Revenue / Month', type: 'number', required: false, description: 'Expected monthly budget revenue.' },
            ];
        case 'FeasibilityStudies':
            return [
                { key: 'projectCode', label: 'Project Code', type: 'string', required: true, description: 'Must match existing Project Code.' },
                { key: 'fsType', label: 'FS Type', type: 'string', required: true, description: 'Type of feasibility study (e.g. Revenue Generating, Cost Saving).' },
                { key: 'amount', label: 'Amount (Investment)', type: 'number', required: true, description: 'Total investment amount.' },
                { key: 'irr', label: 'IRR (%)', type: 'number', required: false, description: 'Internal Rate of Return in percentage. Defaults to 0.' },
                { key: 'paybackPeriod', label: 'Payback Period (months)', type: 'number', required: false, description: 'Payback period in months. Defaults to 0.' },
                { key: 'npv', label: 'NPV', type: 'number', required: false, description: 'Net Present Value. Defaults to 0.' },
                { key: 'roi', label: 'ROI (%)', type: 'number', required: false, description: 'Return on Investment in percentage. Defaults to 0.' },
                { key: 'plannedRevenueStartDate', label: 'Planned Revenue Start Date', type: 'date', required: false, description: 'When revenue is expected to start. Supports Excel date formats.' },
                { key: 'monthlyRevenuePlan', label: 'Monthly Revenue Plan', type: 'number', required: false, description: 'Expected monthly revenue. Defaults to 0.' },
                { key: 'throughput', label: 'Throughput per month', type: 'number', required: false, description: 'Planned throughput per month (Qty Object). Defaults to 0.' },
                { key: 'conclusion', label: 'Conclusion / Status', type: 'string', required: false, description: 'Pending, Approved, Approved with Notes, or Rejected. Defaults to Pending.' },
                { key: 'followUpAction', label: 'Follow-up Action', type: 'string', required: false, description: 'Optional follow-up action or notes.' },
            ];
        case 'Users':
            return [
                { key: 'username', label: 'Name / Username', type: 'string', required: true },
                { key: 'email', label: 'Email', type: 'string', required: true },
                { key: 'roleName', label: 'Position / Role', type: 'string', required: true, description: 'Must match an existing Role Name' },
                { key: 'scope', label: 'Unit / Network', type: 'string', required: true, description: 'Name OR Code of the HU/Network (e.g. "SHMA" or "Siloam Hospitals Mampang"). Use "All" for global access.' },
            ];
        default:
            return [];
    }
};

// --- Helper Functions ---

const normalizeMigrationAssetCode = (value: unknown): string =>
    String(value ?? '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();

const collectAssetCodesFromMappedRows = (
    rawData: Record<string, unknown>[],
    mapping: Record<string, string>,
): Set<string> => {
    const codesLower = new Set<string>();
    for (const row of rawData) {
        for (const [header, sysKey] of Object.entries(mapping)) {
            if (sysKey !== 'assetCode') continue;
            const v = row[header];
            const normalized = normalizeMigrationAssetCode(v);
            if (normalized) codesLower.add(normalized.toLowerCase());
            break;
        }
    }
    return codesLower;
};

export const parseExcelHeaders = (file: File): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                if (!firstSheet?.['!ref']) {
                    resolve([]);
                    return;
                }
                // Gunakan key dari sheet_to_json agar header mapping = key baris data (hindari mismatch __EMPTY / spasi).
                const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
                if (rows.length > 0) {
                    resolve(Object.keys(rows[0]));
                    return;
                }
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                resolve(Array.isArray(jsonData[0]) ? (jsonData[0] as string[]) : []);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
        reader.readAsBinaryString(file);
    });
};

export const parseExcelData = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                // defval: "" ensures empty cells are read as empty strings
                resolve(XLSX.utils.sheet_to_json(firstSheet, { defval: "" }));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
        reader.readAsBinaryString(file);
    });
};

/** Baris data saja (tanpa header) dari !ref — tanpa memuat seluruh sheet ke memori. */
export const parseExcelRowCount = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const workbook = XLSX.read(e.target?.result, {
                    type: 'binary',
                    cellStyles: false,
                    cellHTML: false,
                    cellNF: false,
                    cellDates: false,
                });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const ref = firstSheet?.['!ref'];
                if (!ref) {
                    resolve(0);
                    return;
                }
                const range = XLSX.utils.decode_range(ref);
                resolve(Math.max(0, range.e.r - range.s.r));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
        reader.readAsBinaryString(file);
    });
};

/** Hanya N baris pertama untuk preview/mapping — hindari parse penuh di klien. */
export const parseExcelPreviewData = (file: File, maxRows = 5): Promise<Record<string, unknown>[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const workbook = XLSX.read(e.target?.result, { type: 'binary' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                if (!firstSheet?.['!ref']) {
                    resolve([]);
                    return;
                }
                const fullRange = XLSX.utils.decode_range(firstSheet['!ref']);
                const capped: XLSX.Range = {
                    s: { r: fullRange.s.r, c: fullRange.s.c },
                    e: {
                        r: Math.min(fullRange.e.r, fullRange.s.r + maxRows),
                        c: fullRange.e.c,
                    },
                };
                const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
                    defval: '',
                    range: capped,
                });
                resolve(rows.slice(0, maxRows));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
        reader.readAsBinaryString(file);
    });
};

// --- Template Download ---

const TEMPLATE_EXAMPLE_DATA: Record<MigrationTarget, Record<string, unknown>[]> = {
    Projects: [
        { 'Project Code': 'PRJ-001', 'Project Name': 'CT Scan Unit A', 'AX Code': 'AX-12345', 'Hospital Unit Code': 'SHMA', 'Budget Plan': 500000000, 'Carry Forward': 0, 'Approved Budget': 500000000, 'Budget Category': 'Medical Equipment', 'Project Priority': 'High' },
        { 'Project Code': 'PRJ-002', 'Project Name': 'Renovation Building B', 'AX Code': '', 'Hospital Unit Code': 'SHGD', 'Budget Plan': 1200000000, 'Carry Forward': 50000000, 'Approved Budget': 1200000000, 'Budget Category': 'Construction', 'Project Priority': 'Medium' },
    ],
    Assets: [
        { 'Project Code': 'PRJ-001', 'Asset Code': '', 'Asset Name': 'CT Scanner 128-slice', 'Deskripsi': 'High-end CT scanner for radiology dept', 'Budget Plan': 350000000, 'Consumed Budget': 0, 'Workflow/Asset Type': '', 'Target Date Time': '31/12/2026' },
        { 'Project Code': 'PRJ-001', 'Asset Code': 'AST-XRAY-01', 'Asset Name': 'X-Ray Digital', 'Deskripsi': '', 'Budget Plan': 150000000, 'Consumed Budget': 25000000, 'Workflow/Asset Type': '', 'Target Date Time': '30/06/2026' },
    ],
    Vendors: [
        { 'Vendor Name': 'PT Medika Utama', 'Address': 'Jl. Sudirman No. 123, Jakarta', 'Contact Person': 'Budi Santoso', 'Email': 'budi@medikautama.co.id', 'Phone': '021-5551234', 'NPWP': '01.234.567.8-901.000' },
        { 'Vendor Name': 'CV Teknik Jaya', 'Address': 'Jl. Gatot Subroto No. 45, Bandung', 'Contact Person': 'Andi Wijaya', 'Email': 'andi@teknikjaya.com', 'Phone': '022-4445678', 'NPWP': '' },
    ],
    MasterCatalogue: [
        { 'RDS Code': 'RDS-CT-001', 'Item Name': 'CT Scanner 128-slice', 'Category': 'Radiology', 'Price': 3500000000 },
        { 'RDS Code': 'RDS-XR-002', 'Item Name': 'X-Ray Digital Portable', 'Category': 'Radiology', 'Price': 750000000 },
    ],
    Rooms: [
        { 'Room Name': 'ICU Room 1' },
        { 'Room Name': 'Radiology Suite A' },
    ],
    BudgetCategories: [
        { 'Category Name': 'Medical Equipment', 'Is Active': 'true' },
        { 'Category Name': 'Construction', 'Is Active': 'true' },
    ],
    ProjectPriorities: [
        { 'Priority Name': 'High', 'Is Active': 'true' },
        { 'Priority Name': 'Medium', 'Is Active': 'true' },
        { 'Priority Name': 'Low', 'Is Active': 'true' },
    ],
    HospitalUnits: [
        { 'Hospital Unit Name': 'Siloam Hospitals Mampang', 'Hospital Unit Code': 'SHMA', 'Network Code': 'TYPE-A', 'Regional Code': 'REG-JKT', 'HU Number': '001' },
        { 'Hospital Unit Name': 'Siloam Hospitals Godean', 'Hospital Unit Code': 'SHGD', 'Network Code': 'TYPE-B', 'Regional Code': 'REG-YOG', 'HU Number': '002' },
    ],
    Archetypes: [
        { 'Network Name': 'Type A Hospital', 'Network Code': 'TYPE-A' },
        { 'Network Name': 'Type B Hospital', 'Network Code': 'TYPE-B' },
    ],
    Regionals: [
        { 'Regional Name': 'Jakarta Region', 'Regional Code': 'REG-JKT' },
        { 'Regional Name': 'Yogyakarta Region', 'Regional Code': 'REG-YOG' },
    ],
    AssetTypes: [
        { 'Asset Type Name': 'Medical Equipment', 'Asset Type Group ID': '', 'Workflow Set ID': '', 'Is Active': 'true' },
        { 'Asset Type Name': 'IT Equipment', 'Asset Type Group ID': '', 'Workflow Set ID': '', 'Is Active': 'true' },
    ],
    BudgetPeriod: [
        { 'Period Name': 'FY 2026', 'Budget Category Name': 'Medical Equipment', 'Budget Plan': 5000000000, 'Budget Carry Forward': 0, 'Budget Allocated': 4500000000, 'Approved Budget': 5000000000, 'Consumed Budget': 1200000000, 'Asset Count': 25, 'No Budget Asset Count': 0 },
    ],
    BudgetArchetype: [
        { 'Period Name': 'FY 2026', 'Network Name': 'Type A Hospital', 'Budget Category Name': 'Medical Equipment', 'Budget Plan': 3000000000 },
    ],
    BudgetHospitalUnit: [
        { 'Period Name': 'FY 2026', 'Hospital Unit Code': 'SHMA', 'Budget Category Name': 'Medical Equipment', 'Budget Plan': 1500000000 },
    ],
    TaskUpdates: [
        { 'Asset Code': 'AST-XRAY-01', 'Task Name': 'PO Created', 'Completion Date Time': '15/03/2026 10:30', 'Reschedule': '10/03/2026', 'Remark': 'PO completed by procurement' },
        { 'Asset Code': 'AST-XRAY-01', 'Task Name': 'Goods Received', 'Completion Date Time': '20/04/2026 14:00', 'Reschedule': '', 'Remark': 'Items received at warehouse' },
    ],
    MOMNotes: [
        { 'Asset Code': 'AST-XRAY-01', 'MOM Content / Note': 'Discussed delivery timeline with vendor. Expected arrival by end of April.', 'Date/Time': '10/03/2026 09:00', 'Created By': 'John Doe' },
        { 'Asset Code': 'AST-CT-001', 'MOM Content / Note': 'Site preparation for CT scanner installation confirmed.', 'Date/Time': '12/03/2026 14:30', 'Created By': '' },
    ],
    FeasibilityStudies: [
        { 'Project Code': 'PRJ-001', 'FS Type': 'Revenue Generating', 'Amount (Investment)': 3500000000, 'IRR (%)': 18.5, 'Payback Period (months)': 36, 'NPV': 1200000000, 'ROI (%)': 25, 'Planned Revenue Start Date': '01/07/2026', 'Monthly Revenue Plan': 150000000, 'Throughput per month': 1200, 'Conclusion / Status': 'Approved', 'Follow-up Action': 'Proceed with procurement' },
        { 'Project Code': 'PRJ-002', 'FS Type': 'Cost Saving', 'Amount (Investment)': 800000000, 'IRR (%)': 12, 'Payback Period (months)': 48, 'NPV': 350000000, 'ROI (%)': 15, 'Planned Revenue Start Date': '01/01/2027', 'Monthly Revenue Plan': 50000000, 'Throughput per month': 500, 'Conclusion / Status': 'Pending', 'Follow-up Action': '' },
    ],
    PoUpdates: [
        { 'Asset Code': 'SHK.01.00.001', 'CPR ID': 'CPR-2026-001', 'PO Number': 'PO-12345', 'Tgl PO': '15/03/2026', 'PO Value': 150000000 },
        { 'Asset Code': 'SHK.01.00.002', 'CPR ID': 'CPR-2026-002', 'PO Number': 'PO-12346', 'Tgl PO': '20/03/2026', 'PO Value': 85000000 },
    ],
    FsUpdates: [
        { 'Project Code': 'SHMA.26.001', 'AX Code': 'AX-2026-001', 'Approved Budget': 5000000000, 'Target Budget Start': '01/07/2026', 'Budget Revenue / Month': 150000000 },
        { 'Project Code': 'SHMA.26.002', 'AX Code': 'AX-2026-002', 'Approved Budget': 2500000000, 'Target Budget Start': '15/08/2026', 'Budget Revenue / Month': 75000000 },
    ],
    Users: [
        { 'Name / Username': 'John Doe', 'Email': 'john.doe@siloamhospitals.com', 'Position / Role': 'Project Manager', 'Unit / Network': 'SHMA' },
        { 'Name / Username': 'Jane Smith', 'Email': 'jane.smith@siloamhospitals.com', 'Position / Role': 'Finance Officer', 'Unit / Network': 'All' },
    ],
};

const TARGET_DISPLAY_NAMES: Record<MigrationTarget, string> = {
    Projects: 'Projects',
    Assets: 'Assets',
    Vendors: 'Vendors',
    MasterCatalogue: 'Master_Catalogue',
    Rooms: 'Rooms',
    BudgetCategories: 'Budget_Categories',
    ProjectPriorities: 'Project_Priorities',
    HospitalUnits: 'Hospital_Units',
    Archetypes: 'Archetypes',
    Regionals: 'Regionals',
    AssetTypes: 'Asset_Types',
    BudgetPeriod: 'Budget_Period',
    BudgetArchetype: 'Budget_Archetype',
    BudgetHospitalUnit: 'Budget_Hospital_Unit',
    TaskUpdates: 'Task_Updates',
    MOMNotes: 'MOM_Notes',
    FeasibilityStudies: 'Feasibility_Studies',
    PoUpdates: 'PO_Updates',
    FsUpdates: 'FS_Updates',
    Users: 'Users',
};

export const downloadMigrationTemplate = (target: MigrationTarget): void => {
    const schema = getMigrationSchema(target);
    const headers = schema.map(f => f.label + (f.required ? ' *' : ''));
    const exampleRows = TEMPLATE_EXAMPLE_DATA[target] || [];

    const wsData: unknown[][] = [];

    // Row 1: Headers
    wsData.push(headers);

    // Rows 2+: Example data
    for (const row of exampleRows) {
        const rowArr = headers.map(h => {
            const val = row[h] ?? row[h.replace(' *', '')] ?? '';
            return val;
        });
        wsData.push(rowArr);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths based on header text length (min 14, max 35)
    ws['!cols'] = headers.map(h => ({ wch: Math.max(14, Math.min(35, h.length + 4)) }));

    // Instructions sheet
    const instrData: unknown[][] = [
        ['Migration Template Instructions'],
        [''],
        ['Target:', target],
        [''],
        ['Column', 'Required', 'Type', 'Description'],
    ];
    for (const f of schema) {
        instrData.push([
            f.label,
            f.required ? 'YES' : 'No',
            f.type,
            f.description || '-',
        ]);
    }
    instrData.push(['']);
    instrData.push(['Notes:']);
    instrData.push(['- Columns marked with * are required.']);
    instrData.push(['- Date fields support formats: dd/mm/yyyy, dd/mm/yyyy hh:mm, Excel serial dates.']);
    instrData.push(['- Number fields should contain numeric values only (no currency symbols).']);
    instrData.push(['- The "Data" sheet contains example rows — replace them with your actual data.']);

    const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
    wsInstr['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 60 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

    const fileName = `Template_Migration_${TARGET_DISPLAY_NAMES[target] || target}.xlsx`;
    XLSX.writeFile(wb, fileName);
};

/** Alias kolom Excel untuk MOM Notes agar auto-map tanpa ubah header. */
const MOM_NOTES_HEADER_ALIASES: Record<string, string> = {
    cpxassetcode: 'assetCode',
    cpx_asset_code: 'assetCode',
    assetcode: 'assetCode',
    asset_code: 'assetCode',
    kode_asset: 'assetCode',
    kodeasset: 'assetCode',
    content: 'content',
    note: 'content',
    notes: 'content',
    mom: 'content',
    momnote: 'content',
    momnotes: 'content',
    mom_note: 'content',
    mom_notes: 'content',
    momcontent: 'content',
    catatan: 'content',
    isi: 'content',
    isimom: 'content',
    isi_mom: 'content',
    cpxcomment: 'content',
    cpx_comment: 'content',
    comment: 'content',
    createdat: 'createdAt',
    created_at: 'createdAt',
    date: 'createdAt',
    tanggal: 'createdAt',
    cpxdate: 'createdAt',
    cpx_date: 'createdAt',
    createdby: 'createdByUsername',
    created_by: 'createdByUsername',
    createdbyusername: 'createdByUsername',
    username: 'createdByUsername',
    user: 'createdByUsername',
    author: 'createdByUsername',
    penulis: 'createdByUsername',
    dibuatoleh: 'createdByUsername',
};

/** Alias kolom Excel untuk FS (Feasibility Studies) agar auto-map tanpa ubah header. */
const FS_HEADER_ALIASES: Record<string, string> = {
    projectcode: 'projectCode',
    project_code: 'projectCode',
    kodeproyek: 'projectCode',
    kode_proyek: 'projectCode',
    fstype: 'fsType',
    fs_type: 'fsType',
    type: 'fsType',
    tipe: 'fsType',
    tipefs: 'fsType',
    tipe_fs: 'fsType',
    jenisfs: 'fsType',
    jenis_fs: 'fsType',
    amount: 'amount',
    investasi: 'amount',
    investment: 'amount',
    totalinvestment: 'amount',
    nilaiinvestasi: 'amount',
    irr: 'irr',
    paybackperiod: 'paybackPeriod',
    payback_period: 'paybackPeriod',
    payback: 'paybackPeriod',
    npv: 'npv',
    roi: 'roi',
    plannedrevenuestartdate: 'plannedRevenueStartDate',
    planned_revenue_start_date: 'plannedRevenueStartDate',
    revenuestartdate: 'plannedRevenueStartDate',
    revenue_start_date: 'plannedRevenueStartDate',
    tanggalmulairevenue: 'plannedRevenueStartDate',
    monthlyrevenueplan: 'monthlyRevenuePlan',
    monthly_revenue_plan: 'monthlyRevenuePlan',
    revenuepermonth: 'monthlyRevenuePlan',
    revenuebulanan: 'monthlyRevenuePlan',
    throughput: 'throughput',
    throughputpermonth: 'throughput',
    throughput_per_month: 'throughput',
    throughputmonth: 'throughput',
    throughputmonthly: 'throughput',
    throughputamonth: 'throughput',
    throughput_a_month: 'throughput',
    qtyobject: 'throughput',
    qtypermonth: 'throughput',
    qty_per_month: 'throughput',
    throughputqty: 'throughput',
    conclusion: 'conclusion',
    kesimpulan: 'conclusion',
    status: 'conclusion',
    followupaction: 'followUpAction',
    followup_action: 'followUpAction',
    followup: 'followUpAction',
    tindaklanjut: 'followUpAction',
    tindak_lanjut: 'followUpAction',
    action: 'followUpAction',
};

/** Alias kolom Excel untuk Projects / Assets agar auto-map lebih akurat. */
const PROJECTS_HEADER_ALIASES: Record<string, string> = {
    projectcode: 'projectCode',
    project_code: 'projectCode',
    kodeproyek: 'projectCode',
    kode_proyek: 'projectCode',
    projectname: 'projectName',
    project_name: 'projectName',
    namaproyek: 'projectName',
    nama_proyek: 'projectName',
    axcode: 'axCode',
    ax_code: 'axCode',
    hucode: 'huCode',
    hu_code: 'huCode',
    hospitalunitcode: 'huCode',
    hospital_unit_code: 'huCode',
    kodehu: 'huCode',
    kode_hu: 'huCode',
    budgetplan: 'budgetPlan',
    budget_plan: 'budgetPlan',
    anggaran: 'budgetPlan',
    budgetcarryforward: 'budgetCarryForward',
    budget_carry_forward: 'budgetCarryForward',
    carryforward: 'budgetCarryForward',
    approvedbudget: 'approvedBudget',
    approved_budget: 'approvedBudget',
    categoryname: 'categoryName',
    category_name: 'categoryName',
    kategori: 'categoryName',
    priorityname: 'priorityName',
    priority_name: 'priorityName',
    prioritas: 'priorityName',
};

const ASSETS_HEADER_ALIASES: Record<string, string> = {
    projectcode: 'projectCode',
    project_code: 'projectCode',
    kodeproyek: 'projectCode',
    assetcode: 'assetCode',
    asset_code: 'assetCode',
    kodeasset: 'assetCode',
    kode_asset: 'assetCode',
    assetname: 'assetName',
    asset_name: 'assetName',
    namaasset: 'assetName',
    budgetplan: 'budgetPlan',
    budget_plan: 'budgetPlan',
    consumedbudget: 'consumedBudget',
    consumed_budget: 'consumedBudget',
    workflowname: 'workflowName',
    workflow_name: 'workflowName',
    endtargetdate: 'endTargetDate',
    end_target_date: 'endTargetDate',
    targetdate: 'endTargetDate',
};

/** Target migrasi yang diproses di capexbe (akurat + batch server-side). */
const BACKEND_MIGRATION_TARGETS: ReadonlySet<MigrationTarget> = new Set([
  'TaskUpdates',
  'PoUpdates',
  'FsUpdates',
  'Projects',
  'Assets',
]);

/** Alias kolom Excel untuk Task Updates (cpx_asset_code, cpx_date, cpx_comment) agar auto-map tanpa ubah header. */
const TASK_UPDATES_HEADER_ALIASES: Record<string, string> = {
    cpxassetcode: 'assetCode',
    cpx_asset_code: 'assetCode',
    assetcode: 'assetCode',
    cpxdate: 'completionDate',
    cpx_date: 'completionDate',
    completiondate: 'completionDate',
    date: 'completionDate',
    reschedule: 'rescheduleDate',
    rescheduledate: 'rescheduleDate',
    reschedule_date: 'rescheduleDate',
    rescheduledenddate: 'rescheduleDate',
    rescheduled_end_date: 'rescheduleDate',
    tanggalreschedule: 'rescheduleDate',
    cpxreschedule: 'rescheduleDate',
    cpx_reschedule: 'rescheduleDate',
    cpxcomment: 'remark',
    cpx_comment: 'remark',
    comment: 'remark',
    remark: 'remark',
};

const PO_UPDATES_HEADER_ALIASES: Record<string, string> = {
    assetcode: 'assetCode',
    kodeasset: 'assetCode',
    asset_code: 'assetCode',
    kode_asset: 'assetCode',
    cprid: 'cprId',
    cpr_id: 'cprId',
    cpr: 'cprId',
    ponumber: 'poNumber',
    po_number: 'poNumber',
    pono: 'poNumber',
    po_no: 'poNumber',
    povalue: 'consumedBudget',
    po_value: 'consumedBudget',
    consumedbudget: 'consumedBudget',
    consumed_budget: 'consumedBudget',
    podate: 'poDate',
    po_date: 'poDate',
    tglpo: 'poDate',
    tgl_po: 'poDate',
    'tgl po': 'poDate',
    nilaipo: 'consumedBudget',
    nilai_po: 'consumedBudget',
    'nilai po': 'consumedBudget',
    poamount: 'consumedBudget',
    po_amount: 'consumedBudget',
    jumlahpo: 'consumedBudget',
    nominal: 'consumedBudget',
    amount: 'consumedBudget',
    nilai: 'consumedBudget',
    povalueidr: 'consumedBudget',
    'povalue(consumed)': 'consumedBudget',
};

const FS_UPDATES_HEADER_ALIASES: Record<string, string> = {
    projectcode: 'projectCode',
    project_code: 'projectCode',
    kodeproject: 'projectCode',
    kode_project: 'projectCode',
    'kode project': 'projectCode',
    axcode: 'axCode',
    ax_code: 'axCode',
    kodeax: 'axCode',
    approvedbudget: 'approvedBudget',
    approved_budget: 'approvedBudget',
    budgetapproved: 'approvedBudget',
    'approved budget': 'approvedBudget',
    targetbudgetstart: 'targetBudgetStart',
    target_budget_start: 'targetBudgetStart',
    targetstart: 'targetBudgetStart',
    'target budget start': 'targetBudgetStart',
    budgetrevenuepermonth: 'budgetRevenuePermonth',
    budget_revenue_permonth: 'budgetRevenuePermonth',
    revenuepermonth: 'budgetRevenuePermonth',
    'budget revenue / month': 'budgetRevenuePermonth',
    'budget revenue per month': 'budgetRevenuePermonth',
    pendapatanbulanan: 'budgetRevenuePermonth',
};

const normalizeHeaderKey = (header: string): string =>
    header.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Ambil nilai sel dari baris Excel — toleran spasi / perbedaan key header vs sheet_to_json. */
export const resolveMigrationRowValue = (
    row: Record<string, unknown>,
    header: string,
): unknown => {
    if (!header) return undefined;
    if (Object.prototype.hasOwnProperty.call(row, header)) return row[header];

    const trimmed = header.trim();
    if (trimmed && Object.prototype.hasOwnProperty.call(row, trimmed)) return row[trimmed];

    const targetNorm = normalizeHeaderKey(header);
    if (targetNorm) {
        for (const key of Object.keys(row)) {
            if (normalizeHeaderKey(key) === targetNorm) return row[key];
        }
    }

    const lower = trimmed.toLowerCase();
    for (const key of Object.keys(row)) {
        if (key.trim().toLowerCase() === lower) return row[key];
    }

    return undefined;
};

/** Parse angka dari Excel (number, Rp, format ID 1.234.567, US 1,234,567). */
export const parseMigrationNumberValue = (value: unknown): number => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    let s = String(value).trim();
    if (!s) return 0;
    s = s.replace(/[Rp\s\u00A0]/gi, '').trim();
    if (!s) return 0;

    // Indonesia: 1.234.567,89 atau 1.234.567
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
        return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    }
    // US: 1,234,567.89
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
        return parseFloat(s.replace(/,/g, '')) || 0;
    }

    const cleaned = s.replace(/[^0-9,-]+/g, '').replace(/,(?=.*,)/g, '');
    const normalized = cleaned.includes(',') && !cleaned.includes('.')
        ? cleaned.replace(',', '.')
        : cleaned;
    return parseFloat(normalized) || 0;
};

export const applyMigrationFieldTransform = (
    value: unknown,
    schemaField?: MigrationField,
): unknown => {
    if (!schemaField) return value;

    if (schemaField.type === 'number') {
        return parseMigrationNumberValue(value);
    }
    if (schemaField.type === 'date') {
        if (isEmptyMigrationCellValue(value)) return '';
        const parsedDate = parseExcelDateValue(value);
        return parsedDate ?? '';
    }
    return value;
};

/** Preview baris migrasi dengan transformasi tipe yang sama seperti executeSmartMigration. */
export const transformMigrationPreviewRows = (
    rows: Record<string, unknown>[],
    mapping: Record<string, string>,
    schema: MigrationField[],
): Record<string, unknown>[] =>
    rows.map((row) => {
        const transformed: Record<string, unknown> = {};
        for (const [header, sysKey] of Object.entries(mapping)) {
            if (!sysKey) continue;
            const schemaField = schema.find((f) => f.key === sysKey);
            const raw = resolveMigrationRowValue(row, header);
            const value = applyMigrationFieldTransform(raw, schemaField);
            if (value !== undefined && value !== null && value !== '') {
                transformed[sysKey] = value;
            } else if (schemaField?.type === 'number' && raw !== undefined && raw !== null && raw !== '') {
                transformed[sysKey] = value;
            }
        }
        return transformed;
    });

/** Saran asset code terdekat saat lookup migrasi gagal (typo / salah kolom). */
const suggestSimilarAssetCodes = (
    input: string,
    assetMap: Map<string, string>,
    limit = 3,
): string[] => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    const parts = q.split(/[.\-_/\s]+/).filter((p) => p.length >= 2);
    const scored: { code: string; score: number }[] = [];

    for (const key of assetMap.keys()) {
        const c = key.toLowerCase();
        let score = 0;
        if (c === q) score = 100;
        else if (c.includes(q) || q.includes(c)) score = 85;
        else {
            const matchingParts = parts.filter((p) => c.includes(p)).length;
            score = matchingParts * 25;
            // Typo ringan pada segmen HU (mis. MROCC vs MRCCC)
            const qHu = parts[0] || '';
            const cHu = c.split(/[.\-_/\s]+/)[0] || '';
            if (qHu.length >= 4 && cHu.length >= 4) {
                let diff = 0;
                const len = Math.min(qHu.length, cHu.length);
                for (let i = 0; i < len; i++) {
                    if (qHu[i] !== cHu[i]) diff++;
                }
                if (diff > 0 && diff <= 2) score += 30;
            }
        }
        if (score > 0) scored.push({ code: key, score });
    }

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((s) => s.code);
};

const formatAssetCodeLookupError = (
    rowNum: number,
    assetCode: string,
    assetMap: Map<string, string>,
): string => {
    const suggestions = suggestSimilarAssetCodes(assetCode, assetMap);
    const hint = suggestions.length
        ? ` Kode terdekat di sistem: ${suggestions.join(', ')}.`
        : ' Pastikan kolom Asset Code berisi kode asset (bukan project code).';
    return `Row ${rowNum}: Asset Code '${assetCode}' not found.${hint} Asset harus sudah terdaftar di tabel assets (import via Smart Migration → Assets jika belum ada).`;
};

const scoreFieldMatch = (normalizedHeader: string, field: MigrationField): number => {
    const normalizedLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedKey = field.key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedHeader === normalizedLabel || normalizedHeader === normalizedKey) return 100;
    if (normalizedHeader.endsWith(normalizedLabel) || normalizedHeader.startsWith(normalizedLabel)) return 85;
    if (normalizedLabel.includes(normalizedHeader) && normalizedHeader.length >= 4) return 70;
    if (normalizedHeader.includes(normalizedLabel) && normalizedLabel.length >= 4) return 60;
    return 0;
};

const resolveAliasFieldKey = (
    header: string,
    normalizedHeader: string,
    target?: MigrationTarget,
): string | undefined => {
    const aliasTables: Partial<Record<MigrationTarget, Record<string, string>>> = {
        Projects: PROJECTS_HEADER_ALIASES,
        Assets: ASSETS_HEADER_ALIASES,
        TaskUpdates: TASK_UPDATES_HEADER_ALIASES,
        MOMNotes: MOM_NOTES_HEADER_ALIASES,
        FeasibilityStudies: FS_HEADER_ALIASES,
        PoUpdates: PO_UPDATES_HEADER_ALIASES,
        FsUpdates: FS_UPDATES_HEADER_ALIASES,
    };
    const table = target ? aliasTables[target] : undefined;
    if (table) {
        return table[normalizedHeader] ?? table[header.toLowerCase()];
    }
    const legacy = LEGACY_NETWORK_HEADER_TO_FIELD_KEY[target ?? ''];
    return legacy?.[normalizedHeader];
};

export const generateAutoMapping = (
    fileHeaders: string[],
    schema: MigrationField[],
    target?: MigrationTarget
): Record<string, string> => {
    const mapping: Record<string, string> = {};
    const usedFieldKeys = new Set<string>();

    const candidates: { header: string; fieldKey: string; score: number }[] = [];

    fileHeaders.forEach((header) => {
        const normalizedHeader = normalizeHeaderKey(header);
        if (!normalizedHeader) return;

        const aliasKey = resolveAliasFieldKey(header, normalizedHeader, target);
        if (aliasKey && schema.some((f) => f.key === aliasKey)) {
            candidates.push({ header, fieldKey: aliasKey, score: 95 });
            return;
        }

        let best: { fieldKey: string; score: number } | null = null;
        for (const field of schema) {
            const score = scoreFieldMatch(normalizedHeader, field);
            if (score > 0 && (!best || score > best.score)) {
                best = { fieldKey: field.key, score };
            }
        }
        if (best) {
            candidates.push({ header, fieldKey: best.fieldKey, score: best.score });
        }
    });

    candidates
        .sort((a, b) => b.score - a.score)
        .forEach(({ header, fieldKey }) => {
            if (usedFieldKeys.has(fieldKey)) return;
            mapping[header] = fieldKey;
            usedFieldKeys.add(fieldKey);
        });

    return mapping;
};

/** Mapping identitas label kolom template → field key (untuk mode spreadsheet). */
export const buildMigrationMappingFromSchema = (schema: MigrationField[]): Record<string, string> => {
    const mapping: Record<string, string> = {};
    schema.forEach((field) => {
        mapping[field.label] = field.key;
    });
    return mapping;
};

export const createEmptyMigrationSpreadsheetRow = (
    schema: MigrationField[],
    rowId?: string,
): Record<string, string> => {
    const row: Record<string, string> = {
        id: rowId ?? `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    schema.forEach((field) => {
        row[field.key] = '';
    });
    return row;
};

export const filterNonEmptyMigrationRows = (
    rows: Record<string, unknown>[],
    schema: MigrationField[],
): Record<string, unknown>[] =>
    rows.filter((row) =>
        schema.some((field) => {
            const value = row[field.key];
            return value !== undefined && value !== null && String(value).trim() !== '';
        }),
    );

export interface MigrationRowValidation {
    rowIndex: number;
    fieldKey: string;
    message: string;
}

export const validateMigrationSpreadsheetRows = (
    rows: Record<string, unknown>[],
    schema: MigrationField[],
): MigrationRowValidation[] => {
    const errors: MigrationRowValidation[] = [];
    const nonEmptyRows = filterNonEmptyMigrationRows(rows, schema);

    nonEmptyRows.forEach((row, index) => {
        schema.forEach((field) => {
            const value = row[field.key];
            if (field.required && (value === undefined || value === null || String(value).trim() === '')) {
                errors.push({
                    rowIndex: index + 1,
                    fieldKey: field.key,
                    message: `${field.label} wajib diisi`,
                });
            }
            if (
                field.type === 'number' &&
                value !== undefined &&
                value !== null &&
                String(value).trim() !== '' &&
                Number.isNaN(Number(value))
            ) {
                errors.push({
                    rowIndex: index + 1,
                    fieldKey: field.key,
                    message: `${field.label} harus angka`,
                });
            }
        });
    });

    return errors;
};

/** Parse data TSV dari clipboard Excel/Sheets ke baris spreadsheet migrasi. */
export const parseClipboardToMigrationRows = (
    text: string,
    schema: MigrationField[],
    target?: MigrationTarget,
): Record<string, string>[] => {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.replace(/\r$/, ''))
        .filter((line) => line.trim());

    if (lines.length === 0) return [];

    const parseLine = (line: string) => line.split('\t');
    const firstCells = parseLine(lines[0]);
    const autoMap = generateAutoMapping(firstCells, schema, target);
    const mappedCount = Object.values(autoMap).filter(Boolean).length;
    const requiredCount = Math.max(1, schema.filter((field) => field.required).length);
    const firstRowIsHeader = mappedCount >= Math.min(2, requiredCount);

    const columnKeys: (string | null)[] = firstRowIsHeader
        ? firstCells.map((header) => autoMap[header] || null)
        : schema.map((field) => field.key);
    const dataLines = firstRowIsHeader ? lines.slice(1) : lines;

    return dataLines
        .filter((line) => line.trim())
        .map((line, index) => {
            const cells = parseLine(line);
            const row: Record<string, string> = {
                id: `paste-${Date.now()}-${index}`,
            };
            columnKeys.forEach((fieldKey, colIndex) => {
                if (fieldKey) {
                    row[fieldKey] = (cells[colIndex] ?? '').trim();
                }
            });
            return row;
        })
        .filter((row) =>
            schema.some((field) => {
                const value = row[field.key];
                return value !== undefined && value.trim() !== '';
            }),
        );
};

/** Konversi baris spreadsheet ke File Excel untuk pipeline executeSmartMigration. */
export const buildMigrationFileFromRows = (
    rows: Record<string, unknown>[],
    schema: MigrationField[],
): File => {
    const labelRows = rows.map((row) => {
        const mapped: Record<string, unknown> = {};
        schema.forEach((field) => {
            mapped[field.label] = row[field.key] ?? '';
        });
        return mapped;
    });

    const headers = schema.map((field) => field.label);
    const worksheet = XLSX.utils.json_to_sheet(labelRows, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new File([buffer], 'spreadsheet-migration.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
};

// --- Execution Logic ---

/** Progres migrasi (untuk UI: batch ke Supabase / polling backend) */
export interface MigrationProgress {
    stage: 'preparing' | 'processing' | 'saving' | 'finalizing' | 'done' | 'error';
    processedRows: number;
    totalRows: number;
    message?: string;
    /** Urutan penyimpanan parsial ke Supabase (Projects/Assets / Task Updates / PO) */
    partialSaveIndex?: number;
    /** Jumlah baris/aset yang sudah tersimpan ke DB (backend PoUpdates) */
    savedCount?: number;
    /** Jumlah baris gagal validasi/simpan sejauh ini */
    failedCount?: number;
}

type BackendMigrationProgressDto = {
    stage?: MigrationProgress['stage'];
    processedRows?: number;
    totalRows?: number;
    message?: string;
    partialSaveIndex?: number;
    savedCount?: number;
    failedCount?: number;
};

function createMigrationJobId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `mig-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapBackendMigrationProgress(dto: BackendMigrationProgressDto | null): MigrationProgress | null {
    if (!dto) return null;
    return {
        stage: dto.stage ?? 'preparing',
        processedRows: Number(dto.processedRows) || 0,
        totalRows: Number(dto.totalRows) || 0,
        message: dto.message,
        partialSaveIndex: dto.partialSaveIndex,
        savedCount: dto.savedCount,
        failedCount: dto.failedCount,
    };
}

async function fetchBackendMigrationProgress(
    jobId: string,
    userId: number,
    accessToken: string | null,
): Promise<MigrationProgress | null> {
    try {
        const dto = await postToCapexBe<BackendMigrationProgressDto>(
            '/smart-migration/progress',
            { jobId, userId },
            accessToken,
        );
        return mapBackendMigrationProgress(dto);
    } catch {
        return null;
    }
}

async function pollBackendMigrationProgress(
    jobId: string,
    userId: number,
    accessToken: string | null,
    onProgress: ((p: MigrationProgress) => void) | undefined,
    stopSignal: { stopped: boolean },
): Promise<void> {
    while (!stopSignal.stopped) {
        const progress = await fetchBackendMigrationProgress(jobId, userId, accessToken);
        if (progress) {
            onProgress?.(progress);
            if (progress.stage === 'done' || progress.stage === 'error') break;
        }
        await new Promise((resolve) => setTimeout(resolve, 450));
    }
}

export function migrationProgressStageLabel(stage: MigrationProgress['stage']): string {
    switch (stage) {
        case 'preparing':
            return 'Persiapan';
        case 'processing':
            return 'Validasi baris';
        case 'saving':
            return 'Menyimpan ke database';
        case 'finalizing':
            return 'Finalisasi';
        case 'done':
            return 'Selesai';
        case 'error':
            return 'Gagal';
        default:
            return stage;
    }
}

/**
 * Interval flush chunk: mode cepat (`persistOnly`) tanpa trigger/recalc seluruh periode.
 * Nilai lebih besar = lebih sedikit putaran ke DB, migrasi besar lebih cepat.
 */
const BUDGET_TREE_FLUSH_EVERY = 400;
/** Task Updates: flush ke task_logs / asset_task_statuses per batch */
const TASK_UPDATES_FLUSH_EVERY = 400;
/** MOM Notes: flush ke moms per batch */
const MOM_NOTES_FLUSH_EVERY = 400;
/** Feasibility Studies: flush ke feasibility_studies per batch */
const FS_FLUSH_EVERY = 200;
/** PO Updates: flush ke backend per batch (bulk PO-field update di server) */
const PO_UPDATES_FLUSH_EVERY = 200;

export interface MigrationResult {
    success: boolean;
    totalRows: number;
    /** Baris berhasil disimpan sebagai data baru */
    insertedCount: number;
    /** Baris yang memperbarui data yang sudah ada */
    updatedCount: number;
    /** Baris dilewati (mis. task sudah Done) */
    skippedCount: number;
    /** inserted + updated (untuk ringkasan cepat / audit) */
    successCount: number;
    failedCount: number;
    errors: string[];
    /** Koreksi otomatis (bukan error): default prioritas, truncate, dll. */
    warnings: string[];
    taskLogsBatch?: TaskLog[];
    assetTaskStatusesBatch?: AssetTaskStatus[];
    momsBatch?: MOM[];
    fsBatch?: FeasibilityStudy[];
    savedProjectCodes?: string[];
    savedAssetCodes?: string[];
}

export const executeSmartMigration = async (
    target: MigrationTarget,
    periodName: string | null,
    file: File,
    mapping: Record<string, string>,
    currentUser: User,
    selectedAssetTypeId?: string,
    onProgress?: (p: MigrationProgress) => void
): Promise<MigrationResult> => {
    const beBase = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
    if (!beBase) {
        throw new Error(`Migrasi ${target} memerlukan backend capexbe (NEXT_PUBLIC_CAPEXBE_URL).`);
    }
    if (!BACKEND_MIGRATION_TARGETS.has(target)) {
        throw new Error(`Migrasi ${target} belum didukung via backend.`);
    }

    const bearerToken = useBackendSession() ? null : await getAccessTokenForBackend();
    if (!useBackendSession() && !bearerToken) {
        throw new Error('Sesi login diperlukan untuk migrasi.');
    }

    try {
        const totalRowsForProgress = await parseExcelRowCount(file);
        const jobId = createMigrationJobId();
        const fd = new FormData();
        fd.append('file', file);
        fd.append(
            'meta',
            JSON.stringify({
                target,
                periodName,
                mapping,
                userId: currentUser.id,
                currentUser: { id: currentUser.id, username: currentUser.username },
                selectedAssetTypeId,
                jobId,
            }),
        );
        onProgress?.({
            stage: 'preparing',
            processedRows: 0,
            totalRows: totalRowsForProgress,
            message: `Memulai migrasi ${target} di server…`,
        });

        const pollStop = { stopped: false };
        const pollPromise = pollBackendMigrationProgress(
            jobId,
            currentUser.id,
            bearerToken,
            onProgress,
            pollStop,
        );

        let res: Response;
        try {
            const headers: Record<string, string> = {};
            if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;
            res = await authenticatedFetch(capexBeRequestUrl('/smart-migration/execute'), {
                method: 'POST',
                headers,
                credentials: 'include',
                body: fd,
                retryOn401: useBackendSession(),
            });
        } finally {
            pollStop.stopped = true;
            await pollPromise.catch(() => undefined);
            const finalProgress = await fetchBackendMigrationProgress(
                jobId,
                currentUser.id,
                bearerToken,
            );
            if (finalProgress) onProgress?.(finalProgress);
        }

        if (res.ok) {
            const serverResult = (await res.json()) as MigrationResult;
            if (serverResult.successCount > 0) {
                invalidateRequestCache();
            }
            onProgress?.({
                stage: 'done',
                processedRows: serverResult.totalRows || totalRowsForProgress,
                totalRows: serverResult.totalRows || totalRowsForProgress,
                message: serverResult.success
                    ? 'Migrasi selesai.'
                    : 'Migrasi selesai dengan error pada sebagian baris.',
            });
            return serverResult;
        }

        const errBody = await res.text().catch(() => '');
        throw new Error(
            `Server migrasi gagal (${res.status})${errBody ? `: ${errBody.slice(0, 200)}` : ''}`,
        );
    } catch (e) {
        console.warn('capexbe smart-migration error:', e);
        throw e instanceof Error ? e : new Error(String(e));
    }
};
// --- Utilities & Backups ---

export const exportFullBackup = async (): Promise<never> => {
    throw new Error('Legacy Supabase export removed. Use exportFullBackupViaBackend.');
};

export const exportFullBackupViaBackend = async (): Promise<any | null> => {
    const beBase = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
    if (!beBase) {
        trackBackendFetch('dataMigration.exportBackup', 'fallback', { reason: 'missing_base_url' });
        return null;
    }
    const token = useBackendSession() ? null : await getAccessTokenForBackend();
    if (!useBackendSession() && !token) {
        trackBackendFetch('dataMigration.exportBackup', 'fallback', { reason: 'missing_access_token' });
        return null;
    }
    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await authenticatedFetch(capexBeRequestUrl('/backup/export-full'), {
            method: 'POST',
            headers,
            credentials: useBackendSession() ? 'include' : 'same-origin',
            body: JSON.stringify({}),
        });
        if (!res.ok) {
            trackBackendFetch('dataMigration.exportBackup', 'fallback', { reason: 'http_error', httpStatus: res.status });
            return null;
        }
        trackBackendFetch('dataMigration.exportBackup', 'success');
        return await res.json();
    } catch {
        trackBackendFetch('dataMigration.exportBackup', 'fallback', { reason: 'network_error' });
        return null;
    }
};

export const importFullBackup = async (
    _data: any,
    _options?: { restoreMasterConfig?: boolean },
): Promise<never> => {
    throw new Error('Legacy Supabase import removed. Use importFullBackupViaBackend.');
};

export const importFullBackupViaBackend = async (data: any): Promise<boolean> => {
    const beBase = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
    if (!beBase) {
        trackBackendFetch('dataMigration.importBackup', 'fallback', { reason: 'missing_access_token' });
        return false;
    }
    const token = useBackendSession() ? null : await getAccessTokenForBackend();
    if (!useBackendSession() && !token) {
        trackBackendFetch('dataMigration.importBackup', 'fallback', { reason: 'missing_access_token' });
        return false;
    }
    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await authenticatedFetch(capexBeRequestUrl('/backup/import-full'), {
            method: 'POST',
            headers,
            credentials: useBackendSession() ? 'include' : 'same-origin',
            body: JSON.stringify({ backup: data }),
        });
        if (!res.ok) {
            trackBackendFetch('dataMigration.importBackup', 'fallback', { reason: 'http_error', httpStatus: res.status });
            return false;
        }
        trackBackendFetch('dataMigration.importBackup', 'success');
        invalidateRequestCache();
        return true;
    } catch {
        trackBackendFetch('dataMigration.importBackup', 'fallback', { reason: 'network_error' });
        return false;
    }
};

// --- Legacy / Excel Template Functions ---

export const generateBudgetPlanTemplate = async (periodName: string) => { /* ... existing ... */ };
export const importBudgetPlanExcel = async (file: File, periodName: string, currentUser: User): Promise<{ success: boolean; message: string }> => { /* ... existing ... */ return { success: false, message: "Use Smart Migration" } };
export const generateTransactionDataTemplate = () => { /* ... existing ... */ };

export const generateMasterAndConfigTemplate = () => {
    const wb = XLSX.utils.book_new();
    
    // Example data for template
    const archetypeData = [{ name: 'Example Network', code: 'EX-NET' }];
    const regionalData = [{ name: 'Example Regional', code: 'EX-REG' }];
    const huData = [{ name: 'Example Hospital', code: 'EX-HU', huNumber: '123', archetypeCode: 'EX-ARCH', regionalCode: 'EX-REG' }];

    const ws1 = XLSX.utils.json_to_sheet(archetypeData);
    XLSX.utils.book_append_sheet(wb, ws1, "Networks");
    
    const ws2 = XLSX.utils.json_to_sheet(regionalData);
    XLSX.utils.book_append_sheet(wb, ws2, "Regionals");

    const ws3 = XLSX.utils.json_to_sheet(huData);
    XLSX.utils.book_append_sheet(wb, ws3, "HospitalUnits");

    XLSX.writeFile(wb, "MasterConfig_Template.xlsx");
};

export const importTransactionsExcel = async (file: File, periodName: string, currentUser: User): Promise<{ success: boolean; message: string }> => { /* ... existing ... */ return { success: false, message: "Use Smart Migration" } };
export const importMasterCatalogueExcel = async (file: File): Promise<{ success: boolean; message: string }> => { /* ... existing ... */ return { success: false, message: "Use Smart Migration" } };
export const importRoomsExcel = async (file: File): Promise<{ success: boolean; message: string }> => { /* ... existing ... */ return { success: false, message: "Use Smart Migration" } };
export const importVendorsExcel = async (file: File): Promise<{ success: boolean; message: string }> => { /* ... existing ... */ return { success: false, message: "Use Smart Migration" } };
