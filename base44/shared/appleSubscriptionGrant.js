// Pure Apple recurring-subscription grant field computation.
// Used by the RevenueCat Apple subscription webhook and focused tests.
//
// Generic User fields can only hold one plan string at a time. Apple/Wix
// Trailblazer (30-month one-time) and Apple recurring subscriptions both use
// those fields. When a higher-rank plan is still active (typically
// Trailblazer), a lower recurring grant must NOT clobber it — the
// RevenueCatPurchase ledger remains the source of truth for the subscription
// row, and subscription_status becomes 'active' so the purchase is reflected.
//
// PRODUCT_CHANGE is intentionally excluded by callers (bookkeeping only).
// Expired higher plans never block a grant.

export const PLAN_RANK = {
  observer: 0,
  seeker: 1,
  technician: 2,
  explorer: 3,
  investigator: 4,
  trailblazer: 5,
};

export function getPlanRank(planId) {
  if (!planId) return 0;
  return PLAN_RANK[planId] || 0;
}

export function isDateActive(isoDate, now = new Date()) {
  if (!isoDate) return false;
  const ms = new Date(isoDate).getTime();
  if (Number.isNaN(ms)) return false;
  return ms > now.getTime();
}

/**
 * Whether the generic plan fields currently hold a paid, unexpired entitlement.
 * Mirrors isGenericPlanActive in access.js (kept local to avoid import cycles
 * in pure tests).
 */
export function isGenericPlanCurrentlyActive(user, now = new Date()) {
  if (!user) return false;
  const plan = user.plan || 'observer';
  if (plan === 'observer') return false;

  if (user.plan_expiration_date) {
    return isDateActive(user.plan_expiration_date, now);
  }

  if (user.subscription_status === 'canceled' || user.subscription_status === 'expired') {
    return false;
  }

  return true;
}

/**
 * Compute User field updates for an Apple INITIAL_PURCHASE / RENEWAL /
 * UNCANCELLATION grant onto the generic plan fields.
 *
 * @param {object} user Current Base44 user row
 * @param {{ id: string, manifestation_energy?: number, narration_energy?: number }} plan
 *   Target PLANS.* entry for the Apple product
 * @param {string} expirationIso RFC3339 expiration from RevenueCat
 * @param {{ refillEnergy?: boolean, subscriptionId?: string | null, now?: Date | number | string }} [opts]
 * @returns {{
 *   fields: Record<string, unknown>,
 *   preservedHigherPlan: boolean,
 *   stale: boolean,
 *   finalExpiration: string,
 * }}
 */
export function computeAppleSubscriptionGrantFields(user, plan, expirationIso, opts = {}) {
  const now = opts.now != null ? new Date(opts.now) : new Date();
  const refillEnergy = opts.refillEnergy !== false;
  const subscriptionId = opts.subscriptionId || null;

  const newExp = Date.parse(expirationIso);
  if (Number.isNaN(newExp)) {
    throw new Error('invalid expirationIso');
  }

  const currentPlan = (user && user.plan) || 'observer';
  const currentRank = getPlanRank(currentPlan);
  const newRank = getPlanRank(plan && plan.id);
  const currentActive = isGenericPlanCurrentlyActive(user, now);

  // ── Preserve active higher-rank entitlement (Trailblazer 30-month, etc.) ──
  // An active App Store subscription may coexist on the RevenueCatPurchase
  // ledger while the generic plan fields continue to show Trailblazer.
  // Do not shorten Trailblazer expiry, swap plan id, refill lower-tier energy,
  // or steal subscription_id ownership from the higher-plan purchase.
  if (currentActive && currentRank > newRank) {
    return {
      fields: {
        // Recurring purchase is activated under the higher plan umbrella.
        subscription_status: 'active',
      },
      preservedHigherPlan: true,
      stale: false,
      finalExpiration: user.plan_expiration_date || expirationIso,
    };
  }

  // ── Normal grant / upgrade / renewal path ──
  const existingExp = user && user.plan_expiration_date
    ? Date.parse(user.plan_expiration_date)
    : null;
  const hasExisting = existingExp !== null && !Number.isNaN(existingExp);
  const samePlan = currentPlan === plan.id;

  let finalExpiration = expirationIso;
  // Same-plan out-of-order delivery: never shorten an already-granted period.
  if (samePlan && hasExisting && existingExp > newExp) {
    finalExpiration = user.plan_expiration_date;
  }
  // Event for an older period than the one already granted — keep energy as-is.
  const stale = samePlan && hasExisting && newExp < existingExp;

  const fields = {
    plan: plan.id,
    plan_expiration_date: finalExpiration,
    subscription_status: 'active',
    subscription_id: subscriptionId || (user && user.subscription_id) || null,
  };

  if (refillEnergy && !stale) {
    fields.manifestation_energy = plan.manifestation_energy;
    fields.narration_energy = plan.narration_energy;
  }

  return {
    fields,
    preservedHigherPlan: false,
    stale: Boolean(stale),
    finalExpiration,
  };
}

