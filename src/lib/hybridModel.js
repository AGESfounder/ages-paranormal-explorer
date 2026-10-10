import { jsPDF } from 'jspdf';

// ===== HYBRID PLAN — Cost Analysis "B" =====
//
// The Hybrid Plan is a NEW SUBSCRIPTION TIER proposed during the Centralia PA
// tour audit. The problem it solves: Explorer ($7.99, 500 narE) cannot finish
// a single full Enhanced-narrated tour — the Centralia reference tour costs
// ~764 narration credits (8 stops × all 4 tabs + intro + conclusion), but
// Explorer only has 500. Users burn through energy before the tour ends and
// feel cheated.
//
// The Hybrid Plan sits between Explorer and Investigator:
//   Explorer:     $7.99/mo,  5 manE,  500 narE  → 0.65 full tours (can't finish 1)
//   HYBRID:       $9.99/mo,  10 manE, 1000 narE → 1.31 full tours (finishes 1, starts a 2nd)
//   Investigator: $11.99/mo, 15 manE, 1500 narE → 1.96 full tours
//
// Enhanced narration remains available for the ENTIRE tour — all 4 tabs per
// stop (Ghost Story, History, Paranormal, Investigation) + intro + conclusion.
// Nothing changes about how the app works. Only the plan tier is new.
//
// The Centralia PA tour (8 stops, full Relive-length Enhanced narration) is
// the reference case: ~764 narration credits = the real-world cost of one
// full Enhanced-narrated tour.

// ===== REFERENCE: Centralia PA Tour (8 stops, full Enhanced narration) =====
const CENTRALIA_STOPS = 8;
const CENTRALIA_NARRATION_CREDITS = 764; // measured: all tabs, all stops + intro + conclusion
const CENTRALIA_MANIFESTATION_CREDITS = 56; // search + creation + 8-stop enrichment (2-pass single-site)
const CENTRALIA_TOTAL_CREDITS = CENTRALIA_NARRATION_CREDITS + CENTRALIA_MANIFESTATION_CREDITS; // 820

// ===== SHARED CONSTANTS (same as PlanAnalysis.jsx) =====
const CREDITS_PER_MANIFESTATION = 3;
const CREDITS_PER_NARRATION = 1;
const COST_PER_CREDIT = 0.004; // Builder plan: $40/mo ÷ 10,000 credits

const ENRICHMENT_CREDITS_SINGLE_SITE = 6; // 2-pass (Sept 2026)
const ENRICHMENT_CREDITS_MULTI_SITE = 3;
const SINGLE_SITE_FRACTION = 0.6;
const AVG_ENRICHMENT_CREDITS = Math.round(
  ENRICHMENT_CREDITS_SINGLE_SITE * SINGLE_SITE_FRACTION +
  ENRICHMENT_CREDITS_MULTI_SITE * (1 - SINGLE_SITE_FRACTION)
); // ~5
const ENRICHMENT_CALL_FRACTION = 0.5;
const BLENDED_MANIFESTATION_CREDITS = Math.round(
  CREDITS_PER_MANIFESTATION * (1 - ENRICHMENT_CALL_FRACTION) +
  AVG_ENRICHMENT_CREDITS * ENRICHMENT_CALL_FRACTION
); // ~4

// Full Enhanced-narrated tour cost (Centralia reference: 8 stops, all tabs)
const FULL_TOUR_NARRATION_CREDITS = CENTRALIA_NARRATION_CREDITS; // 764
const TOURS_PER_ENERGY = (narE) => Math.floor(narE / FULL_TOUR_NARRATION_CREDITS);
const TOURS_PER_ENERGY_DECIMAL = (narE) => (narE / FULL_TOUR_NARRATION_CREDITS);

// Store fees
const STORE_FEE_PCT = 0.15;
const STORE_FEE_PCT_HIGH = 0.30;
const STORE_HIGH_THRESHOLD = 1000000;
const REVENUECAT_FEE_PCT = 0.01;
const REVENUECAT_THRESHOLD = 2500;

// Fixed costs
const APPLE_DEV_ANNUAL = 99;
const fixedOngoingMonthly = APPLE_DEV_ANNUAL / 12;

// AdMob (same as current model)
const ADMOB_ECPM = 15;
const ADMOB_PER_IMPRESSION = ADMOB_ECPM / 1000;
const ADS_PER_TOUR = 7;
const TOURS_PER_FREE_USER_MO = 2;
const AD_REV_PER_FREE_USER_MO = ADS_PER_TOUR * TOURS_PER_FREE_USER_MO * ADMOB_PER_IMPRESSION;
const OBSERVER_NARRATION_ADS_PER_TOUR = 27;
const NARRATION_AD_REV_PER_FREE_USER_MO = OBSERVER_NARRATION_ADS_PER_TOUR * TOURS_PER_FREE_USER_MO * ADMOB_PER_IMPRESSION;
const TOOL_USE_ADS_OBSERVER_MO = 10;
const ADMOB_REWARDED_PER_IMPRESSION = 20 / 1000;
const TOOL_USE_AD_REV_OBSERVER_MO = TOOL_USE_ADS_OBSERVER_MO * ADMOB_REWARDED_PER_IMPRESSION;
const SAVE_ADS_MO = 3;
const SAVE_AD_REV_MO = SAVE_ADS_MO * ADMOB_REWARDED_PER_IMPRESSION;
const OBSERVER_AD_REV_MO = AD_REV_PER_FREE_USER_MO + NARRATION_AD_REV_PER_FREE_USER_MO + TOOL_USE_AD_REV_OBSERVER_MO + SAVE_AD_REV_MO;

