// Apple App Store subscription ledger access for client effective-plan
// resolution.
//
// Why this exists: the generic User plan fields hold only one plan id at a
// time. When a higher plan (e.g. Trailblazer 27-month) expires while an Apple
// recurring subscription is still active, the webhook-written
// RevenueCatPurchase ledger is the source of truth for the remaining
// recurring entitlement. The backend already escalates with
// getEffectivePlanIdWithAppleLedger (grant-ad-reward, spend-evidence-save);
// this module fetches the same trusted rows so the client helpers in
// lib/access.js resolve the identical effective plan.
//
// Trust model: rows come from the Base44 entities API (server webhook-writes;
// RLS limits reads to the signed-in user's own rows). Access is NEVER granted
// from the RevenueCat SDK or any other client-provided value. Google Play
// rows are excluded twice — the query filters store === 'APP_STORE' and the
// product resolver in lib/access.js maps Apple product ids only. Every
// failure fail-softs to "no rows", in which case the generic plan fields
// decide exactly as before.

import { base44 } from '@/api/base44Client';

// Client-only user field carrying the fetched Apple ledger rows from the
// fetch sites to the pure helpers in lib/access.js. It is never posted back
// to the server — all update paths send explicit field objects.
export const APPLE_LEDGER_ROWS_FIELD = 'apple_ledger_rows';

export const APPLE_STORE = 'APP_STORE';

/**
 * Fetch the signed-in user's Apple App Store subscription ledger rows from
 * the webhook-written RevenueCatPurchase entity. Fail-safe: resolves to []
 * when the entity is unavailable or the query fails, so plan resolution
 * degrades to the generic fields only (never a false grant, never a throw).
 *
 * @param {string | null | undefined} userId Base44 user id
 * @returns {Promise<Array<object>>}
 */
export async function fetchAppleLedgerRows(userId) {
  if (!userId) return [];
  try {
    // The entity accessor may not exist until the entity is deployed.
    if (!base44.entities?.RevenueCatPurchase) return [];
    const rows = await base44.entities.RevenueCatPurchase.filter({
      user_id: userId,
      store: APPLE_STORE,
    });
    // Some SDK versions return { items }; the declared type is Array, so the
    // fallback branch narrows to never without the cast (same pattern as
    // AdminUsersTab.jsx).
    const list = Array.isArray(rows) ? rows : /** @type {any} */ (rows)?.items || [];
    // Defense in depth: keep only this user's App Store rows even though the
    // query filter and RLS already enforce both constraints.
    return list.filter((row) => row && row.user_id === userId && row.store === APPLE_STORE);
  } catch {
    return [];
  }
}

// Client-only field carrying the SERVER-verified entitlement (plan + balances)
// from the get-entitlement function. Like the ledger rows it is never posted
// back to the server — all update paths send explicit field objects.
export const SERVER_ENTITLEMENT_FIELD = 'server_entitlement';

/**
 * Ask the server what it has verified for this account: the effective plan
 * resolved from the purchase ledger, and the balances held in the server-owned
 * energy account. Fail-soft: resolves to null when the call fails, in which case
 * the client falls back to the record's display mirror (the server still decides
 * every spend).
 *
 * @returns {Promise<object | null>}
 */
export async function fetchServerEntitlement() {
  try {
    const res = await base44.functions.invoke('get-entitlement', {});
    const data = res?.data;
    if (!data || data.verified !== true) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Attach the user's Apple ledger rows AND the server-verified entitlement to a
 * user record, so the helpers in lib/access.js resolve the same effective plan
 * and balances the backend does. Never throws: on any failure the original user
 * object is returned unchanged and resolution falls back to the mirror.
 *
 * @param {object | null | undefined} user
 * @returns {Promise<object | null | undefined>}
 */
export async function withAppleLedger(user) {
  if (!user?.id) return user;
  try {
    const [rows, entitlement] = await Promise.all([
      fetchAppleLedgerRows(user.id),
      fetchServerEntitlement(),
    ]);
    return {
      ...user,
      [APPLE_LEDGER_ROWS_FIELD]: rows,
      [SERVER_ENTITLEMENT_FIELD]: entitlement,
    };
  } catch {
    return user;
  }
}