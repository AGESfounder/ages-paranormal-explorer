import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveTrustedEntitlement } from '../../shared/entitlement.js';
import {
  loadEnergyAccount,
  planSpend,
  applySpend,
  setAccountFields,
  readAccount,
  mirrorToRecord,
} from '../../shared/energy.js';

// Server-authoritative evidence save gate.
//
// Tier-aware daily save accounting:
//   Admin          → free, no count, unlimited
//   Observer       → 10 free daily saves (ad-watched client-side). Over cap → blocked.
//   Seeker         → 10 free daily saves. Over cap → aura_save (blocked if empty).
//   Technician     → 20 free daily saves, then aura_save only (blocked if empty)
//   Explorer+      → 20 free daily saves, then aura_narration → aura_manifestation
//
// Everything this decides now comes from trusted server sources:
//   * the tier from the purchase ledger (shared/entitlement.js) — a user editing
//     their own record's plan cannot change their cap or their pool access;
//   * the daily counter, the balances and the outstanding charge from the
//     server-owned energy account — a user editing their own record's counter or
//     aura cannot add saves or energy.
//
// The charge is recorded ON THE ACCOUNT in the same operation as the spend, so
// the refund path reverses only what this server really took.

const FREE_DAILY_CAP = 10;   // Observer / Seeker
const PAID_DAILY_CAP = 20;   // Technician / Explorer / Investigator / Trailblazer

const chargeRecord = (cost) => ({ cost, at: new Date().toISOString() });

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const entitlement = await resolveTrustedEntitlement(base44, user);
    const planId = entitlement.planId;

    // Admin: always free, no counter increment
    if (entitlement.isAdmin) {
      return Response.json({ success: true, cost: 'admin', remaining: Infinity });
    }

    const today = new Date().toISOString().split('T')[0];
    const account = await loadEnergyAccount(base44, user, entitlement);
    const isFree = planId === 'observer' || planId === 'seeker';
    const dailyCap = isFree ? FREE_DAILY_CAP : PAID_DAILY_CAP;

    const counted = account.save_date === today ? Number(account.save_count) || 0 : 0;

    // ── Under the daily cap: free save ──
    if (counted < dailyCap) {
      // Reset the counter when the day rolled over, then count this save with a
      // guarded increment so two concurrent saves cannot both use the last slot.
      if (account.save_date !== today) {
        await base44.asServiceRole.entities.EnergyAccount.updateMany(
          { id: account.id, save_date: { $ne: today } },
          { $set: { save_count: 0, save_date: today } },
        );
      }
      await base44.asServiceRole.entities.EnergyAccount.updateMany(
        { id: account.id, save_date: today, save_count: { $lt: dailyCap } },
        { $inc: { save_count: 1 } },
      );

      const fresh = await readAccount(base44, user.id);
      const newCount = fresh?.save_date === today ? Number(fresh.save_count) || 0 : 0;

      if (newCount > counted) {
        const charged = await setAccountFields(base44, fresh, {
          save_charge: chargeRecord('free'),
        });
        await mirrorToRecord(base44, user.id, charged);
        console.log('Evidence save (free daily):', user.id, planId, `${newCount}/${dailyCap}`);
        return Response.json({
          success: true,
          cost: 'free',
          remaining: Math.max(0, dailyCap - newCount),
          dailyCount: newCount,
          dailyCap,
        });
      }
      // The cap filled between the read and the increment — fall through to the
      // over-cap paths below (Observer is blocked, paid tiers spend Aura).
    }

    // ── Over the daily cap ──
    // Observer: no Aura pool access — blocked
    if (planId === 'observer') {
      return Response.json({ success: false, reason: 'daily_cap', cap: dailyCap }, { status: 429 });
    }

    // Seeker / Technician: aura_save only. Explorer+: aura_narration → aura_manifestation.
    const kind = isFree ? 'evidence_save_seeker' : 'evidence_save_paid';
    // One id for the whole charge: the plan's duplicate check and the applied
    // spend refer to the same request, so a retry cannot charge twice.
    const requestId = `save-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const spendPlan = planSpend(account, { kind, cost: 1, requestId });
    if (!spendPlan.ok) {
      return Response.json({ success: false, reason: 'energy_empty' }, { status: 429 });
    }

    const spent = await applySpend(base44, account, spendPlan.pools, requestId);
    if (!spent.ok) {
      return Response.json({ success: false, reason: 'energy_empty' }, { status: 429 });
    }

    const cost = spendPlan.pools[0]?.field === 'aura_save'
      ? 'aura_save'
      : (spendPlan.pools[0]?.field === 'aura_narration' ? 'aura_narration' : 'aura_manifestation');

    const charged = await setAccountFields(base44, spent.account, {
      save_charge: chargeRecord(cost),
    });
    await mirrorToRecord(base44, user.id, charged);

    const remaining = (Number(charged?.aura_save) || 0)
      + (Number(charged?.aura_narration) || 0)
      + (Number(charged?.aura_manifestation) || 0);
    console.log('Evidence save:', user.id, planId, cost, 'remaining pool units:', remaining);
    return Response.json({
      success: true,
      cost,
      remaining,
      dailyCount: counted,
      dailyCap,
    });
  } catch (error) {
    console.error('spend-evidence-save error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}