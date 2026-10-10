// Client effective plan / paid-access helpers.
// Mirrors base44/shared/access.js so gates honor Apple/Wix expiry and the
// isolated Google Trailblazer 30-month grant. Source of truth for grants is
// the Base44 user record (webhook-written); never grant from RevenueCat SDK.

import { PLANS } from '@/lib/plans';

const PLAN_RANK = {
  observer: 0,
  seeker: 1,
  technician: 2,
  explorer: 3,
  investigator: 4,
  trailblazer: 5,
};

// Apple App Store subscription product id → Base44 plan id, for resolving
// RevenueCatPurchase ledger rows. Mirrors APPLE_SUBSCRIPTION_PRODUCTS in
// base44/shared/revenuecat.js (kept local so this pure module never pulls in
// the RevenueCat SDK import chain). Google Play product ids are deliberately
// absent, so Play ledger rows can never resolve (or grant) through here.
const APPLE_LEDGER_PLAN_IDS = {
  'com.ages.explorer.explorer.monthly': 'explorer',
  'com.ages.explorer.explorer.annual': 'explorer',
  'com.ages.explorer.investigator.monthly': 'investigator',
  'com.ages.explorer.investigator.annual': 'investigator',
  'com.ages.explorer.seeker.monthly': 'seeker',
  'com.ages.explorer.seeker.annual': 'seeker',
  'com.ages.explorer.technician.monthly': 'technician',
  'com.ages.explorer.technician.annual': 'technician',
};

/**
 * Default Apple ledger product resolver, shaped like
 * getAppleSubscriptionProduct in base44/shared/revenuecat.js.
 * Returns { plan_id } for known App Store subscription products, else null.
 */
export function resolveAppleLedgerProduct(productId) {
  const planId = APPLE_LEDGER_PLAN_IDS[productId] || null;
  return planId ? { plan_id: planId } : null;
}

/** Public plan rank for grant/poll helpers (higher wins). */
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
 * Generic (Apple/Wix) plan is active when plan is paid and either has no
 * expiration or the expiration is still in the future.
 */
export function isGenericPlanActive(user, now = new Date()) {
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

/** Isolated Google Trailblazer grant is active while its expiry is in the future. */
export function isGoogleTrailblazerActive(user, now = new Date()) {
  if (!user) return false;
  return isDateActive(user.google_trailblazer_expiration_date, now);
}

/**
 * Generic (Apple/Wix) + isolated Google resolution WITHOUT the Apple ledger.
 * Internal base for the ledger-aware helpers — the ledger path must call
 * this, never the public getEffectivePlanId (which would recurse).
 */
function getBaseEffectivePlanId(user, now = new Date()) {
  if (!user) return 'observer';
  if (user.role === 'admin') {
    return user.plan && user.plan !== 'observer' ? user.plan : 'trailblazer';
  }

  let best = 'observer';

  if (isGenericPlanActive(user, now)) {
    best = user.plan || 'observer';
  }

  if (isGoogleTrailblazerActive(user, now)) {
    if ((PLAN_RANK.trailblazer || 0) >= (PLAN_RANK[best] || 0)) {
      best = 'trailblazer';
    }
  }

  return best;
}

/**
 * Effective plan id. When the user record carries its Apple subscription
 * ledger rows (user.apple_ledger_rows, attached by withAppleLedger in
 * lib/appleLedger.js from trusted webhook-written RevenueCatPurchase data),
 * resolution matches the backend getEffectivePlanIdWithAppleLedger exactly —
 * an active App Store recurring subscription can surface once a higher plan
 * (e.g. Trailblazer) has expired. Without attached rows the generic +
 * Google fields decide, exactly as before (network fail-safe).
 */
export function getEffectivePlanId(user, now = new Date()) {
  if (!user) return 'observer';
  if (Array.isArray(user.apple_ledger_rows)) {
    return getEffectivePlanIdWithAppleLedger(
      user,
      user.apple_ledger_rows,
      resolveAppleLedgerProduct,
      now,
    );
  }
  return getBaseEffectivePlanId(user, now);
}

/**
 * Whether auth.me() reflects a successful recurring subscription grant.
 *
 * Exact plan match with a future expiration (normal path), OR a higher-rank
 * active plan (e.g. Trailblazer) with subscription_status === 'active' when
 * the recurring purchase was recorded without clobbering the higher plan.
 * Expired plan_expiration_date never counts. PRODUCT_CHANGE alone does not
 * flip these fields, so it does not satisfy this check.
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

  if (
    user.subscription_status === 'active'
    && getPlanRank(plan) > getPlanRank(expectedPlanId)
  ) {
    return true;
  }

  return false;
}

/**
 * Effective plan including optional Apple subscription ledger rows.
 * Precedence (highest rank wins among still-active sources):
 *   1. Active generic plan (Apple/Wix), including Trailblazer on generic fields
 *   2. Active isolated Google Trailblazer
 *   3. Active App Store recurring subscription ledger rows
 * Expired Trailblazer on generic fields does not count; an ACTIVE ledger
 * subscription can then become effective. Aura is never consulted.
 */
export function getEffectivePlanIdWithAppleLedger(
  user,
  appleLedgerRows,
  resolveAppleProduct,
  now = new Date(),
) {
  if (!user) return 'observer';
  if (user.role === 'admin') {
    return user.plan && user.plan !== 'observer' ? user.plan : 'trailblazer';
  }

  let best = getBaseEffectivePlanId(user, now);
  let bestRank = getPlanRank(best);

  if (typeof resolveAppleProduct !== 'function') return best;

  for (const row of appleLedgerRows || []) {
    if (!row || row.status !== 'active') continue;
    const product = resolveAppleProduct(row.product_id);
    if (!product || !product.plan_id) continue;
    if (!isDateActive(row.plan_expiration_date, now)) continue;
    const rank = getPlanRank(product.plan_id);
    if (rank > bestRank) {
      best = product.plan_id;
      bestRank = rank;
    }
  }

  return best;
}

// Explorer+ can generate tours (Nearby/Abroad). Seeker/Technician are paid
// but have no manifestation energy and are not generation-eligible by plan.
export function canGenerate(user, now = new Date()) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const planId = getEffectivePlanId(user, now);
  return planId === 'explorer' || planId === 'investigator' || planId === 'trailblazer';
}

