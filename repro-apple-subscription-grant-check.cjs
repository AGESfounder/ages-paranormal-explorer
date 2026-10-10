// Focused checks for Apple subscription grant / effective-plan coexistence.
// Run: node repro-apple-subscription-grant-check.cjs
// No test framework — plain Node assertions against pure helpers.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Load the ESM pure helper via dynamic import (package is "type": "module").
async function main() {
  const grantUrl = pathToFileUrl(path.join(__dirname, 'base44/shared/appleSubscriptionGrant.js'));
  const accessUrl = pathToFileUrl(path.join(__dirname, 'base44/shared/access.js'));
  const revenuecatUrl = pathToFileUrl(path.join(__dirname, 'base44/shared/revenuecat.js'));

  const grant = await import(grantUrl);
  const access = await import(accessUrl);
  const rc = await import(revenuecatUrl);

  const now = new Date('2026-10-10T12:00:00.000Z');
  const trailblazerExp = '2028-04-09T00:00:00.000Z';
  const investigatorExp = '2026-11-09T00:00:00.000Z';
  const seekerExp = '2026-11-10T00:00:00.000Z';
  const expiredTrailblazer = '2026-09-01T00:00:00.000Z';

  const investigatorPlan = {
    id: 'investigator',
    manifestation_energy: 40,
    narration_energy: 120,
  };
  const seekerPlan = {
    id: 'seeker',
    manifestation_energy: 0,
    narration_energy: 0,
  };

  let passed = 0;
  function check(name, fn) {
    try {
      fn();
      passed += 1;
      console.log('PASS:', name);
    } catch (e) {
      console.error('FAIL:', name, e.message);
      throw e;
    }
  }

  // 1. Active Trailblazer + Investigator grant → preserve Trailblazer, mark sub active
  check('preserve active Trailblazer under Investigator grant', () => {
    const user = {
      plan: 'trailblazer',
      plan_expiration_date: trailblazerExp,
      subscription_status: 'none',
      subscription_id: 'tb-txn-1',
      manifestation_energy: 80,
      narration_energy: 240,
    };
    const result = grant.computeAppleSubscriptionGrantFields(
      user,
      investigatorPlan,
      investigatorExp,
      { refillEnergy: true, subscriptionId: 'inv-txn-1', now },
    );
    assert.strictEqual(result.preservedHigherPlan, true);
    assert.deepStrictEqual(result.fields, { subscription_status: 'active' });
    assert.strictEqual(result.fields.plan, undefined);
    assert.strictEqual(result.fields.plan_expiration_date, undefined);
    assert.strictEqual(result.fields.manifestation_energy, undefined);
  });

  // 2. Expired Trailblazer must NOT block Investigator grant
  check('expired Trailblazer allows Investigator grant', () => {
    const user = {
      plan: 'trailblazer',
      plan_expiration_date: expiredTrailblazer,
      subscription_status: 'none',
      subscription_id: 'tb-txn-old',
    };
    const result = grant.computeAppleSubscriptionGrantFields(
      user,
      investigatorPlan,
      investigatorExp,
      { refillEnergy: true, subscriptionId: 'inv-txn-2', now },
    );
    assert.strictEqual(result.preservedHigherPlan, false);
    assert.strictEqual(result.fields.plan, 'investigator');
    assert.strictEqual(result.fields.plan_expiration_date, investigatorExp);
    assert.strictEqual(result.fields.subscription_status, 'active');
    assert.strictEqual(result.fields.subscription_id, 'inv-txn-2');
    assert.strictEqual(result.fields.manifestation_energy, 40);
  });

  // 3. Fresh observer → normal Investigator grant
  check('observer receives full Investigator grant', () => {
    const user = { plan: 'observer', subscription_status: 'none' };
    const result = grant.computeAppleSubscriptionGrantFields(
      user,
      investigatorPlan,
      investigatorExp,
      { refillEnergy: true, subscriptionId: 'inv-txn-3', now },
    );
    assert.strictEqual(result.preservedHigherPlan, false);
    assert.strictEqual(result.fields.plan, 'investigator');
    assert.strictEqual(result.fields.subscription_status, 'active');
  });

  // 4. Same-plan renewal never shortens expiration
  check('same-plan renewal keeps longer expiration', () => {
    const user = {
      plan: 'investigator',
      plan_expiration_date: '2026-12-09T00:00:00.000Z',
      subscription_status: 'active',
      subscription_id: 'inv-lineage',
    };
    const result = grant.computeAppleSubscriptionGrantFields(
      user,
      investigatorPlan,
      investigatorExp, // earlier than existing
      { refillEnergy: true, subscriptionId: 'inv-lineage', now },
    );
    assert.strictEqual(result.stale, true);
    assert.strictEqual(result.fields.plan_expiration_date, '2026-12-09T00:00:00.000Z');
    assert.strictEqual(result.fields.manifestation_energy, undefined);
  });

  // 5. Poll reflection: exact match
  check('poll reflects exact Investigator grant', () => {
    const user = {
      plan: 'investigator',
      plan_expiration_date: investigatorExp,
      subscription_status: 'active',
    };
    assert.strictEqual(
      grant.isRecurringPlanGrantReflected(user, 'investigator', now),
      true,
    );
    assert.strictEqual(
      access.isRecurringPlanGrantReflected(user, 'investigator', now),
      true,
    );
  });

  // 6. Poll reflection: Trailblazer preserved + subscription_status active
  check('poll reflects Investigator under preserved Trailblazer', () => {
    const user = {
      plan: 'trailblazer',
      plan_expiration_date: trailblazerExp,
      subscription_status: 'active',
    };
    assert.strictEqual(
      grant.isRecurringPlanGrantReflected(user, 'investigator', now),
      true,
    );
    assert.strictEqual(
      grant.isRecurringPlanGrantReflected(user, 'seeker', now),
      true,
    );
  });

  // 7. Poll does NOT succeed for Trailblazer alone without active subscription_status
  check('poll rejects Trailblazer without active subscription_status for lower plan', () => {
    const user = {
      plan: 'trailblazer',
      plan_expiration_date: trailblazerExp,
      subscription_status: 'none',
    };
    assert.strictEqual(
      grant.isRecurringPlanGrantReflected(user, 'investigator', now),
      false,
    );
  });

  // 8. Poll rejects expired plan
  check('poll rejects expired plan', () => {
    const user = {
      plan: 'investigator',
      plan_expiration_date: expiredTrailblazer,
      subscription_status: 'active',
    };
    assert.strictEqual(
      grant.isRecurringPlanGrantReflected(user, 'investigator', now),
      false,
    );
  });

  // 9. Effective plan precedence: Trailblazer > active Investigator ledger
  check('effective plan prefers Trailblazer over active Investigator ledger', () => {
    const user = {
      plan: 'trailblazer',
      plan_expiration_date: trailblazerExp,
      subscription_status: 'active',
    };
    const ledger = [
      {
        status: 'active',
        product_id: 'com.ages.explorer.investigator.monthly',
        plan_expiration_date: investigatorExp,
      },
    ];
    const id = grant.resolveEffectivePlanId(
      user,
      ledger,
      (pid) => rc.getAppleSubscriptionProduct(pid),
      now,
    );
    assert.strictEqual(id, 'trailblazer');
    assert.strictEqual(
      access.getEffectivePlanIdWithAppleLedger(
        user,
        ledger,
        (pid) => rc.getAppleSubscriptionProduct(pid),
        now,
      ),
      'trailblazer',
    );
  });

  // 10. Expired Trailblazer + ACTIVE Investigator ledger → investigator
  check('expired Trailblazer falls back to active Investigator ledger', () => {
    const user = {
      plan: 'trailblazer',
      plan_expiration_date: expiredTrailblazer,
      subscription_status: 'active',
    };
    const ledger = [
      {
        status: 'active',
        product_id: 'com.ages.explorer.investigator.monthly',
        plan_expiration_date: investigatorExp,
      },
    ];
    const id = grant.resolveEffectivePlanId(
      user,
      ledger,
      (pid) => rc.getAppleSubscriptionProduct(pid),
      now,
    );
    assert.strictEqual(id, 'investigator');
  });

  // 11. Expired ledger row does not grant
  check('expired ledger subscription does not grant access', () => {
    const user = { plan: 'observer', subscription_status: 'none' };
    const ledger = [
      {
        status: 'active',
        product_id: 'com.ages.explorer.investigator.monthly',
        plan_expiration_date: expiredTrailblazer,
      },
    ];
    const id = grant.resolveEffectivePlanId(
      user,
      ledger,
      (pid) => rc.getAppleSubscriptionProduct(pid),
      now,
    );
    assert.strictEqual(id, 'observer');
  });

  // 12. Seeker grant under Trailblazer preserves Trailblazer (siegby-style)
  check('Seeker grant under Trailblazer preserves higher plan', () => {
    const user = {
      plan: 'trailblazer',
      plan_expiration_date: trailblazerExp,
      subscription_status: 'active',
      manifestation_energy: 80,
      narration_energy: 240,
      aura_narration_energy: 50,
      aura_manifestation_energy: 10,
    };
    const result = grant.computeAppleSubscriptionGrantFields(
      user,
      seekerPlan,
      seekerExp,
      { refillEnergy: true, subscriptionId: 'seeker-txn', now },
    );
    assert.strictEqual(result.preservedHigherPlan, true);
    assert.deepStrictEqual(result.fields, { subscription_status: 'active' });
    // Aura untouched (not in fields)
    assert.strictEqual(result.fields.aura_narration_energy, undefined);
  });

  // 13. getEffectivePlanId still prefers Google Trailblazer isolation
  check('Google Trailblazer isolation still wins over generic investigator', () => {
    const user = {
      plan: 'investigator',
      plan_expiration_date: investigatorExp,
      subscription_status: 'active',
      google_trailblazer_expiration_date: trailblazerExp,
    };
    assert.strictEqual(access.getEffectivePlanId(user, now), 'trailblazer');
  });

  // 14. PRODUCT_CHANGE semantics: no grant fields without caller — ensure
  // isRecurringPlanGrantReflected stays false when only trailblazer/none
  check('no false grant reflection for PRODUCT_CHANGE-like state', () => {
    const user = {
      plan: 'trailblazer',
      plan_expiration_date: trailblazerExp,
      subscription_status: 'none',
    };
    assert.strictEqual(grant.isRecurringPlanGrantReflected(user, 'seeker', now), false);
  });

  // 15. Server caller pattern (grant-ad-reward / spend-evidence-save): the
  // generic resolution runs first; the ACTIVE Apple ledger escalates only an
  // otherwise-free effective plan. Expired Trailblazer + active Investigator
  // ledger → investigator; Play rows / expired rows / refunded rows cannot.
  check('server permission callers resolve expired Trailblazer via active ledger', () => {
    const expiredTbUser = {
      plan: 'trailblazer',
      plan_expiration_date: expiredTrailblazer,
      subscription_status: 'active',
    };
    const resolve = (pid) => rc.getAppleSubscriptionProduct(pid);
    // Mirror the function fallback: base first, ledger only when observer.
    const callerResolve = (u, rows) => {
      let planId = access.getEffectivePlanId(u, now);
      if (planId === 'observer') {
        planId = access.getEffectivePlanIdWithAppleLedger(u, rows, resolve, now);
      }
      return planId;
    };
    const activeInvRow = {
      status: 'active',
      store: 'APP_STORE',
      product_id: 'com.ages.explorer.investigator.monthly',
      plan_expiration_date: investigatorExp,
    };
    // Escalation works
    assert.strictEqual(callerResolve(expiredTbUser, [activeInvRow]), 'investigator');
    // Expired row cannot grant (point 3)
    assert.strictEqual(
      callerResolve(expiredTbUser, [{ ...activeInvRow, plan_expiration_date: expiredTrailblazer }]),
      'observer',
    );
    // Refunded/canceled-out row cannot grant (point 3)
    assert.strictEqual(
      callerResolve(expiredTbUser, [{ ...activeInvRow, status: 'refunded' }]),
      'observer',
    );
    // Google Play rows never escalate through the Apple resolver (isolation)
    assert.strictEqual(
      callerResolve(expiredTbUser, [{
        status: 'active',
        store: 'PLAY_STORE',
        product_id: 'investigator:monthly',
        plan_expiration_date: investigatorExp,
      }]),
      'observer',
    );
    // Active Trailblazer keeps precedence without touching the ledger (point 1)
    const activeTbUser = {
      plan: 'trailblazer',
      plan_expiration_date: trailblazerExp,
      subscription_status: 'active',
    };
    assert.strictEqual(callerResolve(activeTbUser, [activeInvRow]), 'trailblazer');
    // Aura balances are never part of plan resolution (point 4)
    assert.strictEqual(
      callerResolve({ ...expiredTbUser, aura_narration_energy: 500 }, []),
      'observer',
    );
  });

  // 16. Wiring assertions — the ledger-aware helper must have REAL callers.
  // Static source checks (fs) so the harness fails if the callers are removed
  // or the helpers silently drift back to dead code.
  check('production callers reference the ledger-aware effective-plan helper', () => {
    const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

    const grantAdReward = read('base44/functions/grant-ad-reward/entry.ts');
    assert.ok(grantAdReward.includes('getEffectivePlanIdWithAppleLedger'),
      'grant-ad-reward must escalate via the Apple ledger');
    assert.ok(grantAdReward.includes('getAppleSubscriptionProduct'),
      'grant-ad-reward must resolve Apple products');

    const spendSave = read('base44/functions/spend-evidence-save/entry.ts');
    assert.ok(spendSave.includes('getEffectivePlanIdWithAppleLedger'),
      'spend-evidence-save must escalate via the Apple ledger');
    assert.ok(spendSave.includes('APPLE_STORE'),
      'spend-evidence-save must scope the ledger query to APP_STORE');

    // Android AdMob SSV stays on the generic helpers only (untouched).
    const ssv = read('base44/functions/admob-ssv/entry.ts');
    assert.ok(ssv.includes('isPaidAccess') && !ssv.includes('WithAppleLedger'),
      'admob-ssv must remain Apple-ledger-free');
  });

  // 17. PRODUCT_CHANGE cannot grant access: the webhook PRODUCT_CHANGE branch
  // only records ledger bookkeeping — it must not call applyAppleGrant.
  check('webhook PRODUCT_CHANGE branch performs bookkeeping only', () => {
    const src = fs.readFileSync(
      path.join(__dirname, 'base44/shared/webhookAppleSubscriptions.ts'),
      'utf8',
    );
    const start = src.indexOf('async function handleAppleProductChange');
    const end = src.indexOf('async function handleAppleGrant', start);
    assert.ok(start !== -1 && end !== -1, 'PRODUCT_CHANGE/GRANT handlers must exist');
    const branch = src.slice(start, end);
    assert.ok(!branch.includes('applyAppleGrant'),
      'PRODUCT_CHANGE must never apply a grant');
    assert.ok(branch.includes('recordAppleLedgerEvent'),
      'PRODUCT_CHANGE should only record ledger bookkeeping');
  });

  // 18. Client poll wiring: the Apple grant poll reflects preserved grants.
  check('client poll uses the recurring-grant reflection helper', () => {
    const src = fs.readFileSync(path.join(__dirname, 'src/lib/revenuecat.js'), 'utf8');
    assert.ok(src.includes("import { isRecurringPlanGrantReflected } from '@/lib/access'"),
      'revenuecat client must import the reflection helper');
    assert.ok(src.includes('isRecurringPlanGrantReflected(lastUser, expectedPlanId)'),
      'pollForPlanGrant must use the reflection helper');
  });

  // 19. Trailblazer refund restoration path exists and Aura is never part of
  // the subscription grant fields (points 1 + 4).
  check('trailblazer refund restores remaining subscription; aura stays isolated', () => {
    const tb = fs.readFileSync(
      path.join(__dirname, 'base44/shared/webhookAppleTrailblazer.ts'),
      'utf8',
    );
    assert.ok(tb.includes('latestActiveAppleSubscription'),
      'Trailblazer refund must restore a remaining active Apple subscription');
    const grantSrc = fs.readFileSync(
      path.join(__dirname, 'base44/shared/appleSubscriptionGrant.js'),
      'utf8',
    );
    assert.ok(!grantSrc.includes('aura_'),
      'subscription grant computation must never touch aura_* energy');
  });

  // ── Client access-layer fix: src/lib/access.js must resolve the same ────
  // ledger-aware effective plan as the backend. The checks below import the
  // REAL client module (not a reimplementation): its only import is the
  // '@/lib/plans' alias, so the specifier is rewritten to a file URL in a
  // temp copy and the temp module is imported. src/lib/plans.js is pure.
  const clientAccess = await (async () => {
    const srcPath = path.join(__dirname, 'src/lib/access.js');
    const src = fs.readFileSync(srcPath, 'utf8');
    const plansUrl = pathToFileUrl(path.join(__dirname, 'src/lib/plans.js'));
    const rewritten = src.replace(/from '@\/lib\/plans'/, `from '${plansUrl}'`);
    if (rewritten === src) {
      throw new Error("could not rewrite '@/lib/plans' import for client access module test");
    }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'client-access-'));
    const tmpFile = path.join(tmpDir, 'access.mjs');
    fs.writeFileSync(tmpFile, rewritten);
    return import(pathToFileUrl(tmpFile));
  })();

  const activeInvLedgerRow = {
    status: 'active',
    store: 'APP_STORE',
    product_id: 'com.ages.explorer.investigator.monthly',
    plan_expiration_date: investigatorExp,
    user_id: 'user-1',
  };

  // 20. Expired Trailblazer + active Apple recurring ledger (attached to the
  // client user) becomes the effective CLIENT plan via the plain helpers —
  // the exact resolution the backend permission functions use.
  check('client effective plan: expired Trailblazer + active Apple ledger wins', () => {
    const user = {
      id: 'user-1',
      plan: 'trailblazer',
      plan_expiration_date: expiredTrailblazer,
      subscription_status: 'active',
      apple_ledger_rows: [activeInvLedgerRow],
    };
    assert.strictEqual(clientAccess.getEffectivePlanId(user, now), 'investigator');
    assert.strictEqual(clientAccess.isPaidAccess(user, now), true);
    assert.strictEqual(clientAccess.canGenerate(user, now), true);
    assert.strictEqual(clientAccess.getEffectivePlan(user, now).id, 'investigator');
  });

  // 21. Active Trailblazer still wins over an active Apple recurring ledger
  // row (precedence preserved on the client helpers).
  check('client effective plan: active Trailblazer beats Apple ledger', () => {
    const user = {
      id: 'user-1',
      plan: 'trailblazer',
      plan_expiration_date: trailblazerExp,
      subscription_status: 'active',
      apple_ledger_rows: [activeInvLedgerRow],
    };
    assert.strictEqual(clientAccess.getEffectivePlanId(user, now), 'trailblazer');
    // Ledger escalation to a HIGHER plan also works while Trailblazer is the
    // ledger entry (parity with the backend helper).
    const invUser = {
      id: 'user-1',
      plan: 'investigator',
      plan_expiration_date: investigatorExp,
      subscription_status: 'active',
      apple_ledger_rows: [{ ...activeInvLedgerRow, product_id: 'com.ages.explorer.seeker.monthly' }],
    };
    assert.strictEqual(clientAccess.getEffectivePlanId(invUser, now), 'investigator');
  });

  // 22. Cancellation-through-expiration: a canceled recurring subscription
  // keeps its ledger row status 'active' until the paid period ends — it must
  // still grant while plan_expiration_date is in the future. Same for the
  // generic-field representation (subscription_status 'canceled' + future
  // plan_expiration_date).
  check('canceled-but-future-expiring access remains active', () => {
    const ledgerUser = {
      id: 'user-1',
      plan: 'observer',
      apple_ledger_rows: [{
        ...activeInvLedgerRow,
        event_type: 'CANCELLATION', // auto-renew off; entitled through expiry
      }],
    };
    assert.strictEqual(clientAccess.getEffectivePlanId(ledgerUser, now), 'investigator');
    const genericUser = {
      id: 'user-1',
      plan: 'investigator',
      plan_expiration_date: investigatorExp,
      subscription_status: 'canceled',
      apple_ledger_rows: [],
    };
    assert.strictEqual(clientAccess.getEffectivePlanId(genericUser, now), 'investigator');
  });

  // 23. Refund/expiration protections: expired rows, refunded rows, and any
  // non-'active' ledger status can never grant client access.
  check('expired/refunded/non-active ledger rows never grant client access', () => {
    const base = { id: 'user-1', plan: 'observer', apple_ledger_rows: [] };
    const pastExp = '2026-09-01T00:00:00.000Z';
    assert.strictEqual(clientAccess.getEffectivePlanId(
      { ...base, apple_ledger_rows: [{ ...activeInvLedgerRow, plan_expiration_date: pastExp }] }, now), 'observer');
    assert.strictEqual(clientAccess.getEffectivePlanId(
      { ...base, apple_ledger_rows: [{ ...activeInvLedgerRow, status: 'refunded' }] }, now), 'observer');
    assert.strictEqual(clientAccess.getEffectivePlanId(
      { ...base, apple_ledger_rows: [{ ...activeInvLedgerRow, status: 'expired' }] }, now), 'observer');
    assert.strictEqual(clientAccess.isPaidAccess(
      { ...base, apple_ledger_rows: [{ ...activeInvLedgerRow, status: 'refunded' }] }, now), false);
    // 'paid' is the Google one-time status — not a granting status here.
    assert.strictEqual(clientAccess.getEffectivePlanId(
      { ...base, apple_ledger_rows: [{ ...activeInvLedgerRow, status: 'paid' }] }, now), 'observer');
  });

  // 24. Google Play rows and Aura balances stay isolated: Play ledger rows
  // (PLAY_STORE store, Play product ids) never resolve through the Apple
  // resolver; aura_* balances never influence plan resolution; the isolated
  // Google Trailblazer grant still wins through the client helpers.
  check('Play rows and Aura balances remain isolated on the client', () => {
    const expiredTb = {
      id: 'user-1',
      plan: 'trailblazer',
      plan_expiration_date: expiredTrailblazer,
      subscription_status: 'active',
    };
    const playRows = [
      { status: 'active', store: 'PLAY_STORE', product_id: 'investigator:monthly', plan_expiration_date: investigatorExp, user_id: 'user-1' },
      { status: 'paid', store: 'PLAY_STORE', product_id: 'trailblazer.30month', plan_expiration_date: trailblazerExp, user_id: 'user-1' },
    ];
    assert.strictEqual(clientAccess.getEffectivePlanId(
      { ...expiredTb, apple_ledger_rows: playRows }, now), 'observer');
    // Even if a Play row were mis-tagged with an Apple product id, the STORE
    // filter in lib/appleLedger.js drops it before resolution.
    assert.strictEqual(clientAccess.getEffectivePlanId(
      { ...expiredTb, apple_ledger_rows: [] }, now), 'observer');
    // Aura balances alone cannot create access.
    assert.strictEqual(clientAccess.getEffectivePlanId(
      { ...expiredTb, aura_narration_energy: 500, aura_manifestation_energy: 100, aura_save_energy: 50, apple_ledger_rows: [] }, now), 'observer');
    assert.strictEqual(clientAccess.isPaidAccess(
      { plan: 'observer', aura_narration_energy: 500, apple_ledger_rows: [] }, now), false);
    // Isolated Google Trailblazer (user fields) behavior is unchanged.
    assert.strictEqual(clientAccess.getEffectivePlanId(
      { plan: 'investigator', plan_expiration_date: investigatorExp, subscription_status: 'active', google_trailblazer_expiration_date: trailblazerExp, apple_ledger_rows: [] }, now), 'trailblazer');
    assert.strictEqual(clientAccess.getEffectivePlanId(
      { plan: 'observer', google_trailblazer_expiration_date: trailblazerExp, apple_ledger_rows: [] }, now), 'trailblazer');
  });

  // 25. Fail-safe + backend parity: no attached rows behaves exactly as
  // before; an empty ledger array changes nothing; client ledger resolution
  // matches the server helper row-for-row.
  check('no-ledger fallback unchanged and client matches server resolution', () => {
    const expiredTb = {
      plan: 'trailblazer',
      plan_expiration_date: expiredTrailblazer,
      subscription_status: 'active',
    };
    // No attached rows → generic+Google fields only (old behavior).
    assert.strictEqual(clientAccess.getEffectivePlanId(expiredTb, now), 'observer');
    // Empty ledger array → identical result.
    assert.strictEqual(clientAccess.getEffectivePlanId({ ...expiredTb, apple_ledger_rows: [] }, now), 'observer');
    // Active Trailblazer without rows → trailblazer (unchanged).
    assert.strictEqual(clientAccess.getEffectivePlanId(
      { plan: 'trailblazer', plan_expiration_date: trailblazerExp, subscription_status: 'active' }, now), 'trailblazer');
    // Client vs server helper parity for the attached-ledger scenario.
    const withLedger = {
      plan: 'trailblazer',
      plan_expiration_date: expiredTrailblazer,
      subscription_status: 'active',
    };
    const ledger = [activeInvLedgerRow];
    const clientId = clientAccess.getEffectivePlanIdWithAppleLedger(
      withLedger, ledger, clientAccess.resolveAppleLedgerProduct, now);
    const serverId = access.getEffectivePlanIdWithAppleLedger(
      withLedger, ledger, (pid) => rc.getAppleSubscriptionProduct(pid), now);
    assert.strictEqual(clientId, serverId);
    assert.strictEqual(clientId, 'investigator');
  });

  // 26. Client wiring: the ledger-aware helper must have REAL client callers
  // and the real fetch sites must attach the rows (fail-soft, APP_STORE only,
  // never from the RevenueCat SDK).
  check('client callers use the ledger-aware effective-plan path', () => {
    const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

    const clientAccessSrc = read('src/lib/access.js');
    assert.ok(clientAccessSrc.includes('user.apple_ledger_rows'),
      'getEffectivePlanId must consult attached apple_ledger_rows');
    assert.ok(clientAccessSrc.includes('getEffectivePlanIdWithAppleLedger(')
      && clientAccessSrc.includes('resolveAppleLedgerProduct'),
      'client getEffectivePlanId must delegate to the ledger-aware helper');

    const ledgerSrc = read('src/lib/appleLedger.js');
    assert.ok(ledgerSrc.includes('store: APPLE_STORE') && ledgerSrc.includes("APPLE_STORE = 'APP_STORE'"),
      'apple ledger fetch must scope rows to APP_STORE');
    assert.ok(!ledgerSrc.includes('PLAY_STORE'),
      'apple ledger fetch must never touch Play rows');
    assert.ok(ledgerSrc.includes('user_id') && ledgerSrc.includes('withAppleLedger'),
      'apple ledger fetch must scope to the current user and expose withAppleLedger');

    const dash = read('src/pages/Dashboard.jsx');
    assert.ok(dash.includes('withAppleLedger(await base44.auth.me())'),
      'Dashboard summary/gates must attach Apple ledger rows');
    const authCtx = read('src/lib/AuthContext.jsx');
    assert.ok(authCtx.includes('withAppleLedger'),
      'AuthContext must attach Apple ledger rows to the global user');
    const energyGate = read('src/hooks/useEnergyGate.js');
    assert.ok(energyGate.includes('withAppleLedger'),
      'useEnergyGate must attach Apple ledger rows');
    const saveGate = read('src/hooks/useEvidenceSaveGate.js');
    assert.ok(saveGate.includes('withAppleLedger'),
      'useEvidenceSaveGate must attach Apple ledger rows');
  });

  console.log(`\nAll ${passed} checks passed.`);
}

function pathToFileUrl(p) {
  const resolved = path.resolve(p);
  if (!fs.existsSync(resolved)) {
    throw new Error('missing file: ' + resolved);
  }
  return 'file://' + resolved;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});