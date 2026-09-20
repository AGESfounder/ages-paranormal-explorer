import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { PLANS, getGrantForProduct, getNextResetDate } from '../../shared/plans.js';
import {
  APPLE_AURA_GRANT_EVENT_TYPES,
  APPLE_STORE,
  APPLE_TRAILBLAZER_GRANT_EVENT_TYPES,
  APPLE_TRAILBLAZER_PRODUCT_ID,
  GOOGLE_TRAILBLAZER_PRODUCT_ID,
  GRANT_EVENT_TYPES,
  REVOKE_EVENT_TYPES,
  buildGoogleTrailblazerGrantFields,
  classifyAppleSubscriptionEvent,
  computeGoogleTrailblazerExpiration,
  getAppleAuraProduct,
  getAppleSubscriptionProduct,
  isAppleAuraRefundEvent,
  isAppleTrailblazerRefundEvent,
  latestActiveAppleSubscription,
  latestActiveAppleTrailblazerRow,
  maxActiveGoogleExpiration,
  normalizeAppleAuraLedgerFields,
  normalizeAppleLedgerFields,
  normalizeAppleTrailblazerLedgerFields,
  normalizeLedgerFields,
  resolveAppUserId,
  shouldProcessAppleAuraEvent,
  shouldProcessAppleSubscriptionEvent,
  shouldProcessAppleTrailblazerEvent,
  shouldProcessGoogleTrailblazerEvent,
} from '../../shared/revenuecat.js';

/**
 * Verify RevenueCat Authorization header (shared secret).
 * RevenueCat dashboard → Webhooks → Authorization header value.
 * Store the full expected header value (e.g. "Bearer <token>" or bare token)
 * in REVENUECAT_WEBHOOK_AUTH.
 */
function verifyAuthorization(req: Request): boolean {
  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!expected) {
    console.error('Missing REVENUECAT_WEBHOOK_AUTH');
    return false;
  }
  const header = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  if (!header) return false;
  // Accept exact match, or Bearer-prefixed forms either side.
  if (header === expected) return true;
  if (header === `Bearer ${expected}`) return true;
  if (expected.startsWith('Bearer ') && header === expected.slice(7)) return true;
  return false;
}

/**
 * Optional HMAC verification when RevenueCat webhook signing is enabled.
 * Header format: t=<unix_seconds>,v1=<hex>
 * Signed payload: `${timestamp}.${rawBody}`
 * Secret: REVENUECAT_WEBHOOK_SECRET
 */
async function verifyHmacIfConfigured(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!secret) {
    // HMAC not configured — authorization header alone is enough.
    return true;
  }

  const sigHeader =
    req.headers.get('X-RevenueCat-Signature') ||
    req.headers.get('X-RevenueCat-Webhook-Signature') ||
    req.headers.get('x-revenuecat-signature') ||
    '';

  if (!sigHeader) {
    console.error('REVENUECAT_WEBHOOK_SECRET set but signature header missing');
    return false;
  }

  const parts: Record<string, string> = {};
  for (const segment of sigHeader.split(',')) {
    const idx = segment.indexOf('=');
    if (idx > -1) {
      parts[segment.slice(0, idx).trim()] = segment.slice(idx + 1).trim();
    }
  }

  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  const ageSec = Date.now() / 1000 - parseInt(timestamp, 10);
  if (Number.isNaN(ageSec) || Math.abs(ageSec) > 86400) {
    // Reject timestamps older/newer than 24h to limit replay window
    console.error('RevenueCat HMAC timestamp out of range');
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const expected = [...new Uint8Array(sigBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time-ish compare
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

async function findLedgerByTransaction(base44: any, transactionId: string) {
  if (!transactionId) return null;
  const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
    transaction_id: transactionId,
  });
  if (rows?.length) return rows[0];

  // Fallback: some refunds key on original_transaction_id
  const byOriginal = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
    original_transaction_id: transactionId,
  });
  return byOriginal?.length ? byOriginal[0] : null;
}

async function listUserGoogleLedger(base44: any, userId: string) {
  const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
    user_id: userId,
    product_id: GOOGLE_TRAILBLAZER_PRODUCT_ID,
  });
  return rows || [];
}

function eventAlreadyApplied(row: any, eventId: string) {
  if (!eventId) return false;
  if (row.event_id === eventId) return true;
  if (Array.isArray(row.event_ids) && row.event_ids.includes(eventId)) return true;
  return false;
}

function mergeEventIds(row: any, eventId: string) {
  const set = new Set<string>(Array.isArray(row?.event_ids) ? row.event_ids : []);
  if (row?.event_id) set.add(row.event_id);
  if (eventId) set.add(eventId);
  return [...set];
}

/**
 * Apply a Google Trailblazer grant without touching Apple/Wix plan fields.
 * Extends google_trailblazer_expiration_date to max(existing, new) so out-of-order
 * events cannot shorten access. Energy is only filled on first active grant or
 * when the previous Google grant had already expired.
 */
async function applyGoogleGrant(base44: any, user: any, expirationIso: string, purchaseDateIso: string) {
  const plan = PLANS.trailblazer;
  const now = new Date();
  const existingExp = user.google_trailblazer_expiration_date
    ? new Date(user.google_trailblazer_expiration_date).getTime()
    : null;
  const newExp = new Date(expirationIso).getTime();

  let finalExpiration = expirationIso;
  if (existingExp !== null && !Number.isNaN(existingExp) && existingExp > newExp) {
    finalExpiration = user.google_trailblazer_expiration_date;
  }

  const googleStillActive =
    existingExp !== null && !Number.isNaN(existingExp) && existingExp > now.getTime();

  const fields = buildGoogleTrailblazerGrantFields({
    expirationIso: finalExpiration,
    // Only reset energy pools when there is no currently-active Google grant
    // (fresh purchase or re-purchase after expiry). Avoids duplicate energy on retries.
    manifestationEnergy: googleStillActive
      ? (user.google_trailblazer_manifestation_energy ?? plan.manifestation_energy)
      : plan.manifestation_energy,
    narrationEnergy: googleStillActive
      ? (user.google_trailblazer_narration_energy ?? plan.narration_energy)
      : plan.narration_energy,
    energyResetDate: googleStillActive && user.google_trailblazer_energy_reset_date
      ? user.google_trailblazer_energy_reset_date
      : getNextResetDate(),
  });

  // Never write plan, plan_expiration_date, subscription_*, or generic energy.
  await base44.asServiceRole.entities.User.update(user.id, fields);
  console.log(
    'Google Trailblazer grant applied',
    user.id,
    'expires',
    finalExpiration,
    'purchased',
    purchaseDateIso,
  );
}

