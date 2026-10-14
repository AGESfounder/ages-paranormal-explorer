// Server-owned energy account: the single authority for energy balances, ad-gated
// tool time, the daily evidence-save counter and the ad-reward counter.
//
// Why it exists: a User record's custom fields are writable by their own owner,
// so balances kept there can be added to, and a balance that gates paid work must
// not be client-writable. The account row is admin-write-only (see
// base44/entities/EnergyAccount.jsonc); the app's backend functions write it with
// the service role, and the User record only ever carries a DISPLAY MIRROR of it.
//
// Two rules make the account trustworthy:
//
//  1. ABSORB, ONCE PER GRANT. The mirror is taken into the account only when the
//     purchase ledger has moved (its marker changed) or on first use, and never
//     above the entitlement ceilings (see shared/entitlement.js). A forged record
//     therefore cannot top up a spent balance — the marker only a provider
//     webhook can advance is what allows an absorb at all.
//
//  2. GUARDED SPENDS. Every spend is a single-document conditional update
//     (`field: { $gte: amount }` + `$inc`), so a balance can never go below zero
//     and two concurrent requests cannot spend the same unit twice. What actually
//     applied is measured by re-reading the row, and a shortfall is compensated
//     rather than overcharged.

import { AD_REWARD_DAILY_LIMIT } from './adRewards.js';

// Account pool → User record display field.
export const MIRROR_FIELDS = {
  narration: 'narration_energy',
  manifestation: 'manifestation_energy',
  google_narration: 'google_trailblazer_narration_energy',
  google_manifestation: 'google_trailblazer_manifestation_energy',
  aura_narration: 'aura_narration_energy',
  aura_manifestation: 'aura_manifestation_energy',
  aura_save: 'aura_save_energy',
};

export const ENERGY_POOLS = Object.keys(MIRROR_FIELDS);

// Keep the idempotency marker list bounded; it only guards a short window of
// retries, and a spend id is generated fresh per request by the caller.
const MAX_SPEND_REQUESTS = 200;

const toCount = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The balances a fresh account starts from, capped by the entitlement ceilings. */
export function seedBalances(record, ceilings) {
  const out = {};
  for (const pool of ENERGY_POOLS) {
    const mirrored = toCount(record?.[MIRROR_FIELDS[pool]]);
    const ceiling = toCount(ceilings?.[pool]);
    out[pool] = Math.min(mirrored, ceiling);
  }
  return out;
}

/**
 * Take the User record mirror into the account, capped by the ceilings, only when
 * the grant marker has moved (or the account has none yet). Absorbing only ever
 * raises a pool, so a spend that already happened is never undone. Pure — it
 * returns the fields to write, or null when there is nothing to do.
 */
export function absorbFields(account, record, ceilings, marker) {
  if (!account || !record) return null;
  if (account.grant_marker && account.grant_marker === marker) return null;

  const fields = {};
  for (const pool of ENERGY_POOLS) {
    const mirrored = toCount(record[MIRROR_FIELDS[pool]]);
    const capped = Math.min(mirrored, toCount(ceilings?.[pool]));
    if (capped > toCount(account[pool])) fields[pool] = capped;
  }
  fields.grant_marker = marker;
  return fields;
}

/**
 * The display mirror the User record should carry. Pure. The record stays what
 * the UI reads; it is never what the server believes.
 */
export function mirrorFields(account) {
  const out = {};
  for (const pool of ENERGY_POOLS) out[MIRROR_FIELDS[pool]] = toCount(account?.[pool]);
  out.evidence_save_count = toCount(account?.save_count);
  out.evidence_save_date = account?.save_date || null;
  out.tool_banks = account?.tool_banks || null;
  out.tool_banks_date = account?.tool_banks_date || null;
  out.ad_rewards_count = toCount(account?.ad_count);
  out.ad_rewards_date = account?.ad_date || null;
  return out;
}

/** Whether two mirror snapshots differ (skip a pointless write). Pure. */
export function mirrorDiffers(record, mirrored) {
  if (!record) return false;
  for (const [key, value] of Object.entries(mirrored)) {
    const current = record[key] ?? null;
    if (current !== value) return true;
  }
  return false;
}

/**
 * Which pools a spend draws from, in the app's existing order, and whether the
 * balance covers it. Pure: the caller passes the account, the confirmed provider
 * sources, and the request id, so the decision can be tested directly.
 *
 * kinds:
 *   narration        → Google monthly → generic monthly → Aura narration
 *   manifestation    → Google monthly → generic monthly → Aura manifestation
 *   evidence_save_seeker → Aura save only (Seeker/Technician)
 *   evidence_save_paid   → Aura narration → Aura manifestation (Explorer+)
 */
