// Access-gating and energy checks — run with: node verify-access-gating.mjs
//
// Exercises the real decision modules the backend authorizes with:
//   base44/shared/access.js       — the plan/rank helpers
//   base44/shared/entitlement.js  — trusted plan resolution from the purchase ledger
//   base44/shared/energy.js       — the server-owned energy account decisions
//
// Every case below feeds FORGED user records and crafted/expired/missing ledger
// rows, so what is verified is the decision itself, not a happy path.

import {
  getEffectivePlanId,
  isKnownPlanId,
  isPaidAccess,
  canGenerate,
} from './base44/shared/access.js';
import {
  planIdFromLedgerRows,
  planForLedgerProduct,
  activeLedgerRows,
  activeStores,
  ledgerMarker,
  energyCeilings,
  canGenerateForPlan,
  resolveTrustedEntitlement,
} from './base44/shared/entitlement.js';
import {
  APPLE_SUBSCRIPTION_PRODUCTS,
  GOOGLE_SUBSCRIPTION_PRODUCTS,
} from './base44/shared/revenuecat.js';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { verifyPaidAi } from './verify-paid-ai.mjs';
import { eventAlreadyApplied, mergeEventIds } from './base44/shared/webhookCommon.ts';
import {
  planSpend,
  planRefund,
  seedBalances,
  absorbFields,
  mirrorFields,
} from './base44/shared/energy.js';

const now = new Date('2026-10-14T00:00:00Z');
const future = '2027-01-01T00:00:00Z';
const past = '2026-01-01T00:00:00Z';

let passed = 0;
let failed = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
};
const section = (title) => console.log(`\n── ${title} ──`);

const plan = (user) => getEffectivePlanId(user, now);
const paid = (user) => isPaidAccess(user, now);

// Ledger rows as the provider webhooks write them.
const activeRow = (plan_id_product, overrides = {}) => ({
  user_id: 'u1',
  product_id: plan_id_product,
  store: 'APP_STORE',
  status: 'active',
  plan_expiration_date: future,
  updated_date: '2026-10-01T00:00:00.000Z',
  ...overrides,
});
const APPLE_EXPLORER = 'com.ages.explorer.explorer.monthly';
const APPLE_TRAILBLAZER = 'com.ages.explorer.trailblazer.30month';
const PLAY_EXPLORER = 'explorer:monthly';
const PLAY_TRAILBLAZER = 'trailblazer.30month';

const forgedRecord = (extra = {}) => ({
  id: 'u1',
  role: 'user',
  plan: 'trailblazer',
  plan_expiration_date: future,
  subscription_status: 'active',
  created_date: '2026-09-01T00:00:00.000Z',
  ...extra,
});

// ── The plan resolver the record no longer decides ──────────────────────────
section('Record-based resolution (unchanged helper behavior)');
check('missing user record resolves to free', plan(null), 'observer');
check('record without a plan resolves to free', plan({ id: 'u1' }), 'observer');
for (const bogus of ['premium', 'TRAILBLAZER', 'admin', '', 0, null, {}, ['trailblazer']]) {
  check(`unknown plan ${JSON.stringify(bogus)} resolves to free`, plan({ plan: bogus }), 'observer');
}
check('expired subscription resolves to free', plan({ plan: 'investigator', plan_expiration_date: past }), 'observer');
check('cancelled without a future expiry resolves to free', plan({ plan: 'seeker', subscription_status: 'canceled' }), 'observer');
check('isKnownPlanId rejects a crafted value', isKnownPlanId('premium'), false);

// ── Trusted resolution: the purchase ledger decides ─────────────────────────
section('Trusted plan resolution (purchase ledger only)');
check('apple subscription product maps to its plan', planForLedgerProduct(APPLE_EXPLORER), 'explorer');
check('play subscription product maps to its plan', planForLedgerProduct(PLAY_EXPLORER), 'explorer');
check('trailblazer one-time product maps to trailblazer', planForLedgerProduct(APPLE_TRAILBLAZER), 'trailblazer');
check('play trailblazer product maps to trailblazer', planForLedgerProduct(PLAY_TRAILBLAZER), 'trailblazer');
check('aura bundle is not a plan', planForLedgerProduct('com.ages.explorer.aura.flicker'), null);

