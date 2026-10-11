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
      'Device Narration',
      'Save favorites',
      'Toolkit: 4 tools (2 ad-gated)',
      'Evidence Journal + Dashboard',
    ],
  },
  seeker: {
    id: 'seeker',
    name: 'Seeker',
    manifestation_energy: 0,
    narration_energy: 0,
    monthly_price: 3.99,
    annual_price: 39.99,
    color: 'text-emerald-400',
    features: [
      'Everything in Observer',
      'Ad-Free experience',
      'Toolkit: 4 tools (no ads)',
      'Community Map posting',
      'Evidence saves: 10/day (no ad)',
      'Aura Bundle access (Save Energy)',
    ],
  },
  technician: {
    id: 'technician',
    name: 'Technician',
    manifestation_energy: 0,
    narration_energy: 0,
    monthly_price: 5.99,
    annual_price: 59.99,
    color: 'text-sky-400',
    features: [
      'Everything in Seeker',
      'Toolkit: 10 of 12 tools',
      'Aura Bundle access (100% Save Energy)',
      'Evidence saves: 20/day, then Aura',
    ],
  },
  explorer: {
    id: 'explorer',
    name: 'Explorer',
    manifestation_energy: 15,
    narration_energy: 800,
    monthly_price: 7.99,
    annual_price: 79.99,
    color: 'text-primary',
    features: [
      'Everything in Observer',
      'AI narration (1-3 narrated tours/month)',
      'Custom tour generation (1-3/month)',
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
    manifestation_energy: 45,
    narration_energy: 2400,
    monthly_price: 11.99,
    annual_price: 119.99,
    color: 'text-accent-foreground',
    features: [
      'Everything in Explorer',
      'AI narration for up to 5 fully narrated tours/month',
      'Custom tour generation (up to 5/month)',
      'Full toolkit (all 12 tools)',
      'Evidence Dashboard with analytics',
      'Aura Bundle purchases',
    ],
  },
  trailblazer: {
    id: 'trailblazer',
    name: 'Trailblazer',
    manifestation_energy: 45,
    narration_energy: 2400,
    one_time_price: 239.99,
    duration_months: 27,
    max_slots: 100,
    color: 'text-amber-400',
    features: [
      'Everything in Investigator',
      'AI narration for up to 5 fully narrated tours/month',
      'Custom tour generation (up to 5/month)',
      'Exclusive Trailblazer badge',
      'Early access to new features',
      '27-month price lock (3 months free)',
      'Seasonal Aura Bundle discounts (20% off)',
      'Limited to 100 slots',
    ],
  },
};

export const AURA_BUNDLES = {
  flicker: {
    id: 'flicker',
    name: 'Flicker',
    energy: 150,
    price: 2.99,
    narration_pct: 0.9,
    manifestation_pct: 0.1,
  },
  apparition: {
    id: 'apparition',
    name: 'Apparition',
    energy: 500,
    price: 6.49,
    narration_pct: 0.9,
    manifestation_pct: 0.1,
  },
  haunting: {
    id: 'haunting',
    name: 'Haunting',
    energy: 1500,
    price: 16.99,
    narration_pct: 0.9,
    manifestation_pct: 0.1,
  },
  spectral: {
    id: 'spectral',
    name: 'Spectral',
    energy: 2500,
    price: 24.99,
    narration_pct: 0.9,
    manifestation_pct: 0.1,
  },
};