/**
 * Recompute Google-only fields after a refund. Clears Google expiry when no
 * paid non-expired ledger rows remain. Never sets plan to observer.
 */
async function recomputeGoogleAccessAfterRefund(base44: any, userId: string) {
  const user = await base44.asServiceRole.entities.User.get(userId);
  if (!user) return;

  const ledger = await listUserGoogleLedger(base44, userId);
  const maxExp = maxActiveGoogleExpiration(ledger, new Date());

  if (!maxExp) {
    await base44.asServiceRole.entities.User.update(userId, {
      google_trailblazer_expiration_date: null,
      google_trailblazer_manifestation_energy: 0,
      google_trailblazer_narration_energy: 0,
      google_trailblazer_energy_reset_date: null,
    });
    console.log('Google Trailblazer access cleared after refund:', userId);
    return;
  }

  await base44.asServiceRole.entities.User.update(userId, {
    google_trailblazer_expiration_date: maxExp,
  });
  console.log('Google Trailblazer expiry recomputed after refund:', userId, maxExp);
}

export default async function (req: Request) {
  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    if (!verifyAuthorization(req)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const rawBody = await req.text();

    const hmacOk = await verifyHmacIfConfigured(req, rawBody);
    if (!hmacOk) {
      return jsonResponse({ error: 'Invalid signature' }, 401);
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400);
    }

    // RevenueCat wraps the event: { api_version, event: { ... } }
    const event = payload?.event || payload;

    if (!event || typeof event !== 'object') {
      return jsonResponse({ received: true, skipped: 'empty' });
    }

    // TEST pings and unrelated events: acknowledge without granting.
    if (event.type === 'TEST') {
      console.log('RevenueCat TEST event received');
      return jsonResponse({ received: true, test: true });
    }

    // Apple App Store Explorer/Investigator subscriptions via StoreKit.
    if (shouldProcessAppleSubscriptionEvent(event)) {
      return await handleAppleSubscriptionEvent(req, event);
    }

    // Apple App Store Aura Bundle consumables (one-time energy top-ups).
    // Consumables fire NON_RENEWING_PURCHASE, not subscription lifecycle
    // events, so they need their own route — and they never touch the
    // generic plan fields.
    if (shouldProcessAppleAuraEvent(event)) {
      return await handleAppleAuraEvent(req, event);
    }

    // Apple App Store Trailblazer one-time purchase (30-month non-renewing
    // product, native iOS only). Grants the existing generic Trailblazer
    // entitlement fields with Wix semantics — never the google_trailblazer_*
    // fields, which stay exclusive to the Android Play product below.
    if (shouldProcessAppleTrailblazerEvent(event)) {
      return await handleAppleTrailblazerEvent(req, event);
    }

    if (!shouldProcessGoogleTrailblazerEvent(event)) {
      console.log(
        'RevenueCat event ignored (store/product/type filter):',
        event.type,
        event.store,
        event.product_id,
      );
      return jsonResponse({ received: true, skipped: 'filtered' });
    }

    const base44 = createClientFromRequest(req);
    const eventId = event.id || event.event_id || '';
    const transactionId = event.transaction_id || event.original_transaction_id || '';

    if (!transactionId) {
      console.error('RevenueCat event missing transaction_id', eventId);
      return jsonResponse({ received: true, skipped: 'no_transaction' });
    }

    const appUserId = resolveAppUserId(event);
    if (!appUserId) {
      console.error('RevenueCat event has no mappable app_user_id', eventId);
      return jsonResponse({ received: true, skipped: 'anonymous_user' });
    }

    // Resolve Base44 user — app_user_id is the Base44 user.id set by the client.
    let user: any = null;
    try {
      user = await base44.asServiceRole.entities.User.get(appUserId);
    } catch (e) {
      console.error('User lookup failed for', appUserId, (e as Error).message);
    }

    if (!user) {
      console.error('No Base44 user for RevenueCat app_user_id', appUserId);
      // 200 so RC does not retry forever for permanently unmapped ids
      return jsonResponse({ received: true, skipped: 'user_not_found' });
    }

    const existing = await findLedgerByTransaction(base44, transactionId);

    // ── GRANT ──
    if (GRANT_EVENT_TYPES.has(event.type)) {
      if (existing && eventAlreadyApplied(existing, eventId)) {
        console.log('Duplicate grant event, skipping:', eventId);
        return jsonResponse({ received: true, duplicate: true });
      }

      // Already paid for this transaction with a different event id — record event, no re-grant energy
      if (existing && existing.status === 'paid') {
        const eventIds = mergeEventIds(existing, eventId);
        await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
          event_id: eventId || existing.event_id,
          event_ids: eventIds,
          event_type: event.type,
        });

        // Still ensure user expiry is at least this purchase's expiry (max)
        const purchasedAt = event.purchased_at_ms || Date.parse(existing.purchase_date);
        try {
          const expiration = computeGoogleTrailblazerExpiration(purchasedAt);
          await applyGoogleGrant(
            base44,
            user,
            expiration.toISOString(),
            new Date(Number(purchasedAt)).toISOString(),
          );
        } catch (e) {
          console.error('Re-apply grant on duplicate transaction failed:', (e as Error).message);
        }

        return jsonResponse({ received: true, idempotent: true });
      }

      const purchasedAtMs = event.purchased_at_ms;
      if (!purchasedAtMs) {
        console.error('Grant event missing purchased_at_ms', eventId);
        return jsonResponse({ error: 'missing purchased_at_ms' }, 400);
      }

      let expiration: Date;
      try {
        expiration = computeGoogleTrailblazerExpiration(purchasedAtMs);
      } catch (e) {
        console.error('Expiry calculation failed:', (e as Error).message);
        return jsonResponse({ error: 'invalid purchase date' }, 400);
      }

      const purchaseDateIso = new Date(Number(purchasedAtMs)).toISOString();
      const expirationIso = expiration.toISOString();
      const eventIds = mergeEventIds(existing, eventId);
      const ledgerFields = normalizeLedgerFields(event, {
        userId: user.id,
        purchaseDateIso,
        expirationIso,
        status: 'paid',
        eventIds,
      });

      try {
        if (existing) {
          // Previously refunded transaction being re-granted, or pending row
          await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, ledgerFields);
        } else {
          await base44.asServiceRole.entities.RevenueCatPurchase.create(ledgerFields);
        }

        await applyGoogleGrant(base44, user, expirationIso, purchaseDateIso);
      } catch (e) {
        console.error('Grant persistence failed:', (e as Error).message);
        // 5xx so RevenueCat retries
        return jsonResponse({ error: 'persistence_failed' }, 500);
      }

      return jsonResponse({ received: true, granted: true, expires: expirationIso });
    }

    // ── REVOKE / REFUND ──
    if (REVOKE_EVENT_TYPES.has(event.type)) {
      if (!existing) {
        // No matching paid row — acknowledge. Optionally record a refund stub.
        console.log('Refund event with no ledger row:', transactionId);
        return jsonResponse({ received: true, skipped: 'no_ledger' });
      }

      if (eventAlreadyApplied(existing, eventId) && existing.status === 'refunded') {
        return jsonResponse({ received: true, duplicate: true });
      }

      const eventIds = mergeEventIds(existing, eventId);

      try {
        await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
          status: 'refunded',
          event_id: eventId || existing.event_id,
          event_ids: eventIds,
          event_type: event.type,
        });

        await recomputeGoogleAccessAfterRefund(base44, existing.user_id || user.id);
      } catch (e) {
        console.error('Refund persistence failed:', (e as Error).message);
        return jsonResponse({ error: 'persistence_failed' }, 500);
      }

      return jsonResponse({ received: true, refunded: true });
    }

    return jsonResponse({ received: true, skipped: 'unhandled_type' });
  } catch (error) {
    console.error('revenuecat-webhook error:', (error as Error).message);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
}