// Regression guard: every product in both store catalogs must resolve to a plan
// this app knows, or a real subscriber would silently resolve as free.
let catalogResolves = true;
for (const id of Object.keys(APPLE_SUBSCRIPTION_PRODUCTS)) {
  if (!isKnownPlanId(planForLedgerProduct(id))) catalogResolves = false;
}
for (const id of Object.keys(GOOGLE_SUBSCRIPTION_PRODUCTS)) {
  if (!isKnownPlanId(planForLedgerProduct(id))) catalogResolves = false;
}
check('every catalog plan product resolves to a known plan', catalogResolves, true);
check('apple catalog is not empty', Object.keys(APPLE_SUBSCRIPTION_PRODUCTS).length > 0, true);
check('play catalog is not empty', Object.keys(GOOGLE_SUBSCRIPTION_PRODUCTS).length > 0, true);

check('no ledger rows → observer', planIdFromLedgerRows([], now), 'observer');
check('active row → its plan', planIdFromLedgerRows([activeRow(APPLE_EXPLORER)], now), 'explorer');
check('higher active plan wins', planIdFromLedgerRows([
  activeRow(APPLE_EXPLORER),
  activeRow(APPLE_TRAILBLAZER),
], now), 'trailblazer');
check('expired row → observer', planIdFromLedgerRows([
  activeRow(APPLE_EXPLORER, { plan_expiration_date: past }),
], now), 'observer');
check('refunded row → observer', planIdFromLedgerRows([
  activeRow(APPLE_EXPLORER, { status: 'refunded' }),
], now), 'observer');
check('active status with no expiration → observer', planIdFromLedgerRows([
  activeRow(APPLE_EXPLORER, { plan_expiration_date: null }),
], now), 'observer');
check('crafted product id → observer', planIdFromLedgerRows([
  activeRow('premium.everything.forever'),
], now), 'observer');
check('another users row is ignored in counting', planIdFromLedgerRows([
  { ...activeRow(APPLE_TRAILBLAZER), user_id: 'someone-else' },
], now), 'trailblazer');

section('Forged record + ledger (the user edits their own plan)');
const forgedNoRows = planIdFromLedgerRows([], now);
check('forged trailblazer record, no rows → observer', forgedNoRows, 'observer');
check('forged trailblazer record, no rows → not paid', forgedNoRows !== 'observer', false);
check('forged record cannot generate', canGenerateForPlan(forgedNoRows, false), false);
check('forged record + expired row → observer', planIdFromLedgerRows([
  activeRow(APPLE_TRAILBLAZER, { plan_expiration_date: past }),
], now), 'observer');
check('forged record + refunded row → observer', planIdFromLedgerRows([
  activeRow(APPLE_TRAILBLAZER, { status: 'refunded' }),
], now), 'observer');

section('Valid active subscribers keep their access');
check('apple explorer → paid', planIdFromLedgerRows([activeRow(APPLE_EXPLORER)], now), 'explorer');
check('apple explorer can generate', canGenerateForPlan(planIdFromLedgerRows([activeRow(APPLE_EXPLORER)], now), false), true);
check('trailblazer can generate', canGenerateForPlan(planIdFromLedgerRows([activeRow(APPLE_TRAILBLAZER)], now), false), true);
check('seeker is paid but cannot generate', canGenerateForPlan('seeker', false), false);
check('technician is paid but cannot generate', canGenerateForPlan('technician', false), false);
check('admin keeps full access', canGenerateForPlan('observer', true), true);
check('play-only subscriber resolves', planIdFromLedgerRows([
  activeRow(PLAY_EXPLORER, { store: 'PLAY_STORE' }),
], now), 'explorer');

