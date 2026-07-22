import { BadRequestException } from '@nestjs/common';

export type PeriodUserBody = {
  userId: number;
  periodName: string;
};

export type FsCreatePayload = {
  id?: string;
  projectId: string;
  fsType: string;
  amount: number;
  irr: number;
  paybackPeriod: number;
  npv: number;
  roi: number;
  plannedRevenueStartDate: string;
  actualRevenueStartDate?: string | null;
  monthlyRevenuePlan: number;
  throughput?: number;
  conclusion?: string;
  followUpAction?: string | null;
};

export type FsUpdatePayload = Partial<Omit<FsCreatePayload, 'projectId'>>;

export type FsRealizationPayload = {
  id?: string;
  fsId: string;
  month: string;
  actualRevenue: number;
  actualThroughput?: number;
  notes?: string | null;
};

function requireString(value: unknown, field: string, minLen = 1): string {
  const s = String(value ?? '').trim();
  if (s.length < minLen) throw new BadRequestException(`${field} is required`);
  return s;
}

function requireNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new BadRequestException(`${field} must be a number`);
  return n;
}

export function parsePeriodUserBody(body: unknown): PeriodUserBody {
  const b = (body ?? {}) as Record<string, unknown>;
  const userId = Number(b.userId);
  if (!Number.isFinite(userId)) throw new BadRequestException('Invalid userId');
  const periodName = requireString(b.periodName, 'periodName');
  return { userId, periodName };
}

export function parseUserIdBody(body: unknown): number {
  const b = (body ?? {}) as Record<string, unknown>;
  const userId = Number(b.userId);
  if (!Number.isFinite(userId)) throw new BadRequestException('Invalid userId');
  return userId;
}

export function parseFsIdBody(body: unknown): { userId: number; id: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const userId = parseUserIdBody(body);
  const id = requireString(b.id, 'id');
  return { userId, id };
}

export function parseFsIdWithUpdatesBody(body: unknown): { userId: number; id: string; updates: FsUpdatePayload } {
  const { userId, id } = parseFsIdBody(body);
  const b = (body ?? {}) as Record<string, unknown>;
  const updates = validateFsUpdatePayload(b.updates ?? {});
  return { userId, id, updates };
}

export function validateFsCreatePayload(payload: unknown): FsCreatePayload {
  const p = (payload ?? {}) as Record<string, unknown>;
  return {
    id: p.id != null ? String(p.id) : undefined,
    projectId: requireString(p.projectId, 'projectId'),
    fsType: requireString(p.fsType, 'fsType'),
    amount: requireNumber(p.amount ?? 0, 'amount'),
    irr: requireNumber(p.irr ?? 0, 'irr'),
    paybackPeriod: requireNumber(p.paybackPeriod ?? 0, 'paybackPeriod'),
    npv: requireNumber(p.npv ?? 0, 'npv'),
    roi: requireNumber(p.roi ?? 0, 'roi'),
    plannedRevenueStartDate: requireString(p.plannedRevenueStartDate, 'plannedRevenueStartDate'),
    actualRevenueStartDate: p.actualRevenueStartDate != null ? String(p.actualRevenueStartDate) : null,
    monthlyRevenuePlan: requireNumber(p.monthlyRevenuePlan ?? 0, 'monthlyRevenuePlan'),
    throughput: requireNumber(p.throughput ?? 0, 'throughput'),
    conclusion: p.conclusion != null ? String(p.conclusion) : 'Pending',
    followUpAction: p.followUpAction != null ? String(p.followUpAction) : null,
  };
}

export function validateFsUpdatePayload(updates: unknown): FsUpdatePayload {
  const u = (updates ?? {}) as Record<string, unknown>;
  const out: FsUpdatePayload = {};
  if (u.fsType !== undefined) out.fsType = requireString(u.fsType, 'fsType');
  if (u.amount !== undefined) out.amount = requireNumber(u.amount, 'amount');
  if (u.irr !== undefined) out.irr = requireNumber(u.irr, 'irr');
  if (u.paybackPeriod !== undefined) out.paybackPeriod = requireNumber(u.paybackPeriod, 'paybackPeriod');
  if (u.npv !== undefined) out.npv = requireNumber(u.npv, 'npv');
  if (u.roi !== undefined) out.roi = requireNumber(u.roi, 'roi');
  if (u.plannedRevenueStartDate !== undefined) out.plannedRevenueStartDate = requireString(u.plannedRevenueStartDate, 'plannedRevenueStartDate');
  if (u.actualRevenueStartDate !== undefined) {
    out.actualRevenueStartDate = u.actualRevenueStartDate == null ? null : String(u.actualRevenueStartDate);
  }
  if (u.monthlyRevenuePlan !== undefined) out.monthlyRevenuePlan = requireNumber(u.monthlyRevenuePlan, 'monthlyRevenuePlan');
  if (u.throughput !== undefined) out.throughput = requireNumber(u.throughput, 'throughput');
  if (u.conclusion !== undefined) out.conclusion = requireString(u.conclusion, 'conclusion');
  if (u.followUpAction !== undefined) out.followUpAction = u.followUpAction == null ? null : String(u.followUpAction);
  return out;
}

export function validateFsRealizationPayload(payload: unknown): FsRealizationPayload {
  const p = (payload ?? {}) as Record<string, unknown>;
  return {
    id: p.id != null ? String(p.id) : undefined,
    fsId: requireString(p.fsId, 'fsId'),
    month: requireString(p.month, 'month'),
    actualRevenue: requireNumber(p.actualRevenue ?? 0, 'actualRevenue'),
    actualThroughput: requireNumber(p.actualThroughput ?? 0, 'actualThroughput'),
    notes: p.notes != null ? String(p.notes) : null,
  };
}

export function parseFsIdParam(body: unknown): { userId: number; fsId: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const userId = parseUserIdBody(body);
  const fsId = requireString(b.fsId, 'fsId');
  return { userId, fsId };
}
