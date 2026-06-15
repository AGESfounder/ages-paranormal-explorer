import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jwtVerify, importSPKI } from 'npm:jose@5.9.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.text();
    const publicKeyPem = Deno.env.get('WIX_PAYMENTS_WEBHOOK_PUBLIC_KEY');

    if (!publicKeyPem) {
      console.error('Missing WIX_PAYMENTS_WEBHOOK_PUBLIC_KEY');
      return new Response(null, { status: 500 });
    }

    // Verify JWT signature
    const publicKey = await importSPKI(publicKeyPem, 'RS256');
    const { payload: rawPayload } = await jwtVerify(body, publicKey, { algorithms: ['RS256'] });

    // Parse double-nested JSON
    const event = JSON.parse(rawPayload.data);
    const eventData = JSON.parse(event.data);

    if (event.eventType === 'wix.ecom.v1.order_approved') {
      const order = eventData.actionEvent.body.order;

      const items = order.lineItems.map(item => ({
        product_name: item.productName?.original || '',
        quantity: item.quantity || 1,
        price: parseFloat(item.price?.amount || '0'),
        subscription_id: item.subscriptionInfo?.id || null,
      }));

      const total = parseFloat(order.priceSummary?.total?.amount || '0');

      await base44.asServiceRole.entities.Order.create({
        stripe_session_id: order.checkoutId,
        status: 'paid',
        items,
        total,
        shipping_name: [
          order.billingInfo?.contactDetails?.firstName,
          order.billingInfo?.contactDetails?.lastName,
        ].filter(Boolean).join(' ') || 'Customer',
        shipping_address: order.billingInfo?.address?.addressLine || '',
        shipping_city: order.billingInfo?.address?.city || '',
        shipping_state: order.billingInfo?.address?.subdivision || '',
        shipping_zip: order.billingInfo?.address?.postalCode || '',
        shipping_email: order.buyerInfo?.email || '',
      });

      console.log('Order created:', order.checkoutId);
    }

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error.message);
    return new Response(null, { status: 500 });
  }
});