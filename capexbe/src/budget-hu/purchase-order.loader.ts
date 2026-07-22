import type { SupabaseClient } from '@supabase/supabase-js';
import { toCamelCase } from '../project-list/supabase-helpers';

function mapPoItem(item: Record<string, unknown>) {
  return {
    catalogueId: String(item.catalogue_id ?? item.catalogueId ?? ''),
    rdsCode: String(item.rds_code ?? item.rdsCode ?? ''),
    name: String(item.name ?? ''),
    qty: Number(item.quantity ?? item.qty ?? 0),
    price: Number(item.price ?? 0),
    subtotal: Number(item.subtotal ?? 0),
    remarks: item.remarks ?? undefined,
    receivedQty: Number(item.received_quantity ?? item.receivedQty ?? 0),
  };
}

function mapPurchaseOrderRow(
  po: Record<string, unknown>,
  items: Record<string, unknown>[],
) {
  const camel = toCamelCase(po) as Record<string, unknown>;
  return {
    ...camel,
    items: items.map((item) => mapPoItem(item)),
  };
}

export async function fetchPurchaseOrderById(
  client: SupabaseClient,
  poId: string,
): Promise<Record<string, unknown> | null> {
  const id = String(poId ?? '').trim();
  if (!id) return null;

  const { data: po, error: poError } = await client
    .from('purchase_orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (poError) throw new Error(`getPurchaseOrder: ${poError.message}`);
  if (!po) return null;

  const { data: items, error: itemsError } = await client
    .from('purchase_order_items')
    .select('*')
    .eq('purchase_order_id', id);
  if (itemsError) throw new Error(`getPurchaseOrder items: ${itemsError.message}`);

  return mapPurchaseOrderRow(po as Record<string, unknown>, (items ?? []) as Record<string, unknown>[]);
}

export async function fetchPurchaseOrdersByProjectId(
  client: SupabaseClient,
  projectId: string,
): Promise<Record<string, unknown>[]> {
  const pid = String(projectId ?? '').trim();
  if (!pid) return [];

  const { data: pos, error } = await client
    .from('purchase_orders')
    .select('*')
    .eq('project_id', pid);
  if (error) throw new Error(`getPurchaseOrdersByProject: ${error.message}`);
  if (!pos?.length) return [];

  const poIds = pos.map((po) => String((po as { id: string }).id));
  const { data: allItems, error: itemsError } = await client
    .from('purchase_order_items')
    .select('*')
    .in('purchase_order_id', poIds);
  if (itemsError) throw new Error(`getPurchaseOrdersByProject items: ${itemsError.message}`);

  const itemsByPo = new Map<string, Record<string, unknown>[]>();
  for (const item of (allItems ?? []) as Record<string, unknown>[]) {
    const poKey = String(item.purchase_order_id ?? '');
    const bucket = itemsByPo.get(poKey) ?? [];
    bucket.push(item);
    itemsByPo.set(poKey, bucket);
  }

  return pos.map((po) =>
    mapPurchaseOrderRow(
      po as Record<string, unknown>,
      itemsByPo.get(String((po as { id: string }).id)) ?? [],
    ),
  );
}