section('Which provider pools an entitlement may spend from');
check('app_store row → generic pools only', [...activeStores([activeRow(APPLE_EXPLORER)], now)], ['APP_STORE']);
check('play row → play pool', [...activeStores([activeRow(PLAY_EXPLORER, { store: 'PLAY_STORE' })], now)], ['PLAY_STORE']);
check('marker moves with the ledger', ledgerMarker([activeRow(APPLE_EXPLORER)]), '2026-10-01T00:00:00.000Z');
check('empty ledger has a stable marker', ledgerMarker([]), 'no-ledger-rows');

// ── Missing / unreadable subscription data ──────────────────────────────────
section('Missing and unreadable subscription data (server calls, real code)');
const ledgerClient = (rows) => ({
  asServiceRole: { entities: { RevenueCatPurchase: { filter: async () => rows } } },
});
const failingClient = {
  asServiceRole: {
    entities: { RevenueCatPurchase: { filter: async () => { throw new Error('ledger down'); } } },
  },
};

const noRows = await resolveTrustedEntitlement(ledgerClient([]), forgedRecord(), now);
check('forged record, no ledger rows → observer', noRows.planId, 'observer');
check('forged record, no ledger rows → not paid', noRows.isPaid, false);

const down = await resolveTrustedEntitlement(failingClient, forgedRecord(), now);
check('unreadable ledger → observer', down.planId, 'observer');
check('unreadable ledger → not paid', down.isPaid, false);
check('unreadable ledger is flagged', down.ledgerUnavailable, true);

const real = await resolveTrustedEntitlement(ledgerClient([activeRow(APPLE_TRAILBLAZER)]), forgedRecord(), now);
check('active ledger row → trailblazer', real.planId, 'trailblazer');
check('active ledger row → paid', real.isPaid, true);
check('active ledger row → generic pools allowed', real.genericAllowed, true);
check('active app store row → play pool not allowed', real.googleAllowed, false);

// ── Energy ceilings: an inflated record cannot carry energy in ───────────────
section('Energy ceilings and absorb (adding energy to your own record)');
const observerCeilings = energyCeilings({ planId: 'observer', rows: [], createdAt: '2026-10-13T00:00:00.000Z', now });
const inflated = {
  narration_energy: 999999,
  manifestation_energy: 999999,
  aura_narration_energy: 999999,
  aura_manifestation_energy: 999999,
  aura_save_energy: 999999,
  google_trailblazer_narration_energy: 999999,
  google_trailblazer_manifestation_energy: 999999,
};
const seeded = seedBalances(inflated, observerCeilings);
check('inflated monthly narration is capped to the free allowance', seeded.narration, 0);
check('inflated monthly manifestation is capped to the free allowance', seeded.manifestation, 0);
check('inflated aura_save is capped (no ad source for save energy)', seeded.aura_save, 0);
check('inflated aura narration is capped to the ad allowance', seeded.aura_narration, observerCeilings.aura_narration);
check('inflated aura manifestation is capped to the ad allowance', seeded.aura_manifestation, observerCeilings.aura_manifestation);
check('the ad allowance is bounded per day of account life', observerCeilings.aura_narration, 5 * 4);
check('a forged balance is cut to something a person could have won', seeded.aura_narration < 1000, true);

const explorerCeilings = energyCeilings({
  planId: 'explorer',
  rows: [activeRow(APPLE_EXPLORER, { aura_narration_granted: 150, aura_manifestation_granted: 40, aura_save_granted: 0 })],
  createdAt: '2026-10-13T00:00:00.000Z',
  now,
});
const legit = seedBalances({ narration_energy: 300, manifestation_energy: 9, aura_narration_energy: 120, aura_manifestation_energy: 40 }, explorerCeilings);
check('legitimate balances survive seeding', legit.narration, 300);
check('legitimate balances survive seeding (manifestation)', legit.manifestation, 9);
check('legitimate aura within the purchased ceiling survives', legit.aura_narration, 120);

