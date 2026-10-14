// Trusted server-side entitlement resolution.
//
// THE ONLY SOURCE OF PAID ENTITLEMENT IS THE PURCHASE LEDGER — RevenueCatPurchase
// rows written by the provider webhooks with the service role (Apple App Store
// subscriptions, Apple Trailblazer one-time, Apple/Play Aura bundles, Google Play
// subscriptions and Play Trailblazer). That entity's RLS allows writes to admins
// only, so no signed-in user can add, edit, clear or expire one of those rows
// through the user-facing API.
//
// The User record's plan / plan_expiration_date / subscription_status fields are
// a DISPLAY MIRROR that the same webhooks write for the UI. They are writable by
// their own owner, so this module reads them for nothing at all: a user who edits
// their own record to 'trailblazer' still resolves as Observer here, and every
// privileged path decides from this module's answer.
//
// Fail-closed: no active ledger row (or an unreadable ledger) means the free
// tier. Nothing here grants access from a cached or client-supplied value.

import { PLANS } from './plans.js';
import { getPlanRank, isKnownPlanId } from './access.js';
import {
  APPLE_SUBSCRIPTION_PRODUCTS,
  APPLE_TRAILBLAZER_PRODUCT_ID,
  GOOGLE_SUBSCRIPTION_PRODUCTS,
  GOOGLE_TRAILBLAZER_PRODUCT_ID,
  GOOGLE_TRAILBLAZER_STORE,
} from './revenuecat.js';
import { AD_REWARD_DAILY_LIMIT, getAdRewardSplit } from './adRewards.js';

// Ledger row statuses that represent money paid and not refunded:
// 'active' = auto-renewing subscription, 'paid' = one-time purchase.
const PAID_ROW_STATUSES = new Set(['active', 'paid']);

/**
 * The plan a ledger product id belongs to, or null when the product is not a
 * plan product (Aura bundles are consumables — they carry energy, not a plan).
 * Pure.
 */
export function planForLedgerProduct(productId) {
  if (!productId) return null;
  const apple = APPLE_SUBSCRIPTION_PRODUCTS[productId];
  if (apple?.plan_id) return apple.plan_id;
  const google = GOOGLE_SUBSCRIPTION_PRODUCTS[productId];
  if (google?.plan_id) return google.plan_id;
  if (productId === APPLE_TRAILBLAZER_PRODUCT_ID) return 'trailblazer';
  if (productId === GOOGLE_TRAILBLAZER_PRODUCT_ID) return 'trailblazer';
  return null;
}

/** Ledger rows that are paid and not past their expiration. Pure. */
export function activeLedgerRows(rows, now = new Date()) {
  return (rows || []).filter((row) => {
    if (!row || !PAID_ROW_STATUSES.has(row.status)) return false;
    const ms = row.plan_expiration_date ? new Date(row.plan_expiration_date).getTime() : NaN;
    return Number.isFinite(ms) && ms > now.getTime();
  });
}

/**
 * The highest-rank still-active plan among the user's ledger rows — the answer
 * every privileged path uses. Pure, so the resolution can be tested directly
 * against forged records and crafted rows.
 */
export function planIdFromLedgerRows(rows, now = new Date()) {
  let best = 'observer';
  let bestRank = 0;
  for (const row of activeLedgerRows(rows, now)) {
    const planId = planForLedgerProduct(row.product_id);
    if (!isKnownPlanId(planId) || planId === 'observer') continue;
    const rank = getPlanRank(planId);
    if (rank > bestRank) {
      best = planId;
      bestRank = rank;
    }
  }
  return best;
}

/** Which provider stores the active rows came from (pool selection). Pure. */
export function activeStores(rows, now = new Date()) {
  const stores = new Set();
  for (const row of activeLedgerRows(rows, now)) {
    stores.add(row.store || 'unknown');
  }
  return stores;
}

/**
 * A marker that only moves when a provider grant changes the ledger. The energy
 * account absorbs the User record mirror exactly when this marker changes (or on
 * first use), which is what stops a forged record from re-filling a spent
 * balance: the marker cannot be advanced by a signed-in user. Pure.
 */
export function ledgerMarker(rows) {
  let newest = null;
  for (const row of rows || []) {
    for (const stamp of [row.updated_date, row.created_date, row.purchase_date]) {
      if (!stamp) continue;
      if (!newest || String(stamp) > String(newest)) newest = String(stamp);
    }
  }
  return newest ? String(newest) : 'no-ledger-rows';
}

/**
 * The most each pool can legitimately hold. Balances above these cannot have come
 * from the app's grant paths, so these are the ceilings an absorb may take from
 * the User record mirror — which is how an inflated record is stopped at the
 * account boundary.
 *
 *   monthly pools → the plan's included monthly allowance (PLANS), so a refill
 *                   can never exceed what the tier actually includes
 *   Aura pools    → every Aura unit ever granted by a purchase ledger row
 *                   (aura_*_granted) plus the most rewarded ads could have won
 *                   in the days the account has existed (the ad grant is the one
 *                   Aura source with no ledger row of its own, and it is capped
 *                   per day)
 *   Aura save     → purchased save bundles only (no ad source)
 *
 * Pure.
 */
