import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { items } = await req.json();
    if (!items?.length) return Response.json({ error: 'No items' }, { status: 400 });

    const origin = req.headers.get('Origin') || 'https://your-app.com';

    const body = {
      cart: {
        items: items.map(item => ({
          name: item.name,
          quantity: Math.max(1, item.quantity || 1),
          price: item.price.toFixed(2),
        })),
      },
      callbackUrls: {
        postFlowUrl: `${origin}/store`,
        thankYouPageUrl: `${origin}/store?success=true`,
      },
    };

    const response = await fetch(
      'https://www.wixapis.com/payments/platform/v1/checkout-sessions/construct',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': Deno.env.get('WIX_PAYMENTS_API_KEY'),
          'wix-site-id': Deno.env.get('WIX_PAYMENTS_SITE_ID'),
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Wix checkout error:', JSON.stringify(data));
      return Response.json({ error: data.message || 'Checkout failed' }, { status: response.status });
    }

    return Response.json({ url: data.checkoutSession.redirectUrl });
  } catch (error) {
    console.error('create-checkout error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});