const account = { narration: 300, aura_narration: 0, aura_save: 0, grant_marker: 'same' };
check('absorb does nothing while the grant marker is unchanged', absorbFields(account, inflated, explorerCeilings, 'same'), null);
const absorbed = absorbFields(account, inflated, explorerCeilings, 'advanced');
check('absorb caps a forged monthly balance at the plan allowance', absorbed.narration, 800);
check('absorb caps forged aura at the purchase ceiling plus the ad allowance', absorbed.aura_narration, explorerCeilings.aura_narration);
check('the purchase ceiling is what the ledger recorded', explorerCeilings.aura_narration >= 150, true);
check('absorb never lowers a spent balance', absorbFields({ narration: 500, grant_marker: 'old' }, { narration_energy: 1 }, explorerCeilings, 'new'), { grant_marker: 'new' });
check('mirror maps balances onto the record fields', mirrorFields({ narration: 12, aura_save: 3 }).narration_energy, 12);
check('mirror maps aura save', mirrorFields({ aura_save: 3 }).aura_save_energy, 3);

// ── Spend decisions: insufficient energy, pool order, concurrency markers ────
section('Energy spend decisions');
const low = { narration: 2, manifestation: 0, google_narration: 0, google_manifestation: 0, aura_narration: 0, aura_manifestation: 0, aura_save: 0, spend_requests: [] };
check('narration cost above the balance is refused', planSpend(low, { kind: 'narration', cost: 5, requestId: 'r1' }).reason, 'insufficient');
check('manifestation with an empty pool is refused', planSpend(low, { kind: 'manifestation', cost: 1, requestId: 'r2' }).reason, 'insufficient');
check('a duplicate request id spends nothing', planSpend({ ...low, spend_requests: ['r3'] }, { kind: 'narration', cost: 1, requestId: 'r3' }), { ok: true, duplicate: true, pools: [] });
check('a zero cost is refused', planSpend(low, { kind: 'narration', cost: 0, requestId: 'r4' }).reason, 'bad_cost');

const rich = { narration: 5, manifestation: 1, google_narration: 7, google_manifestation: 3, aura_narration: 4, aura_manifestation: 2, aura_save: 6, spend_requests: [] };
check('play monthly is spent first', planSpend(rich, { kind: 'narration', cost: 3, requestId: 'r5', googleAllowed: true }).pools, [{ field: 'google_narration', amount: 3 }]);
check('app store pool is skipped when only play is confirmed', planSpend(rich, { kind: 'narration', cost: 3, requestId: 'r6', genericAllowed: true, googleAllowed: false }).pools, [{ field: 'narration', amount: 3 }]);
check('a spend spanning pools stays in order', planSpend({ ...rich, google_narration: 2 }, { kind: 'narration', cost: 4, requestId: 'r7', googleAllowed: true }).pools, [
  { field: 'google_narration', amount: 2 },
  { field: 'narration', amount: 2 },
]);
check('aura is the last resort', planSpend({ ...rich, google_narration: 0, narration: 0 }, { kind: 'narration', cost: 3, requestId: 'r8', googleAllowed: true }).pools, [{ field: 'aura_narration', amount: 3 }]);
check('seeker evidence saves draw on aura_save only', planSpend(rich, { kind: 'evidence_save_seeker', cost: 1, requestId: 'r9' }).pools, [{ field: 'aura_save', amount: 1 }]);
check('seeker evidence save is blocked with no save energy', planSpend({ ...rich, aura_save: 0 }, { kind: 'evidence_save_seeker', cost: 1, requestId: 'r10' }).reason, 'insufficient');
check('explorer evidence saves draw on aura narration then manifestation', planSpend({ ...rich, aura_narration: 0 }, { kind: 'evidence_save_paid', cost: 1, requestId: 'r11' }).pools, [{ field: 'aura_manifestation', amount: 1 }]);

// Two callers that both read the same balance cannot both plan the full amount
// against it: whichever guarded update lands second finds the pool short.
const bothRead = { ...rich, narration: 5, google_narration: 0, aura_narration: 0 };
check('first concurrent caller can plan the whole balance', planSpend(bothRead, { kind: 'narration', cost: 5, requestId: 'c1' }).ok, true);
check('the same request re-planned reports a duplicate', planSpend({ ...bothRead, spend_requests: ['c1'] }, { kind: 'narration', cost: 5, requestId: 'c1' }).duplicate, true);
check('once the balance is gone the second caller is refused', planSpend({ ...bothRead, narration: 0 }, { kind: 'narration', cost: 5, requestId: 'c2' }).reason, 'insufficient');

