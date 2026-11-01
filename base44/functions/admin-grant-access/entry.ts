import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { PLANS } from '../../shared/plans.js';
import { planForLedgerProduct, planIdFromLedgerRows, fetchLedgerRows } from '../../shared/entitlement.js';
import { computeAppleSubscriptionGrantFields } from '../../shared/appleSubscriptionGrant.js';
import {
  ADMIN_GRANT_ENVIRONMENT,
  ADMIN_GRANT_STORE,
  GRANTABLE_PLAN_IDS,
  adminGrantProductId,
  isAdminGrantRow,
} from '../../shared/adminGrants.js';

// Admin-only access grants: give a user a paid tier until a date, or take it back.
//
// A grant is one RevenueCatPurchase row with the ADMIN_GRANT store and an
// admin_grant.<planId> product id. Every existing resolver (get-entitlement, the
// spend paths, the client helpers) already answers from the highest ranked ACTIVE
// ledger row, so the tier resolves with no changes on their side and ENDS BY
// ITSELF: once plan_expiration_date passes the row stops counting, and whatever
// is still active underneath — a real subscription, or nothing — wins again.
//
// Grants only ever raise. The mirror helper will not lower an active higher-rank
// plan, and revoking re-resolves the remaining ledger instead of blanking the
// account, so a paying subscriber always falls back to what they actually bought.

const DAY_MS = 86400000;
const MAX_GRANT_DAYS = 3650;
const NOTE_MAX = 240;

function fail(message, status = 400) {
  return Response.json({ error: message }, { status });
}

function readExpiration(body, now) {
  const days = Number(body?.days);
  if (Number.isFinite(days) && days > 0) {
    if (days > MAX_GRANT_DAYS) return null;
    return new Date(now.getTime() + Math.round(days) * DAY_MS).toISOString();
  }
  const parsed = body?.expires_at ? Date.parse(body.expires_at) : NaN;
  if (!Number.isFinite(parsed) || parsed <= now.getTime()) return null;
  return new Date(parsed).toISOString();
}

/** Expiry of the highest-ranked active row carrying this plan. */
function winningExpiration(rows, planId, now) {
  let best = null;
  for (const row of rows || []) {
    if (!row || planForLedgerProduct(row.product_id) !== planId) continue;
    if (row.status !== 'active' && row.status !== 'paid') continue;
    const ms = row.plan_expiration_date ? Date.parse(row.plan_expiration_date) : NaN;
    if (!Number.isFinite(ms) || ms <= now.getTime()) continue;
    if (best === null || ms > best) best = ms;
  }
  return best === null ? null : new Date(best).toISOString();
}

async function grantAccess(base44, adminUser, body, now) {
  const userId = String(body?.user_id || '').trim();
  if (!userId) return fail('user_id is required');

  const planId = String(body?.plan_id || '').trim();
  if (!GRANTABLE_PLAN_IDS.includes(planId)) {
    return fail(`plan_id must be one of: ${GRANTABLE_PLAN_IDS.join(', ')}`);
  }

  const expiresIso = readExpiration(body, now);
  if (!expiresIso) return fail(`Provide days (1-${MAX_GRANT_DAYS}) or a future expires_at`);

  const target = await base44.asServiceRole.entities.User
    .get(userId)
    .catch((e) => (e?.status === 404 ? null : Promise.reject(e)));
  if (!target) return fail('User not found', 404);
  if (target.role === 'admin') return fail('Admins already hold full access');

  const note = String(body?.note || '').trim().slice(0, NOTE_MAX);
  const stamp = crypto.randomUUID();
  const nowIso = now.toISOString();

  const row = {
    event_id: `admin_${stamp}`,
    event_type: 'ADMIN_GRANT',
    user_id: userId,
    app_user_id: userId,
    original_app_user_id: userId,
    product_id: adminGrantProductId(planId),
    product_name: `Admin grant — ${PLANS[planId]?.name || planId}`,
    store: ADMIN_GRANT_STORE,
    environment: ADMIN_GRANT_ENVIRONMENT,
    transaction_id: `admin_${stamp}`,
    purchase_date: nowIso,
    purchased_at: nowIso,
    plan_expiration_date: expiresIso,
    expiration_at: expiresIso,
    amount: 0,
    price: 0,
    currency: 'USD',
    status: 'active',
    granted_by_id: adminUser.id,
    aura_narration_granted: 0,
    aura_manifestation_granted: 0,
    aura_save_granted: 0,
  };
  if (note) row.grant_note = note;

  // The row is written first: the ledger is the authority, the User record only
  // mirrors it for display.
  const created = await base44.asServiceRole.entities.RevenueCatPurchase.create(row);

  // Mirror onto the display fields through the same helper a store purchase uses,
  // so an active higher-rank plan is never clobbered by a lower grant.
  const grantFields = computeAppleSubscriptionGrantFields(
    target,
    PLANS[planId],
    expiresIso,
    { subscriptionId: null, refillEnergy: true, now },
  );
  await base44.asServiceRole.entities.User.update(userId, grantFields.fields);

  const { rows } = await fetchLedgerRows(base44, userId);
  const effectivePlanId = planIdFromLedgerRows(rows, now);

  console.log('Admin grant created:', planId, 'until', expiresIso, 'for', userId, 'by', adminUser.id);
  return Response.json({
    ok: true,
    grant_id: created?.id || null,
    expires_at: expiresIso,
    plan_id: effectivePlanId,
    preserved_higher_plan: Boolean(grantFields.preservedHigherPlan),
  });
}

