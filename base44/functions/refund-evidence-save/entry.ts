import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Reverses a charge made by spend-evidence-save when Evidence.create fails.
//
// Rule: No successfully created Evidence record = no evidence-save charge.
//
// The refund is validated SERVER-SIDE. It reverses the charge this server
// actually recorded on the user (evidence_save_charge, written by
// spend-evidence-save in the same update as the charge itself). The `cost` the
// client sends is NOT the basis of a refund: a client-supplied cost would let
// any signed-in user mint energy by calling this function with whichever pool
// they name, having spent nothing at all.
//
// One recorded charge is refundable exactly once: the pending record is
// cleared in the same update that gives the energy back. A charge older than
// REFUND_WINDOW_MS is never refunded — a save whose Evidence.create failed
// does so within seconds — so a save that actually succeeded cannot be claimed
// back later.

const REFUND_WINDOW_MS = 5 * 60 * 1000;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const claimed = body?.cost;   // logged for support only — never acted on

    // The server's own record of its last charge is the only refundable thing.
    const pending = user.evidence_save_charge;
    if (!pending || typeof pending !== 'object' || typeof pending.cost !== 'string') {
      console.log('Evidence save refund: no-op — no charge recorded by the server (client claimed:', claimed, ')');
      return Response.json({ success: true, refunded: false, reason: 'no_charge' });
    }

    const cost = pending.cost;
    const atMs = Date.parse(pending.at);
    if (!Number.isFinite(atMs) || Date.now() - atMs > REFUND_WINDOW_MS) {
      console.log('Evidence save refund: no-op — recorded charge is stale:', cost, pending.at);
      return Response.json({ success: true, refunded: false, reason: 'stale_charge' });
    }

    // ── Free daily save: decrement the daily counter ──
    if (cost === 'free') {
      const today = new Date().toISOString().split('T')[0];
      if (user.evidence_save_date !== today) {
        // Day rolled over — counter already reset, nothing to refund
        console.log('Evidence save refund (free): no-op — day rolled over');
        return Response.json({ success: true, refunded: false, reason: 'day_rollover' });
      }
      const current = user.evidence_save_count || 0;
      if (current <= 0) {
        console.log('Evidence save refund (free): no-op — count already 0');
        return Response.json({ success: true, refunded: false, reason: 'count_zero' });
      }
      const newCount = current - 1;
      await base44.asServiceRole.entities.User.update(user.id, {
        evidence_save_count: newCount,
        evidence_save_charge: null,
      });
      console.log('Evidence save refund (free daily):', user.id, `${current} → ${newCount}`);
      return Response.json({ success: true, refunded: true, cost: 'free', newCount });
    }

    // ── Aura pool refund: return the unit to the pool the server charged ──
    const poolByCost = {
      aura_save: 'aura_save_energy',
      aura_narration: 'aura_narration_energy',
      aura_manifestation: 'aura_manifestation_energy',
    };
    const field = poolByCost[cost];
    if (!field) {
      // The record is server-written, so this cannot be reached by a caller.
      console.log('Evidence save refund: no-op — unrecognized recorded charge:', cost);
      return Response.json({ success: true, refunded: false, reason: 'unknown_charge' });
    }

    const current = user[field] || 0;
    await base44.asServiceRole.entities.User.update(user.id, {
      [field]: current + 1,
      evidence_save_charge: null,
    });
    console.log(`Evidence save refund (${cost}):`, user.id, `${current} → ${current + 1}`);
    return Response.json({ success: true, refunded: true, cost, newEnergy: current + 1 });
  } catch (error) {
    console.error('refund-evidence-save error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}