// Shared helpers for the RevenueCat webhook handlers (ledger lookup + idempotency bookkeeping).

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

export async function findLedgerByTransaction(base44: any, transactionId: string) {
  if (!transactionId) return null;
  const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
    transaction_id: transactionId,
  });
  if (rows?.length) return rows[0];

  // Fallback: some refunds key on original_transaction_id
  const byOriginal = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
    original_transaction_id: transactionId,
  });
  return byOriginal?.length ? byOriginal[0] : null;
}

export function eventAlreadyApplied(row: any, eventId: string) {
  if (!eventId) return false;
  if (row.event_id === eventId) return true;
  if (Array.isArray(row.event_ids) && row.event_ids.includes(eventId)) return true;
  return false;
}

export function mergeEventIds(row: any, eventId: string) {
  const set = new Set<string>(Array.isArray(row?.event_ids) ? row.event_ids : []);
  if (row?.event_id) set.add(row.event_id);
  if (eventId) set.add(eventId);
  return [...set];
}