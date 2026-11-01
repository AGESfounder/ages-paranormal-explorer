// Admin-granted access (contest prizes, testing, support credits).
//
// A grant is an ordinary purchase-ledger row with its own store marker and an
// `admin_grant.<planId>` product id. Because it lives in the same ledger every
// resolver already reads, it needs no special path: the highest ranked ACTIVE
// row wins, so a grant outranks a lower tier while it is live and simply stops
// counting once its expiration passes — at which point a real subscription
// underneath (or Observer) takes over again with nothing to clean up.
//
// The dedicated store marker keeps grants out of provider logic: Apple/Play
// refund recomputation and the sandbox tester reset both filter on their own
// stores, so neither can touch one of these rows.

import { getPlanRank } from './access.js';

export const ADMIN_GRANT_STORE = 'ADMIN_GRANT';

// Deliberately not 'SANDBOX' or 'PRODUCTION': a grant is neither a store
// transaction nor tester data, and the scheduled tester reset only clears
// SANDBOX rows.
export const ADMIN_GRANT_ENVIRONMENT = 'ADMIN';

export const ADMIN_GRANT_PRODUCT_PREFIX = 'admin_grant.';

// Paid tiers an admin may hand out. Observer is the free tier and needs no
// grant; unknown ids fail closed in planForAdminGrantProduct below.
export const GRANTABLE_PLAN_IDS = [
  'seeker',
  'technician',
  'explorer',
  'investigator',
  'trailblazer',
];

/** The ledger product id that carries an admin grant of this plan. Pure. */
export function adminGrantProductId(planId) {
  return `${ADMIN_GRANT_PRODUCT_PREFIX}${planId}`;
}

/** The plan an admin-grant product id carries, or null when it carries none. Pure. */
export function planForAdminGrantProduct(productId) {
  if (typeof productId !== 'string' || !productId.startsWith(ADMIN_GRANT_PRODUCT_PREFIX)) {
    return null;
  }
  const planId = productId.slice(ADMIN_GRANT_PRODUCT_PREFIX.length);
  return GRANTABLE_PLAN_IDS.includes(planId) ? planId : null;
}

/** Whether a ledger row is an admin grant (and so is the only kind revocable). Pure. */
export function isAdminGrantRow(row) {
  return Boolean(row) && row.store === ADMIN_GRANT_STORE
    && planForAdminGrantProduct(row.product_id) !== null;
}

const ACTIVE_STATUSES = new Set(['active', 'paid']);

/** Admin grant rows that are still in force. Pure. */
export function activeAdminGrants(rows, now = new Date()) {
  return (rows || []).filter((row) => {
    if (!isAdminGrantRow(row) || !ACTIVE_STATUSES.has(row.status)) return false;
    const ms = row.plan_expiration_date ? new Date(row.plan_expiration_date).getTime() : NaN;
    return Number.isFinite(ms) && ms > now.getTime();
  });
}

/**
 * The strongest active admin grant on an account, or null. Used where a
 * provider event would otherwise write a lower plan over a live grant.
 * Pure.
 */
export function highestActiveAdminGrant(rows, now = new Date()) {
  let best = null;
  let bestRank = 0;
  for (const row of activeAdminGrants(rows, now)) {
    const planId = planForAdminGrantProduct(row.product_id);
    const rank = getPlanRank(planId);
    if (rank > bestRank) {
      best = { row, planId, expiration: row.plan_expiration_date };
      bestRank = rank;
    }
  }
  return best;
}