const ADS_PER_PAID_USER_MO = 5;
const AD_REWARD_ENERGY = 10;
const AD_REWARD_NARRATION = 8;
const AD_REWARD_MANIFESTATION = 2;
const AD_REWARD_CREDITS_PER_AD = AD_REWARD_NARRATION * CREDITS_PER_NARRATION + AD_REWARD_MANIFESTATION * BLENDED_MANIFESTATION_CREDITS;
const AD_REWARD_UTILIZATION = 0.7;
const AD_REWARD_REV_PER_PAID_USER_MO = ADS_PER_PAID_USER_MO * ADMOB_REWARDED_PER_IMPRESSION;
const AD_REWARD_COST_PER_PAID_USER_MO = ADS_PER_PAID_USER_MO * AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION * COST_PER_CREDIT;
const AD_REWARD_NET_PER_PAID_USER_MO = AD_REWARD_REV_PER_PAID_USER_MO - AD_REWARD_COST_PER_PAID_USER_MO;
const SAVE_UPLOAD_CREDITS_MO = SAVE_ADS_MO * 1;
const SAVE_UPLOAD_COST_MO = SAVE_UPLOAD_CREDITS_MO * COST_PER_CREDIT;

// Base44 plans
const BASE44_PLANS = [
  { name: 'Builder', monthlyCost: 40, credits: 10000, costPerCredit: 40 / 10000 },
  { name: 'Pro', monthlyCost: 80, credits: 20000, costPerCredit: 80 / 20000 },
  { name: 'Elite', monthlyCost: 200, credits: 50000, costPerCredit: 200 / 50000 },
];

// ===== PLANS (with Hybrid tier added) =====
const PLANS = [
  { name: 'Observer', price: '$0', billing: 'Free forever', manE: 0, narE: 0,
    features: 'Browse all 50 states + international tours; view tour details, stops, maps, text; Device narration (ad before each narration — ~27 ads per fully narrated tour); save favorites; 4-tool toolkit (2 ad-gated); evidence saves 10/day (ad-watched); evidence journal + dashboard' },
  { name: 'Seeker', price: '$3.99', billing: 'Monthly ($39.99/yr)', manE: 0, narE: 0,
    features: 'Everything in Observer, ad-free; Device narration only (0 credits); 4-tool toolkit (no ads); community map posting; evidence saves 10/day; Aura Bundle access (Save Energy only)' },
  { name: 'Technician', price: '$5.99', billing: 'Monthly ($59.99/yr)', manE: 0, narE: 0,
    features: 'Everything in Seeker (ad-free, Device narration only — 0 credits); 10 of 12 toolkit tools; Aura Bundle access (100% Save Energy); evidence saves 20/day, then Aura Save energy' },
  { name: 'Explorer', price: '$7.99', billing: 'Monthly ($79.99/yr)', manE: 5, narE: 500,
    features: 'Everything in Technician; Device narration (free) or Enhanced AI narration (~0.65 fully narrated tours/mo — CANNOT finish a full tour); custom tour generation (1-2/mo); ranked tours; nearby + abroad; 10-tool toolkit; aura bundles (80/20 narration/manifestation)' },
  { name: 'Hybrid', price: '$9.99', billing: 'Monthly ($99.99/yr)', manE: 10, narE: 1000,
    features: 'Everything in Explorer; Device narration (free) or Enhanced AI narration (~1.3 fully narrated tours/mo — FINISHES a full Centralia-length tour with energy to spare); custom tour generation (2-3/mo); ranked tours; nearby + abroad; 10-tool toolkit; aura bundles (80/20)' },
  { name: 'Investigator', price: '$11.99', billing: 'Monthly ($119.99/yr)', manE: 15, narE: 1500,
    features: 'Everything in Hybrid; AI narration (~1.96 fully narrated tours/mo); custom tours (up to 5/mo); full 12-tool toolkit; evidence dashboard analytics; aura bundles' },
  { name: 'Trailblazer', price: '$239.99', billing: 'One-time, 30 months (max 300 slots)', manE: 15, narE: 1500,
    features: 'Everything in Investigator; AI narration (~1.96 fully narrated tours/mo); custom tours (up to 5/mo); exclusive badge; early access; 30-mo price lock; 20% off aura bundles' },
];