export function isPaidAccess(user, now = new Date()) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return getEffectivePlanId(user, now) !== 'observer';
}

export function getEffectivePlan(user, now = new Date()) {
  const id = getEffectivePlanId(user, now);
  return PLANS[id] || PLANS.observer;
}

export function getEnergySource(user, now = new Date()) {
  if (isGoogleTrailblazerActive(user, now)) return 'google';
  if (isGenericPlanActive(user, now)) return 'generic';
  return 'none';
}

export function getDisplayEnergy(user, now = new Date()) {
  const source = getEnergySource(user, now);
  const auraMan = user?.aura_manifestation_energy || 0;
  const auraNar = user?.aura_narration_energy || 0;

  if (source === 'google') {
    return {
      source,
      manifestation: user?.google_trailblazer_manifestation_energy || 0,
      narration: user?.google_trailblazer_narration_energy || 0,
      auraManifestation: auraMan,
      auraNarration: auraNar,
      resetDate: user?.google_trailblazer_energy_reset_date || null,
    };
  }

  if (source === 'generic') {
    return {
      source,
      manifestation: user?.manifestation_energy || 0,
      narration: user?.narration_energy || 0,
      auraManifestation: auraMan,
      auraNarration: auraNar,
      resetDate: user?.energy_reset_date || null,
    };
  }

  return {
    source: 'none',
    manifestation: 0,
    narration: 0,
    auraManifestation: auraMan,
    auraNarration: auraNar,
    resetDate: null,
  };
}

export function getSpendableEnergy(user, now = new Date()) {
  const googleActive = isGoogleTrailblazerActive(user, now);
  const genericActive = isGenericPlanActive(user, now);

  let man = 0;
  let nar = 0;

  if (googleActive) {
    man += user?.google_trailblazer_manifestation_energy || 0;
    nar += user?.google_trailblazer_narration_energy || 0;
  }
  if (genericActive) {
    man += user?.manifestation_energy || 0;
    nar += user?.narration_energy || 0;
  }

  man += user?.aura_manifestation_energy || 0;
  nar += user?.aura_narration_energy || 0;

  return { manifestation: man, narration: nar, googleActive, genericActive };
}

export function applyManifestationSpend(user, now = new Date()) {
  const updates = {};
  let gMan = user?.google_trailblazer_manifestation_energy || 0;
  let man = user?.manifestation_energy || 0;
  let aura = user?.aura_manifestation_energy || 0;

  if (isGoogleTrailblazerActive(user, now) && gMan > 0) {
    gMan -= 1;
    updates.google_trailblazer_manifestation_energy = gMan;
  } else if (isGenericPlanActive(user, now) && man > 0) {
    man -= 1;
    updates.manifestation_energy = man;
  } else if (aura > 0) {
    aura -= 1;
    updates.aura_manifestation_energy = aura;
  }

  return {
    updates,
    next: {
      ...user,
      google_trailblazer_manifestation_energy: gMan,
      manifestation_energy: man,
      aura_manifestation_energy: aura,
    },
  };
}