// ── Apple App Store Explorer/Investigator subscriptions ─────────────────────
// Grants reuse the generic Base44 entitlement fields (plan,
// plan_expiration_date, subscription_status, subscription_id, energy) — the
// same fields the Wix payments-webhook writes. Google Trailblazer stays
// isolated in google_trailblazer_* and is untouched by this flow.

/**
 * Locate the ledger row for an Apple subscription. Renewals, cancellations,
 * and refunds each carry their own transaction_id but share the subscription
 * lineage's original_transaction_id, so both are tried.
 */
async function findAppleLedger(base44: any, event: any) {
  const txn = event.transaction_id || '';
  const origTxn = event.original_transaction_id || '';
  if (txn) {
    const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
      transaction_id: txn,
    });
    if (rows?.length) return rows[0];
  }
  if (origTxn && origTxn !== txn) {
    const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
      original_transaction_id: origTxn,
    });
    if (rows?.length) return rows[0];
  }
  return null;
}

/** Transaction ids identifying an Apple subscription lineage. */
function appleLineageKeys(event: any, row: any): string[] {
  return [
    row?.original_transaction_id,
    row?.transaction_id,
    event?.original_transaction_id,
    event?.transaction_id,
  ].filter((k): k is string => typeof k === 'string' && k.length > 0);
}

/**
 * The generic plan fields can only represent one subscription at a time.
 * Apple lifecycle events may rewrite them only when the user's current
 * subscription_id belongs to this Apple lineage (or is unset), so an Apple
 * refund/expiry cannot wipe a Wix or newer subscription's fields.
 */
function appleEventOwnsGenericPlan(user: any, event: any, row: any): boolean {
  if (!user.subscription_id) return true;
  return appleLineageKeys(event, row).includes(user.subscription_id);
}

/**
 * Apply an Apple Explorer/Investigator grant to the generic plan fields.
 * Out-of-order deliveries for the same plan can only extend
 * plan_expiration_date (max), never shorten it, and stale events do not
 * refill energy that was already granted for a newer period.
 */
async function applyAppleGrant(
  base44: any,
  user: any,
  plan: any,
  expirationIso: string,
  opts: { refillEnergy: boolean; subscriptionId?: string | null },
) {
  const newExp = Date.parse(expirationIso);
  const existingExp = user.plan_expiration_date ? Date.parse(user.plan_expiration_date) : null;
  const hasExisting = existingExp !== null && !Number.isNaN(existingExp);
  const samePlan = (user.plan || 'observer') === plan.id;

  let finalExpiration = expirationIso;
  if (samePlan && hasExisting && existingExp > newExp) {
    finalExpiration = user.plan_expiration_date;
  }
  // Event for an older period than the one already granted — keep energy as-is.
  const stale = samePlan && hasExisting && newExp < (existingExp as number);

  const fields: Record<string, unknown> = {
    plan: plan.id,
    plan_expiration_date: finalExpiration,
    subscription_status: 'active',
    subscription_id: opts.subscriptionId || user.subscription_id || null,
  };

  if (opts.refillEnergy && !stale) {
    fields.manifestation_energy = plan.manifestation_energy;
    fields.narration_energy = plan.narration_energy;
    fields.energy_reset_date = getNextResetDate();
  }

  await base44.asServiceRole.entities.User.update(user.id, fields);
}

/**
 * After an Apple refund or expiration, downgrade to observer unless another
 * active Apple subscription remains on the ledger. Energy is zeroed only when
 * no Apple subscription remains (mirrors the Wix cancel/expire downgrade).
 */
