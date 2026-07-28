import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Verify the Stripe-Signature header using Web Crypto (HMAC-SHA256).
// Returns the parsed event object on success, or null on failure.
async function verifyStripeSignature(payload, sigHeader, secret, toleranceSec = 300) {
  const parts = {};
  sigHeader.split(',').forEach(p => {
    const idx = p.indexOf('=');
    if (idx > -1) parts[p.slice(0, idx)] = p.slice(idx + 1);
  });
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return null;

  const ageSec = Date.now() / 1000 - parseInt(timestamp, 10);
  if (ageSec > toleranceSec) return null;

  const signedPayload = `${timestamp}.${payload}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const expected = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, '0')).join('');

  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (diff !== 0) return null;

  return JSON.parse(payload);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');
    const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!secret) {
      console.error('Missing STRIPE_WEBHOOK_SECRET');
      return new Response(null, { status: 500 });
    }
    if (!sig) return new Response(null, { status: 400 });

    const event = await verifyStripeSignature(body, sig, secret);
    if (!event) {
      console.error('Stripe signature verification failed');
      return new Response(null, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orders = await base44.asServiceRole.entities.Order.filter({ stripe_session_id: session.id });

      if (orders.length > 0) {
        const order = orders[0];
        const cd = session.customer_details || {};
        const addr = cd.address || {};
        await base44.asServiceRole.entities.Order.update(order.id, {
          status: 'paid',
          shipping_name: cd.name || order.shipping_name || '',
          shipping_email: cd.email || order.shipping_email || '',
          shipping_address: addr.line1 || order.shipping_address || '',
          shipping_city: addr.city || order.shipping_city || '',
          shipping_state: addr.state || order.shipping_state || '',
          shipping_zip: addr.postal_code || order.shipping_zip || '',
        });
        console.log('Order marked paid:', session.id);
      } else {
        console.log('No pending order for session', session.id);
      }
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('stripe-webhook error:', error.message);
    return new Response(null, { status: 500 });
  }
});