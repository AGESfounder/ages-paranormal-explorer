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

/**
 * Attach the user's Apple ledger rows to a user record so the ledger-aware
 * helpers in lib/access.js (getEffectivePlanId and everything derived from
 * it) resolve the same effective plan as the backend. Never throws: on any
 * failure the original user object is returned unchanged and resolution
 * falls back to the generic + Google fields only.
 *
 * @param {object | null | undefined} user
 * @returns {Promise<object | null | undefined>}
 */
export async function withAppleLedger(user) {
  if (!user?.id) return user;
  try {
    const rows = await fetchAppleLedgerRows(user.id);
    return { ...user, [APPLE_LEDGER_ROWS_FIELD]: rows };
  } catch {
    return user;
  }
}