export function applyNarrationSpend(user, cost, now = new Date()) {
  let remaining = Math.max(0, Number(cost) || 0);
  let gNar = user?.google_trailblazer_narration_energy || 0;
  let nar = user?.narration_energy || 0;
  let aura = user?.aura_narration_energy || 0;
  const updates = {};

  if (remaining > 0 && isGoogleTrailblazerActive(user, now) && gNar > 0) {
    const take = Math.min(gNar, remaining);
    gNar -= take;
    remaining -= take;
    updates.google_trailblazer_narration_energy = gNar;
  }

  if (remaining > 0 && isGenericPlanActive(user, now) && nar > 0) {
    const take = Math.min(nar, remaining);
    nar -= take;
    remaining -= take;
    updates.narration_energy = nar;
  }

  if (remaining > 0 && aura > 0) {
    const take = Math.min(aura, remaining);
    aura -= take;
    remaining -= take;
    updates.aura_narration_energy = aura;
  }

  return {
    updates,
    remaining,
    next: {
      ...user,
      google_trailblazer_narration_energy: gNar,
      narration_energy: nar,
      aura_narration_energy: aura,
    },
  };
}

export function getEffectiveExpirationDate(user, now = new Date()) {
  const dates = [];
  if (isGoogleTrailblazerActive(user, now) && user.google_trailblazer_expiration_date) {
    dates.push(user.google_trailblazer_expiration_date);
  }
  if (isGenericPlanActive(user, now) && user.plan_expiration_date) {
    dates.push(user.plan_expiration_date);
  }
  if (dates.length === 0) return null;

  let max = null;
  for (const d of dates) {
    const ms = new Date(d).getTime();
    if (Number.isNaN(ms)) continue;
    if (max === null || ms > max) max = ms;
  }
  return max === null ? null : new Date(max).toISOString();
}

/**
 * Compute field updates after spending 1 evidence save energy (post free daily).
 * Tier-aware pool selection:
 *   Seeker/Technician → aura_save_energy ONLY (no fallback; blocked when empty)
 *   Explorer+   → aura_narration_energy → aura_manifestation_energy (no save pool)
 *   Observer → no Aura pool access (blocked)
 * NEVER touches monthly narration_energy, manifestation_energy, or
 * google_trailblazer_* pools — those are reserved for narration/generation.
 * Returns { updates: null, remaining: 1 } when no eligible pool is available.
 */
export function applyEvidenceSaveSpend(user, now = new Date()) {
  const planId = getEffectivePlanId(user, now);
  const updates = {};

  // Observer: no Aura pool access for evidence saves
  if (planId === 'observer') {
    return { updates: null, remaining: 1, next: user };
  }

  // Seeker / Technician: aura_save_energy only — no fallback to 80/20 Aura pools
  if (planId === 'seeker' || planId === 'technician') {
    let saveEnergy = user?.aura_save_energy || 0;
    if (saveEnergy > 0) {
      saveEnergy -= 1;
      updates.aura_save_energy = saveEnergy;
      return {
        updates,
        remaining: 0,
        next: { ...user, aura_save_energy: saveEnergy },
      };
    }
    return { updates: null, remaining: 1, next: user };
  }

  // Explorer / Investigator / Trailblazer: narration → manifestation (no save pool)
  let auraNar = user?.aura_narration_energy || 0;
  let auraMan = user?.aura_manifestation_energy || 0;

  if (auraNar > 0) {
    auraNar -= 1;
    updates.aura_narration_energy = auraNar;
  } else if (auraMan > 0) {
    auraMan -= 1;
    updates.aura_manifestation_energy = auraMan;
  } else {
    return { updates: null, remaining: 1, next: user };
  }

  return {
    updates,
    remaining: 0,
    next: {
      ...user,
      aura_narration_energy: auraNar,
      aura_manifestation_energy: auraMan,
    },
  };
}

/** Aura energy available for evidence saves (display helper for Dashboard). */
export function getSaveEnergy(user, now = new Date()) {
  return {
    save: user?.aura_save_energy || 0,
    narration: user?.aura_narration_energy || 0,
    manifestation: user?.aura_manifestation_energy || 0,
    total: (user?.aura_save_energy || 0) + (user?.aura_narration_energy || 0) + (user?.aura_manifestation_energy || 0),
  };
}