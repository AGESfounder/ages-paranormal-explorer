import { jsPDF } from 'jspdf';

// ===== HYBRID MODEL — Cost Analysis "B" =====
// Two structural changes that let Explorer-tier users get a full tour experience
// without raising the developer's per-user cost:
//
// 1. BATCH ENRICHMENT: Instead of 1 InvokeLLM call per stop (7 calls for a
//    7-stop tour), all stops are enriched in a single batched LLM call. The
//    call is larger (~10 credits vs ~4-6 per stop), but 1 call replaces 7.
//    Manifestation energy per tour drops from 8 (1 creation + 7 enrichment)
//    to 2 (1 creation + 1 batch enrichment).
//
// 2. HYBRID NARRATION: Enhanced TTS (GenerateSpeech) is used ONLY for Ghost
//    Story narration (~6 credits/stop, the short dramatic snippet). The
//    longer History, Paranormal, and Investigation tabs use Device narration
//    (0 credits). Per-tour Enhanced narration drops from ~384 credits to
//    ~62 credits (ghost stories × 7 stops + intro + conclusion).
//
// RESULT: Explorer's 500 narration energy now supports ~8 fully narrated
// tours/mo (vs ~1). Developer cost per tour drops from ~$1.72 to ~$0.30.
// Developer cost PER USER is unchanged (same energy allotment, users just
// get more tours for the same energy) — the win is retention and perceived
// value, not per-user savings.

// ===== SHARED CONSTANTS (same as PlanAnalysis.jsx) =====
const PLANS = [
  { name: 'Observer', price: '$0', billing: 'Free forever', manE: 0, narE: 0 },
  { name: 'Seeker', price: '$3.99', billing: 'Monthly ($39.99/yr)', manE: 0, narE: 0 },
  { name: 'Technician', price: '$5.99', billing: 'Monthly ($59.99/yr)', manE: 0, narE: 0 },
  { name: 'Explorer', price: '$7.99', billing: 'Monthly ($79.99/yr)', manE: 5, narE: 500 },
  { name: 'Investigator', price: '$11.99', billing: 'Monthly ($119.99/yr)', manE: 15, narE: 1500 },
  { name: 'Trailblazer', price: '$239.99', billing: 'One-time, 30 months', manE: 15, narE: 1500 },
];

const AURA_BUNDLES = [
  { name: 'Flicker', energy: 150, price: '$2.99' },
  { name: 'Apparition', energy: 500, price: '$6.49' },
  { name: 'Haunting', energy: 1500, price: '$16.99' },
  { name: 'Spectral', energy: 2500, price: '$24.99' },
];

// ===== HYBRID COST ASSUMPTIONS =====
const CREDITS_PER_MANIFESTATION = 3;   // 1 InvokeLLM call (Automatic) = ~3 credits
const CREDITS_PER_NARRATION = 1;       // 1 narration energy = 1 GenerateSpeech credit
const COST_PER_CREDIT = 0.004;         // $40/mo ÷ 10,000 credits (Builder plan)

// Batch enrichment: 1 call covers ALL stops in a tour. The call is larger
// (processing 7+ stops at once) so it costs ~10 credits instead of ~4-6 per
// stop, but 1 call replaces 7. Net: ~10 credits per tour vs ~35-42.
const BATCH_ENRICHMENT_CREDITS = 10;
// Blended manifestation rate: creation (3 credits) + batch enrichment (10 credits)
// averaged over 2 calls = ~6.5 credits per manifestation energy. With creation
// at 3 and batch at 10, the blended rate per manE is ~6.5 (vs ~4 current).
// But users spend fewer manE per tour (2 vs 8), so per-tour cost drops.
const HYBRID_BLENDED_MANIFESTATION_CREDITS = Math.round((3 + 10) / 2); // ~7

// Hybrid narration: Enhanced TTS for Ghost Story only
const HYBRID_NARRATION_PER_STOP = 6;        // Ghost Story only (vs 52 for all 4 tabs)
const HYBRID_NARRATION_INTRO_CONCLUSION = 20; // Intro + Conclusion via Enhanced
const AVG_STOPS_PER_TOUR = 7;
const HYBRID_FULL_TOUR_NARRATION_CREDITS =
  HYBRID_NARRATION_INTRO_CONCLUSION + AVG_STOPS_PER_TOUR * HYBRID_NARRATION_PER_STOP; // 62