export function planSpend(account, { kind, cost, requestId, genericAllowed = true, googleAllowed = false }) {
  if (requestId && Array.isArray(account?.spend_requests) && account.spend_requests.includes(requestId)) {
    return { ok: true, duplicate: true, pools: [] };
  }

  const amount = toCount(cost);
  if (!amount) return { ok: false, reason: 'bad_cost', pools: [] };

  let order;
  if (kind === 'narration') {
    order = [['google_narration', googleAllowed], ['narration', genericAllowed], ['aura_narration', true]];
  } else if (kind === 'manifestation') {
    order = [['google_manifestation', googleAllowed], ['manifestation', genericAllowed], ['aura_manifestation', true]];
  } else if (kind === 'evidence_save_seeker') {
    // No fallback into the 80/20 Aura pools — the tier's save allowance is all it has.
    order = [['aura_save', true]];
  } else if (kind === 'evidence_save_paid') {
    order = [['aura_narration', true], ['aura_manifestation', true]];
  } else {
    return { ok: false, reason: 'bad_kind', pools: [] };
  }

  const available = [];
  let total = 0;
  for (const [field, allowed] of order) {
    if (!allowed) continue;
    const balance = toCount(account?.[field]);
    if (balance > 0) {
      available.push([field, balance]);
      total += balance;
    }
  }
  if (total < amount) return { ok: false, reason: 'insufficient', pools: [], available: total };

  const pools = [];
  let remaining = amount;
  for (const [field, balance] of available) {
    if (remaining <= 0) break;
    const take = Math.min(balance, remaining);
    pools.push({ field, amount: take });
    remaining -= take;
  }
  return { ok: true, pools, available: total };
}

/** Read the account row (service role). */
export async function readAccount(base44, userId) {
  const rows = await base44.asServiceRole.entities.EnergyAccount.filter({ user_id: userId });
  const list = Array.isArray(rows) ? rows : rows?.items || [];
  return list[0] || null;
}

/** Write the User record display mirror when it drifted (forged or stale). */
export async function mirrorToRecord(base44, userId, account) {
  if (!userId || !account) return;
  const mirrored = mirrorFields(account);
  let record = null;
  try {
    record = await base44.asServiceRole.entities.User.get(userId);
  } catch {
    record = null; // still write the mirror: a read failure must not skip it
  }
  if (record && !mirrorDiffers(record, mirrored)) return;
  await base44.asServiceRole.entities.User.update(userId, mirrored);
}

/**
 * Load (or create) the account for a user, absorbing any fresh provider grants
 * from the record mirror and re-mirroring the result back onto the record.
 */
export async function loadEnergyAccount(base44, user, entitlement) {
  let account = await readAccount(base44, user.id);

  if (!account) {
    const seed = seedBalances(user, entitlement.ceilings);
    account = await base44.asServiceRole.entities.EnergyAccount.create({
      user_id: user.id,
      ...seed,
      tool_banks: user.tool_banks || null,
      tool_banks_date: user.tool_banks_date || null,
      save_count: 0,
      save_date: null,
      ad_count: 0,
      ad_date: null,
      spend_requests: [],
      grant_marker: entitlement.marker,
      seeded_at: new Date().toISOString(),
    });
  } else {
    const fields = absorbFields(account, user, entitlement.ceilings, entitlement.marker);
    if (fields) {
      account = await base44.asServiceRole.entities.EnergyAccount.update(account.id, fields);
    }
    if ((account.spend_requests || []).length > MAX_SPEND_REQUESTS) {
      account = await base44.asServiceRole.entities.EnergyAccount.update(account.id, {
        spend_requests: [],
      });
    }
  }

  await mirrorToRecord(base44, user.id, account);
  return account;
}

/**
 * Apply a planned spend to the account.
 *
 * Each pool is decremented by a guarded conditional update, so the balance can
 * never go negative and a concurrent request cannot take the same units. What
 * actually landed is measured by re-reading the row; if the pools could not cover
 * the whole cost (a concurrent spend got there first), everything this request
 * took is put back and the spend is reported as insufficient rather than charged.
 */