const AURA_BUNDLES = [
  { name: 'Flicker', energy: 150, price: '$2.99' },
  { name: 'Apparition', energy: 500, price: '$6.49' },
  { name: 'Haunting', energy: 1500, price: '$16.99' },
  { name: 'Spectral', energy: 2500, price: '$24.99' },
];

// ===== CALCULATIONS =====
function calcCosts(manE, narE, months) {
  const credits = (manE * BLENDED_MANIFESTATION_CREDITS + narE * CREDITS_PER_NARRATION) * months;
  const platformCost = credits * COST_PER_CREDIT;
  return { credits, platformCost };
}

function storeFee(price) { return price * STORE_FEE_PCT; }
function revenuecatFee(monthlySales) {
  if (monthlySales <= REVENUECAT_THRESHOLD) return 0;
  return (monthlySales - REVENUECAT_THRESHOLD) * REVENUECAT_FEE_PCT;
}

function requiredBase44Plan(credits) {
  if (credits <= 10000) return { plan: 'Builder', plans: 1, cost: 40 };
  if (credits <= 20000) return { plan: 'Pro', plans: 1, cost: 80 };
  if (credits <= 50000) return { plan: 'Elite', plans: 1, cost: 200 };
  const eliteCount = Math.ceil(credits / 50000);
  return { plan: `${eliteCount}x Elite`, plans: eliteCount, cost: eliteCount * 200 };
}

// Per-plan monthly profit (100% utilization) — with Hybrid tier
const monthlyAnalysis = [
  { plan: 'Seeker', price: 3.99, manE: 0, narE: 0 },
  { plan: 'Technician', price: 5.99, manE: 0, narE: 0 },
  { plan: 'Explorer', price: 7.99, manE: 5, narE: 500 },
  { plan: 'Hybrid', price: 9.99, manE: 10, narE: 1000 },
  { plan: 'Investigator', price: 11.99, manE: 15, narE: 1500 },
].map(p => {
  const { credits, platformCost } = calcCosts(p.manE, p.narE, 1);
  const sf = storeFee(p.price);
  const totalCost = platformCost + sf;
  const profit = p.price - totalCost;
  return { ...p, credits, platformCost, sf, totalCost, profit, margin: (profit / p.price * 100) };
});

// Trailblazer (30 months, 100% utilization)
const trailblazerAnalysis = (() => {
  const price = 239.99;
  const { credits, platformCost } = calcCosts(15, 1500, 30);
  const sf = storeFee(price);
  const totalCost = platformCost + sf;
  const profit = price - totalCost;
  return { price, credits, platformCost, sf, totalCost, profit, margin: (profit / price * 100) };
})();

const trailblazer50 = (() => {
  const price = 239.99;
  const { credits, platformCost } = calcCosts(7.5, 750, 30);
  const sf = storeFee(price);
  const totalCost = platformCost + sf;
  const profit = price - totalCost;
  return { price, credits, platformCost, sf, totalCost, profit, margin: (profit / price * 100) };
})();

const bundleAnalysis = AURA_BUNDLES.map(b => {
  const price = parseFloat(b.price.replace('$', ''));
  const credits = b.energy;
  const platformCost = credits * COST_PER_CREDIT;
  const sf = storeFee(price);
  const totalCost = platformCost + sf;
  const profit = price - totalCost;
  return { ...b, priceNum: price, credits, platformCost, sf, totalCost, profit, margin: (profit / price * 100) };
});

// Per-user tier economics (with Hybrid)
const perUserCreditCost = (manE, narE) =>
  calcCosts(manE * 0.7, narE * 0.7, 1).platformCost + AD_REWARD_COST_PER_PAID_USER_MO;
