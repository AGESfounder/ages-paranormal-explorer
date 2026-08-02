// AGES Access Levels — shared plan definitions used by backend functions.
// Frontend has its own copy in src/lib/plans.js for display.

export const PLANS = {
  observer: {
    id: 'observer',
    name: 'Observer',
    price: 0,
    manifestation_energy: 0,
    narration_energy: 0,
    color: 'text-muted-foreground',
    features: [
      'Browse all 50 states + international tours',
      'View tour details, stops, maps, and text',
      'Save favorites',
    ],
  },
  explorer: {
    id: 'explorer',
    name: 'Explorer',
    manifestation_energy: 5,
    narration_energy: 300,
    monthly_price: 5.99,
    annual_price: 59.99,
    color: 'text-primary',
    features: [
      'Everything in Observer',
      'AI narration (~1 complete tour/month)',
      'Custom tour generation (1-2/month)',
      'All ranked tours unlocked',
      'Nearby + Abroad tours',
      'Evidence Journal (upload + track)',
      'Community Map access',
      'Leaderboard access',
      'Standard toolkit (8 tools)',
      'Aura Bundle purchases',
    ],
  },
  investigator: {
    id: 'investigator',
    name: 'Investigator',
    manifestation_energy: 15,
    narration_energy: 1000,
    monthly_price: 9.99,
    annual_price: 99.99,
    color: 'text-accent-foreground',
    features: [
      'Everything in Explorer',
      'AI narration for ~4 complete tours/month',
      'Custom tour generation (up to 5/month)',
      'Full toolkit (all 12 tools)',
      'Evidence Dashboard with analytics',
      'Aura Bundle purchases',
    ],
  },
  trailblazer: {
    id: 'trailblazer',
    name: 'Trailblazer',
    manifestation_energy: 25,
    narration_energy: 1200,
    one_time_price: 199.99,
    duration_months: 30,
    max_slots: 300,
    color: 'text-amber-400',
    features: [
      'Everything in Investigator',
      'AI narration for ~5 complete tours/month',
      'Custom tour generation (up to 8/month)',
      'Exclusive Trailblazer badge',
      'Early access to new features',
      '30-month price lock guarantee',
      'Seasonal Aura Bundle discounts (20% off)',
      'Limited to 300 slots',
    ],
  },
};

export const AURA_BUNDLES = {
  flicker: {
    id: 'flicker',
    name: 'Flicker',
    energy: 100,
    price: 1.99,
    narration_pct: 0.8,
    manifestation_pct: 0.2,
  },
  apparition: {
    id: 'apparition',
    name: 'Apparition',
    energy: 400,
    price: 4.99,
    narration_pct: 0.8,
    manifestation_pct: 0.2,
  },
  haunting: {
    id: 'haunting',
    name: 'Haunting',
    energy: 1000,
    price: 10.99,
    narration_pct: 0.8,
    manifestation_pct: 0.2,
  },
  spectral: {
    id: 'spectral',
    name: 'Spectral',
    energy: 2000,
    price: 18.99,
    narration_pct: 0.8,
    manifestation_pct: 0.2,
  },
};

// Wix checkout product configurations
// Subscriptions use subscriptionInfo; one-time items do not.
export const WIX_PRODUCTS = {
  explorer_monthly: {
    name: 'AGES Explorer — Monthly',
    price: '5.99',
    product_type: 'subscription',
    plan_id: 'explorer',
    subscription_info: {
      subscriptionSettings: { frequency: 'MONTH' },
      title: 'AGES Explorer Monthly',
      description: 'Standard access: AI narration, tour generation, ranked tours, evidence journal, community map, and 8 toolkit tools. Billed monthly.',
    },
  },
  explorer_annual: {
    name: 'AGES Explorer — Annual',
    price: '59.99',
    product_type: 'subscription',
    plan_id: 'explorer',
    subscription_info: {
      subscriptionSettings: { frequency: 'YEAR' },
      title: 'AGES Explorer Annual',
      description: 'Standard access: AI narration, tour generation, ranked tours, evidence journal, community map, and 8 toolkit tools. Billed annually (save 16%).',
    },
  },
  investigator_monthly: {
    name: 'AGES Investigator — Monthly',
    price: '9.99',
    product_type: 'subscription',
    plan_id: 'investigator',
    subscription_info: {
      subscriptionSettings: { frequency: 'MONTH' },
      title: 'AGES Investigator Monthly',
      description: 'Premium access: full 12-tool toolkit, evidence dashboard analytics, more energy. Billed monthly.',
    },
  },
  investigator_annual: {
    name: 'AGES Investigator — Annual',
    price: '99.99',
    product_type: 'subscription',
    plan_id: 'investigator',
    subscription_info: {
      subscriptionSettings: { frequency: 'YEAR' },
      title: 'AGES Investigator Annual',
      description: 'Premium access: full 12-tool toolkit, evidence dashboard analytics, more energy. Billed annually (save 16%).',
    },
  },
  trailblazer: {
    name: 'AGES Trailblazer — 30-Month Elite',
    price: '199.99',
    product_type: 'one_time',
    plan_id: 'trailblazer',
  },
  flicker: {
    name: 'Aura Bundle — Flicker (100 Energy)',
    price: '1.99',
    product_type: 'aura_bundle',
    bundle_id: 'flicker',
  },
  apparition: {
    name: 'Aura Bundle — Apparition (400 Energy)',
    price: '4.99',
    product_type: 'aura_bundle',
    bundle_id: 'apparition',
  },
  haunting: {
    name: 'Aura Bundle — Haunting (1000 Energy)',
    price: '10.99',
    product_type: 'aura_bundle',
    bundle_id: 'haunting',
  },
  spectral: {
    name: 'Aura Bundle — Spectral (2000 Energy)',
    price: '18.99',
    product_type: 'aura_bundle',
    bundle_id: 'spectral',
  },
};

// Grant access based on product_id. Called from the payments-webhook on ORDER_APPROVED.
export function getGrantForProduct(productId) {
  const wixProduct = WIX_PRODUCTS[productId];
  if (!wixProduct) return null;

  if (wixProduct.product_type === 'subscription') {
    const plan = PLANS[wixProduct.plan_id];
    return {
      plan: plan.id,
      manifestation_energy: plan.manifestation_energy,
      narration_energy: plan.narration_energy,
      subscription_status: 'active',
    };
  }

  if (wixProduct.product_type === 'one_time' && wixProduct.plan_id === 'trailblazer') {
    const plan = PLANS.trailblazer;
    const expiration = new Date();
    expiration.setMonth(expiration.getMonth() + plan.duration_months);
    return {
      plan: 'trailblazer',
      manifestation_energy: plan.manifestation_energy,
      narration_energy: plan.narration_energy,
      subscription_status: 'none',
      plan_expiration_date: expiration.toISOString(),
    };
  }

  if (wixProduct.product_type === 'aura_bundle') {
    const bundle = AURA_BUNDLES[wixProduct.bundle_id];
    const narrationAdd = Math.round(bundle.energy * bundle.narration_pct);
    const manifestationAdd = Math.round(bundle.energy * bundle.manifestation_pct);
    return {
      aura_narration_add: narrationAdd,
      aura_manifestation_add: manifestationAdd,
    };
  }

  return null;
}

// Compute the next monthly energy reset date (first day of next month at midnight UTC)
export function getNextResetDate() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  return next.toISOString();
}

// Check if energy should reset and return the reset values if so
export function shouldReset(currentResetDate) {
  if (!currentResetDate) return true;
  return new Date(currentResetDate) <= new Date();
}