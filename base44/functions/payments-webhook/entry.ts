import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import jwt from 'npm:jsonwebtoken@9.0.2';
import { getGrantForProduct, getNextResetDate } from '../../shared/plans.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.text();

    // Get public key — try neutral WIX_CHECKOUT_* first, fall back to provider WIX_PAYMENTS_*
    const publicKey = Deno.env.get('WIX_CHECKOUT_WEBHOOK_PUBLIC_KEY') || Deno.env.get('WIX_PAYMENTS_WEBHOOK_PUBLIC_KEY');
    if (!publicKey) {
      console.error('Missing WIX_PAYMENTS_WEBHOOK_PUBLIC_KEY');
      return new Response(null, { status: 500 });
    }

    // Step 1: Verify JWT signature
    let rawPayload;
    try {
      rawPayload = jwt.verify(body, publicKey, { algorithms: ['RS256'] });
    } catch (e) {
      console.error('JWT verification failed:', e.message);
      return new Response(null, { status: 400 });
    }

    // Step 2: Parse double-nested JSON
    const event = JSON.parse(rawPayload.data);
    const eventData = JSON.parse(event.data);

    // ── ORDER APPROVED ──
    if (event.eventType === 'wix.ecom.v1.order_approved') {
      const order = eventData.actionEvent.body.order;
      const checkoutId = order.checkoutId;

      // Find pending purchase by checkoutId
      const purchases = await base44.asServiceRole.entities.Base44Purchase.filter({ checkoutSessionId: checkoutId });
      if (purchases.length === 0) {
        console.log('No pending purchase for checkout', checkoutId);
        return new Response(null, { status: 200 });
      }

      const purchase = purchases[0];

      // Idempotency: already processed
      if (purchase.status === 'paid') {
        console.log('Purchase already paid, skipping:', checkoutId);
        return new Response(null, { status: 200 });
      }

      // Extract subscription ID from line items (for subscription products)
      let subscriptionId = null;
      for (const lineItem of order.lineItems) {
        if (lineItem.subscriptionInfo) {
          subscriptionId = lineItem.subscriptionInfo.id;
          break;
        }
      }

      // Grant access BEFORE marking purchase as paid
      const grant = getGrantForProduct(purchase.product_id);
      if (grant) {
        try {
          const user = await base44.asServiceRole.entities.User.get(purchase.user_id);
          if (user) {
            const updateData = {};

            if (grant.plan) {
              // Subscription or one-time plan upgrade
              updateData.plan = grant.plan;
              updateData.manifestation_energy = grant.manifestation_energy;
              updateData.narration_energy = grant.narration_energy;
              updateData.energy_reset_date = getNextResetDate();
              updateData.subscription_status = grant.subscription_status || 'none';
              if (grant.plan_expiration_date) {
                updateData.plan_expiration_date = grant.plan_expiration_date;
              }
              if (subscriptionId) {
                updateData.subscription_id = subscriptionId;
              }
            }

            if (grant.aura_narration_add || grant.aura_manifestation_add) {
              // Aura Bundle — add to existing rollover energy
              updateData.aura_narration_energy = (user.aura_narration_energy || 0) + (grant.aura_narration_add || 0);
              updateData.aura_manifestation_energy = (user.aura_manifestation_energy || 0) + (grant.aura_manifestation_add || 0);
            }

            await base44.asServiceRole.entities.User.update(user.id, updateData);
            console.log('Access granted for product:', purchase.product_id, 'user:', purchase.user_id);
          }
        } catch (e) {
          console.error('Failed to grant access:', e.message);
        }
      }

      // Mark purchase as paid (after grant succeeds)
      await base44.asServiceRole.entities.Base44Purchase.update(purchase.id, {
        status: 'paid',
        subscription_id: subscriptionId || null,
      });

      console.log('Purchase marked paid:', checkoutId);
    }

    // ── SUBSCRIPTION CANCELED ──
    else if (event.eventType === 'wix.ecom.subscription_contracts.v1.subscription_contract_canceled') {
      const subscriptionContract = eventData.actionEvent.body.subscriptionContract;
      const subscriptionId = subscriptionContract.id;

      const purchases = await base44.asServiceRole.entities.Base44Purchase.filter({ subscription_id: subscriptionId });
      if (purchases.length > 0) {
        const purchase = purchases[0];
        try {
          const user = await base44.asServiceRole.entities.User.get(purchase.user_id);
          if (user) {
            await base44.asServiceRole.entities.User.update(user.id, {
              plan: 'observer',
              manifestation_energy: 0,
              narration_energy: 0,
              subscription_status: 'canceled',
            });
            console.log('User downgraded (canceled):', purchase.user_id);
          }
        } catch (e) {
          console.error('Failed to downgrade user:', e.message);
        }
      }
    }

    // ── SUBSCRIPTION EXPIRED ──
    else if (event.eventType === 'wix.ecom.subscription_contracts.v1.subscription_contract_expired') {
      const subscriptionContract = eventData.actionEvent.body.subscriptionContract;
      const subscriptionId = subscriptionContract.id;

      const purchases = await base44.asServiceRole.entities.Base44Purchase.filter({ subscription_id: subscriptionId });
      if (purchases.length > 0) {
        const purchase = purchases[0];
        try {
          const user = await base44.asServiceRole.entities.User.get(purchase.user_id);
          if (user) {
            await base44.asServiceRole.entities.User.update(user.id, {
              plan: 'observer',
              manifestation_energy: 0,
              narration_energy: 0,
              subscription_status: 'expired',
            });
            console.log('User downgraded (expired):', purchase.user_id);
          }
        } catch (e) {
          console.error('Failed to downgrade user:', e.message);
        }
      }
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('payments-webhook error:', error.message);
    return new Response(null, { status: 500 });
  }
}