const TIER_ECONOMICS = [
  { tier: 'Observer', price: 0, narration: `Device only — one ad before each narration (~${OBSERVER_NARRATION_ADS_PER_TOUR} per tour)`, ads: 'Stop ads, narration ads, 2 ad-gated tools, ad-watched saves', adRev: OBSERVER_AD_REV_MO, creditCost: SAVE_UPLOAD_COST_MO },
  { tier: 'Seeker', price: 3.99, narration: 'Device only, no ads (0 credits)', ads: 'Ad-watched evidence saves only', adRev: SAVE_AD_REV_MO, creditCost: SAVE_UPLOAD_COST_MO },
  { tier: 'Technician', price: 5.99, narration: 'Device only, no ads (0 credits)', ads: 'None (ad-free)', adRev: 0, creditCost: 0 },
  { tier: 'Explorer', price: 7.99, narration: `Enhanced AI narration — ${TOURS_PER_ENERGY_DECIMAL(500).toFixed(2)} full tours/mo (CANNOT finish 1)`, ads: 'Optional rewarded energy top-ups', adRev: AD_REWARD_REV_PER_PAID_USER_MO, creditCost: perUserCreditCost(5, 500) },
  { tier: 'Hybrid', price: 9.99, narration: `Enhanced AI narration — ${TOURS_PER_ENERGY_DECIMAL(1000).toFixed(2)} full tours/mo (FINISHES 1)`, ads: 'Optional rewarded energy top-ups', adRev: AD_REWARD_REV_PER_PAID_USER_MO, creditCost: perUserCreditCost(10, 1000) },
  { tier: 'Investigator', price: 11.99, narration: `Enhanced AI narration — ${TOURS_PER_ENERGY_DECIMAL(1500).toFixed(2)} full tours/mo`, ads: 'Optional rewarded energy top-ups', adRev: AD_REWARD_REV_PER_PAID_USER_MO, creditCost: perUserCreditCost(15, 1500) },
  { tier: 'Trailblazer', price: 239.99 / 30, priceLabel: '$8.00 ($239.99/30)', narration: `Enhanced AI narration — ${TOURS_PER_ENERGY_DECIMAL(1500).toFixed(2)} full tours/mo`, ads: 'Optional rewarded energy top-ups', adRev: AD_REWARD_REV_PER_PAID_USER_MO, creditCost: perUserCreditCost(15, 1500) },
].map(t => {
  const store = t.price * STORE_FEE_PCT;
  return { ...t, priceLabel: t.priceLabel || (t.price === 0 ? 'Free' : '$' + t.price.toFixed(2)), store, net: t.price + t.adRev - store - t.creditCost };
});

// Revenue scenarios (with Hybrid tier in the mix)
// Mix shifts some Explorer users to Hybrid (users who want a full tour upgrade
// at $2/mo more). ~15% of Explorer users convert to Hybrid.
const scenarios = [
  { label: 'Small (50 paid / 250 free)', mix: { seeker: 15, technician: 10, explorer: 12, hybrid: 5, investigator: 5, trailblazer: 3 }, freeUsers: 250 },
  { label: 'Growing (200 paid / 1,000 free)', mix: { seeker: 60, technician: 40, explorer: 50, hybrid: 20, investigator: 20, trailblazer: 10 }, freeUsers: 1000 },
  { label: 'Scale (500 paid / 2,500 free)', mix: { seeker: 150, technician: 100, explorer: 120, hybrid: 50, investigator: 55, trailblazer: 25 }, freeUsers: 2500 },
  { label: 'Mature (1,000 paid / 5,000 free)', mix: { seeker: 300, technician: 200, explorer: 240, hybrid: 100, investigator: 110, trailblazer: 50 }, freeUsers: 5000 },
].map(s => {
  const seekerRev = s.mix.seeker * 3.99;
  const technicianRev = s.mix.technician * 5.99;
  const explorerRev = s.mix.explorer * 7.99;
  const hybridRev = s.mix.hybrid * 9.99;
  const investigatorRev = s.mix.investigator * 11.99;
  const trailblazerRev = s.mix.trailblazer * (239.99 / 30);
  const subRev = seekerRev + technicianRev + explorerRev + hybridRev + investigatorRev + trailblazerRev;
  const energyUsers = s.mix.explorer + s.mix.hybrid + s.mix.investigator + s.mix.trailblazer;
  const interstitialAdRev = s.freeUsers * AD_REV_PER_FREE_USER_MO;
  const narrationAdRev = s.freeUsers * NARRATION_AD_REV_PER_FREE_USER_MO;
  const toolSaveAdRev = s.freeUsers * (TOOL_USE_AD_REV_OBSERVER_MO + SAVE_AD_REV_MO) + s.mix.seeker * SAVE_AD_REV_MO;
  const rewardedAdRev = energyUsers * AD_REWARD_REV_PER_PAID_USER_MO;
  const adRev = interstitialAdRev + narrationAdRev + toolSaveAdRev + rewardedAdRev;
  const totalRev = subRev + adRev;
  const rewardedAdCredits = Math.round(energyUsers * ADS_PER_PAID_USER_MO * AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION);
  const saveCredits = (s.freeUsers + s.mix.seeker) * SAVE_UPLOAD_CREDITS_MO;
  const totalCredits = Math.round(
    s.mix.explorer * calcCosts(5 * 0.7, 500 * 0.7, 1).credits
    + s.mix.hybrid * calcCosts(10 * 0.7, 1000 * 0.7, 1).credits
    + s.mix.investigator * calcCosts(15 * 0.7, 1500 * 0.7, 1).credits
    + s.mix.trailblazer * calcCosts(15 * 0.7, 1500 * 0.7, 1).credits
    + rewardedAdCredits
    + saveCredits
  );
  const base44Plan = requiredBase44Plan(totalCredits);
  const platformCosts = base44Plan.cost;
  const storeCosts = subRev * STORE_FEE_PCT;
  const revcatCost = revenuecatFee(subRev);
  const fixedCost = fixedOngoingMonthly;
  const totalCost = platformCosts + storeCosts + revcatCost + fixedCost;
  const profit = totalRev - totalCost;
  return { ...s, seekerRev, technicianRev, explorerRev, hybridRev, investigatorRev, trailblazerRev, subRev, interstitialAdRev, narrationAdRev, toolSaveAdRev, rewardedAdRev, adRev, totalRev, platformCosts, storeCosts, revcatCost, fixedCost, totalCost, profit, margin: (profit / totalRev * 100), totalCredits, rewardedAdCredits, saveCredits, base44Plan };
});

