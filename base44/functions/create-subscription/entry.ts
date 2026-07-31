import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { WIX_PRODUCTS, PLANS } from '../../shared/plans.js';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const { product_id } = await req.json();

    // Validate product
    const product = WIX_PRODUCTS[product_id];
    if (!product) {
      return Response.json({ error: 'Invalid product' }, { status: 400 });
    }

    // Get authenticated user (required for digital products — we need to know who to grant access to)
    let user;
    try {
      user = await base44.auth.me();
    } catch (e) {
      return Response.json({ error: 'Please log in to purchase' }, { status: 400 });
    }
    if (!user) {
      return Response.json({ error: 'Please log in to purchase' }, { status: 400 });
    }

    // Trailblazer enrollment cap check
    if (product_id === 'trailblazer') {
      const existing = await base44.asServiceRole.entities.Base44Purchase.filter({
        product_id: 'trailblazer',
        status: 'paid',
      });
      if (existing.length >= PLANS.trailblazer.max_slots) {
        return Response.json({ error: 'Trailblazer slots are full' }, { status: 400 });
      }
    }

    // Get Wix secrets — try neutral WIX_CHECKOUT_* first, fall back to provider WIX_PAYMENTS_*
    const apiKey = Deno.env.get('WIX_CHECKOUT_API_KEY') || Deno.env.get('WIX_PAYMENTS_API_KEY');
    const siteId = Deno.env.get('WIX_CHECKOUT_SITE_ID') || Deno.env.get('WIX_PAYMENTS_SITE_ID');
    if (!apiKey || !siteId) {
      console.error('Missing WIX_CHECKOUT_API_KEY/WIX_PAYMENTS_API_KEY or WIX_CHECKOUT_SITE_ID/WIX_PAYMENTS_SITE_ID');
      return Response.json({ error: 'Payments not configured' }, { status: 500 });
    }

    // Get app URL from header (preferred) or secret fallback
    const appUrl = req.headers.get('X-Base44-App-Url') || Deno.env.get('WIX_CHECKOUT_APP_URL') || Deno.env.get('WIX_PAYMENTS_APP_URL');
    if (!appUrl) {
      console.error('Missing app URL (X-Base44-App-Url header and WIX_PAYMENTS_APP_URL both absent)');
      return Response.json({ error: 'App URL not configured' }, { status: 500 });
    }

    // Build cart item
    const item = {
      name: product.name,
      quantity: 1,
      price: product.price,
    };
    if (product.subscription_info) {
      item.subscriptionInfo = product.subscription_info;
    }

    // Create Wix checkout session
    const wixRes = await fetch('https://www.wixapis.com/payments/platform/v1/checkout-sessions/construct', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'wix-site-id': siteId,
      },
      body: JSON.stringify({
        cart: {
          items: [item],
          customerInfo: { email: user.email },
        },
        callbackUrls: {
          postFlowUrl: `${appUrl}/dashboard`,
          thankYouPageUrl: `${appUrl}/ThankYou`,
        },
      }),
    });

    const wixData = await wixRes.json();
    if (!wixRes.ok) {
      console.error('Wix checkout error:', JSON.stringify(wixData));
      return Response.json({ error: wixData.message || 'Checkout failed' }, { status: wixRes.status });
    }

    const checkoutSession = wixData.checkoutSession;

    // Store pending purchase (use service role since Base44Purchase RLS locks writes to admins)
    await base44.asServiceRole.entities.Base44Purchase.create({
      checkoutSessionId: checkoutSession.id,
      status: 'pending',
      user_email: user.email,
      user_id: user.id,
      product_type: product.product_type,
      product_id: product_id,
      product_name: product.name,
      amount: parseFloat(product.price),
    });

    return Response.json({ redirectUrl: checkoutSession.redirectUrl });
  } catch (error) {
    console.error('create-subscription error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}