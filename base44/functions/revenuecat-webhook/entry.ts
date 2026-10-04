// RevenueCat webhook — Base44 access uses a service-role-only client (see shared/webhookClient.js).
// This file holds the entry point: Authorization + HMAC verification, the service client,
// the Google Trailblazer flow and event routing. Store-specific handlers live in base44/shared/webhook*.ts.
import { createClient } from 'npm:@base44/sdk@0.8.40';
import { buildWebhookServiceClient } from '../../shared/webhookClient.js';
import { PLANS, getNextResetDate } from '../../shared/plans.js';
import {
  GOOGLE_TRAILBLAZER_PRODUCT_ID,
  GRANT_EVENT_TYPES,
  REVOKE_EVENT_TYPES,
  buildGoogleTrailblazerGrantFields,
  computeGoogleTrailblazerExpiration,
  maxActiveGoogleExpiration,
  normalizeLedgerFields,
  resolveAppUserId,
  shouldProcessAppleAuraEvent,
  shouldProcessAppleSubscriptionEvent,
  shouldProcessAppleTrailblazerEvent,
  shouldProcessGoogleSubscriptionEvent,
  shouldProcessGoogleTrailblazerEvent,
  shouldProcessPlayAuraEvent,
} from '../../shared/revenuecat.js';
import {
  eventAlreadyApplied,
  findLedgerByTransaction,
  jsonResponse,
  mergeEventIds,
} from '../../shared/webhookCommon.ts';
import { handleAppleSubscriptionEvent } from '../../shared/webhookAppleSubscriptions.ts';
import { handleAppleAuraEvent } from '../../shared/webhookAppleAura.ts';
import { handleAppleTrailblazerEvent } from '../../shared/webhookAppleTrailblazer.ts';
import { handleGoogleSubscriptionEvent } from '../../shared/webhookGoogleSubscriptions.ts';
import { handlePlayAuraEvent } from '../../shared/webhookPlayAura.ts';

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

// Build marker returned on non-POST requests so a deploy can be confirmed from outside.
const WEBHOOK_BUILD = 'service-client-v3-split';

/**
 * Build the Base44 SDK client for a webhook request.
 * RevenueCat's Authorization header carries the webhook shared secret (already
 * validated by verifyAuthorization), not a Base44 user token. This builds a
 * service-role-only client straight from the platform-injected
 * Base44-Service-Authorization credential and never reads or forwards the
 * caller's Authorization header. The request-based SDK helper is not used
 * because it rejects any header that is not exactly "Bearer <token>".
 */
function createBase44Client(req: Request) {
  return buildWebhookServiceClient(req, createClient, Deno.env.get('BASE44_APP_ID') || '');
}

async function listUserGoogleLedger(base44: any, userId: string) {
  const rows = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
    user_id: userId,
    product_id: GOOGLE_TRAILBLAZER_PRODUCT_ID,
  });
  return rows || [];
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
      return jsonResponse({ error: 'Method not allowed', build: WEBHOOK_BUILD }, 405);
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
      return await handleAppleSubscriptionEvent(createBase44Client(req), event);
    }

    // Apple App Store Aura Bundle consumables (one-time energy top-ups).
    // Consumables fire NON_RENEWING_PURCHASE, not subscription lifecycle
    // events, so they need their own route — and they never touch the
    // generic plan fields.
    if (shouldProcessAppleAuraEvent(event)) {
      return await handleAppleAuraEvent(createBase44Client(req), event);
    }

    // Apple App Store Trailblazer one-time purchase (30-month non-renewing
    // product, native iOS only). Grants the existing generic Trailblazer
    // entitlement fields with Wix semantics — never the google_trailblazer_*
    // fields, which stay exclusive to the Android Play product below.
    if (shouldProcessAppleTrailblazerEvent(event)) {
      return await handleAppleTrailblazerEvent(createBase44Client(req), event);
    }

    // Google Play Explorer/Investigator subscriptions via Play Billing base
    // plans. Webhook product ids carry the base plan: explorer:monthly,
    // explorer:annual, investigator:monthly, investigator:annual.
    if (shouldProcessGoogleSubscriptionEvent(event)) {
      return await handleGoogleSubscriptionEvent(createBase44Client(req), event);
    }

    // Google Play Aura Bundle one-time products (bare Play IDs flicker,
    // apparition, haunting, spectral). Consumable-style energy top-ups that
    // reuse the generic aura_*_energy rollover fields — they never touch
    // plan/subscription fields or the google_trailblazer_* fields.
    if (shouldProcessPlayAuraEvent(event)) {
      return await handlePlayAuraEvent(createBase44Client(req), event);
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

    const base44 = createBase44Client(req);
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