const usd0 = (n) => '$' + Math.round(n).toLocaleString();
const pnlRows = [
  { section: 'Users' },
  { label: 'Observer (free)', val: s => s.freeUsers.toLocaleString() },
  { label: 'Seeker ($3.99)', val: s => s.mix.seeker.toLocaleString() },
  { label: 'Technician ($5.99)', val: s => s.mix.technician.toLocaleString() },
  { label: 'Explorer ($7.99)', val: s => s.mix.explorer.toLocaleString() },
  { label: 'Hybrid ($9.99)', val: s => s.mix.hybrid.toLocaleString() },
  { label: 'Investigator ($11.99)', val: s => s.mix.investigator.toLocaleString() },
  { label: 'Trailblazer ($239.99 / 30 mo)', val: s => s.mix.trailblazer.toLocaleString() },
  { section: 'Subscription revenue' },
  { label: 'Seeker', val: s => usd0(s.seekerRev) },
  { label: 'Technician', val: s => usd0(s.technicianRev) },
  { label: 'Explorer', val: s => usd0(s.explorerRev) },
  { label: 'Hybrid', val: s => usd0(s.hybridRev) },
  { label: 'Investigator', val: s => usd0(s.investigatorRev) },
  { label: 'Trailblazer', val: s => usd0(s.trailblazerRev) },
  { label: 'Subscription total', val: s => usd0(s.subRev), bold: true },
  { section: 'Ad revenue' },
  { label: 'Observer stop ads', val: s => usd0(s.interstitialAdRev) },
  { label: `Observer narration ads (${OBSERVER_NARRATION_ADS_PER_TOUR}/tour)`, val: s => usd0(s.narrationAdRev) },
  { label: 'Observer tool + save ads', val: s => usd0(s.toolSaveAdRev) },
  { label: 'Explorer+ rewarded top-ups', val: s => usd0(s.rewardedAdRev) },
  { label: 'Ad total', val: s => usd0(s.adRev), bold: true },
  { label: 'TOTAL REVENUE', val: s => usd0(s.totalRev), bold: true },
  { section: 'Costs' },
  { label: 'AI credits -> Base44 plan', val: s => `${s.totalCredits.toLocaleString()} -> ${s.base44Plan.plan}` },
  { label: 'Base44 plan cost', val: s => usd0(s.platformCosts) },
  { label: 'Store fees (15%)', val: s => usd0(s.storeCosts) },
  { label: 'RevenueCat (1% above $2.5k)', val: s => usd0(s.revcatCost) },
  { label: 'Apple developer (fixed)', val: s => usd0(s.fixedCost) },
  { label: 'TOTAL COST', val: s => usd0(s.totalCost), bold: true },
  { section: 'Result' },
  { label: 'PROFIT / MONTH', val: s => usd0(s.profit), bold: true },
  { label: 'Margin', val: s => s.margin.toFixed(1) + '%' },
];

