// Access-gating audit checks — run with: node verify-access-gating.mjs
//
// Exercises the SERVER-side plan resolver (base44/shared/access.js) — the module
// every backend function authorizes against — across the cases that decide paid
// access: a missing record, a missing plan, an unknown or crafted plan value, an
// expired subscription, a cancelled subscription, an invalid expiration, a valid
// active subscription, an isolated Google grant, and an admin.
//
// The client mirror (src/lib/access.js) resolves the same cases with the same
// rules; this script covers the module the server actually trusts.
import {
  getEffectivePlanId,
  isKnownPlanId,
  isPaidAccess,
  canGenerate,
} from './base44/shared/access.js';

const now = new Date('2026-10-14T00:00:00Z');
const future = '2027-01-01T00:00:00Z';
const past = '2026-01-01T00:00:00Z';

let passed = 0;
let failed = 0;
const check = (name, actual, expected) => {
  const ok = actual === expected;
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — expected ${expected}, got ${actual}`}`);
};

const plan = (user) => getEffectivePlanId(user, now);
const paid = (user) => isPaidAccess(user, now);

// ── No record at all (unreadable / not loaded) ──
check('missing user record resolves to free', plan(null), 'observer');
check('missing user record is not paid', paid(null), false);
check('missing user record cannot generate', canGenerate(null, now), false);

// ── No plan field on the record ──
check('record without a plan resolves to free', plan({ id: 'u1' }), 'observer');
check('record without a plan is not paid', paid({ id: 'u1' }), false);

// ── Unknown / crafted / mistyped plan values ──
const bogusPlans = ['premium', 'TRAILBLAZER', 'admin', 'aura_bundle_80', 'trailblazer ', '', 0, null, {}, ['trailblazer']];
for (const bogus of bogusPlans) {
  check(`unknown plan ${JSON.stringify(bogus)} resolves to free`, plan({ plan: bogus }), 'observer');
  check(`unknown plan ${JSON.stringify(bogus)} is not paid`, paid({ plan: bogus }), false);
  check(`unknown plan ${JSON.stringify(bogus)} cannot generate`, canGenerate({ plan: bogus }, now), false);
}
check('isKnownPlanId rejects a crafted value', isKnownPlanId('premium'), false);
check('isKnownPlanId accepts a real tier', isKnownPlanId('investigator'), true);

// ── The free tier stays free ──
check('observer is not paid', paid({ plan: 'observer' }), false);

// ── Expired / cancelled subscriptions ──
check('expired subscription resolves to free', plan({ plan: 'investigator', plan_expiration_date: past }), 'observer');
check('expired subscription is not paid', paid({ plan: 'investigator', plan_expiration_date: past }), false);
check('expired subscription cannot generate', canGenerate({ plan: 'explorer', plan_expiration_date: past }, now), false);
check('cancelled without a future expiry resolves to free', plan({ plan: 'seeker', subscription_status: 'canceled' }), 'observer');
check('expired status without a future expiry resolves to free', plan({ plan: 'seeker', subscription_status: 'expired' }), 'observer');
check('invalid expiration value resolves to free', plan({ plan: 'explorer', plan_expiration_date: 'not-a-date' }), 'observer');
check('expired Google grant resolves to free', plan({ google_trailblazer_expiration_date: past }), 'observer');

// ── Valid active subscriptions keep working ──
check('active subscription resolves to its tier', plan({ plan: 'investigator', plan_expiration_date: future }), 'investigator');
check('active subscription is paid', paid({ plan: 'investigator', plan_expiration_date: future }), true);
check('active subscription can generate', canGenerate({ plan: 'explorer', plan_expiration_date: future }, now), true);
check('active Google grant resolves to trailblazer', plan({ google_trailblazer_expiration_date: future }), 'trailblazer');
check('higher active tier wins', plan({ plan: 'seeker', plan_expiration_date: future, google_trailblazer_expiration_date: future }), 'trailblazer');

// ── Admin ──
check('admin keeps full access', paid({ role: 'admin', plan: 'observer' }), true);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);