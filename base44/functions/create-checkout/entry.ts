import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { items } = await req.json();
    if (!items?.length) return Response.json({ error: 'No items' }, { status: 400 });

    const origin = req.headers.get('Origin') || 'https://your-app.com';
    const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!secretKey) {
      console.error('Missing STRIPE_SECRET_KEY');
      return Response.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    // Stripe expects amounts in cents (major units * 100)
    const lineItems = items.map(item => {
      const unitAmount = Math.round((item.price || 0) * 100);
      return {
        quantity: Math.max(1, item.quantity || 1),
        price_data: {
          currency: 'usd',
          unit_amount: unitAmount,
          product_data: { name: item.name || 'Product' },
        },
      };
    });

    const totalCents = lineItems.reduce((sum, li) => sum + li.price_data.unit_amount * li.quantity, 0);
    if (totalCents < 50) {
      return Response.json({ error: 'Minimum charge is $0.50' }, { status: 400 });
    }

    const form = new URLSearchParams();
    form.append('mode', 'payment');
    form.append('success_url', `${origin}/store?success=true`);
    form.append('cancel_url', `${origin}/store`);
    lineItems.forEach((li, i) => {
      form.append(`line_items[${i}][quantity]`, String(li.quantity));
      form.append(`line_items[${i}][price_data][currency]`, li.price_data.currency);
      form.append(`line_items[${i}][price_data][unit_amount]`, String(li.price_data.unit_amount));
      form.append(`line_items[${i}][price_data][product_data][name]`, li.price_data.product_data.name);
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${secretKey}`,
      },
      body: form.toString(),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Stripe checkout error:', JSON.stringify(data));
      return Response.json({ error: data.error?.message || 'Checkout failed' }, { status: response.status });
    }

    // Record a pending order tied to this Stripe session; the webhook marks it paid
    const orderItems = items.map(item => ({
      product_id: item.product_id || null,
      name: item.name || '',
      price: item.price || 0,
      quantity: Math.max(1, item.quantity || 1),
    }));
    const total = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    await base44.entities.Order.create({
      stripe_session_id: data.id,
      status: 'pending',
      items: orderItems,
      total,
    });

    return Response.json({ url: data.url });
  } catch (error) {
    console.error('create-checkout error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});