async function recomputeAppleAccessAfterRevoke(
  base44: any,
  user: any,
  revokeKeys: string[],
  statusWhenNone: 'canceled' | 'expired',
) {
  const ownsGenericPlan = !user.subscription_id || revokeKeys.includes(user.subscription_id);

  const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
    user_id: user.id,
    store: APPLE_STORE,
  });
  const remaining = latestActiveAppleSubscription(rows || [], new Date());

  if (remaining) {
    const plan = (PLANS as any)[remaining.product.plan_id];
    if (plan && ownsGenericPlan) {
      await base44.asServiceRole.entities.User.update(user.id, {
        plan: plan.id,
        plan_expiration_date: remaining.row.plan_expiration_date,
        subscription_status: 'active',
        subscription_id: remaining.row.original_transaction_id || remaining.row.transaction_id,
      });
      console.log('Apple revoke: kept remaining subscription', remaining.row.product_id, 'for', user.id);
    }
    return;
  }

  if (!ownsGenericPlan) {
    console.log('Apple revoke: generic plan belongs to another subscription, untouched:', user.id);
    return;
  }

  await base44.asServiceRole.entities.User.update(user.id, {
    plan: 'observer',
    manifestation_energy: 0,
    narration_energy: 0,
    subscription_status: statusWhenNone,
  });
  console.log('Apple subscription access revoked:', user.id, statusWhenNone);
}

/** Record a non-grant lifecycle event on the ledger row (idempotent bookkeeping). */
async function recordAppleLedgerEvent(base44: any, row: any, event: any, eventId: string) {
  if (!row) return;
  await base44.asServiceRole.entities.RevenueCatPurchase.update(row.id, {
    event_id: eventId || row.event_id,
    event_ids: mergeEventIds(row, eventId),
    event_type: event.type,
  });
}

/**
 * REFUND — store-support refund (CANCELLATION/EXPIRATION with CUSTOMER_SUPPORT,
 * or a defensive REFUND type). Revokes access immediately and marks the row
 * refunded. Prorated refunds from a same-group upgrade reference the OLD
 * product while the row already tracks the NEW one — never revoke those.
 */