export function energyCeilings({ planId, rows, createdAt, now = new Date() }) {
  const plan = PLANS[planId] || PLANS.observer;

  let auraNarration = 0;
  let auraManifestation = 0;
  let auraSave = 0;
  for (const row of rows || []) {
    if (!row) continue;
    auraNarration += Number(row.aura_narration_granted) || 0;
    auraManifestation += Number(row.aura_manifestation_granted) || 0;
    auraSave += Number(row.aura_save_granted) || 0;
  }

  const created = createdAt ? new Date(createdAt).getTime() : NaN;
  const days = Number.isFinite(created)
    ? Math.max(1, Math.ceil((now.getTime() - created) / 86400000))
    : 1;
  const split = getAdRewardSplit();

  return {
    narration: Number(plan.narration_energy) || 0,
    manifestation: Number(plan.manifestation_energy) || 0,
    google_narration: Number(plan.narration_energy) || 0,
    google_manifestation: Number(plan.manifestation_energy) || 0,
    aura_narration: auraNarration + days * AD_REWARD_DAILY_LIMIT * split.narration,
    aura_manifestation: auraManifestation + days * AD_REWARD_DAILY_LIMIT * split.manifestation,
    aura_save: auraSave,
  };
}

/**
 * Read the user's purchase-ledger rows with the service role. A failed read is
 * reported as `unavailable` rather than as "no purchases": the two must not be
 * confused, because an internal read failure is not something a client can
 * cause, and it must never be the reason a paying subscriber is treated as paid
 * *or* as lapsed by a call that cannot tell the difference.
 */
export async function fetchLedgerRows(base44, userId) {
  if (!userId) return { rows: [], unavailable: false };
  try {
    const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
      user_id: userId,
    });
    const list = Array.isArray(rows) ? rows : rows?.items || [];
    // Defense in depth: keep only this user's rows even though the query filter
    // already constrains it.
    return { rows: list.filter((row) => row && row.user_id === userId), unavailable: false };
  } catch (error) {
    console.log('Entitlement: ledger read failed:', error?.message || error);
    return { rows: [], unavailable: true };
  }
}

/**
 * The server's answer for one user: which plan they hold, from which stores, the
 * ceilings their balances may reach, and the grant marker.
 *
 * Admins hold full access (unchanged app behavior). Everyone else resolves from
 * the ledger. When the ledger could not be read at all, the resolution is the
 * free tier — no paid path is granted from an unverifiable source — and the
 * caller is told so via `ledgerUnavailable`.
 */
export async function resolveTrustedEntitlement(base44, user, now = new Date()) {
  if (!user?.id) {
    return {
      planId: 'observer',
      isAdmin: false,
      isPaid: false,
      rows: [],
      stores: new Set(),
      ceilings: energyCeilings({ planId: 'observer', rows: [], createdAt: null, now }),
      marker: 'no-ledger-rows',
      ledgerUnavailable: false,
    };
  }

  const { rows, unavailable } = await fetchLedgerRows(base44, user.id);
  const isAdmin = user.role === 'admin';
  const planId = isAdmin ? 'trailblazer' : planIdFromLedgerRows(rows, now);

  return {
    planId,
    isAdmin,
    isPaid: isAdmin || planId !== 'observer',
    rows,
    stores: activeStores(rows, now),
    ceilings: energyCeilings({ planId, rows, createdAt: user.created_date, now }),
    marker: ledgerMarker(rows),
    ledgerUnavailable: unavailable,
    // Which monthly pools this entitlement may spend from. The generic pools
    // belong to the Apple/Wix grant, the google_* pools to the Play grant, so a
    // lapsed Play plan cannot spend Apple energy and vice versa.
    genericAllowed: isAdmin || [...activeStores(rows, now)].some((store) => store !== GOOGLE_TRAILBLAZER_STORE),
    googleAllowed: isAdmin || activeStores(rows, now).has(GOOGLE_TRAILBLAZER_STORE),
  };
}

/** Explorer+ may generate tours; Seeker/Technician are paid but cannot. */
export function canGenerateForPlan(planId, isAdmin) {
  if (isAdmin) return true;
  return planId === 'explorer' || planId === 'investigator' || planId === 'trailblazer';
}

/** The plan's display expiration for the client, from the trusted resolution. */
export function entitlementExpiration(entitlement, now = new Date()) {
  let max = null;
  for (const row of activeLedgerRows(entitlement?.rows, now)) {
    const ms = new Date(row.plan_expiration_date).getTime();
    if (Number.isFinite(ms) && (max === null || ms > max)) max = ms;
  }
  return max === null ? null : new Date(max).toISOString();
}