import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { PLANS, getNextResetDate } from '../../shared/plans.js';

// Trailblazer product IDs (Google Play + Apple)
const TRAILBLAZER_PRODUCT_IDS = [
  'trailblazer.30month',                    // Google Play
  'com.ages.explorer.trailblazer.30month',  // Apple App Store
];
const TRAILBLAZER_DURATION_MONTHS = PLANS.trailblazer.duration_months; // 30

// Add calendar months to a date
function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Constant-time string comparison (prevents timing attacks)
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// HMAC-SHA256 signature verification (optional, if signing secret is set)
async function verifyHmac(body, sigHeader, secret, toleranceSec = 300) {
  const parts = {};
  sigHeader.split(',').forEach(p => {
    const idx = p.indexOf('=');
    if (idx > -1) parts[p.slice(0, idx)] = p.slice(idx + 1);
  });
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;
  const ageSec = Date.now() / 1000 - parseInt(timestamp, 10);
  if (ageSec > toleranceSec) return false;
  const signedPayload = `${timestamp}.${body}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const expected = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
  return safeEqual(expected, signature);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.text();

    // ── Security layer 1: Authorization header ──
    const authHeader = req.headers.get('authorization') || '';
    const expectedAuth = secrets.get('REVENUECAT_WEBHOOK_AUTHORIZATION');
    if (!expectedAuth) {
      console.error('Missing REVENUECAT_WEBHOOK_AUTHORIZATION secret');
      return new Response(null, { status: 500 });
    }
    if (!authHeader || !safeEqual(authHeader, expectedAuth)) {
      console.error('Authorization header mismatch');
      return new Response(null, { status: 401 });
    }

    // ── Security layer 2: HMAC signature (optional, if signing secret is set) ──
    const signingSecret = secrets.get('REVENUECAT_WEBHOOK_SIGNING_SECRET');
    if (signingSecret) {
      const sigHeader = req.headers.get('x-revenuecat-webhook-signature');
      if (!sigHeader) {
        console.error('Missing X-RevenueCat-Webhook-Signature header');
        return new Response(null, { status: 401 });
      }
      const ok = await verifyHmac(body, sigHeader, signingSecret);
      if (!ok) {
        console.error('HMAC signature verification failed');
        return new Response(null, { status: 401 });
      }
    }

    // ── Parse event ──
    const payload = JSON.parse(body);
    const event = payload.event;
    if (!event) {
      console.error('No event in payload');
      return new Response(null, { status: 400 });
    }

    const eventId = event.id;
    const eventType = event.type;
    const appUserId = event.app_user_id;
    const productId = event.product_id;
    const store = event.store;
    const environment = event.environment;
    const purchasedAtMs = event.purchased_at_ms;
    const originalTransactionId = event.original_transaction_id;
    const transactionId = event.transaction_id;
    const price = event.price;
    const currency = event.currency;

    // ── Idempotency: skip if this event was already processed ──
    if (eventId) {
      const existing = await base44.asServiceRole.entities.RevenueCatPurchase.filter({ event_id: eventId });
      if (existing.length > 0) {
        console.log('Duplicate event skipped:', eventId);
        return new Response(null, { status: 200 });
      }
    }

    // Only handle Trailblazer products
    if (!TRAILBLAZER_PRODUCT_IDS.includes(productId)) {
      console.log('Ignoring non-Trailblazer product:', productId);
      return new Response(null, { status: 200 });
    }

    // ── INITIAL_PURCHASE / NON_RENEWING_PURCHASE: grant 30-month access ──
    if (eventType === 'INITIAL_PURCHASE' || eventType === 'NON_RENEWING_PURCHASE') {
      const purchasedAt = purchasedAtMs ? new Date(purchasedAtMs).toISOString() : new Date().toISOString();
      const expiration = addMonths(new Date(purchasedAt), TRAILBLAZER_DURATION_MONTHS).toISOString();

      // Look up the user
      let user = null;
      try {
        user = await base44.asServiceRole.entities.User.get(appUserId);
      } catch (e) {
        console.error('User lookup failed:', appUserId, e.message);
      }

      if (user) {
        // Only grant if new expiration is later than current, or user isn't already trailblazer
        const currentExpiration = user.plan_expiration_date ? new Date(user.plan_expiration_date) : null;
        const shouldGrant = !currentExpiration || new Date(expiration) > currentExpiration || user.plan !== 'trailblazer';

        if (shouldGrant) {
          await base44.asServiceRole.entities.User.update(user.id, {
            plan: 'trailblazer',
            manifestation_energy: PLANS.trailblazer.manifestation_energy,
            narration_energy: PLANS.trailblazer.narration_energy,
            energy_reset_date: getNextResetDate(),
            subscription_status: 'none',
            plan_expiration_date: expiration,
          });
          console.log('Trailblazer access granted:', user.id, 'expires', expiration);
        } else {
          console.log('Trailblazer already active with later expiration:', user.id);
        }
      }

      // Record the purchase
      await base44.asServiceRole.entities.RevenueCatPurchase.create({
        event_id: eventId,
        event_type: eventType,
        app_user_id: appUserId,
        user_id: appUserId,
        original_transaction_id: originalTransactionId || '',
        transaction_id: transactionId || '',
        product_id: productId,
        store: store || '',
        environment: environment || '',
        price: price || 0,
        currency: currency || '',
        purchased_at: purchasedAt,
        expiration_at: expiration,
        status: 'active',
      });
      console.log('Purchase recorded:', eventId);
    }

    // ── CANCELLATION (refund): revoke access ──
    else if (eventType === 'CANCELLATION') {
      // Mark the original purchase as refunded
      if (originalTransactionId) {
        const purchases = await base44.asServiceRole.entities.RevenueCatPurchase.filter({
          original_transaction_id: originalTransactionId,
          product_id: productId,
        });
        for (const p of purchases) {
          if (p.status === 'refunded') continue;
          await base44.asServiceRole.entities.RevenueCatPurchase.update(p.id, { status: 'refunded' });
        }
      }

      // Downgrade the user if their current plan is trailblazer
      if (appUserId) {
        try {
          const user = await base44.asServiceRole.entities.User.get(appUserId);
          if (user && user.plan === 'trailblazer') {
            await base44.asServiceRole.entities.User.update(user.id, {
              plan: 'observer',
              manifestation_energy: 0,
              narration_energy: 0,
              subscription_status: 'none',
              plan_expiration_date: null,
            });
            console.log('Trailblazer access revoked (refund):', appUserId);
          }
        } catch (e) {
          console.error('Failed to revoke access:', e.message);
        }
      }

      // Record the cancellation event
      await base44.asServiceRole.entities.RevenueCatPurchase.create({
        event_id: eventId,
        event_type: eventType,
        app_user_id: appUserId || '',
        user_id: appUserId || '',
        original_transaction_id: originalTransactionId || '',
        transaction_id: transactionId || '',
        product_id: productId,
        store: store || '',
        environment: environment || '',
        price: 0,
        currency: currency || '',
        purchased_at: purchasedAtMs ? new Date(purchasedAtMs).toISOString() : new Date().toISOString(),
        expiration_at: '',
        status: 'refunded',
      });
    }

    // Other event types (RENEWAL, EXPIRATION, etc.) — not applicable to one-time Trailblazer
    else {
      console.log('Unhandled event type for Trailblazer:', eventType);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('revenuecat-webhook error:', error.message);
    return new Response(null, { status: 500 });
  }
}