async function handleAppleRefund(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
) {
  if (!existing) {
    console.log('Apple refund event with no ledger row:', transactionId);
    return jsonResponse({ received: true, skipped: 'no_ledger' });
  }
  if (existing.product_id !== event.product_id) {
    console.log('Apple refund for superseded product, ignoring:', event.product_id, 'row:', existing.product_id);
    return jsonResponse({ received: true, skipped: 'superseded_product' });
  }
  try {
    await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
      status: 'refunded',
      event_id: eventId || existing.event_id,
      event_ids: mergeEventIds(existing, eventId),
      event_type: event.type,
    });
    await recomputeAppleAccessAfterRevoke(base44, user, appleLineageKeys(event, existing), 'canceled');
  } catch (e) {
    console.error('Apple refund persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }
  return jsonResponse({ received: true, refunded: true });
}

/** EXPIRATION — the paid period ended and access should be removed. */
async function handleAppleExpiration(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
) {
  if (!existing) {
    console.log('Apple expiration event with no ledger row:', transactionId);
    return jsonResponse({ received: true, skipped: 'no_ledger' });
  }
  if (existing.product_id !== event.product_id) {
    return jsonResponse({ received: true, skipped: 'superseded_product' });
  }
  try {
    await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
      status: 'expired',
      event_id: eventId || existing.event_id,
      event_ids: mergeEventIds(existing, eventId),
      event_type: event.type,
    });
    await recomputeAppleAccessAfterRevoke(base44, user, appleLineageKeys(event, existing), 'expired');
  } catch (e) {
    console.error('Apple expiration persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }
  return jsonResponse({ received: true, expired: true });
}

/**
 * CANCELLATION — auto-renew turned off. Access continues until
 * plan_expiration_date (isGenericPlanActive honors the date first); the later
 * EXPIRATION event performs the actual downgrade.
 */
async function handleAppleCancel(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
) {
  try {
    if (appleEventOwnsGenericPlan(user, event, existing)) {
      const updates: Record<string, unknown> = { subscription_status: 'canceled' };
      if (event.expiration_at_ms) {
        // Keep the furthest known expiry — never shorten access on reorder.
        const newExp = Number(event.expiration_at_ms);
        const existingExp = user.plan_expiration_date ? Date.parse(user.plan_expiration_date) : null;
        updates.plan_expiration_date =
          existingExp !== null && !Number.isNaN(existingExp) && existingExp > newExp
            ? user.plan_expiration_date
            : new Date(newExp).toISOString();
      }
      await base44.asServiceRole.entities.User.update(user.id, updates);
    }
    await recordAppleLedgerEvent(base44, existing, event, eventId);
  } catch (e) {
    console.error('Apple cancellation persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }
  return jsonResponse({ received: true, cancelled: true });
}

/** UNCANCELLATION — auto-renew re-enabled before expiry; restore active status. */
async function handleAppleUncancel(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
  product: any,
) {
  try {
    if (appleEventOwnsGenericPlan(user, event, existing)) {
      const plan = (PLANS as any)[product.plan_id];
      if (plan && event.expiration_at_ms) {
        await applyAppleGrant(base44, user, plan, new Date(Number(event.expiration_at_ms)).toISOString(), {
          refillEnergy: false,
          subscriptionId: event.original_transaction_id || transactionId,
        });
      } else {
        await base44.asServiceRole.entities.User.update(user.id, { subscription_status: 'active' });
      }
    }
    await recordAppleLedgerEvent(base44, existing, event, eventId);
  } catch (e) {
    console.error('Apple uncancellation persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }
  return jsonResponse({ received: true, uncancelled: true });
}

/**
 * PRODUCT_CHANGE — bookkeeping only. The paired RENEWAL carries the new
 * product + expiration (immediately for upgrades, at period end for
 * downgrades) and performs the actual plan change.
 */
async function handleAppleProductChange(base44: any, existing: any, event: any, eventId: string) {
  try {
    await recordAppleLedgerEvent(base44, existing, event, eventId);
  } catch (e) {
    console.error('Apple product_change ledger update failed:', (e as Error).message);
  }
  return jsonResponse({ received: true, product_change: true });
}

/**
 * GRANT — INITIAL_PURCHASE / RENEWAL. Grants the mapped plan on the generic
 * fields and upserts the ledger row. RENEWAL also covers resubscribe-after-
 * lapse and the new product of a same-group upgrade/downgrade.
 */
async function handleAppleGrant(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
  productId: string,
  product: any,
) {
  const expirationMs = event.expiration_at_ms;
  if (!expirationMs) {
    console.error('Apple grant event missing expiration_at_ms', eventId);
    return jsonResponse({ error: 'missing expiration_at_ms' }, 400);
  }
  const plan = (PLANS as any)[product.plan_id];
  if (!plan) {
    console.error('No plan mapped for Apple product', productId);
    return jsonResponse({ error: 'unmapped product' }, 400);
  }
  const expirationIso = new Date(Number(expirationMs)).toISOString();
  const purchasedAtMs = event.purchased_at_ms || event.event_timestamp_ms || Date.now();
  const purchaseDateIso = new Date(Number(purchasedAtMs)).toISOString();

  try {
    await applyAppleGrant(base44, user, plan, expirationIso, {
      refillEnergy: true,
      subscriptionId: event.original_transaction_id || transactionId,
    });

    // A stale (out-of-order) grant must not regress the ledger row's tracked
    // period — merge the event id only, keep the newer row data.
    const existingExp = existing?.plan_expiration_date ? Date.parse(existing.plan_expiration_date) : null;
    const staleForLedger =
      existingExp !== null && !Number.isNaN(existingExp) && existingExp > Number(expirationMs);

    if (existing && staleForLedger) {
      await recordAppleLedgerEvent(base44, existing, event, eventId);
    } else {
      const ledgerFields = normalizeAppleLedgerFields(event, {
        userId: user.id,
        productId,
        purchaseDateIso,
        expirationIso,
        status: 'active',
        eventIds: mergeEventIds(existing, eventId),
      });
      if (existing) {
        // Renewals / resubscribes update the subscription's existing row.
        await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, ledgerFields);
      } else {
        await base44.asServiceRole.entities.RevenueCatPurchase.create(ledgerFields);
      }
    }
  } catch (e) {
    console.error('Apple grant persistence failed:', (e as Error).message);
    // 5xx so RevenueCat retries
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }

  console.log('Apple subscription grant applied:', user.id, plan.id, event.type, 'expires', expirationIso);
  return jsonResponse({ received: true, granted: true, plan: plan.id, expires: expirationIso });
}

/**
 * Route an Apple App Store subscription lifecycle event.
 * Mirrors the Google flow: auth is verified by the caller, the Base44 user is
 * resolved from app_user_id, and event-level idempotency uses the ledger row's
 * event_ids.
 */
async function handleAppleSubscriptionEvent(req: Request, event: any) {
  const base44 = createClientFromRequest(req);
  const eventId = event.id || event.event_id || '';
  const transactionId = event.transaction_id || event.original_transaction_id || '';

  if (!transactionId) {
    console.error('Apple event missing transaction_id', eventId);
    return jsonResponse({ received: true, skipped: 'no_transaction' });
  }

  const appUserId = resolveAppUserId(event);
  if (!appUserId) {
    console.error('Apple event has no mappable app_user_id', eventId);
    return jsonResponse({ received: true, skipped: 'anonymous_user' });
  }

  // Resolve Base44 user — app_user_id is the Base44 user.id set by the client.
  let user: any = null;
  try {
    user = await base44.asServiceRole.entities.User.get(appUserId);
  } catch (e) {
    console.error('User lookup failed for', appUserId, (e as Error).message);
  }

  if (!user) {
    console.error('No Base44 user for RevenueCat app_user_id', appUserId);
    // 200 so RC does not retry forever for permanently unmapped ids
    return jsonResponse({ received: true, skipped: 'user_not_found' });
  }

  const action = classifyAppleSubscriptionEvent(event);
  const productId = event.type === 'PRODUCT_CHANGE' ? event.new_product_id : event.product_id;
  const product = getAppleSubscriptionProduct(productId);
  if (!action || !product) {
    return jsonResponse({ received: true, skipped: 'unhandled_type' });
  }

  const existing = await findAppleLedger(base44, event);

  if (existing && eventAlreadyApplied(existing, eventId)) {
    console.log('Duplicate Apple event, skipping:', eventId);
    return jsonResponse({ received: true, duplicate: true });
  }

  switch (action) {
    case 'refund':
      return await handleAppleRefund(base44, user, event, existing, eventId, transactionId);
    case 'expire':
      return await handleAppleExpiration(base44, user, event, existing, eventId, transactionId);
    case 'cancel':
      return await handleAppleCancel(base44, user, event, existing, eventId);
    case 'uncancel':
      return await handleAppleUncancel(base44, user, event, existing, eventId, transactionId, product);
    case 'product_change':
      return await handleAppleProductChange(base44, existing, event, eventId);
    default:
      return await handleAppleGrant(
        base44,
        user,
        event,
        existing,
        eventId,
        transactionId,
        productId,
        product,
      );
  }
}

// ── Apple App Store Aura Bundle consumables ───────────────────────────────
// One-time consumable top-ups. The grant mirrors the Wix payments-webhook
// Aura path exactly: additive aura_narration_energy / aura_manifestation_energy
// computed by getGrantForProduct (shared/plans.js). These events never read
// or write plan, plan_expiration_date, subscription_*, or the monthly energy
// fields — AURA is a consumable, not a subscription.

/**
 * Apply an Aura Bundle grant to the rollover aura pools only (additive).
 * Reuses the exact Wix reward mapping (80% narration / 20% manifestation).
 */
async function applyAppleAuraGrant(base44: any, user: any, bundleId: string) {
  const grant = getGrantForProduct(bundleId);
  if (!grant || (!grant.aura_narration_add && !grant.aura_manifestation_add)) {
    throw new Error(`No Aura grant mapped for bundle ${bundleId}`);
  }

  const auraNarration = (user.aura_narration_energy || 0) + (grant.aura_narration_add || 0);
  const auraManifestation = (user.aura_manifestation_energy || 0) + (grant.aura_manifestation_add || 0);

  await base44.asServiceRole.entities.User.update(user.id, {
    aura_narration_energy: auraNarration,
    aura_manifestation_energy: auraManifestation,
  });

  return { auraNarration, auraManifestation };
}

/**
 * Refund of an Aura consumable (CANCELLATION from store support, or a
 * defensive REFUND type). Marks the ledger row refunded and removes exactly
 * the granted bundle energy, floored at 0 so partially-spent pools never go
 * negative. Never touches plan fields.
 */
async function handleAppleAuraRefund(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
) {
  if (!existing) {
    // No matching paid row — acknowledge (mirrors the Google refund path).
    console.log('Apple Aura refund event with no ledger row:', transactionId);
    return jsonResponse({ received: true, skipped: 'no_ledger' });
  }

  if (eventAlreadyApplied(existing, eventId) && existing.status === 'refunded') {
    return jsonResponse({ received: true, duplicate: true });
  }

  const auraProduct = getAppleAuraProduct(event.product_id);
  const grant = auraProduct ? getGrantForProduct(auraProduct.bundle_id) : null;

  try {
    await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
      status: 'refunded',
      event_id: eventId || existing.event_id,
      event_ids: mergeEventIds(existing, eventId),
      event_type: event.type,
    });

    // Only claw back energy this ledger row actually granted (status 'paid').
    // Re-fetch the user so concurrent grants are not overwritten.
    if (grant && existing.status === 'paid') {
      const freshUser = await base44.asServiceRole.entities.User.get(user.id);
      const auraNarration = Math.max(
        0,
        (freshUser?.aura_narration_energy || 0) - (grant.aura_narration_add || 0),
      );
      const auraManifestation = Math.max(
        0,
        (freshUser?.aura_manifestation_energy || 0) - (grant.aura_manifestation_add || 0),
      );
      await base44.asServiceRole.entities.User.update(user.id, {
        aura_narration_energy: auraNarration,
        aura_manifestation_energy: auraManifestation,
      });
      console.log('Apple Aura refund clawed back energy:', user.id, event.product_id);
    }
  } catch (e) {
    console.error('Apple Aura refund persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }

  return jsonResponse({ received: true, refunded: true });
}

/**
 * Route an Apple App Store Aura Bundle consumable event.
 * Mirrors the Google flow: the Base44 user is resolved from app_user_id, the
 * ledger row is keyed by transaction_id, and event-level idempotency uses the
 * ledger row's event_ids. Grants are additive aura energy only — never plan
 * or subscription fields.
 */
async function handleAppleAuraEvent(req: Request, event: any) {
  const base44 = createClientFromRequest(req);
  const eventId = event.id || event.event_id || '';
  const transactionId = event.transaction_id || event.original_transaction_id || '';

  if (!transactionId) {
    console.error('Apple Aura event missing transaction_id', eventId);
    return jsonResponse({ received: true, skipped: 'no_transaction' });
  }

  const appUserId = resolveAppUserId(event);
  if (!appUserId) {
    console.error('Apple Aura event has no mappable app_user_id', eventId);
    return jsonResponse({ received: true, skipped: 'anonymous_user' });
  }

  // Resolve Base44 user — app_user_id is the Base44 user.id set by the client.
  let user: any = null;
  try {
    user = await base44.asServiceRole.entities.User.get(appUserId);
  } catch (e) {
    console.error('User lookup failed for', appUserId, (e as Error).message);
  }

  if (!user) {
    console.error('No Base44 user for RevenueCat app_user_id', appUserId);
    // 200 so RC does not retry forever for permanently unmapped ids
    return jsonResponse({ received: true, skipped: 'user_not_found' });
  }

  const auraProduct = getAppleAuraProduct(event.product_id);
  if (!auraProduct) {
    return jsonResponse({ received: true, skipped: 'unmapped_product' });
  }

  const existing = await findLedgerByTransaction(base44, transactionId);

  // ── REFUND / REVOKE ──
  if (isAppleAuraRefundEvent(event)) {
    return await handleAppleAuraRefund(base44, user, event, existing, eventId, transactionId);
  }

  // ── GRANT (NON_RENEWING_PURCHASE / INITIAL_PURCHASE) ──
  if (!APPLE_AURA_GRANT_EVENT_TYPES.has(event.type)) {
    return jsonResponse({ received: true, skipped: 'unhandled_type' });
  }

  if (existing && eventAlreadyApplied(existing, eventId)) {
    console.log('Duplicate Apple Aura event, skipping:', eventId);
    return jsonResponse({ received: true, duplicate: true });
  }

  // One transaction = one grant. A new event id for an already-paid
  // transaction is bookkeeping only — never re-grant energy.
  if (existing && existing.status === 'paid') {
    try {
      await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
        event_id: eventId || existing.event_id,
        event_ids: mergeEventIds(existing, eventId),
        event_type: event.type,
      });
    } catch (e) {
      console.error('Apple Aura idempotent ledger update failed:', (e as Error).message);
    }
    return jsonResponse({ received: true, idempotent: true });
  }

  const purchasedAtMs = event.purchased_at_ms || event.event_timestamp_ms || Date.now();
  const purchaseDateIso = new Date(Number(purchasedAtMs)).toISOString();
  const ledgerFields = normalizeAppleAuraLedgerFields(event, {
    userId: user.id,
    purchaseDateIso,
    status: 'paid',
    eventIds: mergeEventIds(existing, eventId),
  });

  try {
    if (existing) {
      // Previously refunded transaction being re-granted, or a pending row.
      await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, ledgerFields);
    } else {
      await base44.asServiceRole.entities.RevenueCatPurchase.create(ledgerFields);
    }

    const { auraNarration, auraManifestation } = await applyAppleAuraGrant(
      base44,
      user,
      auraProduct.bundle_id,
    );
    console.log(
      'Apple Aura grant applied:', user.id, event.product_id,
      'aura_narration:', auraNarration, 'aura_manifestation:', auraManifestation,
    );
  } catch (e) {
    console.error('Apple Aura grant persistence failed:', (e as Error).message);
    // 5xx so RevenueCat retries
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }

  return jsonResponse({ received: true, granted: true, bundle: auraProduct.bundle_id });
}

// ── Apple App Store Trailblazer one-time purchase ───────────────────────────
// Non-renewing 30-month product bought only on native iOS. The grant mirrors
// the Wix payments-webhook Trailblazer path (getGrantForProduct('trailblazer'))
// on the EXISTING generic entitlement fields: plan 'trailblazer',
// plan_expiration_date = purchase + 30 calendar months UTC, energy pools,
// subscription_status 'none'. No parallel entitlement model. Android keeps the
// isolated google_trailblazer_* flow above; subscription and Aura flows are
// untouched.

/** Transaction ids identifying an Apple Trailblazer purchase. */
function appleTrailblazerKeys(event: any, row: any): string[] {
  return [
    row?.original_transaction_id,
    row?.transaction_id,
    event?.original_transaction_id,
    event?.transaction_id,
  ].filter((k): k is string => typeof k === 'string' && k.length > 0);
}

/**
 * The generic plan fields can only represent one grant at a time. An Apple
 * Trailblazer event may rewrite them only when the user's current
 * subscription_id belongs to this purchase's lineage (or is unset), so an
 * Apple refund cannot wipe a Wix Trailblazer or another live subscription.
 */
function appleTrailblazerOwnsGenericPlan(user: any, event: any, row: any): boolean {
  if (!user.subscription_id) return true;
  return appleTrailblazerKeys(event, row).includes(user.subscription_id);
}

/** True while the generic plan fields hold an active Trailblazer grant. */
function genericTrailblazerActive(user: any, now = new Date()): boolean {
  if (!user || user.plan !== 'trailblazer') return false;
  const expMs = user.plan_expiration_date ? Date.parse(user.plan_expiration_date) : NaN;
  return !Number.isNaN(expMs) && expMs > now.getTime();
}

/**
 * Apply the Apple Trailblazer grant to the generic plan fields, mirroring the
 * Wix one-time grant. Out-of-order deliveries can only extend
 * plan_expiration_date (max), never shorten it; energy is refilled only when
 * no generic Trailblazer grant is currently active, so a webhook retry or a
 * repurchase mid-term never double-fills the pools.
 */
async function applyAppleTrailblazerGrant(base44: any, user: any, expirationIso: string) {
  const plan = (PLANS as any).trailblazer;
  if (!plan) {
    throw new Error('PLANS.trailblazer missing');
  }

  const now = new Date();
  const newExp = Date.parse(expirationIso);
  const existingExp = user.plan_expiration_date ? Date.parse(user.plan_expiration_date) : null;
  const hasExisting = existingExp !== null && !Number.isNaN(existingExp);
  const samePlan = (user.plan || 'observer') === 'trailblazer';

  let finalExpiration = expirationIso;
  if (samePlan && hasExisting && (existingExp as number) > newExp) {
    finalExpiration = user.plan_expiration_date;
  }

  // Refill energy only when there is no currently-active generic Trailblazer
  // grant (fresh purchase or re-purchase after expiry).
  const trailblazerStillActive = genericTrailblazerActive(user, now);

  const fields: Record<string, unknown> = {
    plan: plan.id,
    plan_expiration_date: finalExpiration,
    // Wix grant semantics: a one-time purchase is not an auto-renewing sub.
    subscription_status: 'none',
  };

  if (!trailblazerStillActive) {
    fields.manifestation_energy = plan.manifestation_energy;
    fields.narration_energy = plan.narration_energy;
    fields.energy_reset_date = getNextResetDate();
  }

  await base44.asServiceRole.entities.User.update(user.id, fields);
  console.log(
    'Apple Trailblazer grant applied:',
    user.id,
    'expires',
    finalExpiration,
    'energyRefill',
    !trailblazerStillActive,
  );
}

/**
 * After an Apple Trailblazer refund, recompute the generic plan fields.
 * If another still-active paid Apple Trailblazer ledger row exists, keep the
 * newer expiry instead of revoking. Otherwise revoke the generic Trailblazer
 * fields exactly like the Wix cancel/expire path (observer, energy zeroed,
 * subscription_status 'canceled') — but only when this purchase's lineage
 * owns the generic plan fields, so a Wix Trailblazer or live subscription
 * belonging to another flow is never clobbered.
 */
async function recomputeAppleTrailblazerAfterRefund(
  base44: any,
  user: any,
  revokeKeys: string[],
) {
  const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
    user_id: user.id,
    store: APPLE_STORE,
    product_id: APPLE_TRAILBLAZER_PRODUCT_ID,
  });
  const remaining = latestActiveAppleTrailblazerRow(rows || [], new Date());

  const ownsGenericPlan =
    !user.subscription_id || revokeKeys.includes(user.subscription_id);

  if (remaining) {
    // A newer Apple Trailblazer purchase is still active — keep it.
    if (ownsGenericPlan && user.plan === 'trailblazer') {
      await base44.asServiceRole.entities.User.update(user.id, {
        plan_expiration_date: remaining.row.plan_expiration_date,
        subscription_id:
          remaining.row.original_transaction_id || remaining.row.transaction_id,
      });
      console.log(
        'Apple Trailblazer refund: kept newer active purchase',
        remaining.row.transaction_id,
        'for',
        user.id,
      );
    }
    return;
  }

  if (!ownsGenericPlan) {
    console.log(
      'Apple Trailblazer refund: generic plan belongs to another purchase, untouched:',
      user.id,
    );
    return;
  }

  if (user.plan !== 'trailblazer') {
    // Nothing to revoke on the generic fields.
    return;
  }

  await base44.asServiceRole.entities.User.update(user.id, {
    plan: 'observer',
    manifestation_energy: 0,
    narration_energy: 0,
    subscription_status: 'canceled',
  });
  console.log('Apple Trailblazer access revoked after refund:', user.id);
}