// Wix checkout product configurations
// Subscriptions use subscriptionInfo; one-time items do not.
export const WIX_PRODUCTS = {
  explorer_monthly: {
    name: 'AGES Explorer — Monthly',
    price: '7.99',
    product_type: 'subscription',
    plan_id: 'explorer',
    subscription_info: {
      subscriptionSettings: { frequency: 'MONTH' },
      title: 'AGES Explorer Monthly',
      description: 'Standard access: AI narration (1-3 narrated tours/mo, all tabs), tour generation, ranked tours, evidence journal, community map, and 8 toolkit tools. Billed monthly.',
    },
  },
  explorer_annual: {
    name: 'AGES Explorer — Annual',
    price: '79.99',
    product_type: 'subscription',
    plan_id: 'explorer',
    subscription_info: {
      subscriptionSettings: { frequency: 'YEAR' },
      title: 'AGES Explorer Annual',
      description: 'Standard access: AI narration (1-3 narrated tours/mo, all tabs), tour generation, ranked tours, evidence journal, community map, and 8 toolkit tools. Billed annually (save 16%).',
    },
  },
  seeker_monthly: {
    name: 'AGES Seeker — Monthly',
    price: '3.99',
    product_type: 'subscription',
    plan_id: 'seeker',
    subscription_info: {
      subscriptionSettings: { frequency: 'MONTH' },
      title: 'AGES Seeker Monthly',
      description: 'Ad-free access: browse all tours, device narration, 4 toolkit tools, evidence journal, and community map posting. Billed monthly.',
    },
  },
  seeker_annual: {
    name: 'AGES Seeker — Annual',
    price: '39.99',
    product_type: 'subscription',
    plan_id: 'seeker',
    subscription_info: {
      subscriptionSettings: { frequency: 'YEAR' },
      title: 'AGES Seeker Annual',
      description: 'Ad-free access: browse all tours, device narration, 4 toolkit tools, evidence journal, and community map posting. Billed annually (save 16%).',
    },
  },
  technician_monthly: {
    name: 'AGES Technician — Monthly',
    price: '5.99',
    product_type: 'subscription',
    plan_id: 'technician',
    subscription_info: {
      subscriptionSettings: { frequency: 'MONTH' },
      title: 'AGES Technician Monthly',
      description: 'Ad-free access plus 10 of 12 toolkit tools and Aura Bundle save energy. Billed monthly.',
    },
  },
  technician_annual: {
    name: 'AGES Technician — Annual',
    price: '59.99',
    product_type: 'subscription',
    plan_id: 'technician',
    subscription_info: {
      subscriptionSettings: { frequency: 'YEAR' },
      title: 'AGES Technician Annual',
      description: 'Ad-free access plus 10 of 12 toolkit tools and Aura Bundle save energy. Billed annually (save 16%).',
    },
  },
  investigator_monthly: {
    name: 'AGES Investigator — Monthly',
    price: '11.99',
    product_type: 'subscription',
    plan_id: 'investigator',
    subscription_info: {
      subscriptionSettings: { frequency: 'MONTH' },
      title: 'AGES Investigator Monthly',
      description: 'Premium access: AI narration (up to 5 fully narrated tours/mo, all tabs), full 12-tool toolkit, evidence dashboard analytics, more energy. Billed monthly.',
    },
  },
  investigator_annual: {
    name: 'AGES Investigator — Annual',
    price: '119.99',
    product_type: 'subscription',
    plan_id: 'investigator',
    subscription_info: {
      subscriptionSettings: { frequency: 'YEAR' },
      title: 'AGES Investigator Annual',
      description: 'Premium access: AI narration (up to 5 fully narrated tours/mo, all tabs), full 12-tool toolkit, evidence dashboard analytics, more energy. Billed annually (save 16%).',
    },
  },
  trailblazer: {
    name: 'AGES Trailblazer — 27-Month Elite (3 Months Free)',
    price: '239.99',
    product_type: 'one_time',
    plan_id: 'trailblazer',
  },
  flicker: {
    name: 'Aura Bundle — Flicker (150 Energy)',
    price: '2.99',
    product_type: 'aura_bundle',
    bundle_id: 'flicker',
  },
  apparition: {
    name: 'Aura Bundle — Apparition (500 Energy)',
    price: '6.49',
    product_type: 'aura_bundle',
    bundle_id: 'apparition',
  },
  haunting: {
    name: 'Aura Bundle — Haunting (1500 Energy)',
    price: '16.99',
    product_type: 'aura_bundle',
    bundle_id: 'haunting',
  },
  spectral: {
    name: 'Aura Bundle — Spectral (2500 Energy)',
    price: '24.99',
    product_type: 'aura_bundle',
    bundle_id: 'spectral',
  },
};

// Grant access based on product_id. Called from the payments-webhook on ORDER_APPROVED.
export function getGrantForProduct(productId, options = {}) {
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
    // Technician Aura purchases route 100% to dedicated save energy.
    // Explorer/Investigator/Trailblazer keep the existing 80/20 split.
    // Phase 2 will pass options.userPlan from the webhook callers.
    // Seeker and Technician Aura purchases route 100% to dedicated save energy.
    // Explorer/Investigator/Trailblazer keep the existing 80/20 split.
    if (options.userPlan === 'seeker' || options.userPlan === 'technician') {
      return {
        aura_save_add: bundle.energy,
        aura_narration_add: 0,
        aura_manifestation_add: 0,
      };
    }
    const narrationAdd = Math.round(bundle.energy * bundle.narration_pct);
    const manifestationAdd = Math.round(bundle.energy * bundle.manifestation_pct);
    return {
      aura_narration_add: narrationAdd,
      aura_manifestation_add: manifestationAdd,
      aura_save_add: 0,
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