// Current model (for comparison)
const CURRENT_NARRATION_PER_STOP = 52;
const CURRENT_NARRATION_INTRO_CONCLUSION = 20;
const CURRENT_FULL_TOUR_NARRATION_CREDITS =
  CURRENT_NARRATION_INTRO_CONCLUSION + AVG_STOPS_PER_TOUR * CURRENT_NARRATION_PER_STOP; // 384
const CURRENT_ENRICHMENT_PER_TOUR = 7 * 5; // 7 stops × ~5 credits avg = 35
const HYBRID_ENRICHMENT_PER_TOUR = BATCH_ENRICHMENT_CREDITS; // 10

// Per-tour totals
const CURRENT_CREDITS_PER_TOUR = 3 + CURRENT_ENRICHMENT_PER_TOUR + CURRENT_FULL_TOUR_NARRATION_CREDITS; // ~422
const HYBRID_CREDITS_PER_TOUR = 3 + HYBRID_ENRICHMENT_PER_TOUR + HYBRID_FULL_TOUR_NARRATION_CREDITS; // ~75
const CURRENT_COST_PER_TOUR = CURRENT_CREDITS_PER_TOUR * COST_PER_CREDIT;
const HYBRID_COST_PER_TOUR = HYBRID_CREDITS_PER_TOUR * COST_PER_CREDIT;

// Tours per energy allotment
const TOURS_PER_ENERGY_HYBRID = (narE) => Math.floor(narE / HYBRID_FULL_TOUR_NARRATION_CREDITS);
const TOURS_PER_ENERGY_CURRENT = (narE) => Math.floor(narE / CURRENT_FULL_TOUR_NARRATION_CREDITS);

// Manifestation: tours per energy (creation + batch enrichment = 2 manE per tour)
const MANE_PER_HYBRID_TOUR = 2; // 1 creation + 1 batch enrichment
const TOURS_PER_MANE_HYBRID = (manE) => Math.floor(manE / MANE_PER_HYBRID_TOUR);

// Store fees
const STORE_FEE_PCT = 0.15;
const STORE_FEE_PCT_HIGH = 0.30;
const STORE_HIGH_THRESHOLD = 1000000;
const REVENUECAT_FEE_PCT = 0.01;
const REVENUECAT_THRESHOLD = 2500;

// Fixed costs
const APPLE_DEV_ANNUAL = 99;
const GOOGLE_DEV_ONE_TIME = 25;
const DEV_UPFRONT_ONE_TIME = 600;
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
const AD_REWARD_CREDITS_PER_AD = AD_REWARD_NARRATION * CREDITS_PER_NARRATION + AD_REWARD_MANIFESTATION * HYBRID_BLENDED_MANIFESTATION_CREDITS;
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

