import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Reverses a charge made by spend-evidence-save when Evidence.create fails.
//
// Rule: No successfully created Evidence record = no evidence-save charge.
//
// The client passes the `cost` value returned by spend-evidence-save so this
// function knows which pool to refund:
//   'free'               → decrement evidence_save_count by 1 (same day only, min 0)
//   'aura_save'           → increment aura_save_energy by 1
//   'aura_narration'      → increment aura_narration_energy by 1
//   'aura_manifestation'  → increment aura_manifestation_energy by 1
//   'admin'               → no-op (admin saves are always free)
//
// Idempotency: the client clears its tracked cost after calling this, so a
// single gate instance cannot double-refund. If the day rolls over between
// the charge and the refund, the free-daily counter is not decremented (the
// counter already reset to 0 for the new day).

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const cost = body.cost;

    if (!cost || cost === 'admin') {
      return Response.json({ success: true, refunded: false, reason: 'no_charge' });
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
      });
      console.log('Evidence save refund (free daily):', user.id, `${current} → ${newCount}`);
      return Response.json({ success: true, refunded: true, cost: 'free', newCount });
    }

    // ── Aura pool refunds: increment the charged pool ──
    if (cost === 'aura_save') {
      const current = user.aura_save_energy || 0;
      await base44.asServiceRole.entities.User.update(user.id, {
        aura_save_energy: current + 1,
      });
      console.log('Evidence save refund (aura_save):', user.id, `${current} → ${current + 1}`);
      return Response.json({ success: true, refunded: true, cost: 'aura_save', newEnergy: current + 1 });
    }

    if (cost === 'aura_narration') {
      const current = user.aura_narration_energy || 0;
      await base44.asServiceRole.entities.User.update(user.id, {
        aura_narration_energy: current + 1,
      });
      console.log('Evidence save refund (aura_narration):', user.id, `${current} → ${current + 1}`);
      return Response.json({ success: true, refunded: true, cost: 'aura_narration', newEnergy: current + 1 });
    }

    if (cost === 'aura_manifestation') {
      const current = user.aura_manifestation_energy || 0;
      await base44.asServiceRole.entities.User.update(user.id, {
        aura_manifestation_energy: current + 1,
      });
      console.log('Evidence save refund (aura_manifestation):', user.id, `${current} → ${current + 1}`);
      return Response.json({ success: true, refunded: true, cost: 'aura_manifestation', newEnergy: current + 1 });
    }

    return Response.json({ error: `Unknown cost type: ${cost}` }, { status: 400 });
  } catch (error) {
    console.error('refund-evidence-save error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}