// ── Refund decisions ────────────────────────────────────────────────────────
section('Refund decisions (server-recorded charge only)');
check('no recorded charge → no refund', planRefund({ save_charge: null }, now).reason, 'no_charge');
check('a forged claim is not an input at all', planRefund({}, now).reason, 'no_charge');
check('a fresh aura charge is refundable', planRefund({ save_charge: { cost: 'aura_narration', at: now.toISOString() } }, now), { ok: true, kind: 'aura', pool: 'aura_narration', cost: 'aura_narration' });
check('a fresh daily save is refundable', planRefund({ save_charge: { cost: 'free', at: now.toISOString() } }, now).kind, 'daily_save');
check('a stale charge is refused', planRefund({ save_charge: { cost: 'aura_narration', at: '2026-10-13T00:00:00.000Z' } }, now).reason, 'stale_charge');
check('an unknown recorded pool is refused', planRefund({ save_charge: { cost: 'narration', at: now.toISOString() } }, now).reason, 'unknown_pool');
check('an already-refunded charge (cleared) refunds nothing', planRefund({ save_charge: null, save_count: 3 }, now).reason, 'no_charge');
check('an invalid timestamp is refused', planRefund({ save_charge: { cost: 'free', at: 'not-a-date' } }, now).reason, 'stale_charge');

// ── Webhook idempotency (redelivered provider events) ───────────────────────
section('Provider event idempotency');
check('a first event is not yet applied', eventAlreadyApplied({ event_id: 'e1', event_ids: ['e1'] }, 'e2'), false);
check('a redelivered event is recognised', eventAlreadyApplied({ event_id: 'e1', event_ids: ['e1'] }, 'e1'), true);
check('an event already in the list is recognised', eventAlreadyApplied({ event_ids: ['e1', 'e2'] }, 'e2'), true);
check('merging keeps one copy of each event', mergeEventIds({ event_id: 'e1', event_ids: ['e1'] }, 'e1'), ['e1']);
check('merging adds a new event', mergeEventIds({ event_ids: ['e1'] }, 'e2'), ['e1', 'e2']);
check('an empty event id is ignored', eventAlreadyApplied({ event_id: 'e1' }, ''), false);

// ── Static guards: the shapes that must not come back ───────────────────────
section('Static guards on the authorization code paths');
const refundSrc = readFileSync('base44/functions/refund-evidence-save/entry.ts', 'utf8');
check('refund reads the charge from the caller\'s own account row', refundSrc.includes('readAccount(base44, user.id)'), true);
check('refund takes no user id from the request', /body\??\.\s*(user_id|userId)/.test(refundSrc), false);
check('refund decides from the recorded charge', refundSrc.includes('planRefund(account)'), true);
check('spend functions resolve the plan from the ledger', readFileSync('base44/functions/spend-evidence-save/entry.ts', 'utf8').includes('resolveTrustedEntitlement'), true);
check('spend functions never resolve the plan from the record', readFileSync('base44/functions/spend-evidence-save/entry.ts', 'utf8').includes('isPaidAccess(user)'), false);

const recordPlanReads = execSync(
  "grep -rn 'isPaidAccess(\\|getEffectivePlanId(' base44/functions base44/shared --include=*.ts --include=*.js | grep -v 'shared/access.js:' | grep -v 'shared/entitlement.js:' || true",
).toString().trim();
check('no authorization path resolves the plan from the user record', recordPlanReads, '');

const clientWrites = execSync(
  "grep -rn 'updateMe(' src/hooks/useEnergyGate.js src/hooks/useEvidenceSaveGate.js || true",
).toString().trim();
check('the client never writes an energy balance', clientWrites, '');

const accountSchema = readFileSync('base44/entities/EnergyAccount.jsonc', 'utf8');
check('energy account writes are admin-only', /"update": \{\s*"user_condition"/.test(accountSchema), true);
check('energy account reads are owner-scoped', accountSchema.includes('"data.user_id": "{{user.id}}"'), true);

await verifyPaidAi(check);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);