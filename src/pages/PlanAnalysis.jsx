import React from 'react';
import { Printer, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';

// ===== DATA (mirrors src/lib/plans.js + base44/shared/plans.js) =====
const PLANS = [
  { name: 'Observer', price: '$0', billing: 'Free forever', manE: 0, narE: 0,
    features: 'Browse all 50 states + international tours; view tour details, stops, maps, text; save favorites' },
  { name: 'Explorer', price: '$7.99', billing: 'Monthly ($79.99/yr)', manE: 5, narE: 500,
    features: 'AI narration (~1 fully narrated tour/mo, all tabs); custom tour generation (1-2/mo); ranked tours; nearby + abroad; evidence journal; community map; leaderboard; 8-tool toolkit; aura bundles' },
  { name: 'Investigator', price: '$11.99', billing: 'Monthly ($119.99/yr)', manE: 15, narE: 1500,
    features: 'Everything in Explorer; AI narration (~3 fully narrated tours/mo, all tabs); custom tours (up to 5/mo); full 12-tool toolkit; evidence dashboard analytics; aura bundles' },
  { name: 'Trailblazer', price: '$239.99', billing: 'One-time, 30 months (6 months free, max 300 slots)', manE: 15, narE: 1500,
    features: 'Everything in Investigator; AI narration (~3 fully narrated tours/mo, all tabs); custom tours (up to 5/mo); exclusive badge; early access; 30-mo price lock (6 months free); 20% off aura bundles' },
];

const AURA_BUNDLES = [
  { name: 'Flicker', energy: 150, price: '$2.99' },
  { name: 'Apparition', energy: 500, price: '$6.49' },
  { name: 'Haunting', energy: 1500, price: '$16.99' },
  { name: 'Spectral', energy: 2500, price: '$24.99' },
];

// ===== COST ASSUMPTIONS =====
const CREDITS_PER_MANIFESTATION = 3;   // 1 InvokeLLM call (Automatic model) = ~3 credits
const CREDITS_PER_NARRATION = 1;       // 1 narration energy = 1 GenerateSpeech credit
const COST_PER_CREDIT = 0.004;         // Builder plan: $40/mo ÷ 10,000 included credits

// Base44 plan tiers and their monthly integration credit allowances
const BASE44_PLANS = [
  { name: 'Builder', monthlyCost: 40, credits: 10000, costPerCredit: 40 / 10000 },
  { name: 'Pro', monthlyCost: 80, credits: 20000, costPerCredit: 80 / 20000 },
  { name: 'Elite', monthlyCost: 200, credits: 50000, costPerCredit: 200 / 50000 }, // estimated
];

// App Store / Google Play IAP fees (replaces Wix/Stripe for digital content)
const STORE_FEE_PCT = 0.15;            // Apple & Google: 15% for small devs (<$1M/yr)
const STORE_FEE_PCT_HIGH = 0.30;       // Apple: 30% if >$1M/yr; Google stays 15%
const STORE_HIGH_THRESHOLD = 1000000;

// RevenueCat (subscription management layer)
const REVENUECAT_FEE_PCT = 0.01;       // 1% of monthly sales above $2,500
const REVENUECAT_THRESHOLD = 2500;

// Fixed annual costs
const APPLE_DEV_ANNUAL = 99;
const GOOGLE_DEV_ONE_TIME = 25;
const DEV_UPFRONT_ONE_TIME = 250;        // private developer — one-time upfront
const DEV_PROFIT_SHARE_PCT = 0.025;      // private developer — 2.5% of annual profit
const BASE44_MONTHLY = 40;           // Base44 Builder plan subscription

// AdMob (interstitial ads for free users — stop 2+ paranormal history on each tour)
const ADMOB_ECPM = 15;                 // $15 per 1,000 interstitial impressions
const ADMOB_PER_IMPRESSION = ADMOB_ECPM / 1000;
const ADS_PER_TOUR = 7;                // stops 2-8 on avg 8-stop tour (stop 1 is free)
const TOURS_PER_FREE_USER_MO = 2;
const AD_REV_PER_FREE_USER_MO = ADS_PER_TOUR * TOURS_PER_FREE_USER_MO * ADMOB_PER_IMPRESSION;

// AdMob Rewarded ads (paid users earn 10 energy per ad, up to 5/day)
// Granted energy is consumed as credits — model both the ad revenue and the
// platform cost of the consumed energy. Net impact is usually a small cost
// per paid user, but it improves retention by preventing churn at energy gates.
const ADMOB_REWARDED_ECPM = 20;        // $20 per 1,000 rewarded impressions (higher engagement)
const ADMOB_REWARDED_PER_IMPRESSION = ADMOB_REWARDED_ECPM / 1000;
const ADS_PER_PAID_USER_MO = 5;        // realistic: users watch ~5 ads/mo when hitting energy gates
const AD_REWARD_ENERGY = 10;           // energy granted per ad (matches base44/shared/adRewards.js)
const AD_REWARD_NARRATION = 8;        // 80% narration
const AD_REWARD_MANIFESTATION = 2;    // 20% manifestation
const AD_REWARD_CREDITS_PER_AD = AD_REWARD_NARRATION * CREDITS_PER_NARRATION
  + AD_REWARD_MANIFESTATION * CREDITS_PER_MANIFESTATION; // 8 + 6 = 14 credits if fully consumed
const AD_REWARD_UTILIZATION = 0.7;    // % of granted energy actually consumed by the user
const AD_REWARD_REV_PER_PAID_USER_MO = ADS_PER_PAID_USER_MO * ADMOB_REWARDED_PER_IMPRESSION;
const AD_REWARD_COST_PER_PAID_USER_MO = ADS_PER_PAID_USER_MO * AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION * COST_PER_CREDIT;
const AD_REWARD_NET_PER_PAID_USER_MO = AD_REWARD_REV_PER_PAID_USER_MO - AD_REWARD_COST_PER_PAID_USER_MO;

// ===== FULL NARRATION COST PER TOUR =====
// Each stop has 4 independent narration buttons (GenerateSpeech @ 1 credit/50 chars):
//   Ghost Story (narration_text):  ~300 chars → ~6 credits
//   History tab (historical_info):  ~1,000 chars → ~20 credits
//   Paranormal tab (paranormal_info): ~1,000 chars → ~20 credits
//   Investigate tab (suggestions):  ~300 chars → ~6 credits
//   Per stop total: ~52 credits
// Tour intro: ~500 chars → ~10 credits; Tour conclusion: ~500 chars → ~10 credits
// Average tour (7 stops): 10 + 7×52 + 10 = 384 credits ≈ 400 credits
const NARRATION_PER_STOP = 52;
const NARRATION_INTRO_CONCLUSION = 20;
const AVG_STOPS_PER_TOUR = 7;
const FULL_TOUR_NARRATION_CREDITS = NARRATION_INTRO_CONCLUSION + AVG_STOPS_PER_TOUR * NARRATION_PER_STOP; // 384
const TOURS_PER_ENERGY = (narE) => Math.floor(narE / FULL_TOUR_NARRATION_CREDITS);

// ===== CREDIT CONSUMPTION AUDIT =====
// Every user action that consumes integration credits (InvokeLLM or GenerateSpeech).
// "Gated" = restricted by the energy system. Energy gating is deployed —
// free (Observer) users are blocked from all credit-consuming actions.
const CREDIT_AUDIT = [
  // --- Manifestation Energy (InvokeLLM) ---
  { action: 'Custom Tour Creation', page: 'Home → Custom Tour', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3–9', gated: 'Yes' },
  { action: 'Haunted Locations → Create Tour', page: 'Home → Haunted Explorations', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3–9', gated: 'Yes' },
  { action: 'Nearby → Create Tour (distance)', page: 'Nearby', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Nearby → Create Tour (zip)', page: 'Nearby', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Abroad Tour Creation', page: 'Abroad Tours → Create', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Auto Stop Generation (no stops)', page: 'Tour Detail (auto)', type: 'Manifest.', integration: 'InvokeLLM (automatic)', credits: '2–4', gated: 'Yes' },
  { action: 'Add Stops to Tour', page: 'Tour Card → Add Stops', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Stop Enrichment (thin content)', page: 'Stop Detail (auto, 1st view)', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3–6', gated: 'Yes' },
  { action: 'People Extraction (rich content)', page: 'Stop Detail (auto, 1st view)', type: 'Manifest.', integration: 'InvokeLLM (automatic)', credits: '2', gated: 'Yes' },
  { action: 'Haunted Locations Discovery', page: 'Home → Nearby/Zip search', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Term Sweeper → Build Terms (stop)', page: 'Toolkit → Term Sweeper', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash)', credits: '3', gated: 'Yes' },
  { action: 'Term Sweeper → Build Terms (geo)', page: 'Toolkit → Term Sweeper', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Weather → Get Location Weather', page: 'Toolkit → Weather Monitor', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Weather → Search by City', page: 'Toolkit → Weather Monitor', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  // --- Narration Energy (GenerateSpeech) ---
  { action: 'Narrate Tour Description', page: 'Tour Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '4–20', gated: 'Yes' },
  { action: 'Narrate Tour Introduction', page: 'Tour Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '10–40', gated: 'Yes' },
  { action: 'Narrate Tour Conclusion', page: 'Tour Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '8–32', gated: 'Yes' },
  { action: 'Narrate Stop Ghost Story', page: 'Stop Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '4–12', gated: 'Yes' },
  { action: 'Narrate Stop Paranormal Info', page: 'Stop Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '20–80', gated: 'Yes' },
  { action: 'Narrate Stop Historical Info', page: 'Stop Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '20–80', gated: 'Yes' },
  { action: 'Narrate Investigation Suggestions', page: 'Stop Detail', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '4–10', gated: 'Yes' },
  { action: 'Narrate Person Story', page: 'Stop Detail → Tap name', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '6–20', gated: 'Yes' },
  { action: 'Narrate Location Summary', page: 'Home → Haunted Explorations', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '4–20', gated: 'Yes' },
  { action: 'Narrate Equipment Guide', page: 'Toolkit → Equipment Guide', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '20–80', gated: 'Yes' },
  { action: 'Sweeper Trigger Voice (Alphabet)', page: 'Toolkit → Alphabet Sweeper', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '1 each', gated: 'Yes' },
  { action: 'Sweeper Trigger Voice (Term)', page: 'Toolkit → Term Sweeper', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '1 each', gated: 'Yes' },
  { action: 'Sweeper Trigger Voice (Yes/No)', page: 'Toolkit → Yes/No Sweeper', type: 'Narration', integration: 'GenerateSpeech (storm)', credits: '1 each', gated: 'Yes' },
];

// Worst-case monthly cost per active paid user (energy-limited)
const UNGATED_WORST_CASE = {
  manifestationCalls: 32, narrationCalls: 40, narrationAvgCredits: 20,
  totalCredits: 32 * 3 + 40 * 20, // 896
  monthlyCost: (32 * 3 + 40 * 20) * COST_PER_CREDIT,
};
// Typical monthly cost per active paid user (energy-limited)
const UNGATED_TYPICAL = {
  manifestationCalls: 10, narrationCalls: 10, narrationAvgCredits: 15,
  totalCredits: 10 * 3 + 10 * 15, // 180
  monthlyCost: (10 * 3 + 10 * 15) * COST_PER_CREDIT,
};

// Itemized per-action breakdown of credits saved by gating for a typical free (Observer) user.
// Every row is an action now gated by the energy system. "Auto" = fires without
// the user explicitly requesting it. "Fix" = the gating action that prevents the leak.
const FREE_USER_BREAKDOWN = [
  { action: 'Stop Enrichment (thin content)', trigger: 'Auto — fires on 1st stop view', freq: 7, creditsEach: 3, type: 'Manifest.', fix: 'Gate: require Explorer+ to trigger enrichment' },
  { action: 'People Extraction (rich content)', trigger: 'Auto — fires on 1st stop view', freq: 3, creditsEach: 2, type: 'Manifest.', fix: 'Gate: require Explorer+ to extract people' },
  { action: 'Custom Tour Creation', trigger: 'User taps Create Tour', freq: 1, creditsEach: 3, type: 'Manifest.', fix: 'Gate: require Explorer+ manifestation energy' },
  { action: 'Haunted Locations Discovery', trigger: 'User searches nearby/zip', freq: 2, creditsEach: 3, type: 'Manifest.', fix: 'Gate: require Explorer+ to search' },
  { action: 'Weather Check', trigger: 'User opens Weather Monitor', freq: 1, creditsEach: 3, type: 'Manifest.', fix: 'Gate: require Explorer+ for weather' },
  { action: 'Narrate Stop Ghost Story', trigger: 'User taps Narrate button', freq: 6, creditsEach: 6, type: 'Narration', fix: 'Gate: require Explorer+ narration energy' },
  { action: 'Narrate Stop Paranormal Info', trigger: 'User taps Narrate button', freq: 2, creditsEach: 20, type: 'Narration', fix: 'Gate: require Explorer+ narration energy' },
  { action: 'Narrate Stop Historical Info', trigger: 'User taps Narrate button', freq: 2, creditsEach: 20, type: 'Narration', fix: 'Gate: require Explorer+ narration energy' },
  { action: 'Narrate Tour Introduction', trigger: 'User taps Narrate button', freq: 2, creditsEach: 10, type: 'Narration', fix: 'Gate: require Explorer+ narration energy' },
  { action: 'Sweeper Trigger Voices', trigger: 'User triggers letter/term', freq: 5, creditsEach: 1, type: 'Narration', fix: 'Gate: require Explorer+ narration energy' },
].map(row => ({
  ...row,
  totalCredits: row.freq * row.creditsEach,
  monthlyCost: row.freq * row.creditsEach * COST_PER_CREDIT,
}));
const FREE_USER_BREAKDOWN_TOTAL = FREE_USER_BREAKDOWN.reduce((sum, r) => sum + r.totalCredits, 0);
const FREE_USER_BREAKDOWN_COST = FREE_USER_BREAKDOWN_TOTAL * COST_PER_CREDIT;

function calcCosts(manE, narE, months) {
  const credits = (manE * CREDITS_PER_MANIFESTATION + narE * CREDITS_PER_NARRATION) * months;
  const platformCost = credits * COST_PER_CREDIT;
  return { credits, platformCost };
}

function storeFee(price) {
  return price * STORE_FEE_PCT;
}

function revenuecatFee(monthlySales) {
  if (monthlySales <= REVENUECAT_THRESHOLD) return 0;
  return (monthlySales - REVENUECAT_THRESHOLD) * REVENUECAT_FEE_PCT;
}

// Per-plan monthly profit (1 month, 100% utilization)
const monthlyAnalysis = [
  { plan: 'Explorer', price: 7.99, manE: 5, narE: 500 },
  { plan: 'Investigator', price: 11.99, manE: 15, narE: 1500 },
].map(p => {
  const { credits, platformCost } = calcCosts(p.manE, p.narE, 1);
  const sf = storeFee(p.price);
  const totalCost = platformCost + sf;
  const profit = p.price - totalCost;
  return { ...p, credits, platformCost, sf, totalCost, profit, margin: (profit / p.price * 100) };
});

// Trailblazer (36 months, 100% utilization)
const trailblazerAnalysis = (() => {
  const price = 239.99;
  const { credits, platformCost } = calcCosts(15, 1500, 30);
  const sf = storeFee(price);
  const totalCost = platformCost + sf;
  const profit = price - totalCost;
  return { price, credits, platformCost, sf, totalCost, profit, margin: (profit / price * 100) };
})();

// Trailblazer at 50% utilization
const trailblazer50 = (() => {
  const price = 239.99;
  const { credits, platformCost } = calcCosts(7.5, 750, 30);
  const sf = storeFee(price);
  const totalCost = platformCost + sf;
  const profit = price - totalCost;
  return { price, credits, platformCost, sf, totalCost, profit, margin: (profit / price * 100) };
})();

// Aura bundle profit (100% utilization)
const bundleAnalysis = AURA_BUNDLES.map(b => {
  const price = parseFloat(b.price.replace('$', ''));
  const credits = b.energy;
  const platformCost = credits * COST_PER_CREDIT;
  const sf = storeFee(price);
  const totalCost = platformCost + sf;
  const profit = price - totalCost;
  return { ...b, priceNum: price, credits, platformCost, sf, totalCost, profit, margin: (profit / price * 100) };
});

// Fixed operating costs
// NOTE: Base44 Builder Plan ($40/mo) is NOT listed here as a fixed cost — it is already
// embedded in the per-credit platform cost ($0.004/credit = $40/mo ÷ 10,000 credits).
// Listing it separately would double-count the Base44 subscription fee.
const fixedCostsFirstYear = [
  { item: 'Apple Developer Program', cost: APPLE_DEV_ANNUAL, period: 'Annual' },
  { item: 'Google Play Developer', cost: GOOGLE_DEV_ONE_TIME, period: 'One-time' },
  { item: 'Private Developer (Upfront)', cost: DEV_UPFRONT_ONE_TIME, period: 'One-time' },
];
const fixedCostsOngoing = [
  { item: 'Apple Developer Program', cost: APPLE_DEV_ANNUAL, period: 'Annual' },
  { item: 'Private Developer (2.5% of profit)', cost: 'Variable', period: 'Annual — variable' },
];
const fixedFirstYearTotal = APPLE_DEV_ANNUAL + GOOGLE_DEV_ONE_TIME + DEV_UPFRONT_ONE_TIME;
const fixedOngoingAnnual = APPLE_DEV_ANNUAL; // only Apple dev is fixed; developer fee is 2.5% of profit (variable)
const fixedOngoingMonthly = fixedOngoingAnnual / 12;

// AdMob interstitial revenue projections at different free-user counts
const adMobScenarios = [
  { label: '250 free users', users: 250 },
  { label: '1,000 free users', users: 1000 },
  { label: '2,500 free users', users: 2500 },
  { label: '5,000 free users', users: 5000 },
].map(s => ({
  ...s,
  monthlyRev: s.users * AD_REV_PER_FREE_USER_MO,
  annualRev: s.users * AD_REV_PER_FREE_USER_MO * 12,
}));

// AdMob rewarded ad projections at different paid-user counts
// Each ad: $0.020 ad revenue, 10 energy granted (14 credits if fully consumed,
// ~9.8 at 70% utilization = $0.039 platform cost). Net = $0.020 - $0.039 = -$0.019/ad.
// The net cost is a retention investment — keeps users engaged at energy gates.
const rewardedAdScenarios = [
  { label: '50 paid users', users: 50 },
  { label: '200 paid users', users: 200 },
  { label: '500 paid users', users: 500 },
  { label: '1,000 paid users', users: 1000 },
].map(s => ({
  ...s,
  monthlyAdRev: s.users * AD_REWARD_REV_PER_PAID_USER_MO,
  monthlyEnergyCost: s.users * AD_REWARD_COST_PER_PAID_USER_MO,
  monthlyNet: s.users * AD_REWARD_NET_PER_PAID_USER_MO,
  monthlyCredits: Math.round(s.users * ADS_PER_PAID_USER_MO * AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION),
}));

// Revenue scenarios (monthly, 70% avg utilization, includes ad revenue + all costs)
const scenarios = [
  { label: 'Small (50 paid / 250 free)', mix: { explorer: 30, investigator: 15, trailblazer: 5 }, freeUsers: 250 },
  { label: 'Growing (200 paid / 1,000 free)', mix: { explorer: 130, investigator: 55, trailblazer: 15 }, freeUsers: 1000 },
  { label: 'Scale (500 paid / 2,500 free)', mix: { explorer: 330, investigator: 140, trailblazer: 30 }, freeUsers: 2500 },
  { label: 'Mature (1,000 paid / 5,000 free)', mix: { explorer: 680, investigator: 270, trailblazer: 50 }, freeUsers: 5000 },
].map(s => {
  const explorerRev = s.mix.explorer * 7.99;
  const investigatorRev = s.mix.investigator * 11.99;
  const trailblazerRev = s.mix.trailblazer * (239.99 / 30);
  const subRev = explorerRev + investigatorRev + trailblazerRev;
  const totalPaidUsers = s.mix.explorer + s.mix.investigator + s.mix.trailblazer;
  // Interstitial ad revenue (free users) + rewarded ad revenue (paid users)
  const interstitialAdRev = s.freeUsers * AD_REV_PER_FREE_USER_MO;
  const rewardedAdRev = totalPaidUsers * AD_REWARD_REV_PER_PAID_USER_MO;
  const adRev = interstitialAdRev + rewardedAdRev;
  const totalRev = subRev + adRev;
  // Credits from ad-reward energy consumed by paid users (added to plan-tier calc)
  const rewardedAdCredits = Math.round(totalPaidUsers * ADS_PER_PAID_USER_MO * AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION);
  // Total credits consumed by paid users at 70% utilization + ad-reward credits
  const totalCredits = Math.round(
    s.mix.explorer * calcCosts(5 * 0.7, 500 * 0.7, 1).credits
    + s.mix.investigator * calcCosts(15 * 0.7, 1500 * 0.7, 1).credits
    + s.mix.trailblazer * calcCosts(15 * 0.7, 1500 * 0.7, 1).credits
    + rewardedAdCredits
  );
  const base44Plan = requiredBase44Plan(totalCredits);
  // Platform cost = actual Base44 plan tier cost (fixed monthly, not per-credit)
  const platformCosts = base44Plan.cost;
  // Store fees (15% on IAP subscription revenue; ad revenue not subject to store fees)
  const storeCosts = subRev * STORE_FEE_PCT;
  // RevenueCat (1% above $2,500/month in subscription sales)
  const revcatCost = revenuecatFee(subRev);
  // Fixed costs (ongoing monthly)
  const fixedCost = fixedOngoingMonthly;
  const preDevCost = platformCosts + storeCosts + revcatCost + fixedCost;
  const preDevProfit = totalRev - preDevCost;
  const developerFee = Math.max(0, preDevProfit) * DEV_PROFIT_SHARE_PCT;
  const totalCost = preDevCost + developerFee;
  const profit = totalRev - totalCost;
  return { ...s, explorerRev, investigatorRev, trailblazerRev, subRev, interstitialAdRev, rewardedAdRev, adRev, totalRev, platformCosts, storeCosts, revcatCost, developerFee, fixedCost, totalCost, profit, margin: (profit / totalRev * 100), totalCredits, rewardedAdCredits, base44Plan };
});

// Determine which Base44 plan(s) are needed for a given monthly credit volume
function requiredBase44Plan(credits) {
  if (credits <= 10000) return { plan: 'Builder', plans: 1, cost: 40 };
  if (credits <= 20000) return { plan: 'Pro', plans: 1, cost: 80 };
  if (credits <= 50000) return { plan: 'Elite', plans: 1, cost: 200 };
  const eliteCount = Math.ceil(credits / 50000);
  return { plan: `${eliteCount}× Elite`, plans: eliteCount, cost: eliteCount * 200 };
}

const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

function downloadPDF() {
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

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('AGES Subscription Plan & Profit Analysis', M, y); y += 22;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Generated ${today}`, M, y); y += 20;

  heading('1. Subscription Tiers');
  table(['Plan', 'Price', 'Billing', 'Man. E', 'Narr. E'],
    PLANS.map(p => [p.name, p.price, p.billing, p.manE, p.narE]),
    [70, 50, 160, 60, 60]);

  heading('2. Aura Bundles');
  table(['Bundle', 'Energy', 'Price', '$/Energy'],
    AURA_BUNDLES.map(b => [b.name, b.energy, b.price, '$' + (parseFloat(b.price.replace('$', '')) / b.energy).toFixed(4)]),
    [80, 60, 50, 70]);

  heading('3. Cost Assumptions');
  para(`Manifestation Energy: 1 unit = 1 InvokeLLM call (Automatic) ~ ${CREDITS_PER_MANIFESTATION} integration credits`);
  para(`Narration Energy: 1 unit = 1 GenerateSpeech credit (1 credit / 50 chars)`);
  para(`Platform cost: $${COST_PER_CREDIT.toFixed(4)}/credit (Builder/Pro: $40-80/mo / 10k-20k credits)`);
  para(`App Store fee: ${(STORE_FEE_PCT * 100).toFixed(0)}% of IAP revenue (Apple & Google, small devs < $1M/yr). Apple jumps to ${(STORE_FEE_PCT_HIGH * 100).toFixed(0)}% above $${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr; Google stays 15%.`);
  para(`RevenueCat: ${(REVENUECAT_FEE_PCT * 100).toFixed(0)}% of monthly subscription sales above $${REVENUECAT_THRESHOLD.toLocaleString()}/mo`);
  para(`Apple Developer: $${APPLE_DEV_ANNUAL}/yr | Google Play Developer: $${GOOGLE_DEV_ONE_TIME} one-time | Private Developer: $${DEV_UPFRONT_ONE_TIME} upfront + ${(DEV_PROFIT_SHARE_PCT * 100).toFixed(1)}% of annual profit`);
  para(`Base44 plan costs are shown as actual fixed monthly tier costs in section 9 (Builder $40/mo, Pro $80/mo, Elite $200/mo), determined by total credits consumed. The per-credit rate ($${COST_PER_CREDIT.toFixed(4)}/credit) is used only for per-plan and per-bundle profit analysis in sections 4-6.`);
  para(`AdMob Interstitial: $${ADMOB_ECPM}/1k impressions (eCPM). Free users see ads on stops 2+ (~${ADS_PER_TOUR} ads/tour, ~${TOURS_PER_FREE_USER_MO} tours/mo = $${AD_REV_PER_FREE_USER_MO.toFixed(3)}/free user/mo)`);
  para(`AdMob Rewarded: $${ADMOB_REWARDED_ECPM}/1k impressions. Paid users watch ~${ADS_PER_PAID_USER_MO} ads/mo for +${AD_REWARD_ENERGY} energy each. Ad rev: $${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(3)}/paid user/mo. Energy cost: ${AD_REWARD_CREDITS_PER_AD} credits/ad × ${Math.round(AD_REWARD_UTILIZATION * 100)}% utilization × $${COST_PER_CREDIT.toFixed(4)} = $${AD_REWARD_COST_PER_PAID_USER_MO.toFixed(3)}/paid user/mo. Net: $${AD_REWARD_NET_PER_PAID_USER_MO.toFixed(3)}/paid user/mo (retention investment, not profit).`);
  para('Credits charged per action at runtime. 100% utilization = worst case; 50-70% = realistic average.');

  heading('3a. Base44 Credit Capacity — When to Upgrade');
  para('Integration credits are hard-capped per plan. Actions FAIL when exhausted — no pay-per-credit overflow.');
  para('Builder ($40/mo, 10k credits): ~19 Explorer, ~6 Investigator, ~6 Trailblazer users at 100% utilization');
  para('Pro ($80/mo, 20k credits): ~38 Explorer, ~12 Investigator, ~12 Trailblazer users at 100% utilization');
  para('At 50% realistic utilization: Builder supports ~38 Explorer, ~12 Investigator, ~12 Trailblazer');
  para('Free (Observer) users are gated — they consume 0 credits. Only paid-user credits determine the required plan tier.');
  para('Upgrade Builder→Pro at ~19 active Explorer users; Pro→Elite at ~38');

  heading('3b. Full Narration Cost Per Tour (All Tabs)');
  para(`Per stop: Ghost Story ~6 credits + History ~20 + Paranormal ~20 + Investigate ~6 = ${NARRATION_PER_STOP} credits/stop`);
  para(`Tour intro ~10 + conclusion ~10. Average tour (${AVG_STOPS_PER_TOUR} stops): ${FULL_TOUR_NARRATION_CREDITS} credits = $${(FULL_TOUR_NARRATION_CREDITS * COST_PER_CREDIT).toFixed(2)}/tour`);
  para(`Explorer: ${TOURS_PER_ENERGY(500)} tours/mo | Investigator: ${TOURS_PER_ENERGY(1500)} tours/mo | Trailblazer: ${TOURS_PER_ENERGY(1500)} tours/mo`);
  para(`Ghost-story-only narration (1 tab/stop) costs ~${NARRATION_PER_STOP} credits/stop vs ~${NARRATION_PER_STOP * 4} for all tabs — stretching energy ~4x further.`);

  heading('3b. Credit Consumption Audit');
  para('Energy gating is now implemented. All 27 credit-consuming actions are gated — free (Observer) users are blocked from consuming credits, and paid users are limited by their energy allotment.');
  para(`Typical cost per active paid user (energy-limited): ${UNGATED_TYPICAL.totalCredits} credits = $${UNGATED_TYPICAL.monthlyCost.toFixed(2)}/mo`);
  para(`Heavy cost per active paid user: ${UNGATED_WORST_CASE.totalCredits} credits = $${UNGATED_WORST_CASE.monthlyCost.toFixed(2)}/mo`);
  para(`Free (Observer) users are gated — 0 credits consumed. Only paid users consume credits, limited by their energy allotment.`);
  table(['Action', 'Page', 'Type', 'Integration', 'Credits', 'Gated'],
    CREDIT_AUDIT.map(a => [a.action, a.page, a.type, a.integration, a.credits, a.gated]),
    [120, 100, 50, 120, 50, 40]);

  heading('3d. Per-Action Breakdown — Credits Now Saved by Gating');
  para(`Itemized monthly credits saved by gating for a typical free (Observer) user. Total saved: ${FREE_USER_BREAKDOWN_TOTAL} credits = $${FREE_USER_BREAKDOWN_COST.toFixed(2)}/mo per free user.`);
  table(['Action', 'Trigger', 'Freq/mo', 'Cr Each', 'Total Cr', 'Cost/mo', 'Fix (Gate With)'],
    [...FREE_USER_BREAKDOWN.map(r => [r.action, r.trigger, r.freq, r.creditsEach, r.totalCredits, '$' + r.monthlyCost.toFixed(2), r.fix]),
     ['TOTAL per free user/mo', '', '', '', FREE_USER_BREAKDOWN_TOTAL, '$' + FREE_USER_BREAKDOWN_COST.toFixed(2), '']],
    [110, 100, 35, 35, 45, 45, 110]);
  para(`At 1,000 free users: $${(1000 * FREE_USER_BREAKDOWN_COST).toFixed(0)}/mo saved. At 5,000: $${(5000 * FREE_USER_BREAKDOWN_COST).toFixed(0)}/mo saved.`);
  const autoLeak = FREE_USER_BREAKDOWN.filter(r => r.trigger.startsWith('Auto'));
  para(`Two "Auto" actions (Stop Enrichment + People Extraction) previously fired without user action — ${autoLeak.reduce((s, r) => s + r.totalCredits, 0)} of ${FREE_USER_BREAKDOWN_TOTAL} credits (${Math.round(autoLeak.reduce((s, r) => s + r.totalCredits, 0) / FREE_USER_BREAKDOWN_TOTAL * 100)}%) per free user. These are now gated — free users silently skip enrichment.`);

  heading('4. Per-Plan Profit - Monthly, 100% Utilization');
  table(['Plan', 'Price', 'Credits', 'Platform', 'Store Fee', 'Cost', 'Profit', 'Margin'],
    monthlyAnalysis.map(r => [r.plan, '$' + r.price.toFixed(2), r.credits, '$' + r.platformCost.toFixed(2), '$' + r.sf.toFixed(2), '$' + r.totalCost.toFixed(2), '$' + r.profit.toFixed(2), r.margin.toFixed(1) + '%']),
    [65, 45, 45, 55, 50, 50, 50, 45]);

  heading('5. Trailblazer - 30-Month ($239.99)');
  table(['Utilization', 'Credits', 'Platform', 'Store Fee', 'Cost', 'Profit', 'Margin'],
    [['100%', trailblazerAnalysis.credits.toLocaleString(), '$' + trailblazerAnalysis.platformCost.toFixed(2), '$' + trailblazerAnalysis.sf.toFixed(2), '$' + trailblazerAnalysis.totalCost.toFixed(2), '$' + trailblazerAnalysis.profit.toFixed(2), trailblazerAnalysis.margin.toFixed(1) + '%'],
     ['50%', trailblazer50.credits.toLocaleString(), '$' + trailblazer50.platformCost.toFixed(2), '$' + trailblazer50.sf.toFixed(2), '$' + trailblazer50.totalCost.toFixed(2), '$' + trailblazer50.profit.toFixed(2), trailblazer50.margin.toFixed(1) + '%']],
    [65, 65, 55, 50, 55, 55, 50]);

  heading('6. Aura Bundle Profit - 100% Utilization');
  table(['Bundle', 'Price', 'Credits', 'Platform', 'Store Fee', 'Profit', 'Margin'],
    bundleAnalysis.map(r => [r.name, '$' + r.priceNum.toFixed(2), r.credits, '$' + r.platformCost.toFixed(2), '$' + r.sf.toFixed(2), '$' + r.profit.toFixed(2), r.margin.toFixed(1) + '%']),
    [65, 45, 45, 55, 50, 55, 50]);

  heading('7. Fixed Operating Costs');
  table(['Item', 'Cost', 'Period'],
    [...fixedCostsFirstYear.map(c => [c.item, '$' + c.cost, c.period]),
     ['First-Year Total', '$' + fixedFirstYearTotal, ''],
     ['---', '', ''],
     ...fixedCostsOngoing.map(c => [c.item, typeof c.cost === 'string' ? c.cost : '$' + c.cost, c.period]),
     ['Ongoing Annual Total', '$' + fixedOngoingAnnual, '$' + fixedOngoingMonthly.toFixed(2) + '/mo']],
    [160, 60, 120]);

  heading('8a. AdMob Interstitial Ad Revenue (Free Users)');
  table(['Free Users', 'Monthly Rev', 'Annual Rev'],
    adMobScenarios.map(s => [s.label, '$' + s.monthlyRev.toFixed(2), '$' + s.annualRev.toFixed(2)]),
    [120, 80, 80]);
  para(`Model: ${ADS_PER_TOUR} ads/tour x ${TOURS_PER_FREE_USER_MO} tours/mo x $${ADMOB_PER_IMPRESSION.toFixed(3)}/impression = $${AD_REV_PER_FREE_USER_MO.toFixed(3)}/free user/mo. Stop 1 paranormal history is free; stops 2+ show interstitial ads.`);

  heading('8b. AdMob Rewarded Ad Revenue (Paid Users — Energy Top-Ups)');
  table(['Paid Users', 'Ad Rev/mo', 'Energy Cost/mo', 'Net/mo', 'Credits/mo'],
    rewardedAdScenarios.map(s => [s.label, '$' + s.monthlyAdRev.toFixed(2), '$' + s.monthlyEnergyCost.toFixed(2), '$' + s.monthlyNet.toFixed(2), s.monthlyCredits.toLocaleString()]),
    [90, 70, 70, 60, 60]);
  para(`Model: ${ADS_PER_PAID_USER_MO} ads/paid user/mo x $${ADMOB_REWARDED_PER_IMPRESSION.toFixed(3)}/impression = $${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(3)} ad rev. Energy cost: ${ADS_PER_PAID_USER_MO} x ${AD_REWARD_CREDITS_PER_AD} credits x ${Math.round(AD_REWARD_UTILIZATION * 100)}% utilization x $${COST_PER_CREDIT.toFixed(4)}/credit = $${AD_REWARD_COST_PER_PAID_USER_MO.toFixed(3)}/paid user/mo. Net is a retention investment — ad-reward credits are included in the Base44 plan-tier calculation in section 9a.`);

  heading('9. Revenue Scenarios (Monthly, 70% Utilization)');
  table(['Scenario', 'Sub Rev', 'Interstitial', 'Rewarded', 'Total Rev', 'B44 Plan', 'Store', 'RevCat', 'Dev 2.5%', 'Fixed', 'Total Cost', 'Profit', 'Margin'],
    scenarios.map(s => [s.label, '$' + s.subRev.toFixed(0), '$' + s.interstitialAdRev.toFixed(0), '$' + s.rewardedAdRev.toFixed(0), '$' + s.totalRev.toFixed(0), '$' + s.platformCosts, '$' + s.storeCosts.toFixed(0), '$' + s.revcatCost.toFixed(0), '$' + s.developerFee.toFixed(0), '$' + s.fixedCost.toFixed(0), '$' + s.totalCost.toFixed(0), '$' + s.profit.toFixed(0), s.margin.toFixed(1) + '%']),
    [70, 30, 30, 30, 35, 30, 25, 25, 30, 25, 30, 30, 25]);

  heading('9a. Base44 Plan Required Per Scenario');
  para('Total monthly integration credits consumed by paid users (70% utilization) plus credits from consumed ad-reward energy, and the minimum Base44 plan needed to support them. Free (Observer) users are gated and consume 0 credits.');
  table(['Scenario', 'Paid Credits', 'Ad-Reward Cr', 'Base44 Plan', 'Plan $/mo'],
    scenarios.map(s => [s.label, (s.totalCredits - s.rewardedAdCredits).toLocaleString(), s.rewardedAdCredits.toLocaleString(), s.base44Plan.plan, '$' + s.base44Plan.cost]),
    [85, 50, 50, 60, 45]);
  para('Base44 plan costs in section 9 ("B44 Plan" column) are the actual fixed monthly plan tier costs. Ad-reward credits (from paid users watching rewarded ads for energy top-ups) are included in the total and can push the required plan tier higher. Free (Observer) users are gated and consume 0 credits.');

  heading('10. Key Takeaways');
  para('CREDIT CAPACITY: Builder plan (10k credits) supports only ~19 Explorer / ~6 Investigator / ~6 Trailblazer users at 100% utilization. Pro (20k) doubles that. Free (Observer) users are gated (0 credits). Must upgrade plans to scale.');
  para('Store fees (15%) are the largest non-platform cost — significantly higher than traditional payment processing (2.9% + $0.30).');
  para(`Full narration cost: ~${FULL_TOUR_NARRATION_CREDITS} credits/tour = $${(FULL_TOUR_NARRATION_CREDITS * COST_PER_CREDIT).toFixed(2)}/tour. Explorer ~${TOURS_PER_ENERGY(500)} tour/mo, Investigator ~${TOURS_PER_ENERGY(1500)} tours/mo, Trailblazer ~${TOURS_PER_ENERGY(1500)} tours/mo.`);
  para(`Explorer yields ~${monthlyAnalysis[0].margin.toFixed(0)}% margin at full utilization; Investigator ~${monthlyAnalysis[1].margin.toFixed(0)}%. Both healthier when energy goes unused.`);
  para(`Trailblazer is profitable at 100% utilization (~${trailblazerAnalysis.margin.toFixed(0)}% margin = $${trailblazerAnalysis.profit.toFixed(0)} profit over 30 months). At 50% realistic usage, margin improves to ~${trailblazer50.margin.toFixed(0)}%. The 300-slot cap protects against credit cost exposure.`);
  para('AdMob interstitial revenue from free users meaningfully supplements subscription income — 5,000 free users generate ~$' + (5000 * AD_REV_PER_FREE_USER_MO).toFixed(0) + '/mo, offsetting platform and store costs.');
  para(`Rewarded ads (paid users) generate ~$${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in ad revenue, but granted energy costs ~$${AD_REWARD_COST_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in platform credits when consumed (net ~$${AD_REWARD_NET_PER_PAID_USER_MO.toFixed(2)}/paid user/mo). This is a retention investment, not a profit center — it keeps paid users engaged at energy gates. Ad-reward credits are included in the Base44 plan-tier calculation (section 9a).`);
  para('Fixed costs (~$' + fixedOngoingMonthly.toFixed(0) + '/mo ongoing + 2.5% of profit to private developer) are negligible at scale but matter for small operations. First-year total: $' + fixedFirstYearTotal + ' (includes $250 developer upfront). Base44 plan costs are now shown as actual tier costs in section 9, not per-credit estimates.');
  para('RevenueCat 1% above $2,500/mo is minimal vs. store fees — only ~$' + revenuecatFee(7104).toFixed(0) + '/mo at the Mature scenario.');
  para('RISK: Apple fee jumps to 30% above $1M/yr revenue. At that rate, Trailblazer becomes a small loss at 100% utilization (~-7% margin) but remains profitable at 50% realistic usage (~31% margin). Revisit pricing before crossing $1M.');
  para('Annual plans improve cash flow and reduce per-transaction store fee burden (one charge vs. twelve).');

  doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
  if (y > 760) { doc.addPage(); y = 50; }
  doc.text('AGES - Accessible Ghost Exploration Solutions  |  Confidential  |  ' + today, M, y + 20);

  doc.save('AGES-Plan-Analysis.pdf');
}

const th = 'text-left py-2 px-3 font-heading uppercase text-[11px] tracking-wider text-muted-foreground border-b border-border';
const td = 'py-2 px-3 text-sm border-b border-border/50';
const num = 'text-right tabular-nums';

export default function PlanAnalysis() {
  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10 print:p-0">
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .print-block { box-shadow: none !important; border-color: #ccc !important; }
          .print-text { color: black !important; }
          .print-muted { color: #555 !important; }
          table { page-break-inside: avoid; }
          h1, h2, h3 { color: black !important; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 no-print">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">AGES Subscription Plan &amp; Profit Analysis</h1>
            <p className="text-sm text-muted-foreground mt-1">Generated {today}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={downloadPDF}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors min-h-[44px]"
            >
              <Download className="w-4 h-4" /> Download PDF
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-heading text-sm uppercase tracking-wider hover:bg-card/60 transition-colors min-h-[44px]"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>
        <div className="hidden print:block mb-6">
          <h1 className="font-heading text-2xl font-bold print-text">AGES Subscription Plan &amp; Profit Analysis</h1>
          <p className="text-sm print-muted mt-1">Generated {today}</p>
        </div>

        {/* 1. Subscription Plans */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">1. Subscription Tiers</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Plan</th>
                  <th className={th}>Price</th>
                  <th className={th}>Billing</th>
                  <th className={`${th} ${num}`}>Manifestation Energy</th>
                  <th className={`${th} ${num}`}>Narration Energy</th>
                </tr>
              </thead>
              <tbody>
                {PLANS.map(p => (
                  <tr key={p.name}>
                    <td className={`${td} font-semibold print-text`}>{p.name}</td>
                    <td className={`${td} print-text`}>{p.price}</td>
                    <td className={`${td} print-muted`}>{p.billing}</td>
                    <td className={`${td} ${num} print-text`}>{p.manE}</td>
                    <td className={`${td} ${num} print-text`}>{p.narE}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 space-y-1">
            {PLANS.map(p => (
              <p key={p.name} className="text-xs print-muted"><span className="font-semibold print-text">{p.name}:</span> {p.features}</p>
            ))}
          </div>
        </section>

        {/* 2. Aura Bundles */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">2. Aura Bundles (One-Time Energy Top-Ups)</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Bundle</th>
                  <th className={`${th} ${num}`}>Energy</th>
                  <th className={`${th} ${num}`}>Price</th>
                  <th className={`${th} ${num}`}>$ / Energy</th>
                </tr>
              </thead>
              <tbody>
                {AURA_BUNDLES.map(b => (
                  <tr key={b.name}>
                    <td className={`${td} font-semibold print-text`}>{b.name}</td>
                    <td className={`${td} ${num} print-text`}>{b.energy}</td>
                    <td className={`${td} ${num} print-text`}>{b.price}</td>
                    <td className={`${td} ${num} print-muted`}>${(parseFloat(b.price.replace('$','')) / b.energy).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3. Cost Assumptions */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3. Cost Assumptions</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block p-4 space-y-2 text-sm">
            <p className="print-text"><span className="font-semibold">Manifestation Energy:</span> 1 unit = 1 InvokeLLM call (Automatic model) ≈ {CREDITS_PER_MANIFESTATION} integration credits</p>
            <p className="print-text"><span className="font-semibold">Narration Energy:</span> 1 unit = 1 GenerateSpeech credit (1 credit / 50 chars of audio)</p>
            <p className="print-text"><span className="font-semibold">Platform cost:</span> ${COST_PER_CREDIT.toFixed(4)}/credit (Builder plan: $40/mo, 10,000 included credits). Pro: $80/mo, 20,000 credits. Elite: custom. Credits are hard-capped — actions FAIL when exhausted, not pay-per-use.</p>
            <p className="print-text"><span className="font-semibold">App Store / Google Play fee:</span> {(STORE_FEE_PCT * 100).toFixed(0)}% of IAP revenue (both stores, small devs &lt; $1M/yr). Apple jumps to {(STORE_FEE_PCT_HIGH * 100).toFixed(0)}% above ${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr; Google stays 15%.</p>
            <p className="print-text"><span className="font-semibold">RevenueCat:</span> {(REVENUECAT_FEE_PCT * 100).toFixed(0)}% of monthly subscription sales above ${REVENUECAT_THRESHOLD.toLocaleString()}/mo</p>
            <p className="print-text"><span className="font-semibold">Fixed costs:</span> Apple Developer ${APPLE_DEV_ANNUAL}/yr · Google Play ${GOOGLE_DEV_ONE_TIME} one-time · Private Developer ${DEV_UPFRONT_ONE_TIME} upfront + ${(DEV_PROFIT_SHARE_PCT * 100).toFixed(1)}% of annual profit</p>
            <p className="print-text text-xs italic"><span className="font-semibold">Note:</span> Base44 plan costs are shown as actual fixed monthly tier costs in section 9 (e.g. Builder $40/mo, Pro $80/mo, Elite $200/mo), determined by the total credits consumed. The per-credit rate (${COST_PER_CREDIT.toFixed(4)}/credit) is used only for per-plan and per-bundle profit analysis in sections 4–6.</p>
            <p className="print-text"><span className="font-semibold">AdMob:</span> ${ADMOB_ECPM}/1k interstitial impressions (eCPM). Free users see ads on stops 2+ (~{ADS_PER_TOUR} ads/tour × {TOURS_PER_FREE_USER_MO} tours/mo = ${AD_REV_PER_FREE_USER_MO.toFixed(3)}/free user/mo)</p>
            <p className="print-muted text-xs italic">Note: Credits are charged per action at runtime. Users who don't exhaust their monthly energy allotment cost less. Analysis shows 100% utilization (worst case) and 50–70% (realistic average).</p>
            <p className="print-text text-xs font-semibold text-green-500 mt-2">✓ Energy gating is now implemented. All actions below are gated — free (Observer) users are blocked, and paid users are limited by their monthly energy allotment. Costs shown reflect gated usage.</p>
          </div>
        </section>

        {/* 3a. Base44 Credit Capacity — When to Upgrade */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3a. Base44 Credit Capacity — When to Upgrade</h2>
          <p className="text-xs print-muted mb-3">Integration credits are hard-capped per plan tier. When exhausted, all AI actions (narration, tour generation, enrichment) FAIL with an error until the next monthly reset. You must upgrade plans to support more users — there is no pay-per-credit overflow.</p>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className={th}>Base44 Plan</th>
                  <th className={`${th} ${num}`}>$/mo</th>
                  <th className={`${th} ${num}`}>Credits/mo</th>
                  <th className={`${th} ${num}`}>$/credit</th>
                  <th className={`${th} ${num}`}>Explorer users (100%)</th>
                  <th className={`${th} ${num}`}>Investigator users (100%)</th>
                  <th className={`${th} ${num}`}>Trailblazer users (100%)</th>
                </tr>
              </thead>
              <tbody>
                {BASE44_PLANS.map(p => {
                  const explorerCredits = 5 * 3 + 500; // 515
                  const investigatorCredits = 15 * 3 + 1500; // 1545
                  const trailblazerCredits = 15 * 3 + 1500; // 1545 (same as Investigator)
                  return (
                    <tr key={p.name}>
                      <td className={`${td} font-semibold print-text`}>{p.name}</td>
                      <td className={`${td} ${num} print-text`}>${p.monthlyCost}</td>
                      <td className={`${td} ${num} print-text`}>{p.credits.toLocaleString()}</td>
                      <td className={`${td} ${num} print-muted`}>${p.costPerCredit.toFixed(4)}</td>
                      <td className={`${td} ${num} print-text`}>~{Math.floor(p.credits / explorerCredits)}</td>
                      <td className={`${td} ${num} print-text`}>~{Math.floor(p.credits / investigatorCredits)}</td>
                      <td className={`${td} ${num} print-text`}>~{Math.floor(p.credits / trailblazerCredits)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-card/40 border border-border/40">
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">At 50% Realistic Utilization</p>
              <p className="text-sm print-text mt-1">Builder (10k credits) supports: ~{Math.floor(10000 / (515 * 0.5))} Explorer, ~{Math.floor(10000 / (1545 * 0.5))} Investigator, ~{Math.floor(10000 / (1545 * 0.5))} Trailblazer users</p>
              <p className="text-sm print-text">Pro (20k credits) supports: ~{Math.floor(20000 / (515 * 0.5))} Explorer, ~{Math.floor(20000 / (1545 * 0.5))} Investigator, ~{Math.floor(20000 / (1545 * 0.5))} Trailblazer users</p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/30">
              <p className="text-[10px] font-heading uppercase tracking-wider text-green-500">Upgrade Triggers (100% Util)</p>
              <p className="text-sm print-text mt-1"><span className="font-semibold">Builder → Pro:</span> At ~19 Explorer, ~6 Investigator, or ~6 Trailblazer active users</p>
              <p className="text-sm print-text"><span className="font-semibold">Pro → Elite:</span> At ~38 Explorer, ~12 Investigator, or ~12 Trailblazer active users</p>
              <p className="text-xs text-green-500 print-text mt-1">✓ Free (Observer) users are gated — 0 credits consumed. Only paid-user credits determine the required plan tier.</p>
            </div>
          </div>
          <p className="text-xs print-muted mt-2 italic">Credits reset monthly with no carryover. The $/credit decreases at higher tiers (Builder $0.004 → Pro $0.004 → Elite ~$0.004), so upgrading is about capacity, not per-unit savings. Elite pricing is estimated — check base44.com/pricing for current rates. Free (Observer) users are gated and consume 0 credits.</p>
        </section>

        {/* 3b. Full Narration Cost Per Tour */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3a. Full Narration Cost Per Tour (All Tabs)</h2>
          <p className="text-xs print-muted mb-3">Each tour stop has 4 independent narration buttons (GenerateSpeech @ 1 credit / 50 chars). A "fully narrated tour" = narrating every tab at every stop + intro + conclusion.</p>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Narration Component</th>
                  <th className={`${th} ${num}`}>Typical Chars</th>
                  <th className={`${th} ${num}`}>Credits</th>
                  <th className={th}>Per</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className={`${td} print-text`}>Ghost Story (narration_text)</td><td className={`${td} ${num} print-text`}>~300</td><td className={`${td} ${num} print-text`}>~6</td><td className={`${td} print-muted`}>stop</td></tr>
                <tr><td className={`${td} print-text`}>History tab (historical_info)</td><td className={`${td} ${num} print-text`}>~1,000</td><td className={`${td} ${num} print-text`}>~20</td><td className={`${td} print-muted`}>stop</td></tr>
                <tr><td className={`${td} print-text`}>Paranormal tab (paranormal_info)</td><td className={`${td} ${num} print-text`}>~1,000</td><td className={`${td} ${num} print-text`}>~20</td><td className={`${td} print-muted`}>stop</td></tr>
                <tr><td className={`${td} print-text`}>Investigate tab (suggestions)</td><td className={`${td} ${num} print-text`}>~300</td><td className={`${td} ${num} print-text`}>~6</td><td className={`${td} print-muted`}>stop</td></tr>
                <tr className="font-semibold border-t-2 border-border"><td className={`${td} print-text`}>Per-Stop Total</td><td className={`${td} ${num} print-text`}>~2,600</td><td className={`${td} ${num} print-text`}>~{NARRATION_PER_STOP}</td><td className={`${td} print-muted`}>stop</td></tr>
                <tr><td className={`${td} print-text`}>Tour Introduction</td><td className={`${td} ${num} print-text`}>~500</td><td className={`${td} ${num} print-text`}>~10</td><td className={`${td} print-muted`}>tour</td></tr>
                <tr><td className={`${td} print-text`}>Tour Conclusion</td><td className={`${td} ${num} print-text`}>~500</td><td className={`${td} ${num} print-text`}>~10</td><td className={`${td} print-muted`}>tour</td></tr>
                <tr className="font-semibold border-t-2 border-primary/40 bg-primary/5"><td className={`${td} print-text`}>Full Tour ({AVG_STOPS_PER_TOUR} stops avg)</td><td className={`${td} ${num} print-text`}>~{(AVG_STOPS_PER_TOUR * 2600 + 1000).toLocaleString()}</td><td className={`${td} ${num} print-text`}>~{FULL_TOUR_NARRATION_CREDITS}</td><td className={`${td} print-muted`}>tour</td></tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { plan: 'Explorer', narE: 500, tours: TOURS_PER_ENERGY(500) },
              { plan: 'Investigator', narE: 1500, tours: TOURS_PER_ENERGY(1500) },
              { plan: 'Trailblazer', narE: 1500, tours: TOURS_PER_ENERGY(1500) },
            ].map(t => (
              <div key={t.plan} className="p-3 rounded-lg bg-card/40 border border-border/40">
                <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">{t.plan}</p>
                <p className="text-lg font-bold text-foreground print-text">{t.narE} narration energy</p>
                <p className="text-sm text-primary print-text">~{t.tours} fully narrated tours/mo</p>
                <p className="text-[10px] text-muted-foreground print-muted">{t.narE} ÷ {FULL_TOUR_NARRATION_CREDITS} credits/tour</p>
              </div>
            ))}
          </div>
          <p className="text-xs print-muted mt-2 italic">Cost per fully narrated tour: {FULL_TOUR_NARRATION_CREDITS} credits × ${COST_PER_CREDIT.toFixed(4)} = ${(FULL_TOUR_NARRATION_CREDITS * COST_PER_CREDIT).toFixed(2)}/tour in platform costs. Users who only narrate ghost stories (not all tabs) use ~{NARRATION_PER_STOP} credits/stop instead of ~{NARRATION_PER_STOP * 4} credits/stop, stretching energy ~4× further.</p>
        </section>

        {/* 3b. Credit Consumption Audit */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3c. Credit Consumption Audit — Every User Action</h2>
          <p className="text-xs print-muted mb-3">Complete inventory of every action that costs integration credits. "Gated = Yes" means the action is restricted by the energy system — free users are blocked, paid users are limited by their energy allotment.</p>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className={th}>Action</th>
                  <th className={th}>Page / Location</th>
                  <th className={th}>Type</th>
                  <th className={th}>Integration</th>
                  <th className={`${th} ${num}`}>Credits</th>
                  <th className={`${th} ${num}`}>Gated?</th>
                </tr>
              </thead>
              <tbody>
                {CREDIT_AUDIT.map((item, i) => (
                  <tr key={i} className={item.type === 'Narration' ? 'bg-accent/5' : ''}>
                    <td className={`${td} text-xs print-text`}>{item.action}</td>
                    <td className={`${td} text-xs print-muted`}>{item.page}</td>
                    <td className={`${td} text-xs print-text`}>{item.type}</td>
                    <td className={`${td} text-xs print-muted`}>{item.integration}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{item.credits}</td>
                    <td className={`${td} ${num} text-xs font-semibold text-red-500 print-text`}>{item.gated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-2">
            <p className="text-sm font-semibold text-green-500 print-text">Gated Cost Risk (Now Mitigated)</p>
            <p className="text-xs print-text">Energy gating is now implemented. Free (Observer) users are blocked from credit-consuming actions. Estimated monthly platform cost per active <span className="font-semibold">paid</span> user (energy-limited):</p>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="p-3 rounded-lg bg-card/40 border border-border/40">
                <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Typical User</p>
                <p className="text-lg font-bold text-foreground print-text">{UNGATED_TYPICAL.totalCredits} credits</p>
                <p className="text-sm text-primary print-text">${UNGATED_TYPICAL.monthlyCost.toFixed(2)}/mo</p>
                <p className="text-[10px] text-muted-foreground print-muted">~1 tour + 8 enrichments + 1 weather + 10 narrations</p>
              </div>
              <div className="p-3 rounded-lg bg-card/40 border border-border/40">
                <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Heavy User</p>
                <p className="text-lg font-bold text-foreground print-text">{UNGATED_WORST_CASE.totalCredits} credits</p>
                <p className="text-sm text-primary print-text">${UNGATED_WORST_CASE.monthlyCost.toFixed(2)}/mo</p>
                <p className="text-[10px] text-muted-foreground print-muted">3 tours + 24 enrichments + 40 narrations + 20 sweeper triggers</p>
              </div>
            </div>
            <p className="text-xs text-green-500 print-text mt-2">At 1,000 free users, gating saves ~${(1000 * UNGATED_TYPICAL.monthlyCost).toFixed(0)}/mo (typical) to ~${(1000 * UNGATED_WORST_CASE.monthlyCost).toFixed(0)}/mo (heavy) in platform costs.</p>
          </div>

          {/* 3d. Itemized Free-Credit Leak Breakdown */}
          <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
            <h3 className="font-heading text-sm font-semibold text-foreground mb-1 print-text">3d. Credits Saved by Gating — Per-Action Breakdown (Typical Free User)</h3>
            <p className="text-xs print-muted mb-3">Every row below is an action that was previously ungated — now gated by the energy system. Free (Observer) users are blocked from all of these. "Auto" actions silently skip for free users. This breakdown shows the credits that <span className="font-semibold">would</span> leak if gating were removed — <span className="font-semibold text-green-500">{FREE_USER_BREAKDOWN_TOTAL} credits = ${FREE_USER_BREAKDOWN_COST.toFixed(2)}/mo per free user</span> is now saved by gating.</p>
            <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr>
                    <th className={th}>Action</th>
                    <th className={th}>Trigger</th>
                    <th className={`${th} ${num}`}>Freq/mo</th>
                    <th className={`${th} ${num}`}>Credits Each</th>
                    <th className={`${th} ${num}`}>Total Credits</th>
                    <th className={`${th} ${num}`}>Cost/mo</th>
                    <th className={th}>Fix (Gate With)</th>
                  </tr>
                </thead>
                <tbody>
                  {FREE_USER_BREAKDOWN.map((r, i) => (
                    <tr key={i} className={r.type === 'Narration' ? 'bg-accent/5' : ''}>
                      <td className={`${td} text-xs print-text`}>{r.action}</td>
                      <td className={`${td} text-xs print-muted`}>{r.trigger}</td>
                      <td className={`${td} ${num} text-xs print-text`}>{r.freq}</td>
                      <td className={`${td} ${num} text-xs print-text`}>{r.creditsEach}</td>
                      <td className={`${td} ${num} text-xs font-semibold print-text`}>{r.totalCredits}</td>
                      <td className={`${td} ${num} text-xs print-text`}>${r.monthlyCost.toFixed(2)}</td>
                      <td className={`${td} text-xs text-primary print-text`}>{r.fix}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold border-t-2 border-green-500/40 bg-green-500/5">
                    <td className={`${td} print-text`} colSpan={4}>Total saved per free user / month</td>
                    <td className={`${td} ${num} print-text`}>{FREE_USER_BREAKDOWN_TOTAL}</td>
                    <td className={`${td} ${num} print-text`}>${FREE_USER_BREAKDOWN_COST.toFixed(2)}</td>
                    <td className={`${td} print-muted`}></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { users: 250, label: '250 free users' },
                { users: 1000, label: '1,000 free users' },
                { users: 2500, label: '2,500 free users' },
                { users: 5000, label: '5,000 free users' },
              ].map(s => (
                <div key={s.users} className="p-3 rounded-lg bg-card/40 border border-border/40 text-center">
                  <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold text-green-500 print-text">${(s.users * FREE_USER_BREAKDOWN_COST).toFixed(0)}/mo saved</p>
                  <p className="text-[10px] text-muted-foreground print-muted">{(s.users * FREE_USER_BREAKDOWN_TOTAL).toLocaleString()} credits/mo saved</p>
                </div>
              ))}
            </div>
            <p className="text-xs print-muted mt-3 italic">The two "Auto" actions (Stop Enrichment + People Extraction) previously fired without the user doing anything — they were the most dangerous leaks. These are now gated: free users silently skip enrichment, saving {FREE_USER_BREAKDOWN.filter(r => r.trigger.startsWith('Auto')).reduce((s, r) => s + r.totalCredits, 0)} of the {FREE_USER_BREAKDOWN_TOTAL} credits ({Math.round(FREE_USER_BREAKDOWN.filter(r => r.trigger.startsWith('Auto')).reduce((s, r) => s + r.totalCredits, 0) / FREE_USER_BREAKDOWN_TOTAL * 100)}%) per free user.</p>
          </div>
        </section>

        {/* 4. Per-Plan Profit (Monthly, 100% Utilization) */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">4. Per-Plan Profit — Monthly, 100% Utilization</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Plan</th>
                  <th className={`${th} ${num}`}>Price</th>
                  <th className={`${th} ${num}`}>Credits/mo</th>
                  <th className={`${th} ${num}`}>Platform Cost</th>
                  <th className={`${th} ${num}`}>Store Fee (15%)</th>
                  <th className={`${th} ${num}`}>Total Cost</th>
                  <th className={`${th} ${num}`}>Profit</th>
                  <th className={`${th} ${num}`}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {monthlyAnalysis.map(r => (
                  <tr key={r.plan}>
                    <td className={`${td} font-semibold print-text`}>{r.plan}</td>
                    <td className={`${td} ${num} print-text`}>${r.price.toFixed(2)}</td>
                    <td className={`${td} ${num} print-text`}>{r.credits}</td>
                    <td className={`${td} ${num} print-text`}>${r.platformCost.toFixed(2)}</td>
                    <td className={`${td} ${num} print-text`}>${r.sf.toFixed(2)}</td>
                    <td className={`${td} ${num} print-text`}>${r.totalCost.toFixed(2)}</td>
                    <td className={`${td} ${num} font-semibold print-text`}>${r.profit.toFixed(2)}</td>
                    <td className={`${td} ${num} print-text`}>{r.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 5. Trailblazer (3-Year) */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">5. Trailblazer — 30-Month Lifetime ($239.99)</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Utilization</th>
                  <th className={`${th} ${num}`}>Credits (30 mo)</th>
                  <th className={`${th} ${num}`}>Platform Cost</th>
                  <th className={`${th} ${num}`}>Store Fee (15%)</th>
                  <th className={`${th} ${num}`}>Total Cost</th>
                  <th className={`${th} ${num}`}>Profit</th>
                  <th className={`${th} ${num}`}>Margin</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${td} font-semibold print-text`}>100% (max use)</td>
                  <td className={`${td} ${num} print-text`}>{trailblazerAnalysis.credits.toLocaleString()}</td>
                  <td className={`${td} ${num} print-text`}>${trailblazerAnalysis.platformCost.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>${trailblazerAnalysis.sf.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>${trailblazerAnalysis.totalCost.toFixed(2)}</td>
                  <td className={`${td} ${num} font-semibold print-text`}>${trailblazerAnalysis.profit.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>{trailblazerAnalysis.margin.toFixed(1)}%</td>
                </tr>
                <tr>
                  <td className={`${td} font-semibold print-text`}>50% (realistic)</td>
                  <td className={`${td} ${num} print-text`}>{trailblazer50.credits.toLocaleString()}</td>
                  <td className={`${td} ${num} print-text`}>${trailblazer50.platformCost.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>${trailblazer50.sf.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>${trailblazer50.totalCost.toFixed(2)}</td>
                  <td className={`${td} ${num} font-semibold print-text`}>${trailblazer50.profit.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>{trailblazer50.margin.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mt-2 italic">With 1500 narration energy/month over 30 months, Trailblazer is profitable at 100% utilization (~{trailblazerAnalysis.margin.toFixed(0)}% margin = ${trailblazerAnalysis.profit.toFixed(0)} profit). At 50% realistic usage, margin improves to ~{trailblazer50.margin.toFixed(0)}%. The 300-slot cap protects against credit cost exposure. At Apple's 30% rate (above $1M/yr), Trailblazer becomes a small loss at 100% utilization but remains profitable at 50% (~31% margin).</p>
        </section>

        {/* 6. Aura Bundle Profit */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">6. Aura Bundle Profit — 100% Utilization</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Bundle</th>
                  <th className={`${th} ${num}`}>Price</th>
                  <th className={`${th} ${num}`}>Credits</th>
                  <th className={`${th} ${num}`}>Platform Cost</th>
                  <th className={`${th} ${num}`}>Store Fee (15%)</th>
                  <th className={`${th} ${num}`}>Profit</th>
                  <th className={`${th} ${num}`}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {bundleAnalysis.map(r => (
                  <tr key={r.name}>
                    <td className={`${td} font-semibold print-text`}>{r.name}</td>
                    <td className={`${td} ${num} print-text`}>${r.priceNum.toFixed(2)}</td>
                    <td className={`${td} ${num} print-text`}>{r.credits}</td>
                    <td className={`${td} ${num} print-text`}>${r.platformCost.toFixed(2)}</td>
                    <td className={`${td} ${num} print-text`}>${r.sf.toFixed(2)}</td>
                    <td className={`${td} ${num} font-semibold print-text`}>${r.profit.toFixed(2)}</td>
                    <td className={`${td} ${num} print-text`}>{r.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mt-2 italic">Store fee (15%) replaces the old flat $0.30 + 2.9% processing fee. This is cheaper for small transactions (Flicker) but more expensive for larger ones.</p>
        </section>

        {/* 7. Fixed Operating Costs */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">7. Fixed Operating Costs</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Item</th>
                  <th className={`${th} ${num}`}>Cost</th>
                  <th className={th}>Period</th>
                </tr>
              </thead>
              <tbody>
                {fixedCostsFirstYear.map(c => (
                  <tr key={c.item}>
                    <td className={`${td} print-text`}>{c.item}</td>
                    <td className={`${td} ${num} print-text`}>${c.cost}</td>
                    <td className={`${td} print-muted`}>{c.period}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className={`${td} print-text`}>First-Year Total</td>
                  <td className={`${td} ${num} print-text`}>${fixedFirstYearTotal}</td>
                  <td className={`${td} print-muted`}>${(fixedFirstYearTotal / 12).toFixed(2)}/mo</td>
                </tr>
                <tr><td colSpan={3} className={`${td} text-center print-muted text-xs`}>— Year 2+ —</td></tr>
                {fixedCostsOngoing.map(c => (
                  <tr key={c.item}>
                    <td className={`${td} print-text`}>{c.item}</td>
                    <td className={`${td} ${num} print-text`}>${c.cost}</td>
                    <td className={`${td} print-muted`}>{c.period}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className={`${td} print-text`}>Ongoing Annual Total</td>
                  <td className={`${td} ${num} print-text`}>${fixedOngoingAnnual}</td>
                  <td className={`${td} print-muted`}>${fixedOngoingMonthly.toFixed(2)}/mo</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mt-2 italic">Google Play's $25 is a one-time fee (not recurring). Private developer charges $250 upfront + 2.5% of annual profit (variable, shown in section 9 as "Dev 2.5%"). Base44 plan costs are shown as actual tier costs in section 9, not listed here as fixed costs.</p>
        </section>

        {/* 8. AdMob Ad Revenue */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">8. AdMob Ad Revenue</h2>

          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 print-text">8a. Interstitial Ads (Free Users)</h3>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Free Users</th>
                  <th className={`${th} ${num}`}>Monthly Revenue</th>
                  <th className={`${th} ${num}`}>Annual Revenue</th>
                </tr>
              </thead>
              <tbody>
                {adMobScenarios.map(s => (
                  <tr key={s.label}>
                    <td className={`${td} font-semibold print-text`}>{s.label}</td>
                    <td className={`${td} ${num} print-text`}>${s.monthlyRev.toFixed(2)}</td>
                    <td className={`${td} ${num} print-text`}>${s.annualRev.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mt-2 italic">Model: {ADS_PER_TOUR} ads/tour × {TOURS_PER_FREE_USER_MO} tours/mo × ${ADMOB_PER_IMPRESSION.toFixed(3)}/impression = ${AD_REV_PER_FREE_USER_MO.toFixed(3)}/free user/mo. Stop 1 paranormal history is free; stops 2+ show interstitial ads. Ad revenue is not subject to store fees.</p>

          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 mt-6 print-text">8b. Rewarded Ads (Paid Users — Energy Top-Ups)</h3>
          <p className="text-xs print-muted mb-3">Paid users who hit an energy gate can watch a rewarded ad for +{AD_REWARD_ENERGY} energy (up to {5}/day). Each ad generates ${ADMOB_REWARDED_PER_IMPRESSION.toFixed(3)} in ad revenue, but the granted energy costs {AD_REWARD_CREDITS_PER_AD} credits ({Math.round(AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION)} at {Math.round(AD_REWARD_UTILIZATION * 100)}% utilization) = ${((AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION * COST_PER_CREDIT)).toFixed(3)} in platform costs when consumed. <span className="font-semibold">Net: ${AD_REWARD_NET_PER_PAID_USER_MO.toFixed(3)}/paid user/mo</span> — a small retention cost that prevents churn at energy gates.</p>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className={th}>Paid Users</th>
                  <th className={`${th} ${num}`}>Ad Rev/mo</th>
                  <th className={`${th} ${num}`}>Energy Cost/mo</th>
                  <th className={`${th} ${num}`}>Net/mo</th>
                  <th className={`${th} ${num}`}>Credits/mo</th>
                </tr>
              </thead>
              <tbody>
                {rewardedAdScenarios.map(s => (
                  <tr key={s.label}>
                    <td className={`${td} font-semibold print-text`}>{s.label}</td>
                    <td className={`${td} ${num} print-text`}>${s.monthlyAdRev.toFixed(2)}</td>
                    <td className={`${td} ${num} print-text`}>${s.monthlyEnergyCost.toFixed(2)}</td>
                    <td className={`${td} ${num} font-semibold print-text`}>${s.monthlyNet.toFixed(2)}</td>
                    <td className={`${td} ${num} print-muted`}>{s.monthlyCredits.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mt-2 italic">Model: {ADS_PER_PAID_USER_MO} ads/paid user/mo × ${ADMOB_REWARDED_PER_IMPRESSION.toFixed(3)}/impression = ${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(3)} ad rev/paid user/mo. Energy cost: {ADS_PER_PAID_USER_MO} ads × {AD_REWARD_CREDITS_PER_AD} credits × {Math.round(AD_REWARD_UTILIZATION * 100)}% utilization × ${COST_PER_CREDIT.toFixed(4)}/credit = ${AD_REWARD_COST_PER_PAID_USER_MO.toFixed(3)}/paid user/mo. The net cost is a retention investment — ad-reward credits are included in the Base44 plan-tier calculation in section 9a.</p>
        </section>

        {/* 9. Revenue Scenarios */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">9. Revenue Scenarios (Monthly, 70% Avg Utilization)</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr>
                  <th className={th}>Scenario</th>
                  <th className={`${th} ${num}`}>Sub Rev</th>
                  <th className={`${th} ${num}`}>Interstitial</th>
                  <th className={`${th} ${num}`}>Rewarded</th>
                  <th className={`${th} ${num}`}>Total Rev</th>
                  <th className={`${th} ${num}`}>Base44 Plan</th>
                  <th className={`${th} ${num}`}>Store 15%</th>
                  <th className={`${th} ${num}`}>RevCat</th>
                  <th className={`${th} ${num}`}>Dev 2.5%</th>
                  <th className={`${th} ${num}`}>Fixed</th>
                  <th className={`${th} ${num}`}>Total Cost</th>
                  <th className={`${th} ${num}`}>Profit</th>
                  <th className={`${th} ${num}`}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <tr key={s.label}>
                    <td className={`${td} font-semibold print-text whitespace-nowrap`}>{s.label}</td>
                    <td className={`${td} ${num} print-text`}>${s.subRev.toFixed(0)}</td>
                    <td className={`${td} ${num} print-muted`}>${s.interstitialAdRev.toFixed(0)}</td>
                    <td className={`${td} ${num} print-muted`}>${s.rewardedAdRev.toFixed(0)}</td>
                    <td className={`${td} ${num} font-semibold print-text`}>${s.totalRev.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>${s.platformCosts}</td>
                    <td className={`${td} ${num} print-text`}>${s.storeCosts.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>${s.revcatCost.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>${s.developerFee.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>${s.fixedCost.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>${s.totalCost.toFixed(0)}</td>
                    <td className={`${td} ${num} font-semibold print-text`}>${s.profit.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>{s.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mt-2 italic">Trailblazer revenue amortized over 30 months. 5:1 free-to-paid ratio assumed. "Base44 Plan" = actual monthly plan tier cost for paid-user credits (from section 9a). Ad revenue = interstitial (free users) + rewarded (paid users). Rewarded ad credits from consumed ad-reward energy are included in the Base44 plan-tier calculation. Free (Observer) users are gated and consume 0 credits. Store fees apply only to IAP subscription revenue, not AdMob. RevenueCat 1% applies above $2,500/mo in subscription sales. Private developer fee is 2.5% of monthly profit (shown as "Dev 2.5%").</p>

          {/* 9a. Base44 Plan Required Per Scenario */}
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <h3 className="font-heading text-sm font-semibold text-foreground mb-3 print-text">9a. Base44 Plan Required Per Scenario</h3>
            <p className="text-xs print-muted mb-3">Total monthly integration credits consumed by paid users (at 70% utilization) plus credits from consumed ad-reward energy, and the minimum Base44 plan needed to support them. Free (Observer) users are gated and consume 0 credits.</p>
            <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr>
                    <th className={th}>Scenario</th>
                    <th className={`${th} ${num}`}>Subscription Credits</th>
                    <th className={`${th} ${num}`}>Ad-Reward Credits</th>
                    <th className={`${th} ${num}`}>Total Credits</th>
                    <th className={th}>Base44 Plan</th>
                    <th className={`${th} ${num}`}>Plan Cost/mo</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map(s => (
                    <tr key={s.label}>
                      <td className={`${td} font-semibold print-text whitespace-nowrap`}>{s.label}</td>
                      <td className={`${td} ${num} print-text`}>{(s.totalCredits - s.rewardedAdCredits).toLocaleString()}</td>
                      <td className={`${td} ${num} print-muted`}>{s.rewardedAdCredits.toLocaleString()}</td>
                      <td className={`${td} ${num} font-semibold print-text`}>{s.totalCredits.toLocaleString()}</td>
                      <td className={`${td} print-text`}>
                        <span className="font-semibold">{s.base44Plan.plan}</span>
                        <span className="text-[10px] print-muted block">{s.base44Plan.plans > 1 ? `${s.base44Plan.plans} plans` : ''}</span>
                      </td>
                      <td className={`${td} ${num} print-text`}>${s.base44Plan.cost}/mo</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-card/40 border border-border/40">
                <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Builder Plan</p>
                <p className="text-sm print-text mt-1">10,000 credits/mo — $40/mo</p>
                <p className="text-[10px] print-muted">Supports ~19 Explorer or ~6 Investigator users at 100% utilization</p>
              </div>
              <div className="p-3 rounded-lg bg-card/40 border border-border/40">
                <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Pro Plan</p>
                <p className="text-sm print-text mt-1">20,000 credits/mo — $80/mo</p>
                <p className="text-[10px] print-muted">Supports ~38 Explorer or ~12 Investigator users at 100% utilization</p>
              </div>
              <div className="p-3 rounded-lg bg-card/40 border border-border/40">
                <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Elite Plan</p>
                <p className="text-sm print-text mt-1">50,000 credits/mo — $200/mo</p>
                <p className="text-[10px] print-muted">Supports ~96 Explorer or ~32 Investigator users at 100% utilization</p>
              </div>
            </div>
            <p className="text-xs text-green-500 print-text mt-3">✓ Energy gating is deployed — free (Observer) users consume 0 credits. Only paid-user credits determine the required Base44 plan tier.</p>
            <p className="text-xs print-muted mt-1 italic">"Ad-Reward Credits" = credits from consumed ad-reward energy (paid users watching rewarded ads for +{AD_REWARD_ENERGY} energy top-ups). These are included in the total and can push the required Base44 plan tier higher. Base44 plan costs in section 9 are the actual fixed monthly plan tier costs. Elite pricing is estimated — check base44.com/pricing for current rates.</p>
          </div>
        </section>

        {/* 10. Key Takeaways */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">10. Key Takeaways</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block p-4 space-y-2 text-sm print-text">
            <p>• <span className="font-semibold text-red-500">✓ CREDIT CAPACITY: Base44 Builder plan includes only 10,000 credits/mo.</span> At 100% utilization that supports just ~19 Explorer, ~6 Investigator, or ~6 Trailblazer users. Pro (20k credits) doubles capacity. Free (Observer) users are gated (0 credits) — upgrade plans as you scale paid users.</p>
            <p>• <span className="font-semibold text-green-500">✓ Energy gating is deployed.</span> All 27 credit-consuming actions are gated. Free (Observer) users are blocked from creating tours, narrating, enriching stops, and using sweepers. Paid users are limited by their monthly energy allotment.</p>
            <p>• <span className="font-semibold">27 credit-consuming actions identified</span> across 14 manifestation (InvokeLLM) and 13 narration (GenerateSpeech) actions. Full audit in section 3c. Key hidden costs: stop enrichment (auto-fires on 1st stop view, 3–6 credits each) and Haunted Locations discovery (auto-fires on every search, 3 credits each).</p>
            <p>• <span className="font-semibold">Store fees (15%)</span> are the largest non-platform cost — significantly higher than traditional payment processing (2.9% + $0.30).</p>
            <p>• <span className="font-semibold">Full narration cost:</span> Each fully narrated tour (all 4 tabs per stop + intro + conclusion) costs ~{FULL_TOUR_NARRATION_CREDITS} credits = ${(FULL_TOUR_NARRATION_CREDITS * COST_PER_CREDIT).toFixed(2)}/tour in platform costs. Energy budgets support: Explorer ~{TOURS_PER_ENERGY(500)} tour/mo, Investigator ~{TOURS_PER_ENERGY(1500)} tours/mo, Trailblazer ~{TOURS_PER_ENERGY(1500)} tours/mo.</p>
            <p>• <span className="font-semibold">Explorer</span> yields ~{monthlyAnalysis[0].margin.toFixed(0)}% margin at full utilization; <span className="font-semibold">Investigator</span> ~{monthlyAnalysis[1].margin.toFixed(0)}%. Both healthier when energy goes unused.</p>
            <p>• <span className="font-semibold text-green-500">✓ Trailblazer is profitable at all utilization levels</span> (~{trailblazerAnalysis.margin.toFixed(0)}% margin at 100% = ${trailblazerAnalysis.profit.toFixed(0)} profit over 30 months; ~{trailblazer50.margin.toFixed(0)}% at 50% realistic usage). The 300-slot cap protects against credit cost exposure. Trailblazer matches Investigator energy at a locked-in discount.</p>
            <p>• <span className="font-semibold">AdMob revenue</span> from free users (interstitial) meaningfully supplements subscription income — 5,000 free users generate ~${(5000 * AD_REV_PER_FREE_USER_MO).toFixed(0)}/mo, offsetting platform and store costs.</p>
            <p>• <span className="font-semibold">Rewarded ads</span> (paid users) generate ~${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in ad revenue, but the granted energy costs ~${AD_REWARD_COST_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in platform credits when consumed (net ~${AD_REWARD_NET_PER_PAID_USER_MO.toFixed(2)}/paid user/mo). This is a <span className="font-semibold">retention investment</span>, not a profit center — it keeps paid users engaged at energy gates instead of churning. Ad-reward credits are included in the Base44 plan-tier calculation (section 9a), so high ad-reward usage can push the required plan tier higher.</p>
            <p>• <span className="font-semibold">Fixed costs</span> (~${fixedOngoingMonthly.toFixed(0)}/mo ongoing + 2.5% of profit to private developer) are negligible at scale but matter for small operations. First-year total: ${fixedFirstYearTotal} (includes $${DEV_UPFRONT_ONE_TIME} developer upfront). Base44 plan costs are now shown as actual tier costs in section 9, not per-credit estimates.</p>
            <p>• <span className="font-semibold">RevenueCat</span> 1% above $2,500/mo is minimal vs. store fees — only ~${revenuecatFee(7104).toFixed(0)}/mo at the Mature scenario.</p>
            <p>• <span className="font-semibold">RISK:</span> Apple's fee jumps to 30% above $1M/yr revenue. At that rate, Trailblazer becomes a small loss at 100% utilization (~-7% margin) but remains profitable at 50% realistic usage (~31% margin). Revisit pricing before crossing $1M.</p>
            <p>• <span className="font-semibold">Annual plans</span> improve cash flow and reduce per-transaction store fee burden (one charge vs. twelve).</p>
          </div>
        </section>

        <footer className="text-center text-xs print-muted pt-4 border-t border-border/50">
          AGES — Accessible Ghost Exploration Solutions · Confidential · {today}
        </footer>
      </div>
    </div>
  );
}