const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export function downloadHybridPDF() {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  let y = 50;
  const lh = 14;

  const heading = (text, size = 14) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.text(text, M, y); y += size + 6; };
  const para = (text, size = 9) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(size); const lines = doc.splitTextToSize(text, W - M * 2); lines.forEach(l => { if (y > 780) { doc.addPage(); y = 50; } doc.text(l, M, y); y += lh; }); y += 2; };
  const table = (headers, rows, colWidths) => {
    const startX = M;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    let x = startX;
    headers.forEach((h, i) => { doc.text(h, x, y); x += colWidths[i]; });
    y += 4; doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 10;
    doc.setFont('helvetica', 'normal');
    rows.forEach(row => {
      if (y > 770) { doc.addPage(); y = 50; }
      x = startX;
      row.forEach((cell, i) => { doc.text(String(cell), x, y); x += colWidths[i]; });
      y += lh;
    });
    y += 8;
  };

  // Title
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('AGES Cost Analysis B — Hybrid Plan', M, y); y += 22;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Generated ${today}`, M, y); y += 6;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
  doc.text('New Hybrid tier ($9.99/mo) — enough energy for a full Enhanced-narrated tour', M, y); y += 20;

  // Overview
  heading('The Problem: Explorer Cannot Finish a Full Tour');
  para(`The Centralia PA tour (8 stops, full Relive-length Enhanced narration across all 4 tabs per stop + intro + conclusion) costs ${CENTRALIA_NARRATION_CREDITS} narration credits. Explorer's 500 narration energy covers only ${TOURS_PER_ENERGY_DECIMAL(500).toFixed(2)} of that tour — users run out of energy before the tour ends. This is the #1 user complaint: "I paid for Enhanced narration but can't even finish one tour."`);
  para(`The Hybrid Plan solves this with a new tier at $9.99/mo with 1000 narration energy — enough for ${TOURS_PER_ENERGY_DECIMAL(1000).toFixed(2)} full Enhanced-narrated Centralia-length tours. Enhanced narration remains available for the ENTIRE tour (all tabs, all stops). Nothing changes about how the app works — only the plan tier is new.`);

  // Centralia reference
  heading('1. Reference Case: Centralia PA Tour (8 Stops, Full Enhanced)');
  para(`The Centralia PA tour is the reference case from the credit-consumption audit. It represents a full-featured tour with Relive-length narration across all tabs at every stop.`);
  table(['Component', 'Credits', 'Notes'],
    [
      ['Nearby search (gemini_3_1_pro + web)', '~9', '1-3 calls for location discovery'],
      ['Tour creation (gemini_3_flash + web)', '~7', '1-3 attempts (web, no-web, web)'],
      ['Stop enrichment x8 (2-pass single-site)', '~48', '8 stops x ~6 credits (2-pass: web + rewrite)'],
      ['Manifestation subtotal', String(CENTRALIA_MANIFESTATION_CREDITS), 'Search + creation + enrichment'],
      ['Narration: intro + conclusion', '~40', '2 long-form Enhanced TTS segments'],
      ['Narration: 8 stops x 4 tabs each', '~724', 'Ghost Story + History + Paranormal + Investigation'],
      ['Narration subtotal', String(CENTRALIA_NARRATION_CREDITS), 'Full Enhanced narration, all tabs'],
      ['TOTAL per full tour', String(CENTRALIA_TOTAL_CREDITS), 'Manifestation + Narration'],
      ['Developer cost per tour', '$' + (CENTRALIA_TOTAL_CREDITS * COST_PER_CREDIT).toFixed(2), `${CENTRALIA_TOTAL_CREDITS} credits x $${COST_PER_CREDIT.toFixed(4)}`],
    ],
    [180, 60, 200]);

  // Tours per energy
  heading('2. Tours Per Energy Allotment (Centralia Reference: 764 narE/tour)');
  table(['Tier', 'Price', 'Narr. Energy', 'Full Tours/mo', 'Can Finish 1 Tour?'],
    [
      ['Explorer', '$7.99', '500', TOURS_PER_ENERGY_DECIMAL(500).toFixed(2), 'NO — runs out at 65%'],
      ['HYBRID', '$9.99', '1000', TOURS_PER_ENERGY_DECIMAL(1000).toFixed(2), 'YES — finishes 1, starts a 2nd'],
      ['Investigator', '$11.99', '1500', TOURS_PER_ENERGY_DECIMAL(1500).toFixed(2), 'YES — finishes ~2'],
      ['Trailblazer', '$239.99/30mo', '1500', TOURS_PER_ENERGY_DECIMAL(1500).toFixed(2), 'YES — finishes ~2'],
    ],
    [65, 55, 60, 60, 100]);
  para(`Manifestation energy: Explorer (5 manE) can create ~1 tour + enrich ~0 stops (needs 8 manE for a full 8-stop tour). Hybrid (10 manE) can create ~1 tour + enrich all 8 stops. Investigator (15 manE) can create ~1 tour + enrich all 8 stops with 7 manE to spare.`);

  // Subscription tiers
  heading('3. Subscription Tiers (with Hybrid Added)');
  table(['Plan', 'Price', 'Billing', 'Man. E', 'Narr. E', 'Full Tours/mo'],
    PLANS.map(p => [p.name, p.price, p.billing, p.manE, p.narE, p.narE > 0 ? TOURS_PER_ENERGY_DECIMAL(p.narE).toFixed(2) : '0 (Device)']),
    [65, 50, 130, 50, 50, 60]);
  PLANS.forEach(p => para(`${p.name}: ${p.features}`));

  // Per-user economics
  heading('4. Per-User Monthly Economics (70% Utilization, with Hybrid)');
  table(['Tier', 'Price/mo', 'Ad Rev', 'Credit Cost', 'Store Fee', 'Net/user'],
    TIER_ECONOMICS.map(t => [t.tier, t.priceLabel.split(' ')[0], '$' + t.adRev.toFixed(2), '$' + t.creditCost.toFixed(2), '$' + t.store.toFixed(2), '$' + t.net.toFixed(2)]),
    [90, 70, 70, 80, 70, 70]);
  TIER_ECONOMICS.forEach(t => para(`${t.tier}: ${t.narration}.`));

  // Per-plan profit
  heading('5. Per-Plan Profit — Monthly, 100% Utilization (with Hybrid)');
  table(['Plan', 'Price', 'Credits', 'Platform', 'Store Fee', 'Cost', 'Profit', 'Margin'],
    monthlyAnalysis.map(r => [r.plan, '$' + r.price.toFixed(2), r.credits, '$' + r.platformCost.toFixed(2), '$' + r.sf.toFixed(2), '$' + r.totalCost.toFixed(2), '$' + r.profit.toFixed(2), r.margin.toFixed(1) + '%']),
    [65, 45, 50, 55, 50, 50, 50, 45]);
  para(`Hybrid at 100% utilization: ${monthlyAnalysis[3].credits} credits = $${monthlyAnalysis[3].platformCost.toFixed(2)} platform cost + $${monthlyAnalysis[3].sf.toFixed(2)} store fee = $${monthlyAnalysis[3].totalCost.toFixed(2)} total. Profit: $${monthlyAnalysis[3].profit.toFixed(2)}/mo (${monthlyAnalysis[3].margin.toFixed(1)}% margin). Compare: Explorer ${monthlyAnalysis[2].margin.toFixed(1)}% margin, Investigator ${monthlyAnalysis[4].margin.toFixed(1)}% margin.`);
  para(`At 70% realistic utilization, Hybrid costs ${Math.round(monthlyAnalysis[3].credits * 0.7)} credits = $${(monthlyAnalysis[3].credits * 0.7 * COST_PER_CREDIT).toFixed(2)} platform cost. Profit rises to $${(9.99 - monthlyAnalysis[3].credits * 0.7 * COST_PER_CREDIT - monthlyAnalysis[3].sf).toFixed(2)} (${((9.99 - monthlyAnalysis[3].credits * 0.7 * COST_PER_CREDIT - monthlyAnalysis[3].sf) / 9.99 * 100).toFixed(1)}% margin).`);

  // Trailblazer
  heading('6. Trailblazer — 30-Month ($239.99)');
  table(['Utilization', 'Credits', 'Platform', 'Store Fee', 'Cost', 'Profit', 'Margin'],
    [['100%', trailblazerAnalysis.credits.toLocaleString(), '$' + trailblazerAnalysis.platformCost.toFixed(2), '$' + trailblazerAnalysis.sf.toFixed(2), '$' + trailblazerAnalysis.totalCost.toFixed(2), '$' + trailblazerAnalysis.profit.toFixed(2), trailblazerAnalysis.margin.toFixed(1) + '%'],
     ['50%', trailblazer50.credits.toLocaleString(), '$' + trailblazer50.platformCost.toFixed(2), '$' + trailblazer50.sf.toFixed(2), '$' + trailblazer50.totalCost.toFixed(2), '$' + trailblazer50.profit.toFixed(2), trailblazer50.margin.toFixed(1) + '%']],
    [65, 65, 55, 50, 55, 55, 50]);

  // Aura bundles
  heading('7. Aura Bundle Profit — 100% Utilization');
  table(['Bundle', 'Price', 'Credits', 'Platform', 'Store Fee', 'Profit', 'Margin'],
    bundleAnalysis.map(r => [r.name, '$' + r.priceNum.toFixed(2), r.credits, '$' + r.platformCost.toFixed(2), '$' + r.sf.toFixed(2), '$' + r.profit.toFixed(2), r.margin.toFixed(1) + '%']),
    [65, 45, 45, 55, 50, 55, 50]);

  // Credit capacity
  heading('8. Base44 Credit Capacity — When to Upgrade (with Hybrid)');
  para('Integration credits are hard-capped per plan. The Hybrid tier consumes more credits than Explorer (1040 vs 520 at 100% util) but less than Investigator (1560). It shifts the credit capacity curve slightly — some users who would have been Explorer (520 credits) are now Hybrid (1040 credits), roughly doubling their credit footprint.');
  table(['Base44 Plan', '$/mo', 'Credits/mo', 'Explorer (100%)', 'Hybrid (100%)', 'Investigator (100%)'],
    BASE44_PLANS.map(p => {
      const explorerCredits = 5 * BLENDED_MANIFESTATION_CREDITS + 500;
      const hybridCredits = 10 * BLENDED_MANIFESTATION_CREDITS + 1000;
      const investigatorCredits = 15 * BLENDED_MANIFESTATION_CREDITS + 1500;
      return [p.name, '$' + p.monthlyCost, p.credits.toLocaleString(), '~' + Math.floor(p.credits / explorerCredits), '~' + Math.floor(p.credits / hybridCredits), '~' + Math.floor(p.credits / investigatorCredits)];
    }),
    [70, 40, 55, 65, 65, 65]);

  // Revenue scenarios
  heading('9. Revenue Scenarios (Monthly P&L, 70% Utilization, with Hybrid)');
  para('User mix includes the Hybrid tier. ~15% of users who would have been Explorer convert to Hybrid (the $2/mo upgrade to get a full tour). This shifts revenue up (Hybrid pays $2/mo more than Explorer) and shifts credits up (Hybrid uses ~2x Explorer credits at 100% util). The net effect on profit depends on the Base44 plan tier required.');
  table(['Monthly P&L', ...scenarios.map(s => s.label.split(' ')[0])],
    pnlRows.map(r => r.section ? [r.section.toUpperCase(), '', '', '', ''] : [r.label, ...scenarios.map(s => r.val(s))]),
    [230, 70, 70, 70, 70]);

  // Base44 plan per scenario
  heading('9a. Base44 Plan Required Per Scenario (with Hybrid)');
  table(['Scenario', 'Sub Credits', 'Ad-Reward Cr', 'Total Cr', 'Base44 Plan', 'Plan $/mo'],
    scenarios.map(s => [s.label, (s.totalCredits - s.rewardedAdCredits).toLocaleString(), s.rewardedAdCredits.toLocaleString(), s.totalCredits.toLocaleString(), s.base44Plan.plan, '$' + s.base44Plan.cost]),
    [85, 50, 50, 50, 60, 45]);

  // Key takeaways
  heading('10. Key Takeaways — Hybrid Plan Impact');
  para(`THE PROBLEM: Explorer ($7.99, 500 narE) cannot finish a full Enhanced-narrated Centralia-length tour (${CENTRALIA_NARRATION_CREDITS} credits). Users run out at 65%. This is the #1 complaint and drives churn.`);
  para(`THE FIX: Hybrid ($9.99, 1000 narE) gives ${TOURS_PER_ENERGY_DECIMAL(1000).toFixed(2)} full tours/mo — enough to finish one complete Enhanced-narrated tour with energy to spare. Enhanced narration covers the ENTIRE tour (all 4 tabs per stop + intro + conclusion). No changes to how the app works.`);
  para(`PROFITABILITY: Hybrid yields ${monthlyAnalysis[3].margin.toFixed(1)}% margin at 100% utilization ($${monthlyAnalysis[3].profit.toFixed(2)}/mo profit). At 70% realistic utilization, margin improves to ~${((9.99 - monthlyAnalysis[3].credits * 0.7 * COST_PER_CREDIT - monthlyAnalysis[3].sf) / 9.99 * 100).toFixed(1)}%. This sits between Explorer (${monthlyAnalysis[2].margin.toFixed(1)}%) and Investigator (${monthlyAnalysis[4].margin.toFixed(1)}%) — sustainable.`);
  para(`REVENUE LIFT: Users who upgrade from Explorer ($7.99) to Hybrid ($9.99) pay $2/mo more. At the Mature scenario (100 Hybrid users), that is +$200/mo in subscription revenue. The additional credit cost is ~${Math.round(monthlyAnalysis[3].credits * 0.7 - monthlyAnalysis[2].credits * 0.7)} credits/user/mo at 70% util = ~$${((monthlyAnalysis[3].credits * 0.7 - monthlyAnalysis[2].credits * 0.7) * COST_PER_CREDIT).toFixed(2)}/user/mo more in platform costs — the $2 price increase covers it with margin to spare.`);
  para(`CREDIT CAPACITY: Hybrid uses ${monthlyAnalysis[3].credits} credits/user at 100% util (vs Explorer ${monthlyAnalysis[2].credits}). Builder (10k) supports ~${Math.floor(10000 / monthlyAnalysis[3].credits)} Hybrid users, Pro (20k) ~${Math.floor(20000 / monthlyAnalysis[3].credits)}, Elite (50k) ~${Math.floor(50000 / monthlyAnalysis[3].credits)}. The shift from Explorer to Hybrid roughly doubles per-user credit consumption — monitor the Base44 plan tier as Hybrid adoption grows.`);
  para(`CONVERSION: The Hybrid tier captures users who want a full Enhanced tour but find Investigator ($11.99) too expensive. It is the natural $2 upsell from Explorer — "finish your tour for $2 more." Expected conversion: ~15% of Explorer users, based on the value gap (can't finish 1 tour vs finishes 1.3 tours).`);
  para(`ANNUAL OPTION: Hybrid annual at $99.99/yr saves users ~17% vs monthly ($119.88). Same energy allotment (1000 narE/mo). Store fee applies to the annual charge. Developer cost is unchanged — users who pay annually are more likely to stay, improving lifetime value.`);
  para(`RISK: If most Explorer users upgrade to Hybrid, credit consumption roughly doubles for that segment. At the Mature scenario, total credits rise from ~${scenarios[3] ? (scenarios[3].totalCredits - scenarios[3].rewardedAdCredits).toLocaleString() : ''} to ${scenarios[3] ? scenarios[3].totalCredits.toLocaleString() : ''} (including ad-reward credits). This may push the required Base44 plan from Builder to Pro or Elite sooner. Monitor credit usage after launch and upgrade the Base44 plan before credits run out (actions fail when exhausted).`);

  // Footer
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
  if (y > 760) { doc.addPage(); y = 50; }
  doc.text('AGES — Accessible Ghost Exploration Solutions  |  Cost Analysis B (Hybrid Plan)  |  Confidential  |  ' + today, M, y + 20);

  doc.save('AGES-Cost-Analysis-B-Hybrid-Plan.pdf');
}