// Cost Analysis B model.
//
// This is the SAME cost model as Cost Analysis A (src/pages/PlanAnalysis.jsx):
// same plans, same prices, same credit / store-fee / RevenueCat / AdMob
// assumptions, same user mixes. The only things that change between A and B are
// the three Option E inputs below. buildModel(OPTION_A) reproduces A's numbers,
// so A and B can be compared like for like.

export const PRICE = { seeker: 3.99, technician: 5.99, explorer: 7.99, investigator: 11.99, trailblazer: 239.99 };

// Maximum Trailblazer lifetime-license slots. Capping the one-time tier
// protects against credit-cost exposure (every slot is 27 months of energy).
export const TRAILBLAZER_MAX_SLOTS = 100;

export const AURA_BUNDLES = [
  { name: 'Flicker', energy: 150, price: '$2.99' },
  { name: 'Apparition', energy: 500, price: '$6.49' },
  { name: 'Haunting', energy: 1500, price: '$16.99' },
  { name: 'Spectral', energy: 2500, price: '$24.99' },
];

// Cost Analysis A inputs (what is in the app stores today).
export const OPTION_A = {
  explorer: { manE: 5, narE: 500 },
  investigator: { manE: 15, narE: 1500 },
  trailblazer: { manE: 15, narE: 1500 },
  enrichStopsPerEnergy: 1, // 1 manifestation energy per stop enriched
  auraNarShare: 0.8, // Aura bundles 80/20 narration/manifestation
  trailblazerMonths: 30, // 30-month license (6 months free vs 24 paid)
  adRewardEnergy: 10, adRewardNarration: 8, adRewardManifestation: 2, // +10 energy per rewarded ad
};

// Option E — Hybrid (the new energy numbers).
export const OPTION_E = {
  explorer: { manE: 15, narE: 800 },
  investigator: { manE: 45, narE: 2400 },
  trailblazer: { manE: 45, narE: 2400 },
  enrichStopsPerEnergy: 2, // 1 manifestation energy per 2 stops enriched
  auraNarShare: 0.9, // Aura bundles 90/10 narration/manifestation
  trailblazerMonths: 27, // 27-month license (3 months free vs 24 paid)
  adRewardEnergy: 5, adRewardNarration: 4, adRewardManifestation: 1, // +5 energy per rewarded ad
};

// ===== Cost assumptions (identical to Cost Analysis A) =====
export const CREDITS_PER_MANIFESTATION = 3;
export const CREDITS_PER_NARRATION = 1;
export const COST_PER_CREDIT = 0.004; // Builder: $40/mo / 10,000 credits
export const ENRICHMENT_CREDITS_SINGLE_SITE = 6; // 2 LLM passes
export const ENRICHMENT_CREDITS_MULTI_SITE = 3; // 1 LLM pass
export const SINGLE_SITE_FRACTION = 0.6;
// Under 1 energy per stop, enrichment is ~50% of manifestation energy spent (A's assumption).
export const ENRICHMENT_CALL_FRACTION = 0.5;
// Narration credits for one fully narrated tour (all 4 tabs per stop + intro + conclusion),
// from the Centralia PA credit audit (8 stops). Cost Analysis A assumed 384 for a 7-stop tour.
export const FULL_TOUR_NARRATION_CREDITS = 764;
export const A_FULL_TOUR_NARRATION_CREDITS = 384;

export const BASE44_PLANS = [
  { name: 'Builder', monthlyCost: 40, credits: 10000, costPerCredit: 40 / 10000 },
  { name: 'Pro', monthlyCost: 80, credits: 20000, costPerCredit: 80 / 20000 },
  { name: 'Elite', monthlyCost: 200, credits: 50000, costPerCredit: 200 / 50000 },
];

export const STORE_FEE_PCT = 0.15;
export const STORE_FEE_PCT_HIGH = 0.3;
export const STORE_HIGH_THRESHOLD = 1000000;
export const REVENUECAT_FEE_PCT = 0.01;
export const REVENUECAT_THRESHOLD = 2500;
export const APPLE_DEV_ANNUAL = 99;
export const GOOGLE_DEV_ONE_TIME = 25;
export const DEV_UPFRONT_ONE_TIME = 600;