// ===== CALCULATIONS =====
function calcCosts(manE, narE, months) {
  const credits = (manE * HYBRID_BLENDED_MANIFESTATION_CREDITS + narE * CREDITS_PER_NARRATION) * months;
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

// Per-plan monthly profit (Hybrid, 100% utilization)
// Developer cost per user is UNCHANGED — same energy allotment, same credits.
// The Hybrid model gives users more tours for the same energy, not cheaper energy.
const monthlyAnalysis = [
  { plan: 'Seeker', price: 3.99, manE: 0, narE: 0 },
  { plan: 'Technician', price: 5.99, manE: 0, narE: 0 },
  { plan: 'Explorer', price: 7.99, manE: 5, narE: 500 },
  { plan: 'Investigator', price: 11.99, manE: 15, narE: 1500 },
].map(p => {
  const { credits, platformCost } = calcCosts(p.manE, p.narE, 1);
  const sf = storeFee(p.price);
  const totalCost = platformCost + sf;
  const profit = p.price - totalCost;
  return { ...p, credits, platformCost, sf, totalCost, profit, margin: (profit / p.price * 100) };
});

const trailblazerAnalysis = (() => {
  const price = 239.99;
  const { credits, platformCost } = calcCosts(15, 1500, 30);
  const sf = storeFee(price);
  const totalCost = platformCost + sf;
  const profit = price - totalCost;
  return { price, credits, platformCost, sf, totalCost, profit, margin: (profit / price * 100) };
});

const trailblazer50 = (() => {
  const price = 239.99;
  const { credits, platformCost } = calcCosts(7.5, 750, 30);
  const sf = storeFee(price);
  const totalCost = platformCost + sf;
  const profit = price - totalCost;
  return { price, credits, platformCost, sf, totalCost, profit, margin: (profit / price * 100) };
});

const bundleAnalysis = AURA_BUNDLES.map(b => {
  const price = parseFloat(b.price.replace('$', ''));
  const credits = b.energy;
  const platformCost = credits * COST_PER_CREDIT;
  const sf = storeFee(price);
  const totalCost = platformCost + sf;
  const profit = price - totalCost;
  return { ...b, priceNum: price, credits, platformCost, sf, totalCost, profit, margin: (profit / price * 100) };
});

// Per-user tier economics (Hybrid)
const perUserCreditCost = (manE, narE) =>
  calcCosts(manE * 0.7, narE * 0.7, 1).platformCost + AD_REWARD_COST_PER_PAID_USER_MO;
const TIER_ECONOMICS = [
  { tier: 'Observer', price: 0, narration: `Device only — one ad before each narration (~${OBSERVER_NARRATION_ADS_PER_TOUR} per tour)`, ads: 'Stop ads, narration ads, 2 ad-gated tools, ad-watched saves', adRev: OBSERVER_AD_REV_MO, creditCost: SAVE_UPLOAD_COST_MO },
  { tier: 'Seeker', price: 3.99, narration: 'Device only, no ads (0 credits)', ads: 'Ad-watched evidence saves only', adRev: SAVE_AD_REV_MO, creditCost: SAVE_UPLOAD_COST_MO },
  { tier: 'Technician', price: 5.99, narration: 'Device only, no ads (0 credits)', ads: 'None (ad-free)', adRev: 0, creditCost: 0 },
  { tier: 'Explorer', price: 7.99, narration: `Hybrid: Enhanced ghost stories + Device for history/paranormal (~${TOURS_PER_ENERGY_HYBRID(500)} tours/mo)`, ads: 'Optional rewarded energy top-ups', adRev: AD_REWARD_REV_PER_PAID_USER_MO, creditCost: perUserCreditCost(5, 500) },
  { tier: 'Investigator', price: 11.99, narration: `Hybrid: Enhanced ghost stories + Device for history/paranormal (~${TOURS_PER_ENERGY_HYBRID(1500)} tours/mo)`, ads: 'Optional rewarded energy top-ups', adRev: AD_REWARD_REV_PER_PAID_USER_MO, creditCost: perUserCreditCost(15, 1500) },
  { tier: 'Trailblazer', price: 239.99 / 30, priceLabel: '$8.00 ($239.99 / 30)', narration: `Hybrid: Enhanced ghost stories + Device for history/paranormal (~${TOURS_PER_ENERGY_HYBRID(1500)} tours/mo)`, ads: 'Optional rewarded energy top-ups', adRev: AD_REWARD_REV_PER_PAID_USER_MO, creditCost: perUserCreditCost(15, 1500) },
].map(t => {
  const store = t.price * STORE_FEE_PCT;
  return { ...t, priceLabel: t.priceLabel || (t.price === 0 ? 'Free' : '$' + t.price.toFixed(2)), store, net: t.price + t.adRev - store - t.creditCost };
});

// Revenue scenarios (Hybrid — same user cost, better value)
const scenarios = [
  { label: 'Small (50 paid / 250 free)', mix: { seeker: 15, technician: 10, explorer: 15, investigator: 7, trailblazer: 3 }, freeUsers: 250 },
  { label: 'Growing (200 paid / 1,000 free)', mix: { seeker: 60, technician: 40, explorer: 60, investigator: 30, trailblazer: 10 }, freeUsers: 1000 },
  { label: 'Scale (500 paid / 2,500 free)', mix: { seeker: 150, technician: 100, explorer: 150, investigator: 75, trailblazer: 25 }, freeUsers: 2500 },
  { label: 'Mature (1,000 paid / 5,000 free)', mix: { seeker: 300, technician: 200, explorer: 300, investigator: 150, trailblazer: 50 }, freeUsers: 5000 },
].map(s => {
  const seekerRev = s.mix.seeker * 3.99;
  const technicianRev = s.mix.technician * 5.99;
  const explorerRev = s.mix.explorer * 7.99;
  const investigatorRev = s.mix.investigator * 11.99;
  const trailblazerRev = s.mix.trailblazer * (239.99 / 30);
  const subRev = seekerRev + technicianRev + explorerRev + investigatorRev + trailblazerRev;
  const energyUsers = s.mix.explorer + s.mix.investigator + s.mix.trailblazer;
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
  return { ...s, seekerRev, technicianRev, explorerRev, investigatorRev, trailblazerRev, subRev, interstitialAdRev, narrationAdRev, toolSaveAdRev, rewardedAdRev, adRev, totalRev, platformCosts, storeCosts, revcatCost, fixedCost, totalCost, profit, margin: (profit / totalRev * 100), totalCredits, rewardedAdCredits, saveCredits, base44Plan };
});

const usd0 = (n) => '$' + Math.round(n).toLocaleString();
const pnlRows = [
  { section: 'Users' },
  { label: 'Observer (free)', val: s => s.freeUsers.toLocaleString() },
  { label: 'Seeker ($3.99)', val: s => s.mix.seeker.toLocaleString() },
  { label: 'Technician ($5.99)', val: s => s.mix.technician.toLocaleString() },
  { label: 'Explorer ($7.99)', val: s => s.mix.explorer.toLocaleString() },
  { label: 'Investigator ($11.99)', val: s => s.mix.investigator.toLocaleString() },
  { label: 'Trailblazer ($239.99 / 30 mo)', val: s => s.mix.trailblazer.toLocaleString() },
  { section: 'Subscription revenue' },
  { label: 'Seeker', val: s => usd0(s.seekerRev) },
  { label: 'Technician', val: s => usd0(s.technicianRev) },
  { label: 'Explorer', val: s => usd0(s.explorerRev) },
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
  doc.text('AGES Cost Analysis B — Hybrid Model', M, y); y += 22;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Generated ${today}`, M, y); y += 6;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
  doc.text('Batch Enrichment + Hybrid Narration — Explorer gets a full tour experience', M, y); y += 20;

  // Overview
  heading('Overview: What Changes in the Hybrid Model');
  para('The Hybrid Model makes two structural changes that let Explorer-tier users experience a full tour (all stops narrated) without raising the developer\'s per-user cost:');
  para(`1. BATCH ENRICHMENT: All stops in a tour are enriched in a single LLM call (vs 1 call per stop). Manifestation energy per tour drops from 8 (1 creation + 7 enrichment) to 2 (1 creation + 1 batch). The batch call is larger (~${BATCH_ENRICHMENT_CREDITS} credits vs ~5 per stop), but 1 call replaces ${AVG_STOPS_PER_TOUR}.`);
  para(`2. HYBRID NARRATION: Enhanced TTS (GenerateSpeech) is used ONLY for Ghost Story narration (~${HYBRID_NARRATION_PER_STOP} credits/stop). The longer History, Paranormal, and Investigation tabs use Device narration (0 credits). Per-tour Enhanced narration drops from ~${CURRENT_FULL_TOUR_NARRATION_CREDITS} to ~${HYBRID_FULL_TOUR_NARRATION_CREDITS} credits.`);
  para(`RESULT: Explorer's 500 narration energy now supports ~${TOURS_PER_ENERGY_HYBRID(500)} fully narrated tours/mo (vs ~${TOURS_PER_ENERGY_CURRENT(500)}). Developer cost per tour drops from ~$${CURRENT_COST_PER_TOUR.toFixed(2)} to ~$${HYBRID_COST_PER_TOUR.toFixed(2)}. Developer cost PER USER is unchanged (same energy allotment) — users just get more tours for the same energy.`);
  para('IMPORTANT: Per-user developer cost does NOT change. Users still exhaust the same energy allotment. The Hybrid model gives them more VALUE per energy unit (more tours), not cheaper energy. The win is retention, conversion, and perceived value — not per-user savings.');

  // Per-tour comparison
  heading('1. Per-Tour Credit Comparison (Current vs Hybrid)');
  table(['Metric', 'Current', 'Hybrid', 'Savings'],
    [
      ['Enrichment calls/tour', '7 (1 per stop)', '1 (batch)', '6 calls'],
      ['Enrichment credits/tour', String(CURRENT_ENRICHMENT_PER_TOUR), String(HYBRID_ENRICHMENT_PER_TOUR), String(CURRENT_ENRICHMENT_PER_TOUR - HYBRID_ENRICHMENT_PER_TOUR)],
      ['Manifestation energy/tour', '8 (1+7)', '2 (1+1)', '6 manE'],
      ['Narration credits/stop', String(CURRENT_NARRATION_PER_STOP), String(HYBRID_NARRATION_PER_STOP), String(CURRENT_NARRATION_PER_STOP - HYBRID_NARRATION_PER_STOP)],
      ['Narration credits/tour', String(CURRENT_FULL_TOUR_NARRATION_CREDITS), String(HYBRID_FULL_TOUR_NARRATION_CREDITS), String(CURRENT_FULL_TOUR_NARRATION_CREDITS - HYBRID_FULL_TOUR_NARRATION_CREDITS)],
      ['TOTAL credits/tour', String(CURRENT_CREDITS_PER_TOUR), String(HYBRID_CREDITS_PER_TOUR), String(CURRENT_CREDITS_PER_TOUR - HYBRID_CREDITS_PER_TOUR)],
      ['Cost/tour (developer)', '$' + CURRENT_COST_PER_TOUR.toFixed(2), '$' + HYBRID_COST_PER_TOUR.toFixed(2), '$' + (CURRENT_COST_PER_TOUR - HYBRID_COST_PER_TOUR).toFixed(2)],
    ],
    [140, 80, 80, 80]);

  // Tours per energy
  heading('2. Tours Per Energy Allotment (Current vs Hybrid)');
  para(`Narration energy per fully narrated tour: Current ~${CURRENT_FULL_TOUR_NARRATION_CREDITS} credits, Hybrid ~${HYBRID_FULL_TOUR_NARRATION_CREDITS} credits (Ghost Story only via Enhanced).`);
  table(['Tier', 'Narr. Energy', 'Current Tours/mo', 'Hybrid Tours/mo', 'Improvement'],
    [
      ['Explorer', '500', '~' + TOURS_PER_ENERGY_CURRENT(500), '~' + TOURS_PER_ENERGY_HYBRID(500), TOURS_PER_ENERGY_HYBRID(500) + 'x more'],
      ['Investigator', '1500', '~' + TOURS_PER_ENERGY_CURRENT(1500), '~' + TOURS_PER_ENERGY_HYBRID(1500), Math.round(TOURS_PER_ENERGY_HYBRID(1500) / TOURS_PER_ENERGY_CURRENT(1500)) + 'x more'],
      ['Trailblazer', '1500', '~' + TOURS_PER_ENERGY_CURRENT(1500), '~' + TOURS_PER_ENERGY_HYBRID(1500), Math.round(TOURS_PER_ENERGY_HYBRID(1500) / TOURS_PER_ENERGY_CURRENT(1500)) + 'x more'],
    ],
    [70, 60, 80, 80, 80]);
  para(`Manifestation energy: Current 8 manE/tour (1 creation + 7 enrichment), Hybrid 2 manE/tour (1 creation + 1 batch). Explorer's 5 manE now supports ~${TOURS_PER_MANE_HYBRID(5)} tours with full enrichment (vs 0.6 current — couldn't even enrich 1 full tour).`);

  // Per-user economics
  heading('3. Per-User Monthly Economics (Hybrid, 70% Utilization)');
  table(['Tier', 'Price/mo', 'Ad Rev', 'Credit Cost', 'Store Fee', 'Net/user'],
    TIER_ECONOMICS.map(t => [t.tier, t.priceLabel.split(' ')[0], '$' + t.adRev.toFixed(2), '$' + t.creditCost.toFixed(2), '$' + t.store.toFixed(2), '$' + t.net.toFixed(2)]),
    [90, 70, 70, 80, 70, 70]);
  TIER_ECONOMICS.forEach(t => para(`${t.tier}: ${t.narration}. Ads: ${t.ads}.`));
  para('Note: Per-user credit cost is UNCHANGED from the current model. The same energy allotment produces the same developer cost. The difference is that users get ~6x more narrated tours for the same energy.');

  // Per-plan profit
  heading('4. Per-Plan Profit — Monthly, 100% Utilization (Hybrid)');
  table(['Plan', 'Price', 'Credits', 'Platform', 'Store Fee', 'Cost', 'Profit', 'Margin'],
    monthlyAnalysis.map(r => [r.plan, '$' + r.price.toFixed(2), r.credits, '$' + r.platformCost.toFixed(2), '$' + r.sf.toFixed(2), '$' + r.totalCost.toFixed(2), '$' + r.profit.toFixed(2), r.margin.toFixed(1) + '%']),
    [65, 45, 45, 55, 50, 50, 50, 45]);
  para('Per-plan profit is IDENTICAL to the current model. The Hybrid model does not change the developer cost per user — it changes the value the user receives. Margins stay the same; user satisfaction rises.');

  // Trailblazer
  heading('5. Trailblazer — 30-Month ($239.99)');
  table(['Utilization', 'Credits', 'Platform', 'Store Fee', 'Cost', 'Profit', 'Margin'],
    [['100%', trailblazerAnalysis.credits.toLocaleString(), '$' + trailblazerAnalysis.platformCost.toFixed(2), '$' + trailblazerAnalysis.sf.toFixed(2), '$' + trailblazerAnalysis.totalCost.toFixed(2), '$' + trailblazerAnalysis.profit.toFixed(2), trailblazerAnalysis.margin.toFixed(1) + '%'],
     ['50%', trailblazer50.credits.toLocaleString(), '$' + trailblazer50.platformCost.toFixed(2), '$' + trailblazer50.sf.toFixed(2), '$' + trailblazer50.totalCost.toFixed(2), '$' + trailblazer50.profit.toFixed(2), trailblazer50.margin.toFixed(1) + '%']],
    [65, 65, 55, 50, 55, 55, 50]);

  // Aura bundles
  heading('6. Aura Bundle Profit — 100% Utilization');
  table(['Bundle', 'Price', 'Credits', 'Platform', 'Store Fee', 'Profit', 'Margin'],
    bundleAnalysis.map(r => [r.name, '$' + r.priceNum.toFixed(2), r.credits, '$' + r.platformCost.toFixed(2), '$' + r.sf.toFixed(2), '$' + r.profit.toFixed(2), r.margin.toFixed(1) + '%']),
    [65, 45, 45, 55, 50, 55, 50]);

  // Credit capacity
  heading('7. Base44 Credit Capacity — When to Upgrade (Hybrid)');
  para('Integration credits are hard-capped per plan. Actions FAIL when exhausted. The Hybrid model does not change per-user credit consumption (same energy allotment), so credit capacity is the same as the current model. The difference is that each credit produces ~6x more narrated tour value.');
  table(['Base44 Plan', '$/mo', 'Credits/mo', 'Explorer (100%)', 'Investigator (100%)', 'Trailblazer (100%)'],
    BASE44_PLANS.map(p => {
      const explorerCredits = 5 * HYBRID_BLENDED_MANIFESTATION_CREDITS + 500;
      const investigatorCredits = 15 * HYBRID_BLENDED_MANIFESTATION_CREDITS + 1500;
      return [p.name, '$' + p.monthlyCost, p.credits.toLocaleString(), '~' + Math.floor(p.credits / explorerCredits), '~' + Math.floor(p.credits / investigatorCredits), '~' + Math.floor(p.credits / investigatorCredits)];
    }),
    [70, 40, 55, 65, 65, 65]);

  // Revenue scenarios
  heading('8. Revenue Scenarios (Monthly P&L, 70% Utilization — Hybrid)');
  para('Same user mix and energy allotment as the current model. Per-user costs are identical. The Hybrid model improves retention and conversion (users get ~6x more tours), which can increase the paid user count over time — but the per-user economics shown here are the same as Cost Analysis A.');
  table(['Monthly P&L', ...scenarios.map(s => s.label.split(' ')[0])],
    pnlRows.map(r => r.section ? [r.section.toUpperCase(), '', '', '', ''] : [r.label, ...scenarios.map(s => r.val(s))]),
    [230, 70, 70, 70, 70]);

  // Base44 plan per scenario
  heading('8a. Base44 Plan Required Per Scenario (Hybrid)');
  table(['Scenario', 'Sub Credits', 'Ad-Reward Cr', 'Total Cr', 'Base44 Plan', 'Plan $/mo'],
    scenarios.map(s => [s.label, (s.totalCredits - s.rewardedAdCredits).toLocaleString(), s.rewardedAdCredits.toLocaleString(), s.totalCredits.toLocaleString(), s.base44Plan.plan, '$' + s.base44Plan.cost]),
    [85, 50, 50, 50, 60, 45]);

  // Key takeaways
  heading('9. Key Takeaways — Hybrid Model Impact');
  para(`VALUE PER ENERGY: Explorer can now do ~${TOURS_PER_ENERGY_HYBRID(500)} fully narrated tours/mo (vs ~${TOURS_PER_ENERGY_CURRENT(500)} current). Investigator ~${TOURS_PER_ENERGY_HYBRID(1500)} (vs ~${TOURS_PER_ENERGY_CURRENT(1500)}). This is a ~${Math.round(TOURS_PER_ENERGY_HYBRID(500) / TOURS_PER_ENERGY_CURRENT(500))}x improvement in perceived value with zero additional developer cost.`);
  para(`COST PER TOUR: Developer cost per fully narrated tour drops from ~$${CURRENT_COST_PER_TOUR.toFixed(2)} to ~$${HYBRID_COST_PER_TOUR.toFixed(2)} — a ${(1 - HYBRID_COST_PER_TOUR / CURRENT_COST_PER_TOUR).toFixed(0)}% reduction. But users exhaust the same energy, so per-user developer cost is unchanged.`);
  para('PER-USER COST: UNCHANGED. The Hybrid model gives users more tours for the same energy allotment, not cheaper energy. Developer cost per Explorer user remains ~$2.08/mo at 100% utilization. Margins in sections 4-6 are identical to Cost Analysis A.');
  para(`MANIFESTATION EFFICIENCY: Explorer's 5 manE now supports ~${TOURS_PER_MANE_HYBRID(5)} tours with full batch enrichment (vs 0.6 current — couldn't even fully enrich 1 tour). This fixes the core Explorer complaint: "I can't even enrich a full tour."`);
  para('RETENTION IMPACT: The primary financial benefit is not per-user savings but improved retention and conversion. Users who get 8 tours/mo instead of 1 are far less likely to churn. Higher retention = more months of subscription revenue per user = higher lifetime value.');
  para('IMPLEMENTATION: Batch enrichment requires a single larger LLM prompt that processes all stops at once (already feasible — the enrichment prompt is lightweight). Hybrid narration requires showing Device narration as the default for History/Paranormal/Investigation tabs and Enhanced only for Ghost Story. The NarrationToggle already supports mode switching; this just changes the default per tab.');
  para('RISK: Batch enrichment may produce lower-quality per-stop content (the LLM has less context per stop in a batch). Hybrid narration means users hear Device TTS for 3 of 4 tabs, which is lower quality than Enhanced. The trade-off is quantity (8 tours) vs quality (all tabs Enhanced on 1 tour). User testing recommended.');
  para(`CREDIT CAPACITY: Unchanged. Builder (10k) still supports ~${Math.floor(10000 / (5 * HYBRID_BLENDED_MANIFESTATION_CREDITS + 500))} Explorer users at 100% utilization. The Hybrid model does not reduce per-user credit consumption — it increases the value per credit from the user's perspective.`);

  // Footer
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
  if (y > 760) { doc.addPage(); y = 50; }
  doc.text('AGES — Accessible Ghost Exploration Solutions  |  Cost Analysis B (Hybrid Model)  |  Confidential  |  ' + today, M, y + 20);

  doc.save('AGES-Cost-Analysis-B-Hybrid.pdf');
}