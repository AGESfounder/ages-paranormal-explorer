import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { readAccount, mirrorToRecord, planRefund } from '../../shared/energy.js';

// Reverses a charge made by spend-evidence-save when Evidence.create fails.
//
// Rule: No successfully created Evidence record = no evidence-save charge.
//
// The refund is validated SERVER-SIDE against the charge this server recorded on
// the caller's own energy account (EnergyAccount.save_charge), which is
// admin-write-only. That is what makes the claim unfakeable:
//   * the `cost` the client sends is not the basis of anything — a client-supplied
//     pool would let any signed-in user mint energy by naming one;
//   * the account row is the caller's own and this request carries no user id, so
//     another user's charge can never be reached;
//   * one recorded charge is refundable exactly once — it is cleared in the same
//     atomic update that pays it back, so a duplicate request finds nothing;
//   * a charge older than the window is never refunded, so a save that actually
//     succeeded cannot be claimed back later.
//
// Nothing is reported as refunded unless the corresponding update ran.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const claimed = body?.cost;   // logged for support only — never acted on

    const account = await readAccount(base44, user.id);
    const decision = planRefund(account);

    if (!decision.ok) {
      if (account && decision.reason !== 'no_charge') {
        // Nothing refundable, but a charge record is still sitting there: clear it
        // so it can never be paid back later.
        await base44.asServiceRole.entities.EnergyAccount.updateMany(
          { id: account.id },
          { $set: { save_charge: null } },
        );
      }
      console.log(
        'Evidence save refund: no-op —', decision.reason,
        '(recorded:', decision.cost || 'none', '· client claimed:', claimed, ')',
      );
      return Response.json({ success: true, refunded: false, reason: decision.reason });
    }

    if (decision.kind === 'daily_save') {
      const today = new Date().toISOString().split('T')[0];
      if (account.save_date !== today) {
        await base44.asServiceRole.entities.EnergyAccount.updateMany(
          { id: account.id },
          { $set: { save_charge: null } },
        );
        console.log('Evidence save refund (free): no-op — day rolled over');
        return Response.json({ success: true, refunded: false, reason: 'day_rollover' });
      }
      // Guarded and single-use: the slot goes back and the charge is cleared in the
      // same atomic update, so it can never be refunded twice.
      await base44.asServiceRole.entities.EnergyAccount.updateMany(
        { id: account.id, save_count: { $gt: 0 }, save_charge: { $ne: null } },
        { $inc: { save_count: -1 }, $set: { save_charge: null } },
      );
      const fresh = await readAccount(base44, user.id);
      await mirrorToRecord(base44, user.id, fresh);
      console.log('Evidence save refund (free): returned one daily save');
      return Response.json({ success: true, refunded: true, cost: 'free', reason: 'refunded' });
    }

    // Aura charge: return exactly the unit that was taken, once.
    await base44.asServiceRole.entities.EnergyAccount.updateMany(
      { id: account.id, save_charge: { $ne: null } },
      { $inc: { [decision.pool]: 1 }, $set: { save_charge: null } },
    );
    const fresh = await readAccount(base44, user.id);
    await mirrorToRecord(base44, user.id, fresh);
    console.log('Evidence save refund:', user.id, decision.pool, 'returned');
    return Response.json({
      success: true,
      refunded: true,
      cost: decision.cost,
      reason: 'refunded',
    });
  } catch (error) {
    console.error('refund-evidence-save error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}