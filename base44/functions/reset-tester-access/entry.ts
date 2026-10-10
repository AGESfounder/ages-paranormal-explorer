import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Scheduled tester-access reset. Called every 2 hours (even hours) by the
// "Tester Access Reset" workflow, and can also be invoked manually by an
// admin. Honors the TesterResetSetting toggle — does nothing when off.
//
// When ON:
//   1. Marks every SANDBOX RevenueCatPurchase ledger row inactive (expired),
//      so purchase history shows Not Active and the plan resolver no longer
//      counts them.
//   2. For each user who appears ONLY in sandbox rows (no active/paid
//      PRODUCTION row), resets their grant fields to Observer (plan, expirations,
//      subscription status, monthly + Google Trailblazer + Aura energy).
//
// Safety: a user with ANY active/paid PRODUCTION row is never reset, so real
// purchases are never affected. Fail-safe: if the production-row check throws,
// the user is skipped (treated as having real access) rather than wiped.

const PAST = '2000-01-01T00:00:00.000Z';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Read the admin toggle (service role bypasses RLS; works from workflow + admin).
    let enabled = false;
    try {
      const rows = await base44.asServiceRole.entities.TesterResetSetting.filter({});
      const list = Array.isArray(rows) ? rows : (rows?.items || []);
      enabled = list.some((r) => r && r.enabled === true);
    } catch (e) {
      console.error('TesterResetSetting read failed:', e?.message || e);
    }
    if (!enabled) {
      return Response.json({ success: true, skipped: 'disabled', enabled: false });
    }

    // Collect distinct user_ids from active/paid sandbox ledger rows.
    const userIds = new Set();
    let sandboxCount = 0;
    let cursor = undefined;
    do {
      const page = await base44.asServiceRole.entities.RevenueCatPurchase.filter(
        { environment: 'SANDBOX', status: { $in: ['active', 'paid'] } },
        { limit: 500, cursor },
      );
      const items = page?.items || [];
      for (const r of items) {
        if (r.user_id) userIds.add(r.user_id);
        sandboxCount++;
      }
      cursor = page?.has_more ? page.next_cursor : undefined;
    } while (cursor);

    if (userIds.size === 0) {
      return Response.json({
        success: true,
        enabled: true,
        skipped: 'no_sandbox',
        sandbox_rows: 0,
        users_reset: 0,
      });
    }

    // Mark all active/paid sandbox rows expired (loop until none remain).
    let more = true;
    let batches = 0;
    while (more) {
      const res = await base44.asServiceRole.entities.RevenueCatPurchase.updateMany(
        { environment: 'SANDBOX', status: { $in: ['active', 'paid'] } },
        { $set: { status: 'expired' } },
      );
      more = res?.has_more === true;
      batches++;
      if (batches > 50) break; // hard safety cap
    }

    // For each sandbox user, reset to Observer UNLESS they have an active/paid
    // PRODUCTION row. Fail safe: a production-check error skips the user.
    let resetCount = 0;
    let skippedProd = 0;
    for (const uid of userIds) {
      let hasProd = false;
      try {
        const prodRows = await base44.asServiceRole.entities.RevenueCatPurchase.filter(
          { user_id: uid, environment: 'PRODUCTION' },
          { limit: 100 },
        );
        const prodList = Array.isArray(prodRows) ? prodRows : (prodRows?.items || []);
        hasProd = prodList.some((r) => r.status === 'active' || r.status === 'paid');
      } catch (e) {
        console.error('Production check failed for', uid, e?.message || e);
        hasProd = true; // fail safe: never wipe a potential real purchase
      }
      if (hasProd) {
        skippedProd++;
        continue;
      }

      try {
        await base44.asServiceRole.entities.User.update(uid, {
          plan: 'observer',
          plan_expiration_date: PAST,
          subscription_status: 'none',
          subscription_id: '',
          manifestation_energy: 0,
          narration_energy: 0,
          energy_reset_date: PAST,
          google_trailblazer_expiration_date: PAST,
          google_trailblazer_manifestation_energy: 0,
          google_trailblazer_narration_energy: 0,
          google_trailblazer_energy_reset_date: PAST,
          aura_narration_energy: 0,
          aura_manifestation_energy: 0,
          aura_save_energy: 0,
        });
        resetCount++;
      } catch (e) {
        console.error('User reset failed for', uid, e?.message || e);
      }
    }

    console.log('Tester reset complete:', {
      sandbox_rows: sandboxCount,
      users_reset: resetCount,
      skipped_prod: skippedProd,
      batches,
    });

    return Response.json({
      success: true,
      enabled: true,
      sandbox_rows: sandboxCount,
      users_reset: resetCount,
      skipped_prod: skippedProd,
    });
  } catch (error) {
    console.error('reset-tester-access error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}