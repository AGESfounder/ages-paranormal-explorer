import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  resolveTrustedEntitlement,
  canGenerateForPlan,
  entitlementExpiration,
} from '../../shared/entitlement.js';
import { loadEnergyAccount, ENERGY_POOLS } from '../../shared/energy.js';

// The client's view of what the SERVER has verified: the effective plan from the
// purchase ledger — never from the user-writable User record — plus the balances
// held in the server-owned energy account. The client uses this to display the
// plan/energy and to keep its own gates honest; every spend re-checks on the
// server regardless of what this returns, so a forged client value buys nothing.

const FREE_DAILY_CAP = 10;   // Observer / Seeker
const PAID_DAILY_CAP = 20;   // Technician / Explorer / Investigator / Trailblazer

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const entitlement = await resolveTrustedEntitlement(base44, user);
    const account = await loadEnergyAccount(base44, user, entitlement);
    const today = new Date().toISOString().split('T')[0];

    const isFreeTier = entitlement.planId === 'observer' || entitlement.planId === 'seeker';
    const energy = {};
    for (const pool of ENERGY_POOLS) energy[pool] = Number(account[pool]) || 0;

    return Response.json({
      verified: true,
      plan_id: entitlement.planId,
      is_paid: entitlement.isPaid,
      is_admin: entitlement.isAdmin,
      can_generate: canGenerateForPlan(entitlement.planId, entitlement.isAdmin),
      // Which monthly pools this entitlement may draw on, taken from the stores
      // behind the ledger rows (a lapsed Play plan cannot spend Apple energy).
      monthly_pools: {
        generic: entitlement.genericAllowed,
        google: entitlement.googleAllowed,
      },
      expiration_date: entitlementExpiration(entitlement),
      energy,
      evidence_saves: {
        date: account.save_date || null,
        count: account.save_date === today ? Number(account.save_count) || 0 : 0,
        cap: isFreeTier ? FREE_DAILY_CAP : PAID_DAILY_CAP,
      },
      // True only when the ledger itself could not be read (an internal failure,
      // which a client cannot cause). The resolution is still the free tier.
      ledger_unavailable: entitlement.ledgerUnavailable,
      verified_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('get-entitlement error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}