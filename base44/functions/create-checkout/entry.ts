import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { ORIGIN_ADDRESS, DEFAULT_PARCEL } from '../../shared/shippingConfig.js';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { items, shipping } = await req.json();
    if (!items?.length) return Response.json({ error: 'No items' }, { status: 400 });

    const origin = req.headers.get('Origin') || 'https://your-app.com';
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      console.error('Missing STRIPE_SECRET_KEY');
      return Response.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    // The shipping address is collected in the app so we can quote a live carrier rate
    // (EasyPost) before creating the Stripe Checkout session.
    const required = ['name', 'street', 'city', 'state', 'zip'];
    for (const k of required) {
      if (!shipping?.[k]) return Response.json({ error: 'Shipping address is required' }, { status: 400 });
    }

    const easyPostKey = Deno.env.get('EASYPOST_API_KEY');
    if (!easyPostKey) {
      console.error('Missing EASYPOST_API_KEY');
      return Response.json({ error: 'Shipping is not configured yet. Please add EASYPOST_API_KEY.' }, { status: 500 });
    }

    // Build the parcel from cart contents: total weight, largest dimensions.
    const totalOz = items.reduce((s, i) => s + (i.weight_oz || DEFAULT_PARCEL.weight) * Math.max(1, i.quantity || 1), 0);
    const length = items.reduce((m, i) => Math.max(m, i.length_in || DEFAULT_PARCEL.length), 0);
    const width = items.reduce((m, i) => Math.max(m, i.width_in || DEFAULT_PARCEL.width), 0);
    const height = items.reduce((m, i) => Math.max(m, i.height_in || DEFAULT_PARCEL.height), 0);

    // Quote live carrier rates via EasyPost.
    const epRes = await fetch('https://api.easypost.com/v2/shipments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(easyPostKey + ':'),
      },
      body: JSON.stringify({
        shipment: {
          from_address: {
            street1: ORIGIN_ADDRESS.street1,
            city: ORIGIN_ADDRESS.city,
            state: ORIGIN_ADDRESS.state,
            zip: ORIGIN_ADDRESS.zip,
            country: 'US',
          },
          to_address: {
            name: shipping.name,
            street1: shipping.street,
            city: shipping.city,
            state: shipping.state,
            zip: shipping.zip,
            country: 'US',
          },
          parcel: { weight: totalOz, length, width, height },
        },
      }),
    });
    const epData = await epRes.json();
    if (!epRes.ok) {
      console.error('EasyPost error:', JSON.stringify(epData));
      return Response.json({ error: 'Unable to calculate shipping to this address.' }, { status: 400 });
    }
    const rateList = epData.rates || (epData.shipment && epData.shipment.rates) || [];
    const rates = rateList
      .map((r) => ({ rate: parseFloat(r.rate), carrier: r.carrier, service: r.service, days: r.delivery_days }))
      .filter((r) => !isNaN(r.rate));
    if (!rates.length) {
      console.error('No EasyPost rates returned');
      return Response.json({ error: 'No shipping rates available for this address.' }, { status: 400 });
    }
    rates.sort((a, b) => a.rate - b.rate);
    const best = rates[0];
    const shippingCents = Math.round(best.rate * 100);
    const shippingLabel = `Shipping (${best.carrier} ${best.service})`;

    // Product line items.
    const lineItems = items.map((item) => {
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
    // Carrier shipping cost as a line item.
    const shippingLine = {
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: shippingCents,
        product_data: { name: shippingLabel },
      },
    };
    const allItems = [...lineItems, shippingLine];

    const totalCents = lineItems.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0) + shippingCents;
    if (totalCents < 50) {
      return Response.json({ error: 'Minimum charge is $0.50' }, { status: 400 });
    }

    // Create a Stripe Customer carrying the shipping address so the Checkout page
    // prefills it (no double entry) and destination-based tax applies.
    const custForm = new URLSearchParams();
    custForm.append('name', shipping.name);
    custForm.append('shipping[name]', shipping.name);
    custForm.append('shipping[address][line1]', shipping.street);
    custForm.append('shipping[address][city]', shipping.city);
    custForm.append('shipping[address][state]', shipping.state);
    custForm.append('shipping[address][postal_code]', shipping.zip);
    custForm.append('shipping[address][country]', 'US');
    const custRes = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Bearer ${stripeKey}` },
      body: custForm.toString(),
    });
    const custData = await custRes.json();
    if (!custRes.ok) {
      console.error('Stripe customer error:', JSON.stringify(custData));
      return Response.json({ error: custData.error?.message || 'Checkout failed' }, { status: custRes.status });
    }

    const form = new URLSearchParams();
    form.append('mode', 'payment');
    form.append('success_url', `${origin}/store?success=true`);
    form.append('cancel_url', `${origin}/store`);
    form.append('customer', custData.id);
    form.append('shipping_address_collection[allowed_countries][0]', 'US');
    form.append('automatic_tax[enabled]', 'true');
    allItems.forEach((li, i) => {
      form.append(`line_items[${i}][quantity]`, String(li.quantity));
      form.append(`line_items[${i}][price_data][currency]`, li.price_data.currency);
      form.append(`line_items[${i}][price_data][unit_amount]`, String(li.price_data.unit_amount));
      form.append(`line_items[${i}][price_data][product_data][name]`, li.price_data.product_data.name);
      form.append(`line_items[${i}][tax_behavior]`, 'exclusive');
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${stripeKey}`,
      },
      body: form.toString(),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Stripe checkout error:', JSON.stringify(data));
      return Response.json({ error: data.error?.message || 'Checkout failed' }, { status: response.status });
    }

    // Record the pending order with the in-app shipping address + shipping breakdown.
    const orderItems = items.map((item) => ({
      product_id: item.product_id || null,
      name: item.name || '',
      price: item.price || 0,
      quantity: Math.max(1, item.quantity || 1),
    }));
    const productsTotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const total = productsTotal + best.rate;

    await base44.entities.Order.create({
      stripe_session_id: data.id,
      status: 'pending',
      items: orderItems,
      total,
      shipping_name: shipping.name,
      shipping_address: shipping.street,
      shipping_city: shipping.city,
      shipping_state: shipping.state,
      shipping_zip: shipping.zip,
      shipping_cost: best.rate,
      shipping_service: shippingLabel,
    });

    return Response.json({ url: data.url });
  } catch (error) {
    console.error('create-checkout error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});