async function revokeAccess(base44, body, now) {
  const grantId = String(body?.grant_id || '').trim();
  if (!grantId) return fail('grant_id is required');

  const row = await base44.asServiceRole.entities.RevenueCatPurchase
    .get(grantId)
    .catch((e) => (e?.status === 404 ? null : Promise.reject(e)));
  if (!row) return fail('Grant not found', 404);
  // Only grants are revocable here — never a real store purchase.
  if (!isAdminGrantRow(row)) return fail('Only an admin grant can be revoked');

  const nowIso = now.toISOString();
  await base44.asServiceRole.entities.RevenueCatPurchase.update(row.id, {
    status: 'expired',
    plan_expiration_date: nowIso,
    expiration_at: nowIso,
    event_type: row.event_type === 'ADMIN_GRANT' ? 'ADMIN_REVOKE' : row.event_type,
  });

  const userId = row.user_id;
  const target = await base44.asServiceRole.entities.User
    .get(userId)
    .catch((e) => (e?.status === 404 ? null : Promise.reject(e)));

  // Re-resolve from what is left rather than blanking the account: a real
  // subscription underneath comes straight back.
  const { rows } = await fetchLedgerRows(base44, userId);
  const remainingPlanId = planIdFromLedgerRows(rows, now);

  if (target && target.role !== 'admin') {
    if (remainingPlanId === 'observer') {
      await base44.asServiceRole.entities.User.update(userId, {
        plan: 'observer',
        plan_expiration_date: null,
        subscription_status: 'expired',
        manifestation_energy: 0,
        narration_energy: 0,
      });
    } else {
      const expiration = winningExpiration(rows, remainingPlanId, now);
      if (expiration) {
        await base44.asServiceRole.entities.User.update(userId, {
          plan: remainingPlanId,
          plan_expiration_date: expiration,
          subscription_status: 'active',
        });
      }
    }
  }

  console.log('Admin grant revoked:', grantId, 'for', userId, '— now', remainingPlanId);
  return Response.json({ ok: true, plan_id: remainingPlanId });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const adminUser = await base44.auth.me().catch((e) => (e?.status === 401 ? null : Promise.reject(e)));
    if (!adminUser) return fail('Unauthorized', 401);
    if (adminUser.role !== 'admin') return fail('Forbidden', 403);

    const body = await req.json().catch(() => ({}));
    const now = new Date();

    if (body?.action === 'grant') return await grantAccess(base44, adminUser, body, now);
    if (body?.action === 'revoke') return await revokeAccess(base44, body, now);
    return fail('action must be "grant" or "revoke"');
  } catch (error) {
    console.error('admin-grant-access failed:', error?.message || error);
    return Response.json({ error: error?.message || 'Access change failed' }, { status: 500 });
  }
}