export const ADMOB_ECPM = 15;
export const ADMOB_PER_IMPRESSION = ADMOB_ECPM / 1000;
export const ADS_PER_TOUR = 7;
export const TOURS_PER_FREE_USER_MO = 2;
export const AD_REV_PER_FREE_USER_MO = ADS_PER_TOUR * TOURS_PER_FREE_USER_MO * ADMOB_PER_IMPRESSION;
export const ADMOB_REWARDED_ECPM = 20;
export const ADMOB_REWARDED_PER_IMPRESSION = ADMOB_REWARDED_ECPM / 1000;
export const ADS_PER_PAID_USER_MO = 5;
export const AD_REWARD_ENERGY = 10;
export const AD_REWARD_NARRATION = 8;
export const AD_REWARD_MANIFESTATION = 2;
export const AD_REWARD_UTILIZATION = 0.7;
export const OBSERVER_NARRATION_ADS_PER_TOUR = 27;
export const NARRATION_AD_REV_PER_FREE_USER_MO = OBSERVER_NARRATION_ADS_PER_TOUR * TOURS_PER_FREE_USER_MO * ADMOB_PER_IMPRESSION;
export const TOOL_USE_ADS_OBSERVER_MO = 10;
export const TOOL_USE_AD_REV_OBSERVER_MO = TOOL_USE_ADS_OBSERVER_MO * ADMOB_REWARDED_PER_IMPRESSION;
export const SAVE_ADS_MO = 3;
export const SAVE_AD_REV_MO = SAVE_ADS_MO * ADMOB_REWARDED_PER_IMPRESSION;
export const SAVE_UPLOAD_CREDITS_MO = SAVE_ADS_MO * 1;
export const SAVE_UPLOAD_COST_MO = SAVE_UPLOAD_CREDITS_MO * COST_PER_CREDIT;
export const OBSERVER_AD_REV_MO = AD_REV_PER_FREE_USER_MO + NARRATION_AD_REV_PER_FREE_USER_MO + TOOL_USE_AD_REV_OBSERVER_MO + SAVE_AD_REV_MO;

export const FIXED_FIRST_YEAR = [
  { item: 'Apple Developer Program', cost: APPLE_DEV_ANNUAL, period: 'Annual' },
  { item: 'Google Play Developer', cost: GOOGLE_DEV_ONE_TIME, period: 'One-time' },
  { item: 'CatDoes (Upfront)', cost: DEV_UPFRONT_ONE_TIME, period: 'One-time' },
];
export const FIXED_FIRST_YEAR_TOTAL = APPLE_DEV_ANNUAL + GOOGLE_DEV_ONE_TIME + DEV_UPFRONT_ONE_TIME;
export const FIXED_ONGOING_ANNUAL = APPLE_DEV_ANNUAL;
export const FIXED_ONGOING_MONTHLY = FIXED_ONGOING_ANNUAL / 12;

// Same four user scales / mixes as Cost Analysis A (no new plans).
const SCENARIO_INPUTS = [
  { label: 'Small (50 paid / 250 free)', mix: { seeker: 15, technician: 10, explorer: 15, investigator: 7, trailblazer: 3 }, freeUsers: 250 },
  { label: 'Growing (200 paid / 1,000 free)', mix: { seeker: 60, technician: 40, explorer: 60, investigator: 30, trailblazer: 10 }, freeUsers: 1000 },
  { label: 'Scale (500 paid / 2,500 free)', mix: { seeker: 150, technician: 100, explorer: 150, investigator: 75, trailblazer: 25 }, freeUsers: 2500 },
  { label: 'Mature (1,000 paid / 5,000 free)', mix: { seeker: 300, technician: 200, explorer: 300, investigator: 150, trailblazer: 50 }, freeUsers: 5000 },
];

const usd0 = (n) => '$' + Math.round(n).toLocaleString();

