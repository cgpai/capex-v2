import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRecordsWhereEq } from './supabase-helpers';

function mapProjectStatusToKey(status: unknown): 'OnTrack' | 'AtRisk' | 'OffTrack' | null {
  if (status === 0 || status === '0' || status === 'OnTrack' || status === 'On Track') return 'OnTrack';
  if (status === 1 || status === '1' || status === 'AtRisk' || status === 'At Risk') return 'AtRisk';
  if (status === 2 || status === '2' || status === 'OffTrack' || status === 'Off Track') return 'OffTrack';
  if (typeof status === 'string' && /track/i.test(status)) {
    const s = status.toLowerCase();
    if (s.includes('on')) return 'OnTrack';
    if (s.includes('risk') && !s.includes('off')) return 'AtRisk';
    if (s.includes('off')) return 'OffTrack';
  }
  return null;
}

export type ProjectMetricsForPeriod = {
  projectCount: number;
  statusCounts: { OnTrack: number; AtRisk: number; OffTrack: number };
};

/**
 * Total project & breakdown status:
 * - Total: PostgREST `count: exact` + `head: true` (tanpa limit 1000, tanpa transfer baris)
 * - Jika status di DB numerik 0/1/2: tiga query count tambahan (sangat ringan)
 * - Jika tidak cocok (status teks / campuran): batch-fetch kolom `status` saja
 */
export async function loadProjectMetricsForPeriod(
  client: SupabaseClient,
  periodName: string,
): Promise<ProjectMetricsForPeriod> {
  const pn = periodName.trim();

  const { count: totalExact, error: errTotal } = await client
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('period_name', pn);

  if (errTotal) {
    throw new Error(`projects count: ${errTotal.message}`);
  }

  const total = totalExact ?? 0;

  if (total === 0) {
    return { projectCount: 0, statusCounts: { OnTrack: 0, AtRisk: 0, OffTrack: 0 } };
  }

  let n0 = 0;
  let n1 = 0;
  let n2 = 0;
  try {
    const [r0, r1, r2] = await Promise.all([
      client.from('projects').select('*', { count: 'exact', head: true }).eq('period_name', pn).eq('status', 0),
      client.from('projects').select('*', { count: 'exact', head: true }).eq('period_name', pn).eq('status', 1),
      client.from('projects').select('*', { count: 'exact', head: true }).eq('period_name', pn).eq('status', 2),
    ]);
    if (r0.error || r1.error || r2.error) {
      throw new Error(r0.error?.message || r1.error?.message || r2.error?.message);
    }
    n0 = r0.count ?? 0;
    n1 = r1.count ?? 0;
    n2 = r2.count ?? 0;
  } catch {
    n0 = -1;
  }

  if (n0 >= 0 && n0 + n1 + n2 === total) {
    return {
      projectCount: total,
      statusCounts: { OnTrack: n0, AtRisk: n1, OffTrack: n2 },
    };
  }

  const statusRows = await fetchAllRecordsWhereEq(client, 'projects', 'period_name', pn, 'status');
  const statusCounts = { OnTrack: 0, AtRisk: 0, OffTrack: 0 };
  statusRows.forEach((p: { status?: unknown }) => {
    const k = mapProjectStatusToKey(p.status);
    if (k) statusCounts[k] += 1;
  });

  return {
    projectCount: total,
    statusCounts,
  };
}
