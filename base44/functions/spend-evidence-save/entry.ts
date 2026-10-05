import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Server-authoritative evidence save gate.
//
// Tier-aware daily save accounting:
//   Admin          → free, no count, unlimited
//   Observer       → 10 free daily saves (ad-watched; client shows the ad
//                     before calling this function). Over cap → blocked.
//   Seeker         → 10 free daily saves (ad-watched). Over cap → aura_save_energy
//                     (same as Technician; blocked if empty).
//   Technician     → 20 free daily saves, then aura_save_energy only (blocked if empty)
//   Explorer+      → 20 free daily saves, then aura_narration → aura_manifestation
//                     (never aura_save_energy; blocked if both empty)
//
// Daily counters: evidence_save_count + evidence_save_date on the User entity.
// Aura pool selection mirrors applyEvidenceSaveSpend in src/lib/access.js.
// NEVER touches monthly narration_energy, manifestation_energy, or
// google_trailblazer_* pools — those are reserved for narration/generation.

const FREE_DAILY_CAP = 10;   // Observer / Seeker
const PAID_DAILY_CAP = 20;    // Technician / Explorer / Investigator / Trailblazer

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Admin: always free, no counter increment
    if (user.role === 'admin') {
      return Response.json({ success: true, cost: 'admin', remaining: Infinity });
    }

    const today = new Date().toISOString().split('T')[0];

    // Reset daily count if it's a new day
    const saveCount = user.evidence_save_date === today
      ? (user.evidence_save_count || 0)
      : 0;

    const planId = user.plan || 'observer';
    const isFree = planId === 'observer' || planId === 'seeker';
    const isObserver = planId === 'observer';
    const dailyCap = isFree ? FREE_DAILY_CAP : PAID_DAILY_CAP;

    // ── Under daily cap: free save, increment counter ──
    if (saveCount < dailyCap) {
      const newCount = saveCount + 1;
      await base44.asServiceRole.entities.User.update(user.id, {
        evidence_save_count: newCount,
        evidence_save_date: today,
      });
      console.log('Evidence save (free daily):', user.id, planId, `${newCount}/${dailyCap}`);
      return Response.json({
        success: true,
        cost: 'free',
        remaining: dailyCap - newCount,
        dailyCount: newCount,
        dailyCap,
      });
    }

    // ── Over daily cap ──
    // Observer: no Aura pool access — blocked
    if (isObserver) {
      return Response.json({
        success: false,
        reason: 'daily_cap',
        cap: dailyCap,
      }, { status: 429 });
    }

    // Seeker / Technician: aura_save_energy only (no fallback)
    if (planId === 'seeker' || planId === 'technician') {
      const saveEnergy = user.aura_save_energy || 0;
      if (saveEnergy <= 0) {
        return Response.json({
          success: false,
          reason: 'energy_empty',
        }, { status: 429 });
      }
      await base44.asServiceRole.entities.User.update(user.id, {
        aura_save_energy: saveEnergy - 1,
      });
      console.log('Evidence save (aura_save):', user.id, 'remaining:', saveEnergy - 1);
      return Response.json({
        success: true,
        cost: 'aura_save',
        remaining: saveEnergy - 1,
        dailyCount: saveCount,
        dailyCap,
      });
    }

    // Explorer / Investigator / Trailblazer: aura_narration → aura_manifestation
    const auraNar = user.aura_narration_energy || 0;
    const auraMan = user.aura_manifestation_energy || 0;

    if (auraNar > 0) {
      await base44.asServiceRole.entities.User.update(user.id, {
        aura_narration_energy: auraNar - 1,
      });
      console.log('Evidence save (aura_narration):', user.id, 'remaining:', auraNar - 1 + auraMan);
      return Response.json({
        success: true,
        cost: 'aura_narration',
        remaining: auraNar - 1 + auraMan,
        dailyCount: saveCount,
        dailyCap,
      });
    }

    if (auraMan > 0) {
      await base44.asServiceRole.entities.User.update(user.id, {
        aura_manifestation_energy: auraMan - 1,
      });
      console.log('Evidence save (aura_manifestation):', user.id, 'remaining:', auraMan - 1);
      return Response.json({
        success: true,
        cost: 'aura_manifestation',
        remaining: auraMan - 1,
        dailyCount: saveCount,
        dailyCap,
      });
    }

    // Both Aura pools empty
    return Response.json({
      success: false,
      reason: 'energy_empty',
    }, { status: 429 });
  } catch (error) {
    console.error('spend-evidence-save error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}