/**
 * Refund / cancellation of the Apple Trailblazer one-time purchase. Marks the
 * ledger row refunded and recomputes generic access without ever revoking a
 * newer active Trailblazer purchase (lineage/transaction checked).
 */
async function handleAppleTrailblazerRefund(
  base44: any,
  user: any,
  event: any,
  existing: any,
  eventId: string,
  transactionId: string,
) {
  if (!existing) {
    console.log('Apple Trailblazer refund event with no ledger row:', transactionId);
    return jsonResponse({ received: true, skipped: 'no_ledger' });
  }

  if (eventAlreadyApplied(existing, eventId) && existing.status === 'refunded') {
    return jsonResponse({ received: true, duplicate: true });
  }

  // Defensive: never revoke if the refund's product doesn't match the row.
  if (existing.product_id !== event.product_id) {
    console.log(
      'Apple Trailblazer refund product mismatch, ignoring:',
      event.product_id,
      'row:',
      existing.product_id,
    );
    return jsonResponse({ received: true, skipped: 'product_mismatch' });
  }

  try {
    await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, {
      status: 'refunded',
      event_id: eventId || existing.event_id,
      event_ids: mergeEventIds(existing, eventId),
      event_type: event.type,
    });

    await recomputeAppleTrailblazerAfterRefund(
      base44,
      user,
      appleTrailblazerKeys(event, existing),
    );
  } catch (e) {
    console.error('Apple Trailblazer refund persistence failed:', (e as Error).message);
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }

  return jsonResponse({ received: true, refunded: true });
}