export async function applySpend(base44, account, pools, requestId) {
  let before = account;
  const applied = [];

  for (const { field, amount } of pools) {
    const start = toCount(before?.[field]);
    if (start <= 0) continue;
    const take = Math.min(start, amount);

    await base44.asServiceRole.entities.EnergyAccount.updateMany(
      { id: before.id, [field]: { $gte: take } },
      { $inc: { [field]: -take } },
    );

    const fresh = await readAccount(base44, account.user_id);
    if (!fresh) break;
    const removed = Math.max(0, start - toCount(fresh[field]));
    if (removed > 0) applied.push({ field, amount: removed });
    before = fresh;

    if (applied.reduce((sum, entry) => sum + entry.amount, 0) >= pools.reduce((sum, p) => sum + p.amount, 0)) {
      break;
    }
  }

  const wanted = pools.reduce((sum, p) => sum + p.amount, 0);
  const spent = applied.reduce((sum, entry) => sum + entry.amount, 0);

  if (spent < wanted) {
    for (const { field, amount } of applied) {
      await base44.asServiceRole.entities.EnergyAccount.updateMany(
        { id: account.id },
        { $inc: { [field]: amount } },
      );
    }
    return { ok: false, reason: 'insufficient', spent: 0 };
  }

  // Mark the request as spent only after the whole cost landed: a request that
  // failed is retryable with the same id, one that succeeded is not.
  const markFields = { spend_requests: [...(before.spend_requests || []), requestId].slice(-MAX_SPEND_REQUESTS) };
  const updated = await base44.asServiceRole.entities.EnergyAccount.update(account.id, {
    ...markFields,
    grant_marker: before.grant_marker,
  });

  // Keep the User record's display mirror in step with the authoritative balance.
  await mirrorToRecord(base44, account.user_id, updated);

  return { ok: true, spent, account: updated };
}

/** Add energy to an account (grants: rewarded ads, admin grants). */
export async function grantEnergy(base44, userId, deltas, extraFields = {}) {
  const account = await readAccount(base44, userId);
  if (!account) return null;

  const inc = {};
  for (const [pool, amount] of Object.entries(deltas || {})) {
    const value = toCount(amount);
    if (ENERGY_POOLS.includes(pool) && value > 0) inc[pool] = value;
  }

  if (Object.keys(inc).length || Object.keys(extraFields).length) {
    // Atomic increments, so two grants arriving together both land.
    await base44.asServiceRole.entities.EnergyAccount.updateMany(
      { id: account.id },
      {
        ...(Object.keys(inc).length ? { $inc: inc } : {}),
        ...(Object.keys(extraFields).length ? { $set: extraFields } : {}),
      },
    );
  }

  const updated = await readAccount(base44, userId);
  if (updated) await mirrorToRecord(base44, userId, updated);
  return updated;
}

/** Set explicit account fields (tool banks, daily counters, save charge). */
export async function setAccountFields(base44, account, fields) {
  if (!account || !fields || !Object.keys(fields).length) return account;
  const updated = await base44.asServiceRole.entities.EnergyAccount.update(account.id, fields);
  await mirrorToRecord(base44, account.user_id, updated);
  return updated;
}

/** The ad-reward daily count for today, from the account. Pure. */
export function adCountToday(account, today) {
  if (!account || account.ad_date !== today) return 0;
  return toCount(account.ad_count);
}

export function adRewardRemaining(account, today) {
  return Math.max(0, AD_REWARD_DAILY_LIMIT - adCountToday(account, today));
}

// A refund may only reverse the pools an evidence save can charge.
export const REFUNDABLE_POOLS = ['aura_save', 'aura_narration', 'aura_manifestation'];
// A save whose Evidence.create failed does so within seconds, so an older charge
// is never paid back — a save that actually succeeded cannot be claimed later.
export const REFUND_WINDOW_MS = 5 * 60 * 1000;

/**
 * Whether the charge the server itself recorded on this account may be reversed,
 * and what it was. Pure: the account row is the only input, so a client-supplied
 * cost, user id or success claim cannot reach the decision. The charge is read
 * from the account (admin-write-only), which is what makes a forged "pending
 * charge" impossible.
 */
export function planRefund(account, now = new Date()) {
  const pending = account?.save_charge;
  if (!pending || typeof pending !== 'object' || typeof pending.cost !== 'string') {
    return { ok: false, reason: 'no_charge' };
  }

  const atMs = Date.parse(pending.at);
  if (!Number.isFinite(atMs) || now.getTime() - atMs > REFUND_WINDOW_MS) {
    return { ok: false, reason: 'stale_charge', cost: pending.cost };
  }

  if (pending.cost === 'free') {
    return { ok: true, kind: 'daily_save', cost: 'free' };
  }

  if (!REFUNDABLE_POOLS.includes(pending.cost)) {
    // A charge naming anything else is not a pool this app refunds: clear it and
    // report, rather than crediting an arbitrary field.
    return { ok: false, reason: 'unknown_pool', cost: pending.cost };
  }

  return { ok: true, kind: 'aura', pool: pending.cost, cost: pending.cost };
}

/** Zero an account's balances and counters (tester reset). */
export async function resetAccount(base44, userId) {
  const account = await readAccount(base44, userId);
  if (!account) return null;
  const zeroed = {};
  for (const pool of ENERGY_POOLS) zeroed[pool] = 0;
  const updated = await base44.asServiceRole.entities.EnergyAccount.update(account.id, {
    ...zeroed,
    save_count: 0,
    save_date: null,
    save_charge: null,
    ad_count: 0,
    ad_date: null,
    tool_banks: null,
    tool_banks_date: null,
    spend_requests: [],
  });
  await mirrorToRecord(base44, userId, updated);
  return updated;
}