export function buildModel(P) {
  const batch = P.enrichStopsPerEnergy;
  const e = P.explorer;
  const i = P.investigator;
  const t = P.trailblazer;

  // Credits per enrichment energy unit = one LLM call (blended single-site 2-pass / multi-site).
  const avgEnrichmentCredits = Math.round(
    ENRICHMENT_CREDITS_SINGLE_SITE * SINGLE_SITE_FRACTION + ENRICHMENT_CREDITS_MULTI_SITE * (1 - SINGLE_SITE_FRACTION)
  );
  // Batching stops per energy unit shrinks enrichment's share of manifestation energy spent.
  const enrichWeight = ENRICHMENT_CALL_FRACTION / batch;
  const enrichShare = enrichWeight / (enrichWeight + (1 - ENRICHMENT_CALL_FRACTION));
  const blended = CREDITS_PER_MANIFESTATION * (1 - enrichShare) + avgEnrichmentCredits * enrichShare;

  const calcCosts = (manE, narE, months) => {
    const credits = (manE * blended + narE * CREDITS_PER_NARRATION) * months;
    return { credits, platformCost: credits * COST_PER_CREDIT };
  };
  const storeFee = (price) => price * STORE_FEE_PCT;
  const revenuecatFee = (sales) => (sales <= REVENUECAT_THRESHOLD ? 0 : (sales - REVENUECAT_THRESHOLD) * REVENUECAT_FEE_PCT);
  const requiredBase44Plan = (credits) => {
    if (credits <= 10000) return { plan: 'Builder', plans: 1, cost: 40 };
    if (credits <= 20000) return { plan: 'Pro', plans: 1, cost: 80 };
    if (credits <= 50000) return { plan: 'Elite', plans: 1, cost: 200 };
    const n = Math.ceil(credits / 50000);
    return { plan: `${n}x Elite`, plans: n, cost: n * 200 };
  };

  // Rewarded-ad energy (option-specific: A = +10/ad 8 nar / 2 man, E = +5/ad 4 nar / 1 man).
  const adReward = (() => {
    const creditsPerAd = P.adRewardNarration * CREDITS_PER_NARRATION + P.adRewardManifestation * blended;
    const rev = ADS_PER_PAID_USER_MO * ADMOB_REWARDED_PER_IMPRESSION;
    const cost = ADS_PER_PAID_USER_MO * creditsPerAd * AD_REWARD_UTILIZATION * COST_PER_CREDIT;
    return { creditsPerAd, rev, cost, net: rev - cost };
  })();

  const monthlyAnalysis = [
    { plan: 'Seeker', price: PRICE.seeker, manE: 0, narE: 0 },
    { plan: 'Technician', price: PRICE.technician, manE: 0, narE: 0 },
    { plan: 'Explorer', price: PRICE.explorer, ...e },
    { plan: 'Investigator', price: PRICE.investigator, ...i },
  ].map((p) => {
    const { credits, platformCost } = calcCosts(p.manE, p.narE, 1);
    const sf = storeFee(p.price);
    const totalCost = platformCost + sf;
    const profit = p.price - totalCost;
    return { ...p, credits, platformCost, sf, totalCost, profit, margin: (profit / p.price) * 100 };
  });

  const trailblazerCase = (util, feePct = STORE_FEE_PCT) => {
    const price = PRICE.trailblazer;
    const { credits, platformCost } = calcCosts(t.manE * util, t.narE * util, P.trailblazerMonths);
    const sf = price * feePct;
    const totalCost = platformCost + sf;
    const profit = price - totalCost;
    return { price, credits, platformCost, sf, totalCost, profit, margin: (profit / price) * 100 };
  };
  const trailblazer100 = trailblazerCase(1);
  const trailblazer50 = trailblazerCase(0.5);
  const trailblazer100HighFee = trailblazerCase(1, STORE_FEE_PCT_HIGH);
  const trailblazer50HighFee = trailblazerCase(0.5, STORE_FEE_PCT_HIGH);

  // Aura bundles: energy split by the Aura split; manifestation energy costs `blended` credits.
  const bundleAnalysis = AURA_BUNDLES.map((b) => {
    const price = parseFloat(b.price.replace('$', ''));
    const narEnergy = Math.round(b.energy * P.auraNarShare);
    const manEnergy = b.energy - narEnergy;
    const credits = narEnergy * CREDITS_PER_NARRATION + manEnergy * blended;
    const platformCost = credits * COST_PER_CREDIT;
    const sf = storeFee(price);
    const totalCost = platformCost + sf;
    const profit = price - totalCost;
    return { ...b, priceNum: price, narEnergy, manEnergy, credits, platformCost, sf, totalCost, profit, margin: (profit / price) * 100 };
  });

  const adMobScenarios = [250, 1000, 2500, 5000].map((users) => ({
    label: `${users.toLocaleString()} free users`, users,
    monthlyRev: users * AD_REV_PER_FREE_USER_MO, annualRev: users * AD_REV_PER_FREE_USER_MO * 12,
  }));
  const rewardedAdScenarios = [50, 200, 500, 1000].map((users) => ({
    label: `${users.toLocaleString()} Explorer+ users`, users,
    monthlyAdRev: users * adReward.rev,
    monthlyEnergyCost: users * adReward.cost,
    monthlyNet: users * adReward.net,
    monthlyCredits: Math.round(users * ADS_PER_PAID_USER_MO * adReward.creditsPerAd * AD_REWARD_UTILIZATION),
  }));

  const credits70 = (p) => calcCosts(p.manE * 0.7, p.narE * 0.7, 1).credits;
  const scenarios = SCENARIO_INPUTS.map((s) => {
    const seekerRev = s.mix.seeker * PRICE.seeker;
    const technicianRev = s.mix.technician * PRICE.technician;
    const explorerRev = s.mix.explorer * PRICE.explorer;
    const investigatorRev = s.mix.investigator * PRICE.investigator;
    const trailblazerRev = s.mix.trailblazer * (PRICE.trailblazer / P.trailblazerMonths);
    const subRev = seekerRev + technicianRev + explorerRev + investigatorRev + trailblazerRev;
    const energyUsers = s.mix.explorer + s.mix.investigator + s.mix.trailblazer;
    const interstitialAdRev = s.freeUsers * AD_REV_PER_FREE_USER_MO;
    const narrationAdRev = s.freeUsers * NARRATION_AD_REV_PER_FREE_USER_MO;
    const toolSaveAdRev = s.freeUsers * (TOOL_USE_AD_REV_OBSERVER_MO + SAVE_AD_REV_MO) + s.mix.seeker * SAVE_AD_REV_MO;
    const rewardedAdRev = energyUsers * adReward.rev;
    const adRev = interstitialAdRev + narrationAdRev + toolSaveAdRev + rewardedAdRev;
    const totalRev = subRev + adRev;
    const rewardedAdCredits = Math.round(energyUsers * ADS_PER_PAID_USER_MO * adReward.creditsPerAd * AD_REWARD_UTILIZATION);
    const saveCredits = (s.freeUsers + s.mix.seeker) * SAVE_UPLOAD_CREDITS_MO;
    const totalCredits = Math.round(
      s.mix.explorer * credits70(e) + s.mix.investigator * credits70(i) + s.mix.trailblazer * credits70(t) + rewardedAdCredits + saveCredits
    );
    const base44Plan = requiredBase44Plan(totalCredits);
    const storeCosts = subRev * STORE_FEE_PCT;
    const revcatCost = revenuecatFee(subRev);
    const totalCost = base44Plan.cost + storeCosts + revcatCost + FIXED_ONGOING_MONTHLY;
    const profit = totalRev - totalCost;
    return {
      ...s, seekerRev, technicianRev, explorerRev, investigatorRev, trailblazerRev, subRev, interstitialAdRev, narrationAdRev,
      toolSaveAdRev, rewardedAdRev, adRev, totalRev, platformCosts: base44Plan.cost, storeCosts, revcatCost, fixedCost: FIXED_ONGOING_MONTHLY,
      totalCost, profit, margin: (profit / totalRev) * 100, totalCredits, rewardedAdCredits, saveCredits, base44Plan,
    };
  });

  const perUserCreditCost = (p) => calcCosts(p.manE * 0.7, p.narE * 0.7, 1).platformCost + adReward.cost;
  const tierEconomics = [
    { tier: 'Observer', price: 0, narration: `Device only - one ad before each narration (~${OBSERVER_NARRATION_ADS_PER_TOUR} per tour)`, ads: 'Stop ads, narration ads, 2 ad-gated tools, ad-watched saves', adRev: OBSERVER_AD_REV_MO, creditCost: SAVE_UPLOAD_COST_MO },
    { tier: 'Seeker', price: PRICE.seeker, narration: 'Device only, no ads (0 credits)', ads: 'Ad-watched evidence saves only', adRev: SAVE_AD_REV_MO, creditCost: SAVE_UPLOAD_COST_MO },
    { tier: 'Technician', price: PRICE.technician, narration: 'Device only, no ads (0 credits)', ads: 'None (ad-free)', adRev: 0, creditCost: 0 },
    { tier: 'Explorer', price: PRICE.explorer, narration: `Device (free) or Enhanced (${e.narE.toLocaleString()} energy)`, ads: 'Optional rewarded energy top-ups', adRev: adReward.rev, creditCost: perUserCreditCost(e) },
    { tier: 'Investigator', price: PRICE.investigator, narration: `Device (free) or Enhanced (${i.narE.toLocaleString()} energy)`, ads: 'Optional rewarded energy top-ups', adRev: adReward.rev, creditCost: perUserCreditCost(i) },
    { tier: 'Trailblazer', price: PRICE.trailblazer / P.trailblazerMonths, priceLabel: `$${(PRICE.trailblazer / P.trailblazerMonths).toFixed(2)} ($239.99 / ${P.trailblazerMonths})`, narration: `Device (free) or Enhanced (${t.narE.toLocaleString()} energy)`, ads: 'Optional rewarded energy top-ups', adRev: adReward.rev, creditCost: perUserCreditCost(t) },
  ].map((x) => {
    const store = x.price * STORE_FEE_PCT;
    return { ...x, priceLabel: x.priceLabel || (x.price === 0 ? 'Free' : '$' + x.price.toFixed(2)), store, net: x.price + x.adRev - store - x.creditCost };
  });

  const pnlRows = [
    { section: 'Users' },
    { label: 'Observer (free)', val: (s) => s.freeUsers.toLocaleString() },
    { label: 'Seeker ($3.99)', val: (s) => s.mix.seeker.toLocaleString() },
    { label: 'Technician ($5.99)', val: (s) => s.mix.technician.toLocaleString() },
    { label: 'Explorer ($7.99)', val: (s) => s.mix.explorer.toLocaleString() },
    { label: 'Investigator ($11.99)', val: (s) => s.mix.investigator.toLocaleString() },
    { label: `Trailblazer ($239.99 / ${P.trailblazerMonths} mo)`, val: (s) => s.mix.trailblazer.toLocaleString() },
    { section: 'Subscription revenue' },
    { label: 'Seeker', val: (s) => usd0(s.seekerRev) },
    { label: 'Technician', val: (s) => usd0(s.technicianRev) },
    { label: 'Explorer', val: (s) => usd0(s.explorerRev) },
    { label: 'Investigator', val: (s) => usd0(s.investigatorRev) },
    { label: 'Trailblazer', val: (s) => usd0(s.trailblazerRev) },
    { label: 'Subscription total', val: (s) => usd0(s.subRev), bold: true },
    { section: 'Ad revenue' },
    { label: 'Observer stop ads (paranormal, stops 2+)', val: (s) => usd0(s.interstitialAdRev) },
    { label: `Observer narration ads (${OBSERVER_NARRATION_ADS_PER_TOUR} per tour)`, val: (s) => usd0(s.narrationAdRev) },
    { label: 'Observer tool ads + Observer/Seeker save ads', val: (s) => usd0(s.toolSaveAdRev) },
    { label: 'Explorer+ rewarded energy top-ups', val: (s) => usd0(s.rewardedAdRev) },
    { label: 'Ad total', val: (s) => usd0(s.adRev), bold: true },
    { label: 'TOTAL REVENUE', val: (s) => usd0(s.totalRev), bold: true },
    { section: 'Costs' },
    { label: 'AI credits used -> Base44 plan needed', val: (s) => `${s.totalCredits.toLocaleString()} -> ${s.base44Plan.plan}` },
    { label: 'Base44 plan cost', val: (s) => usd0(s.platformCosts) },
    { label: 'Store fees (15% of subscriptions)', val: (s) => usd0(s.storeCosts) },
    { label: 'RevenueCat (1% above $2,500)', val: (s) => usd0(s.revcatCost) },
    { label: 'Apple developer (fixed)', val: (s) => usd0(s.fixedCost) },
    { label: 'TOTAL COST', val: (s) => usd0(s.totalCost), bold: true },
    { section: 'Result' },
    { label: 'PROFIT / MONTH', val: (s) => usd0(s.profit), bold: true },
    { label: 'Margin', val: (s) => s.margin.toFixed(1) + '%' },
  ];

  // Itemised monthly credits a typical free (Observer) user would burn if ungated.
  const freeUserBreakdown = [
    { action: 'Stop Enrichment (thin content, 2-pass for single-site)', trigger: batch > 1 ? `Auto - 1 call per ${batch} stops` : 'Auto - fires on 1st stop view', freq: 7 / batch, creditsEach: avgEnrichmentCredits, fix: 'Gate: require Explorer+ to trigger enrichment' },
    { action: 'People Extraction (rich content)', trigger: 'Auto - fires on 1st stop view', freq: 3, creditsEach: 2, fix: 'Gate: require Explorer+ to extract people' },
    { action: 'Custom Tour Creation', trigger: 'User taps Create Tour', freq: 1, creditsEach: 3, fix: 'Gate: require Explorer+ manifestation energy' },
    { action: 'Haunted Locations Discovery', trigger: 'User searches nearby/zip', freq: 2, creditsEach: 3, fix: 'Gate: require Explorer+ to search' },
    { action: 'Weather Check', trigger: 'User opens Weather Monitor', freq: 1, creditsEach: 3, fix: 'Gate: require Explorer+ for weather' },
    { action: 'Narrate Stop Ghost Story', trigger: 'User taps Narrate button', freq: 6, creditsEach: 6, fix: 'Gate: require Explorer+ narration energy' },
    { action: 'Narrate Stop Paranormal Info', trigger: 'User taps Narrate button', freq: 2, creditsEach: 20, fix: 'Gate: require Explorer+ narration energy' },
    { action: 'Narrate Stop Historical Info', trigger: 'User taps Narrate button', freq: 2, creditsEach: 20, fix: 'Gate: require Explorer+ narration energy' },
    { action: 'Narrate Tour Introduction', trigger: 'User taps Narrate button', freq: 2, creditsEach: 10, fix: 'Gate: require Explorer+ narration energy' },
    { action: 'Sweeper Trigger Voices', trigger: 'User triggers letter/term', freq: 5, creditsEach: 1, fix: 'Gate: require Explorer+ narration energy' },
  ].map((r) => ({ ...r, totalCredits: r.freq * r.creditsEach, monthlyCost: r.freq * r.creditsEach * COST_PER_CREDIT }));
  const freeUserTotal = freeUserBreakdown.reduce((sum, r) => sum + r.totalCredits, 0);

  const ungatedCredits = (enrichCalls, otherManCalls, narCalls, narAvg) => enrichCalls * avgEnrichmentCredits + otherManCalls * CREDITS_PER_MANIFESTATION + narCalls * narAvg;
  const ungatedTypical = ungatedCredits(5 / batch, 5, 10, 15);
  const ungatedWorst = ungatedCredits(16 / batch, 16, 40, 20);

  const perUser100 = { explorer: calcCosts(e.manE, e.narE, 1).credits, investigator: calcCosts(i.manE, i.narE, 1).credits, trailblazer: calcCosts(t.manE, t.narE, 1).credits };

  return {
    P, batch, blended, avgEnrichmentCredits, enrichShare, adReward, calcCosts, storeFee, revenuecatFee, requiredBase44Plan,
    trailblazerMonths: P.trailblazerMonths, adRewardEnergy: P.adRewardEnergy, adRewardNarration: P.adRewardNarration, adRewardManifestation: P.adRewardManifestation,
    monthlyAnalysis, trailblazer100, trailblazer50, trailblazer100HighFee, trailblazer50HighFee, bundleAnalysis, adMobScenarios,
    rewardedAdScenarios, scenarios, tierEconomics, pnlRows, freeUserBreakdown, freeUserTotal, freeUserCost: freeUserTotal * COST_PER_CREDIT,
    ungatedTypical, ungatedTypicalCost: ungatedTypical * COST_PER_CREDIT, ungatedWorst, ungatedWorstCost: ungatedWorst * COST_PER_CREDIT, perUser100,
  };
}