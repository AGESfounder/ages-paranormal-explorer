import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveTrustedEntitlement } from '../../shared/entitlement.js';
import { loadEnergyAccount, planSpend, applySpend, ENERGY_POOLS } from '../../shared/energy.js';

// Server-side energy spend — the only way energy is ever deducted.
//
// The client no longer writes balances: a User record's custom fields are
// writable by their own owner, so a balance kept there could be topped up at
// will. Here the entitlement is resolved from the purchase ledger, the balance
// comes from the server-owned energy account, and the deduction is a guarded
// conditional update, so two concurrent requests cannot spend the same unit and
// a balance cannot be driven below zero.
//
// The client-supplied `cost` is clamped to the app's own narration ceiling and is
// never used as a balance: for manifestation the cost is fixed at the single unit
// the app charges.
const MAX_NARRATION_COST = 100;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const kind = body?.kind;
    const requestId = typeof body?.request_id === 'string' && body.request_id
      ? body.request_id
      : null;
    if (!requestId) {
      return Response.json({ ok: false, reason: 'missing_request_id' }, { status: 400 });
    }

    // What is being spent is validated first, for every caller.
    let cost = 1;
    if (kind === 'narration') {
      const requested = Math.floor(Number(body?.cost) || 0);
      cost = Math.min(MAX_NARRATION_COST, Math.max(1, requested));
    } else if (kind !== 'manifestation') {
      return Response.json({ ok: false, reason: 'bad_kind' }, { status: 400 });
    }

    // Admins hold full access and do not spend energy (unchanged app behavior).
    if (user.role === 'admin') {
      return Response.json({ ok: true, bypassed: true, spent: 0, cost: 'admin' });
    }

    const entitlement = await resolveTrustedEntitlement(base44, user);
    if (!entitlement.isPaid) {
      // Nothing paid is verifiable for this account: the free tier cannot spend.
      return Response.json({ ok: false, reason: 'plan' }, { status: 403 });
    }

    const account = await loadEnergyAccount(base44, user, entitlement);
    const plan = planSpend(account, {
      kind,
      cost,
      requestId,
      genericAllowed: entitlement.genericAllowed,
      googleAllowed: entitlement.googleAllowed,
    });

    if (!plan.ok) {
      console.log('Energy spend refused:', user.id, kind, cost, plan.reason, 'available:', plan.available);
      return Response.json(
        { ok: false, reason: plan.reason, available: plan.available ?? 0 },
        { status: plan.reason === 'insufficient' ? 402 : 400 },
      );
    }

    if (plan.duplicate) {
      const energy = {};
      for (const pool of ENERGY_POOLS) energy[pool] = Number(account[pool]) || 0;
      return Response.json({ ok: true, duplicate: true, spent: 0, energy });
    }

    const result = await applySpend(base44, account, plan.pools, requestId);
    if (!result.ok) {
      console.log('Energy spend lost a race:', user.id, kind, cost);
      return Response.json({ ok: false, reason: result.reason }, { status: 402 });
    }

    const energy = {};
    for (const pool of ENERGY_POOLS) energy[pool] = Number(result.account?.[pool]) || 0;
    console.log('Energy spent:', user.id, kind, result.spent, 'plan:', entitlement.planId);
    return Response.json({ ok: true, spent: result.spent, energy });
  } catch (error) {
    console.error('spend-energy error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}