/**
 * Whether base44.auth.me() reflects a successful Apple (or Google) recurring
 * plan grant for the expected plan id.
 *
 * Success when:
 *  1. Exact plan match with a future plan_expiration_date (normal path), OR
 *  2. A higher-rank plan is still active (e.g. Trailblazer) AND
 *     subscription_status === 'active' — the recurring purchase was recorded
 *     under the higher entitlement without clobbering it.
 *
 * Expired subscriptions (past plan_expiration_date) never satisfy the poll.
 * A bare PRODUCT_CHANGE does not set subscription_status/plan, so it does
 * not satisfy this check on its own.
 *
 * @param {object | null | undefined} user
 * @param {string | null | undefined} expectedPlanId
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isRecurringPlanGrantReflected(user, expectedPlanId, now = new Date()) {
  if (!user) return false;

  const plan = user.plan || 'observer';
  const expMs = user.plan_expiration_date
    ? new Date(user.plan_expiration_date).getTime()
    : NaN;
  const expOk = !Number.isNaN(expMs) && expMs > now.getTime();

  if (!expOk) return false;

  if (!expectedPlanId) {
    return ['seeker', 'technician', 'explorer', 'investigator', 'trailblazer'].includes(plan);
  }

  if (plan === expectedPlanId) return true;

  // Higher-rank active plan preserved while the recurring sub activated
  // underneath (subscription_status flipped to active, ledger row written).
  if (
    user.subscription_status === 'active'
    && getPlanRank(plan) > getPlanRank(expectedPlanId)
  ) {
    return true;
  }

  return false;
}

/**
 * Resolve effective plan id from the user row plus optional Apple subscription
 * ledger rows. Higher rank wins among:
 *   - active generic plan (Apple/Wix, including Trailblazer on generic fields)
 *   - active isolated Google Trailblazer
 *   - active App Store recurring subscription rows on the ledger
 *
 * An expired generic Trailblazer no longer counts; an ACTIVE ledger
 * subscription can then surface as the effective plan. Aura balances are
 * never consulted here.
 *
 * @param {object | null | undefined} user
 * @param {Array<object> | null | undefined} appleLedgerRows
 *   RevenueCatPurchase rows (Apple store); only status==='active' subscription
 *   products with a future plan_expiration_date count.
 * @param {(productId: string) => ({ plan_id: string } | null | undefined) | null | undefined} resolveAppleProduct
 * @param {Date} [now]
 * @returns {string}
 */
export function resolveEffectivePlanId(user, appleLedgerRows, resolveAppleProduct, now = new Date()) {
  if (!user) return 'observer';
  if (user.role === 'admin') {
    return user.plan && user.plan !== 'observer' ? user.plan : 'trailblazer';
  }

  let best = 'observer';
  let bestRank = 0;

  if (isGenericPlanCurrentlyActive(user, now)) {
    best = user.plan || 'observer';
    bestRank = getPlanRank(best);
  }

  if (isDateActive(user.google_trailblazer_expiration_date, now)) {
    const rank = getPlanRank('trailblazer');
    if (rank >= bestRank) {
      best = 'trailblazer';
      bestRank = rank;
    }
  }

  if (typeof resolveAppleProduct === 'function') {
    for (const row of appleLedgerRows || []) {
      if (!row || row.status !== 'active') continue;
      const product = resolveAppleProduct(row.product_id);
      if (!product || !product.plan_id) continue;
      if (!row.plan_expiration_date) continue;
      const expMs = new Date(row.plan_expiration_date).getTime();
      if (Number.isNaN(expMs) || expMs <= now.getTime()) continue;
      const rank = getPlanRank(product.plan_id);
      if (rank > bestRank) {
        best = product.plan_id;
        bestRank = rank;
      }
    }
  }

  return best;
}