/**
 * Route an Apple App Store Trailblazer event.
 * Mirrors the Google one-time flow: the Base44 user is resolved from
 * app_user_id, the ledger row is keyed by transaction_id (fallback to
 * original_transaction_id), and event-level idempotency uses the ledger row's
 * event_ids. Grants write only the generic Trailblazer fields.
 */
async function handleAppleTrailblazerEvent(req: Request, event: any) {
  const base44 = createClientFromRequest(req);
  const eventId = event.id || event.event_id || '';
  const transactionId = event.transaction_id || event.original_transaction_id || '';

  if (!transactionId) {
    console.error('Apple Trailblazer event missing transaction_id', eventId);
    return jsonResponse({ received: true, skipped: 'no_transaction' });
  }

  const appUserId = resolveAppUserId(event);
  if (!appUserId) {
    console.error('Apple Trailblazer event has no mappable app_user_id', eventId);
    return jsonResponse({ received: true, skipped: 'anonymous_user' });
  }

  // Resolve Base44 user — app_user_id is the Base44 user.id set by the client.
  let user: any = null;
  try {
    user = await base44.asServiceRole.entities.User.get(appUserId);
  } catch (e) {
    console.error('User lookup failed for', appUserId, (e as Error).message);
  }

  if (!user) {
    console.error('No Base44 user for RevenueCat app_user_id', appUserId);
    // 200 so RC does not retry forever for permanently unmapped ids
    return jsonResponse({ received: true, skipped: 'user_not_found' });
  }

  const existing = await findLedgerByTransaction(base44, transactionId);

  // ── REFUND / REVOKE ──
  if (isAppleTrailblazerRefundEvent(event)) {
    return await handleAppleTrailblazerRefund(
      base44,
      user,
      event,
      existing,
      eventId,
      transactionId,
    );
  }

  // ── GRANT (NON_RENEWING_PURCHASE / INITIAL_PURCHASE) ──
  if (!APPLE_TRAILBLAZER_GRANT_EVENT_TYPES.has(event.type)) {
    return jsonResponse({ received: true, skipped: 'unhandled_type' });
  }

  if (existing && eventAlreadyApplied(existing, eventId)) {
    console.log('Duplicate Apple Trailblazer event, skipping:', eventId);
    return jsonResponse({ received: true, duplicate: true });
  }

  const purchasedAtMs = event.purchased_at_ms || event.event_timestamp_ms || Date.now();
  let expiration: Date;
  try {
    // purchase timestamp + 30 calendar months (UTC) — same window as Wix/Play.
    expiration = computeGoogleTrailblazerExpiration(purchasedAtMs);
  } catch (e) {
    console.error('Apple Trailblazer expiry calculation failed:', (e as Error).message);
    return jsonResponse({ error: 'invalid purchase date' }, 400);
  }

  const purchaseDateIso = new Date(Number(purchasedAtMs)).toISOString();
  const expirationIso = expiration.toISOString();
  const subscriptionId = event.original_transaction_id || event.transaction_id || transactionId;

  try {
    await applyAppleTrailblazerGrant(base44, user, expirationIso);

    const ledgerFields = normalizeAppleTrailblazerLedgerFields(event, {
      userId: user.id,
      purchaseDateIso,
      expirationIso,
      status: 'paid',
      eventIds: mergeEventIds(existing, eventId),
    });

    if (existing) {
      // Previously refunded transaction being re-granted, or a pending row.
      await base44.asServiceRole.entities.RevenueCatPurchase.update(existing.id, ledgerFields);
    } else {
      await base44.asServiceRole.entities.RevenueCatPurchase.create(ledgerFields);
    }

    // Record the lineage key so future refund/expiration events can prove
    // ownership of the generic plan fields.
    await base44.asServiceRole.entities.User.update(user.id, {
      subscription_id: subscriptionId,
    });
  } catch (e) {
    console.error('Apple Trailblazer grant persistence failed:', (e as Error).message);
    // 5xx so RevenueCat retries
    return jsonResponse({ error: 'persistence_failed' }, 500);
  }

  console.log('Apple Trailblazer granted:', user.id, event.type, 'expires', expirationIso);
  return jsonResponse({ received: true, granted: true, plan: 'trailblazer', expires: expirationIso });
}