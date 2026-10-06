import React, { useEffect, useState } from 'react';
import { Printer, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Navigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft } from 'lucide-react';

// ===== DATA (mirrors src/lib/plans.js + base44/shared/plans.js) =====
const PLANS = [
  { name: 'Observer', price: '$0', billing: 'Free forever', manE: 0, narE: 0,
    features: 'Browse all 50 states + international tours; view tour details, stops, maps, text; device narration; save favorites; 4-tool toolkit (2 ad-gated: Audio Recorder, Radio Sweeper — 30s ad = 30s use, 300s/day cap); evidence saves 10/day (ad-watched); evidence journal + dashboard' },
  { name: 'Seeker', price: '$3.99', billing: 'Monthly ($39.99/yr)', manE: 0, narE: 0,
    features: 'Everything in Observer, ad-free; 4-tool toolkit (no ads); community map posting; evidence saves 10/day (no ad); Aura Bundle access (Save Energy only)' },
  { name: 'Technician', price: '$5.99', billing: 'Monthly ($59.99/yr)', manE: 0, narE: 0,
    features: 'Everything in Seeker; 10 of 12 toolkit tools; Aura Bundle access (100% Save Energy); evidence saves 20/day, then Aura Save energy' },
  { name: 'Explorer', price: '$7.99', billing: 'Monthly ($79.99/yr)', manE: 5, narE: 500,
    features: 'Everything in Technician; AI narration (~1 fully narrated tour/mo, all tabs); custom tour generation (1-2/mo); ranked tours; nearby + abroad; evidence journal; community map; leaderboard; 10-tool toolkit; aura bundles (80/20 narration/manifestation)' },
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

// Two-pass stop enrichment (Sept 2026): single-site tours (landmark, ship,
// cold_spot) now run a second LLM pass (rewriteForStopFocus) to remove general
// property history and keep stop-specific content. This doubles the InvokeLLM
// cost per enrichment for those tours. Area/road_trip tours are unchanged
// (1 pass). The user still pays 1 manifestation energy per stop — the extra
// cost is borne by the app owner, not the user.
const ENRICHMENT_CREDITS_SINGLE_SITE = CREDITS_PER_MANIFESTATION * 2; // 6 credits (2 passes)
const ENRICHMENT_CREDITS_MULTI_SITE = CREDITS_PER_MANIFESTATION;      // 3 credits (1 pass)
const SINGLE_SITE_FRACTION = 0.6;     // ~60% of tours are single-site (landmark/ship/cold_spot)
const AVG_ENRICHMENT_CREDITS = Math.round(
  ENRICHMENT_CREDITS_SINGLE_SITE * SINGLE_SITE_FRACTION +
  ENRICHMENT_CREDITS_MULTI_SITE * (1 - SINGLE_SITE_FRACTION)
); // ~5 credits (blended average)

// Blended manifestation credit rate: enrichment is ~50% of manifestation calls,
// and enrichment now averages 5 credits vs 3 for other actions. The blended
// rate rises from 3 to ~4 credits per manifestation energy unit. This drives
// the per-plan and scenario profit analysis below.
const ENRICHMENT_CALL_FRACTION = 0.5;
const BLENDED_MANIFESTATION_CREDITS = Math.round(
  CREDITS_PER_MANIFESTATION * (1 - ENRICHMENT_CALL_FRACTION) +
  AVG_ENRICHMENT_CREDITS * ENRICHMENT_CALL_FRACTION
); // ~4 credits (blended)

// Base44 plan tiers and their monthly integration credit allowances
const BASE44_PLANS = [
  { name: 'Builder', monthlyCost: 40, credits: 10000, costPerCredit: 40 / 10000 },
  { name: 'Pro', monthlyCost: 80, credits: 20000, costPerCredit: 80 / 20000 },
  { name: 'Elite', monthlyCost: 200, credits: 50000, costPerCredit: 200 / 50000 }, // estimated
];

// App Store / Google Play IAP fees — the app publishes natively via iOS/Android.
// Apple & Google take 15% for small developers (<$1M/yr). Apple jumps to 30%
// above $1M/yr; Google stays at 15%. This is the active billing model.
const STORE_FEE_PCT = 0.15;            // Apple & Google: 15% for small devs (<$1M/yr)
const STORE_FEE_PCT_HIGH = 0.30;       // Apple: 30% if >$1M/yr; Google stays 15%
const STORE_HIGH_THRESHOLD = 1000000;

// RevenueCat (subscription management layer for IAP across iOS/Android)
const REVENUECAT_FEE_PCT = 0.01;       // 1% of monthly sales above $2,500
const REVENUECAT_THRESHOLD = 2500;

// Fixed annual costs
const APPLE_DEV_ANNUAL = 99;
const GOOGLE_DEV_ONE_TIME = 25;
const DEV_UPFRONT_ONE_TIME = 600;        // CatDoes — one-time upfront (no profit share)

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
  + AD_REWARD_MANIFESTATION * BLENDED_MANIFESTATION_CREDITS; // 8 + 8 = 16 credits (blended 2-pass enrichment)
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

// ===== TOOLKIT VISIBILITY CHANGE (Sept 2026) =====
// Previously: tools were filtered by tier — Observer saw 2, Explorer saw 8,
// Investigator+ saw all 12. Now: ALL 12 tools are visible to ALL users, but
// tapping a tool outside the user's tier shows an upgrade prompt instead of
// opening it. This is a conversion funnel improvement, not a cost increase —
// gating still blocks credit consumption. But it exposes the more costly
// tools (Term Sweeper, Alphabet Sweeper, Anomaly Camera, Vibration Communicator)
// to lower-tier users, increasing upgrade motivation.
const TOOLKIT_TIERS = [
  { tier: 'Observer (Free)', visible: 12, accessible: 4, locked: 8, accessibleTools: 'Audio Recorder (ad-gated), Radio Sweeper (ad-gated), Equipment Guide, Safety Protocol', lockedTools: 'Yes/No Sweeper, Vibration Communicator, Alphabet Sweeper, Weather Monitor, Moon Phase, Paranormal Research: Terms, Term Sweeper, Anomaly Camera' },
  { tier: 'Seeker ($3.99)', visible: 12, accessible: 4, locked: 8, accessibleTools: 'Audio Recorder, Radio Sweeper, Equipment Guide, Safety Protocol (all ad-free)', lockedTools: 'Yes/No Sweeper, Vibration Communicator, Alphabet Sweeper, Weather Monitor, Moon Phase, Paranormal Research: Terms, Term Sweeper, Anomaly Camera' },
  { tier: 'Technician ($5.99)', visible: 12, accessible: 10, locked: 2, accessibleTools: 'Audio Recorder, Radio Sweeper, Yes/No Sweeper, Vibration Communicator, Alphabet Sweeper, Weather Monitor, Moon Phase, Paranormal Research: Terms, Equipment Guide, Safety Protocol', lockedTools: 'Term Sweeper, Anomaly Camera' },
  { tier: 'Explorer ($7.99)', visible: 12, accessible: 10, locked: 2, accessibleTools: 'Audio Recorder, Radio Sweeper, Yes/No Sweeper, Vibration Communicator, Alphabet Sweeper, Weather Monitor, Moon Phase, Paranormal Research: Terms, Equipment Guide, Safety Protocol', lockedTools: 'Term Sweeper, Anomaly Camera' },
  { tier: 'Investigator ($11.99)', visible: 12, accessible: 12, locked: 0, accessibleTools: 'All 12 tools', lockedTools: '—' },
  { tier: 'Trailblazer ($239.99)', visible: 12, accessible: 12, locked: 0, accessibleTools: 'All 12 tools', lockedTools: '—' },
];

// The 4 tools newly visible to Observer/Explorer users that were previously hidden.
// These are the "more costly generations in the one area" the user referenced.
const NEWLY_VISIBLE_COSTLY_TOOLS = [
  { name: 'Term Sweeper', tier: 'Investigator+', costType: 'Manifest. + Narration', credits: '3 (build terms) + 1/trigger voice', desc: 'Location-based spirit dictation with LLM term generation + GenerateSpeech trigger voices' },
  { name: 'Alphabet Sweeper', tier: 'Investigator+', costType: 'Narration', credits: '1/trigger voice', desc: 'A→Z sweep with GenerateSpeech trigger voices' },
  { name: 'Vibration Communicator', tier: 'Investigator+', costType: 'No credits', credits: '0 (sensor-only)', desc: 'Phone sensor detection — no LLM or speech credits needed' },
  { name: 'Anomaly Camera', tier: 'Investigator+', costType: 'No credits', credits: '0 (camera-only)', desc: 'IR depth scan — no LLM or speech credits needed' },
];

// ===== CREDIT CONSUMPTION AUDIT =====
// Every user action that consumes integration credits (InvokeLLM or GenerateSpeech).
// "Gated" = restricted by the energy system. Energy gating is deployed —
// free (Observer) users are blocked from all credit-consuming actions.
// NOTE (Sept 2026): All 12 toolkit tools are now visible to all users. Tools
// outside the user's tier show an upgrade prompt instead of opening. This
// increases upgrade conversion potential without changing credit costs.
const CREDIT_AUDIT = [
  // --- Manifestation Energy (InvokeLLM) ---
  { action: 'Custom Tour Creation', page: 'Home → Custom Tour', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3–9', gated: 'Yes' },
  { action: 'Haunted Locations → Create Tour', page: 'Home → Haunted Explorations', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3–9', gated: 'Yes' },
  { action: 'Nearby → Create Tour (distance)', page: 'Nearby', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Nearby → Create Tour (zip)', page: 'Nearby', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Abroad Tour Creation', page: 'Abroad Tours → Create', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Auto Stop Generation (no stops)', page: 'Tour Detail (auto)', type: 'Manifest.', integration: 'InvokeLLM (automatic)', credits: '2–4', gated: 'Yes' },
  { action: 'Add Stops to Tour', page: 'Tour Card → Add Stops', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web)', credits: '3', gated: 'Yes' },
  { action: 'Stop Enrichment (thin content, 2-pass for single-site)', page: 'Stop Detail (auto, 1st view)', type: 'Manifest.', integration: 'InvokeLLM (gemini_3_flash + web) + rewrite pass (single-site only)', credits: '3–6 (6 = single-site 2-pass)', gated: 'Yes' },
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
  // 16 of 32 manifestation calls are enrichments at ~5 credits (blended 2-pass);
  // other 16 at 3 credits. Man: 16*5 + 16*3 = 128. Narration: 40*20 = 800. Total: 928.
  totalCredits: 16 * AVG_ENRICHMENT_CREDITS + 16 * CREDITS_PER_MANIFESTATION + 40 * 20,
  monthlyCost: (16 * AVG_ENRICHMENT_CREDITS + 16 * CREDITS_PER_MANIFESTATION + 40 * 20) * COST_PER_CREDIT,
};
// Typical monthly cost per active paid user (energy-limited)
const UNGATED_TYPICAL = {
  manifestationCalls: 10, narrationCalls: 10, narrationAvgCredits: 15,
  // 5 of 10 manifestation calls are enrichments at ~5 credits (blended 2-pass);
  // other 5 at 3 credits. Man: 5*5 + 5*3 = 40. Narration: 10*15 = 150. Total: 190.
  totalCredits: 5 * AVG_ENRICHMENT_CREDITS + 5 * CREDITS_PER_MANIFESTATION + 10 * 15,
  monthlyCost: (5 * AVG_ENRICHMENT_CREDITS + 5 * CREDITS_PER_MANIFESTATION + 10 * 15) * COST_PER_CREDIT,
};

// Itemized per-action breakdown of credits saved by gating for a typical free (Observer) user.
const FREE_USER_BREAKDOWN = [
  { action: 'Stop Enrichment (thin content, 2-pass for single-site)', trigger: 'Auto — fires on 1st stop view', freq: 7, creditsEach: AVG_ENRICHMENT_CREDITS, type: 'Manifest.', fix: 'Gate: require Explorer+ to trigger enrichment' },
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
  // Uses BLENDED_MANIFESTATION_CREDITS to account for two-pass enrichment
  // (single-site tours cost 2× InvokeLLM credits per manifestation energy).
  const credits = (manE * BLENDED_MANIFESTATION_CREDITS + narE * CREDITS_PER_NARRATION) * months;
  const platformCost = credits * COST_PER_CREDIT;
  return { credits, platformCost };
}

// App Store / Google Play IAP fee (15% for small devs)
function storeFee(price) {
  return price * STORE_FEE_PCT;
}

// RevenueCat fee (1% of monthly sales above $2,500)
function revenuecatFee(monthlySales) {
  if (monthlySales <= REVENUECAT_THRESHOLD) return 0;
  return (monthlySales - REVENUECAT_THRESHOLD) * REVENUECAT_FEE_PCT;
}

// Determine which Base44 plan(s) are needed for a given monthly credit volume
function requiredBase44Plan(credits) {
  if (credits <= 10000) return { plan: 'Builder', plans: 1, cost: 40 };
  if (credits <= 20000) return { plan: 'Pro', plans: 1, cost: 80 };
  if (credits <= 50000) return { plan: 'Elite', plans: 1, cost: 200 };
  const eliteCount = Math.ceil(credits / 50000);
  return { plan: `${eliteCount}× Elite`, plans: eliteCount, cost: eliteCount * 200 };
}

// Per-plan monthly profit (1 month, 100% utilization)
// Seeker and Technician have 0 AI energy — 0 platform credits, only store fee.
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

// Trailblazer (30 months, 100% utilization)
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
const fixedCostsFirstYear = [
  { item: 'Apple Developer Program', cost: APPLE_DEV_ANNUAL, period: 'Annual' },
  { item: 'Google Play Developer', cost: GOOGLE_DEV_ONE_TIME, period: 'One-time' },
  { item: 'CatDoes (Upfront)', cost: DEV_UPFRONT_ONE_TIME, period: 'One-time' },
];
const fixedCostsOngoing = [
  { item: 'Apple Developer Program', cost: APPLE_DEV_ANNUAL, period: 'Annual' },
];
const fixedFirstYearTotal = APPLE_DEV_ANNUAL + GOOGLE_DEV_ONE_TIME + DEV_UPFRONT_ONE_TIME;
const fixedOngoingAnnual = APPLE_DEV_ANNUAL;
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
// Mix now includes Seeker ($3.99, 0 energy) and Technician ($5.99, 0 energy) —
// both are high-margin (0 platform credits, only 15% store fee). Realistic
// distribution: Seeker is the largest paid tier (low price point), Technician
// is the second largest, Explorer/Investigator/Trailblazer are smaller.
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
  const totalPaidUsers = s.mix.seeker + s.mix.technician + s.mix.explorer + s.mix.investigator + s.mix.trailblazer;
  const interstitialAdRev = s.freeUsers * AD_REV_PER_FREE_USER_MO;
  const rewardedAdRev = totalPaidUsers * AD_REWARD_REV_PER_PAID_USER_MO;
  const adRev = interstitialAdRev + rewardedAdRev;
  const totalRev = subRev + adRev;
  const rewardedAdCredits = Math.round(totalPaidUsers * ADS_PER_PAID_USER_MO * AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION);
  // Seeker and Technician have 0 AI energy — 0 platform credits
  const totalCredits = Math.round(
    s.mix.explorer * calcCosts(5 * 0.7, 500 * 0.7, 1).credits
    + s.mix.investigator * calcCosts(15 * 0.7, 1500 * 0.7, 1).credits
    + s.mix.trailblazer * calcCosts(15 * 0.7, 1500 * 0.7, 1).credits
    + rewardedAdCredits
  );
  const base44Plan = requiredBase44Plan(totalCredits);
  const platformCosts = base44Plan.cost;
  // Store fees (15% on IAP subscription revenue; ad revenue not subject to store fees)
  const storeCosts = subRev * STORE_FEE_PCT;
  // RevenueCat (1% above $2,500/month in subscription sales)
  const revcatCost = revenuecatFee(subRev);
  const fixedCost = fixedOngoingMonthly;
  const totalCost = platformCosts + storeCosts + revcatCost + fixedCost;
  const profit = totalRev - totalCost;
  return { ...s, seekerRev, technicianRev, explorerRev, investigatorRev, trailblazerRev, subRev, interstitialAdRev, rewardedAdRev, adRev, totalRev, platformCosts, storeCosts, revcatCost, fixedCost, totalCost, profit, margin: (profit / totalRev * 100), totalCredits, rewardedAdCredits, base44Plan };
});

// ===== DEVICE NARRATION HYPOTHETICALS (Oct 2026) =====
// Device Narration uses the device's built-in speechSynthesis API — 0
// GenerateSpeech credits. Enhanced Narration uses server-side GenerateSpeech
// (1 credit / 50 chars). An average tour has ~25 narration opportunities (4
// tabs × ~7 stops + intro + conclusion); a typical engaged user narrates ~10
// of those per tour. Narration is the single biggest platform cost, so these
// 3 hypotheticals have major profit implications. NO CODE CHANGES MADE —
// planning scenarios only.
const NARRATION_OPPS_PER_TOUR = 25;
const NARRATION_OPPS_NARRATED = 10;
const TOURS_PER_FREE_USER_HYPO = 2;
const TOURS_PER_PAID_USER_HYPO = 3;
const NARRATION_AD_INTERSTITIAL = ADMOB_PER_IMPRESSION;       // $0.015/imp
const NARRATION_AD_REWARDED = ADMOB_REWARDED_PER_IMPRESSION;   // $0.020/imp

// Per-plan monthly profit under a narration-credit + ad-revenue model.
function hypoMonthly(manE, narCredits, adRevMo, price) {
  const credits = manE * BLENDED_MANIFESTATION_CREDITS + narCredits;
  const platformCost = credits * COST_PER_CREDIT;
  const sf = storeFee(price);
  const netCost = platformCost + sf - adRevMo;
  const profit = price - netCost;
  return { credits, platformCost, sf, adRevMo, netCost, profit, margin: price > 0 ? (profit / price * 100) : 0 };
}

// HYPO 1: Device narration for all. Observer: ad before each narration. Paid:
// enhanced until energy depleted, then ad-gated device narration. Paid users
// still consume their FULL enhanced narration energy — device only extends
// access beyond depletion (more ad revenue, better retention, no credit cut).
// Observer sees an ad before EVERY narration opportunity (~25/tour), not just
// the ~10 a paying user typically narrates.
const OBSERVER_NARRATION_ADS_PER_TOUR = NARRATION_OPPS_PER_TOUR;
const HYPO1_OBSERVER_ADREV = OBSERVER_NARRATION_ADS_PER_TOUR * TOURS_PER_FREE_USER_HYPO * NARRATION_AD_INTERSTITIAL;
const HYPO1_EXPLORER_ADREV = NARRATION_OPPS_NARRATED * 1 * NARRATION_AD_REWARDED;
const HYPO1_INVESTIGATOR_ADREV = NARRATION_OPPS_NARRATED * 2 * NARRATION_AD_REWARDED;
const HYPO1_TRAILBLAZER_ADREV = NARRATION_OPPS_NARRATED * 2 * NARRATION_AD_REWARDED;

// HYPO 2: HYPO 1 + paid tiers choose per-narration: ad→device OR enhanced.
// Modeled at ~50% device / 50% enhanced — halves enhanced narration credits.
const HYPO2_DEVICE_FRACTION = 0.5;
const HYPO2_EXPLORER_ADREV = NARRATION_OPPS_NARRATED * TOURS_PER_PAID_USER_HYPO * HYPO2_DEVICE_FRACTION * NARRATION_AD_REWARDED;
const HYPO2_INVESTIGATOR_ADREV = NARRATION_OPPS_NARRATED * TOURS_PER_PAID_USER_HYPO * HYPO2_DEVICE_FRACTION * NARRATION_AD_REWARDED;
const HYPO2_TRAILBLAZER_ADREV = HYPO2_INVESTIGATOR_ADREV;

// HYPO 3: ALL plans use device narration exclusively. No enhanced narration.
// Only manifestation credits consumed. Observer STILL sees ads before each
// device narration (same ad revenue as HYPO 1/2 — that gating is constant
// across all 3 hypotheticals). Paid users get device narration free (no ad —
// they paid for the app). Zero narration credits for everyone.
const hypo1Plans = [
  { plan: 'Observer', price: 0, manE: 0, narCredits: 0, adRevMo: HYPO1_OBSERVER_ADREV, ...hypoMonthly(0, 0, HYPO1_OBSERVER_ADREV, 0) },
  { plan: 'Explorer', price: 7.99, manE: 5, narCredits: 500, adRevMo: HYPO1_EXPLORER_ADREV, ...hypoMonthly(5, 500, HYPO1_EXPLORER_ADREV, 7.99) },
  { plan: 'Investigator', price: 11.99, manE: 15, narCredits: 1500, adRevMo: HYPO1_INVESTIGATOR_ADREV, ...hypoMonthly(15, 1500, HYPO1_INVESTIGATOR_ADREV, 11.99) },
];
const hypo2Plans = [
  { plan: 'Observer', price: 0, manE: 0, narCredits: 0, adRevMo: HYPO1_OBSERVER_ADREV, ...hypoMonthly(0, 0, HYPO1_OBSERVER_ADREV, 0) },
  { plan: 'Explorer', price: 7.99, manE: 5, narCredits: Math.round(500 * (1 - HYPO2_DEVICE_FRACTION)), adRevMo: HYPO2_EXPLORER_ADREV, ...hypoMonthly(5, Math.round(500 * (1 - HYPO2_DEVICE_FRACTION)), HYPO2_EXPLORER_ADREV, 7.99) },
  { plan: 'Investigator', price: 11.99, manE: 15, narCredits: Math.round(1500 * (1 - HYPO2_DEVICE_FRACTION)), adRevMo: HYPO2_INVESTIGATOR_ADREV, ...hypoMonthly(15, Math.round(1500 * (1 - HYPO2_DEVICE_FRACTION)), HYPO2_INVESTIGATOR_ADREV, 11.99) },
];
const hypo3Plans = [
  { plan: 'Observer', price: 0, manE: 0, narCredits: 0, adRevMo: HYPO1_OBSERVER_ADREV, ...hypoMonthly(0, 0, HYPO1_OBSERVER_ADREV, 0) },
  { plan: 'Explorer', price: 7.99, manE: 5, narCredits: 0, adRevMo: 0, ...hypoMonthly(5, 0, 0, 7.99) },
  { plan: 'Investigator', price: 11.99, manE: 15, narCredits: 0, adRevMo: 0, ...hypoMonthly(15, 0, 0, 11.99) },
];

// Trailblazer (30-month) under each hypothetical
const hypo1Trail = (() => { const c = calcCosts(15, 1500, 30); const adRev = HYPO1_TRAILBLAZER_ADREV * 30; const sf = storeFee(239.99); const netCost = c.platformCost + sf - adRev; return { credits: c.credits, platformCost: c.platformCost, sf, adRev, netCost, profit: 239.99 - netCost, margin: (239.99 - netCost) / 239.99 * 100 }; })();
const hypo2Trail = (() => { const c = calcCosts(15, Math.round(1500 * (1 - HYPO2_DEVICE_FRACTION)), 30); const adRev = HYPO2_TRAILBLAZER_ADREV * 30; const sf = storeFee(239.99); const netCost = c.platformCost + sf - adRev; return { credits: c.credits, platformCost: c.platformCost, sf, adRev, netCost, profit: 239.99 - netCost, margin: (239.99 - netCost) / 239.99 * 100 }; })();
const hypo3Trail = (() => { const c = calcCosts(15, 0, 30); const sf = storeFee(239.99); const netCost = c.platformCost + sf; return { credits: c.credits, platformCost: c.platformCost, sf, adRev: 0, netCost, profit: 239.99 - netCost, margin: (239.99 - netCost) / 239.99 * 100 }; })();

// Mature scenario (1,000 paid / 5,000 free, 70% util) under each hypothetical.
// KEEPS the existing rewarded-ad energy top-up system (matches section 9's
// Mature row) so the baseline is directly comparable. The narration-gating
// ads modeled here are ADDITIVE — a new revenue stream on top of the
// rewarded-ad top-up, not a replacement for it.
function hypoMatureScenario(narCreditsByPlan, observerAdRev, paidAdRevPerUser) {
  const mix = { seeker: 300, technician: 200, explorer: 300, investigator: 150, trailblazer: 50 };
  const freeUsers = 5000;
  const seekerRev = mix.seeker * 3.99;
  const technicianRev = mix.technician * 5.99;
  const explorerRev = mix.explorer * 7.99;
  const investigatorRev = mix.investigator * 11.99;
  const trailblazerRev = mix.trailblazer * (239.99 / 30);
  const subRev = seekerRev + technicianRev + explorerRev + investigatorRev + trailblazerRev;
  const totalPaidUsers = mix.seeker + mix.technician + mix.explorer + mix.investigator + mix.trailblazer;
  const interstitialAdRev = freeUsers * AD_REV_PER_FREE_USER_MO;
  const rewardedAdRev = totalPaidUsers * AD_REWARD_REV_PER_PAID_USER_MO;
  const narrationAdRev = freeUsers * observerAdRev + totalPaidUsers * paidAdRevPerUser;
  const adRev = interstitialAdRev + rewardedAdRev + narrationAdRev;
  const totalRev = subRev + adRev;
  const rewardedAdCredits = Math.round(totalPaidUsers * ADS_PER_PAID_USER_MO * AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION);
  // Seeker and Technician have 0 AI energy — 0 platform credits
  const totalCredits = Math.round(
    mix.explorer * calcCosts(5 * 0.7, narCreditsByPlan.explorer * 0.7, 1).credits
    + mix.investigator * calcCosts(15 * 0.7, narCreditsByPlan.investigator * 0.7, 1).credits
    + mix.trailblazer * calcCosts(15 * 0.7, narCreditsByPlan.trailblazer * 0.7, 1).credits
    + rewardedAdCredits
  );
  const base44Plan = requiredBase44Plan(totalCredits);
  const platformCosts = base44Plan.cost;
  const storeCosts = subRev * STORE_FEE_PCT;
  const revcatCost = revenuecatFee(subRev);
  const fixedCost = fixedOngoingMonthly;
  const totalCost = platformCosts + storeCosts + revcatCost + fixedCost;
  const profit = totalRev - totalCost;
  return { subRev, interstitialAdRev, rewardedAdRev, narrationAdRev, adRev, totalRev, totalCredits, base44Plan, platformCosts, storeCosts, revcatCost, fixedCost, totalCost, profit, margin: (profit / totalRev * 100) };
}
const baselineMature = hypoMatureScenario({ explorer: 500, investigator: 1500, trailblazer: 1500 }, 0, 0);
const hypo1Mature = hypoMatureScenario({ explorer: 500, investigator: 1500, trailblazer: 1500 }, HYPO1_OBSERVER_ADREV, (HYPO1_EXPLORER_ADREV + HYPO1_INVESTIGATOR_ADREV) / 2);
const hypo2Mature = hypoMatureScenario({ explorer: Math.round(500 * (1 - HYPO2_DEVICE_FRACTION)), investigator: Math.round(1500 * (1 - HYPO2_DEVICE_FRACTION)), trailblazer: Math.round(1500 * (1 - HYPO2_DEVICE_FRACTION)) }, HYPO1_OBSERVER_ADREV, HYPO2_EXPLORER_ADREV);
const hypo3Mature = hypoMatureScenario({ explorer: 0, investigator: 0, trailblazer: 0 }, HYPO1_OBSERVER_ADREV, 0);

// ===== HYPO 2 + TOOLKIT ADMOB GATING — COMBINED ANALYSIS (Oct 2026) =====
// The proposed toolkit change (not yet implemented): 6 ad-gatable device tools
// for Observer (Radio Sweeper, Audio Recorder, Alphabet Sweeper, Yes/No/IDK
// Sweeper, Vibration Communicator, Anomaly Camera), 3 for Explorer (Alphabet,
// Vibration, Anomaly Camera). Use-time: 30s ad = 30s tool use, 5 min/day/tool.
// Save-gate: Observer only, 1 ad = 1 save, 10/day cap. Device-only tools cost
// 0 credits (no LLM, no speech). Term Sweeper stays paid-only (generative).
// Weather Monitor moves to free Open-Meteo (0 credits, no gate).
const TOOL_USE_ADS_OBSERVER_MO = 10;   // active Observer watches ~10 use-time ads/mo across 6 tools
const TOOL_USE_ADS_EXPLORER_MO = 5;    // active Explorer watches ~5 use-time ads/mo across 3 tools
const TOOL_SAVE_ADS_OBSERVER_MO = 3;  // active Observer saves ~3 evidence items/mo (1 ad each)
const UPLOAD_CREDITS_PER_SAVE = 1;    // UploadPrivateFile ≈ 1 integration credit
const TOOL_USE_ADREV_OBSERVER = TOOL_USE_ADS_OBSERVER_MO * ADMOB_REWARDED_PER_IMPRESSION;
const TOOL_USE_ADREV_EXPLORER = TOOL_USE_ADS_EXPLORER_MO * ADMOB_REWARDED_PER_IMPRESSION;
const TOOL_SAVE_ADREV_OBSERVER = TOOL_SAVE_ADS_OBSERVER_MO * ADMOB_REWARDED_PER_IMPRESSION;
const TOOL_SAVE_COST_OBSERVER = TOOL_SAVE_ADS_OBSERVER_MO * UPLOAD_CREDITS_PER_SAVE * COST_PER_CREDIT;

// Per-plan monthly profit under HYPO 2 + toolkit (adds save cost + toolkit ad rev)
function hypoMonthlyToolkit(manE, narCredits, adRevMo, price, saveCost) {
  const credits = manE * BLENDED_MANIFESTATION_CREDITS + narCredits;
  const platformCost = credits * COST_PER_CREDIT;
  const sf = storeFee(price);
  const netCost = platformCost + sf + saveCost - adRevMo;
  const profit = price - netCost;
  return { credits, platformCost, sf, adRevMo, saveCost, netCost, profit, margin: price > 0 ? (profit / price * 100) : 0 };
}
const hypo2ToolkitPlans = [
  { plan: 'Observer', price: 0, manE: 0, narCredits: 0, adRevMo: HYPO1_OBSERVER_ADREV + TOOL_USE_ADREV_OBSERVER + TOOL_SAVE_ADREV_OBSERVER, saveCost: TOOL_SAVE_COST_OBSERVER, ...hypoMonthlyToolkit(0, 0, HYPO1_OBSERVER_ADREV + TOOL_USE_ADREV_OBSERVER + TOOL_SAVE_ADREV_OBSERVER, 0, TOOL_SAVE_COST_OBSERVER) },
  { plan: 'Explorer', price: 7.99, manE: 5, narCredits: Math.round(500 * (1 - HYPO2_DEVICE_FRACTION)), adRevMo: HYPO2_EXPLORER_ADREV + TOOL_USE_ADREV_EXPLORER, saveCost: 0, ...hypoMonthlyToolkit(5, Math.round(500 * (1 - HYPO2_DEVICE_FRACTION)), HYPO2_EXPLORER_ADREV + TOOL_USE_ADREV_EXPLORER, 7.99, 0) },
  { plan: 'Investigator', price: 11.99, manE: 15, narCredits: Math.round(1500 * (1 - HYPO2_DEVICE_FRACTION)), adRevMo: HYPO2_INVESTIGATOR_ADREV, saveCost: 0, ...hypoMonthlyToolkit(15, Math.round(1500 * (1 - HYPO2_DEVICE_FRACTION)), HYPO2_INVESTIGATOR_ADREV, 11.99, 0) },
];

// Mature scenario (1,000 paid / 5,000 free, 70% util) with HYPO 2 + toolkit.
// Same as hypoMatureScenario but adds toolkit ad revenue (use-time + save-gate)
// and save upload cost. Credits unchanged — device-only tools cost 0 credits.
function hypoMatureWithToolkit(narCreditsByPlan, observerAdRev, paidAdRevPerUser) {
  const mix = { seeker: 300, technician: 200, explorer: 300, investigator: 150, trailblazer: 50 };
  const freeUsers = 5000;
  const seekerRev = mix.seeker * 3.99;
  const technicianRev = mix.technician * 5.99;
  const explorerRev = mix.explorer * 7.99;
  const investigatorRev = mix.investigator * 11.99;
  const trailblazerRev = mix.trailblazer * (239.99 / 30);
  const subRev = seekerRev + technicianRev + explorerRev + investigatorRev + trailblazerRev;
  const totalPaidUsers = mix.seeker + mix.technician + mix.explorer + mix.investigator + mix.trailblazer;
  const interstitialAdRev = freeUsers * AD_REV_PER_FREE_USER_MO;
  const rewardedAdRev = totalPaidUsers * AD_REWARD_REV_PER_PAID_USER_MO;
  const narrationAdRev = freeUsers * observerAdRev + totalPaidUsers * paidAdRevPerUser;
  const toolkitUseAdRev = freeUsers * TOOL_USE_ADREV_OBSERVER + mix.explorer * TOOL_USE_ADREV_EXPLORER;
  const toolkitSaveAdRev = freeUsers * TOOL_SAVE_ADREV_OBSERVER;
  const toolkitSaveCost = freeUsers * TOOL_SAVE_COST_OBSERVER;
  const toolkitAdRev = toolkitUseAdRev + toolkitSaveAdRev;
  const adRev = interstitialAdRev + rewardedAdRev + narrationAdRev + toolkitAdRev;
  const totalRev = subRev + adRev;
  const rewardedAdCredits = Math.round(totalPaidUsers * ADS_PER_PAID_USER_MO * AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION);
  // Seeker and Technician have 0 AI energy — 0 platform credits
  const totalCredits = Math.round(
    mix.explorer * calcCosts(5 * 0.7, narCreditsByPlan.explorer * 0.7, 1).credits
    + mix.investigator * calcCosts(15 * 0.7, narCreditsByPlan.investigator * 0.7, 1).credits
    + mix.trailblazer * calcCosts(15 * 0.7, narCreditsByPlan.trailblazer * 0.7, 1).credits
    + rewardedAdCredits
  );
  const base44Plan = requiredBase44Plan(totalCredits);
  const platformCosts = base44Plan.cost;
  const storeCosts = subRev * STORE_FEE_PCT;
  const revcatCost = revenuecatFee(subRev);
  const fixedCost = fixedOngoingMonthly;
  const totalCost = platformCosts + storeCosts + revcatCost + fixedCost + toolkitSaveCost;
  const profit = totalRev - totalCost;
  return { subRev, interstitialAdRev, rewardedAdRev, narrationAdRev, toolkitAdRev, toolkitSaveCost, adRev, totalRev, totalCredits, base44Plan, platformCosts, storeCosts, revcatCost, fixedCost, totalCost, profit, margin: (profit / totalRev * 100) };
}
const hypo2ToolkitMature = hypoMatureWithToolkit(
  { explorer: Math.round(500 * (1 - HYPO2_DEVICE_FRACTION)), investigator: Math.round(1500 * (1 - HYPO2_DEVICE_FRACTION)), trailblazer: Math.round(1500 * (1 - HYPO2_DEVICE_FRACTION)) },
  HYPO1_OBSERVER_ADREV, HYPO2_EXPLORER_ADREV
);
// Trailblazer under HYPO 2 + toolkit = same as HYPO 2 (all 12 tools, no ad-gate, no save cost)
const hypo2ToolkitTrail = hypo2Trail;

// Section 13: HYPO 2 + Toolkit AdGate across all 4 revenue scenarios (mirrors section 9)
function hypo2ToolkitScenario(mix, freeUsers) {
  const narCreditsByPlan = { explorer: Math.round(500 * (1 - HYPO2_DEVICE_FRACTION)), investigator: Math.round(1500 * (1 - HYPO2_DEVICE_FRACTION)), trailblazer: Math.round(1500 * (1 - HYPO2_DEVICE_FRACTION)) };
  const seekerRev = (mix.seeker || 0) * 3.99;
  const technicianRev = (mix.technician || 0) * 5.99;
  const explorerRev = mix.explorer * 7.99;
  const investigatorRev = mix.investigator * 11.99;
  const trailblazerRev = mix.trailblazer * (239.99 / 30);
  const subRev = seekerRev + technicianRev + explorerRev + investigatorRev + trailblazerRev;
  const totalPaidUsers = (mix.seeker || 0) + (mix.technician || 0) + mix.explorer + mix.investigator + mix.trailblazer;
  const interstitialAdRev = freeUsers * AD_REV_PER_FREE_USER_MO;
  const rewardedAdRev = totalPaidUsers * AD_REWARD_REV_PER_PAID_USER_MO;
  const narrationAdRev = freeUsers * HYPO1_OBSERVER_ADREV + totalPaidUsers * HYPO2_EXPLORER_ADREV;
  const toolkitUseAdRev = freeUsers * TOOL_USE_ADREV_OBSERVER + mix.explorer * TOOL_USE_ADREV_EXPLORER;
  const toolkitSaveAdRev = freeUsers * TOOL_SAVE_ADREV_OBSERVER;
  const toolkitSaveCost = freeUsers * TOOL_SAVE_COST_OBSERVER;
  const toolkitAdRev = toolkitUseAdRev + toolkitSaveAdRev;
  const adRev = interstitialAdRev + rewardedAdRev + narrationAdRev + toolkitAdRev;
  const totalRev = subRev + adRev;
  const rewardedAdCredits = Math.round(totalPaidUsers * ADS_PER_PAID_USER_MO * AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION);
  // Seeker and Technician have 0 AI energy — 0 platform credits
  const totalCredits = Math.round(
    mix.explorer * calcCosts(5 * 0.7, narCreditsByPlan.explorer * 0.7, 1).credits
    + mix.investigator * calcCosts(15 * 0.7, narCreditsByPlan.investigator * 0.7, 1).credits
    + mix.trailblazer * calcCosts(15 * 0.7, narCreditsByPlan.trailblazer * 0.7, 1).credits
    + rewardedAdCredits
  );
  const base44Plan = requiredBase44Plan(totalCredits);
  const platformCosts = base44Plan.cost;
  const storeCosts = subRev * STORE_FEE_PCT;
  const revcatCost = revenuecatFee(subRev);
  const fixedCost = fixedOngoingMonthly;
  const totalCost = platformCosts + storeCosts + revcatCost + fixedCost + toolkitSaveCost;
  const profit = totalRev - totalCost;
  return { subRev, interstitialAdRev, rewardedAdRev, narrationAdRev, toolkitAdRev, toolkitSaveCost, adRev, totalRev, totalCredits, rewardedAdCredits, base44Plan, platformCosts, storeCosts, revcatCost, fixedCost, totalCost, profit, margin: (profit / totalRev * 100) };
}
const hypo2ToolkitScenarios = [
  { label: 'Small (50 paid / 250 free)', mix: { seeker: 15, technician: 10, explorer: 15, investigator: 7, trailblazer: 3 }, freeUsers: 250 },
  { label: 'Growing (200 paid / 1,000 free)', mix: { seeker: 60, technician: 40, explorer: 60, investigator: 30, trailblazer: 10 }, freeUsers: 1000 },
  { label: 'Scale (500 paid / 2,500 free)', mix: { seeker: 150, technician: 100, explorer: 150, investigator: 75, trailblazer: 25 }, freeUsers: 2500 },
  { label: 'Mature (1,000 paid / 5,000 free)', mix: { seeker: 300, technician: 200, explorer: 300, investigator: 150, trailblazer: 50 }, freeUsers: 5000 },
].map(s => ({ ...s, ...hypo2ToolkitScenario(s.mix, s.freeUsers) }));

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
  para(`App Store / Google Play IAP fee: ${(STORE_FEE_PCT * 100).toFixed(0)}% of IAP revenue (Apple & Google, small devs < $1M/yr). Apple jumps to ${(STORE_FEE_PCT_HIGH * 100).toFixed(0)}% above $${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr; Google stays 15%. The app publishes natively via iOS/Android IAP.`);
  para(`RevenueCat: ${(REVENUECAT_FEE_PCT * 100).toFixed(0)}% of monthly subscription sales above $${REVENUECAT_THRESHOLD.toLocaleString()}/mo (IAP subscription management layer)`);
  para(`Apple Developer: $${APPLE_DEV_ANNUAL}/yr | Google Play Developer: $${GOOGLE_DEV_ONE_TIME} one-time | CatDoes: $${DEV_UPFRONT_ONE_TIME} upfront (one-time, no profit share)`);
  para(`Base44 plan costs are shown as actual fixed monthly tier costs in section 9 (Builder $40/mo, Pro $80/mo, Elite $200/mo), determined by total credits consumed. The per-credit rate ($${COST_PER_CREDIT.toFixed(4)}/credit) is used only for per-plan and per-bundle profit analysis in sections 4-6.`);
  para(`AdMob Interstitial: $${ADMOB_ECPM}/1k impressions (eCPM). Free users see ads on stops 2+ (~${ADS_PER_TOUR} ads/tour, ~${TOURS_PER_FREE_USER_MO} tours/mo = $${AD_REV_PER_FREE_USER_MO.toFixed(3)}/free user/mo)`);
  para(`AdMob Rewarded: $${ADMOB_REWARDED_ECPM}/1k impressions. Paid users watch ~${ADS_PER_PAID_USER_MO} ads/mo for +${AD_REWARD_ENERGY} energy each. Ad rev: $${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(3)}/paid user/mo. Energy cost: ${AD_REWARD_CREDITS_PER_AD} credits/ad × ${Math.round(AD_REWARD_UTILIZATION * 100)}% utilization × $${COST_PER_CREDIT.toFixed(4)} = $${AD_REWARD_COST_PER_PAID_USER_MO.toFixed(3)}/paid user/mo. Net: $${AD_REWARD_NET_PER_PAID_USER_MO.toFixed(3)}/paid user/mo (retention investment, not profit).`);
  para('Credits charged per action at runtime. 100% utilization = worst case; 50-70% = realistic average.');
  para(`Two-Pass Stop Enrichment (Sept 2026): Single-site tours (landmark, ship, cold_spot) now run a second LLM pass (rewriteForStopFocus) to remove general property history and keep stop-specific content. This doubles the enrichment cost to ~${ENRICHMENT_CREDITS_SINGLE_SITE} credits for those tours (was ${ENRICHMENT_CREDITS_MULTI_SITE}). Area/road_trip tours are unchanged (1 pass, ${ENRICHMENT_CREDITS_MULTI_SITE} credits). The user still pays 1 manifestation energy per stop — the extra cost is borne by the app owner. Blended average: ~${AVG_ENRICHMENT_CREDITS} credits/enrichment. Blended manifestation rate: ~${BLENDED_MANIFESTATION_CREDITS} credits/manifestation energy (was ${CREDITS_PER_MANIFESTATION}). One-time content_version upgrade: old tours regenerate at 2× cost when first opened by a paid user/admin.`);

  heading('3a. Base44 Credit Capacity — When to Upgrade');
  para('Integration credits are hard-capped per plan. Actions FAIL when exhausted — no pay-per-credit overflow.');
  para(`Builder ($40/mo, 10k credits): ~${Math.floor(10000 / (5 * BLENDED_MANIFESTATION_CREDITS + 500))} Explorer, ~${Math.floor(10000 / (15 * BLENDED_MANIFESTATION_CREDITS + 1500))} Investigator, ~${Math.floor(10000 / (15 * BLENDED_MANIFESTATION_CREDITS + 1500))} Trailblazer users at 100% utilization`);
  para(`Pro ($80/mo, 20k credits): ~${Math.floor(20000 / (5 * BLENDED_MANIFESTATION_CREDITS + 500))} Explorer, ~${Math.floor(20000 / (15 * BLENDED_MANIFESTATION_CREDITS + 1500))} Investigator, ~${Math.floor(20000 / (15 * BLENDED_MANIFESTATION_CREDITS + 1500))} Trailblazer users at 100% utilization`);
  para(`At 50% realistic utilization: Builder supports ~${Math.floor(10000 / ((5 * BLENDED_MANIFESTATION_CREDITS + 500) * 0.5))} Explorer, ~${Math.floor(10000 / ((15 * BLENDED_MANIFESTATION_CREDITS + 1500) * 0.5))} Investigator, ~${Math.floor(10000 / ((15 * BLENDED_MANIFESTATION_CREDITS + 1500) * 0.5))} Trailblazer`);
  para('Free (Observer) users are gated — they consume 0 credits. Only paid-user credits determine the required plan tier.');
  para(`Upgrade Builder→Pro at ~${Math.floor(10000 / (5 * BLENDED_MANIFESTATION_CREDITS + 500))} active Explorer users; Pro→Elite at ~${Math.floor(20000 / (5 * BLENDED_MANIFESTATION_CREDITS + 500))}`);

  heading('3b. Full Narration Cost Per Tour (All Tabs)');
  para(`Per stop: Ghost Story ~6 credits + History ~20 + Paranormal ~20 + Investigate ~6 = ${NARRATION_PER_STOP} credits/stop`);
  para(`Tour intro ~10 + conclusion ~10. Average tour (${AVG_STOPS_PER_TOUR} stops): ${FULL_TOUR_NARRATION_CREDITS} credits = $${(FULL_TOUR_NARRATION_CREDITS * COST_PER_CREDIT).toFixed(2)}/tour`);
  para(`Explorer: ${TOURS_PER_ENERGY(500)} tours/mo | Investigator: ${TOURS_PER_ENERGY(1500)} tours/mo | Trailblazer: ${TOURS_PER_ENERGY(1500)} tours/mo`);
  para(`Ghost-story-only narration (1 tab/stop) costs ~${NARRATION_PER_STOP} credits/stop vs ~${NARRATION_PER_STOP * 4} for all tabs — stretching energy ~4x further.`);

  heading('3c. Credit Consumption Audit');
  para('Energy gating is now implemented. All 27 credit-consuming actions are gated — free (Observer) users are blocked from consuming credits, and paid users are limited by their energy allotment. Additionally, all 12 toolkit tools are now visible to all users (Sept 2026 change — see section 3e), with upgrade prompts on locked tools.');
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

  heading('3e. Toolkit Visibility & AdGate (Oct 2026)');
  para('All 12 toolkit tools are visible to every user. Tapping a locked tool shows an upgrade prompt. Observer (free) gets 4 tools — 2 free (Equipment Guide, Safety Protocol) + 2 ad-gated (Audio Recorder, Radio Sweeper: 30s ad = 30s use, 300s/day cap per tool). Seeker gets the same 4 tools ad-free. Technician and Explorer get 10 of 12 tools. Investigator+ get all 12. This is a conversion funnel improvement — gating still blocks credit consumption.');
  table(['Tier', 'Visible', 'Accessible', 'Locked'],
    TOOLKIT_TIERS.map(t => [t.tier, t.visible, t.accessible, t.locked]),
    [120, 40, 40, 40]);
  para('Newly visible costly tools (previously hidden from Observer/Explorer):');
  table(['Tool', 'Required Tier', 'Cost Type', 'Credits'],
    NEWLY_VISIBLE_COSTLY_TOOLS.map(t => [t.name, t.tier, t.costType, t.credits]),
    [80, 60, 80, 80]);
  para('Cost impact: Zero direct change. Gating blocks unauthorized users. Observer ad-gated tools (Audio Recorder, Radio Sweeper) are device-only — 0 integration credits. Ad revenue from tool-use ads is nearly pure profit. Conversion impact: Observer/Seeker users now see Term Sweeper, Alphabet Sweeper, Anomaly Camera, and Vibration Communicator — stronger upgrade incentive. Term Sweeper is the most credit-intensive (3 + 1/trigger). Vibration Communicator and Anomaly Camera are sensor-only (0 credits).');
  para('Seeker ($3.99/mo) and Technician ($5.99/mo) are new ad-free tiers with 0 AI energy — they consume 0 platform credits and generate only 15% store fee in costs. High-margin tiers that capture users who want ad-free access without AI features. Community Map (Sept 2026): Author names resolve via backend function (no credit cost). Stacked markers grouped by coordinate.');

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
  table(['Scenario', 'Sub Rev', 'Interstitial', 'Rewarded', 'Total Rev', 'B44 Plan', 'Store', 'RevCat', 'Fixed', 'Total Cost', 'Profit', 'Margin'],
    scenarios.map(s => [s.label, '$' + s.subRev.toFixed(0), '$' + s.interstitialAdRev.toFixed(0), '$' + s.rewardedAdRev.toFixed(0), '$' + s.totalRev.toFixed(0), '$' + s.platformCosts, '$' + s.storeCosts.toFixed(0), '$' + s.revcatCost.toFixed(0), '$' + s.fixedCost.toFixed(0), '$' + s.totalCost.toFixed(0), '$' + s.profit.toFixed(0), s.margin.toFixed(1) + '%']),
    [70, 30, 30, 30, 35, 30, 25, 25, 25, 30, 30, 25]);

  heading('9a. Base44 Plan Required Per Scenario');
  para('Total monthly integration credits consumed by paid users (70% utilization) plus credits from consumed ad-reward energy, and the minimum Base44 plan needed to support them. Free (Observer) users are gated and consume 0 credits.');
  table(['Scenario', 'Paid Credits', 'Ad-Reward Cr', 'Base44 Plan', 'Plan $/mo'],
    scenarios.map(s => [s.label, (s.totalCredits - s.rewardedAdCredits).toLocaleString(), s.rewardedAdCredits.toLocaleString(), s.base44Plan.plan, '$' + s.base44Plan.cost]),
    [85, 50, 50, 60, 45]);
  para('Base44 plan costs in section 9 ("B44 Plan" column) are the actual fixed monthly plan tier costs. Ad-reward credits (from paid users watching rewarded ads for energy top-ups) are included in the total and can push the required plan tier higher. Free (Observer) users are gated and consume 0 credits.');

  heading('11. Device Narration Hypotheticals (Oct 2026)');
  para(`Narration is the single biggest platform cost (~${FULL_TOUR_NARRATION_CREDITS} credits per fully-narrated tour). Device Narration uses the device's built-in speechSynthesis — 0 GenerateSpeech credits. Enhanced Narration uses server-side GenerateSpeech (1 credit/50 chars). An average tour has ~${NARRATION_OPPS_PER_TOUR} narration opportunities; a typical paid user narrates ~${NARRATION_OPPS_NARRATED} of them, while an Observer watches an ad before all ~${OBSERVER_NARRATION_ADS_PER_TOUR}. These 3 hypotheticals model offering device narration across all tiers with different AdMob gating. NO CODE CHANGES MADE — planning scenarios only.`);
  para(`HYPO 1 (Ad-Gated Device Narration): Observer sees an ad before each narration (device voice, 0 credits). Explorer/Investigator/Trailblazer use enhanced narration until energy depleted, then ad-gated device narration. Paid users still consume their FULL enhanced energy allotment — device narration only extends access beyond depletion, adding ad revenue and improving retention without cutting credit costs.`);
  para(`HYPO 2 (Choice: Device or Enhanced): HYPO 1 + paid tiers choose per-narration: watch an ad for device narration OR spend enhanced energy. Modeled at ~50% device / 50% enhanced. Halves enhanced narration credits for paid users — major cost savings — at the cost of ad friction on half of narrations.`);
  para(`HYPO 3 (Device Only, No Enhanced): All plans use device narration exclusively. Zero narration credits for everyone — only manifestation credits (tour generation, enrichment) are consumed. Observer STILL sees ads before each device narration (same ad revenue as HYPO 1/2 — that gating is constant across all 3 hypotheticals). Paid users get device narration free (no ad — they paid for the app). Lowest platform cost, but users lose the premium "storm" server voice and get device voices only.`);
  para(`Baseline vs HYPO 1: Baseline offers NO device narration — Observer cannot narrate at all (0 narration ad revenue; free users lose the feature entirely), and paid users get enhanced narration only (once energy depletes, narration stops). HYPO 1 adds device narration for all: Observer gets ad-gated device narration (NEW ad revenue + a usable feature for free users), and paid users keep their FULL enhanced narration energy with ad-gated device narration as a fallback after depletion (same credits + small overflow ad revenue + better retention — narration never just "stops"). Net: HYPO 1 adds ad revenue without cutting any credits.`);
  para('11a. Per-Plan Monthly Profit (100% Utilization):');
  table(['Scenario', 'Plan', 'Price', 'Man Cr', 'Nar Cr', 'Total Cr', 'Platform', 'Store', 'Ad Rev', 'Net Cost', 'Profit', 'Margin'],
    [
      ...monthlyAnalysis.map(r => ['Baseline', r.plan, '$' + r.price.toFixed(2), r.plan === 'Explorer' ? 5 : 15, r.plan === 'Explorer' ? 500 : 1500, r.credits, '$' + r.platformCost.toFixed(2), '$' + r.sf.toFixed(2), '—', '$' + r.totalCost.toFixed(2), '$' + r.profit.toFixed(2), r.margin.toFixed(1) + '%']),
      ...hypo1Plans.filter(p => p.price > 0).map(p => ['HYPO 1', p.plan, '$' + p.price.toFixed(2), p.manE, p.narCredits, p.credits, '$' + p.platformCost.toFixed(2), '$' + p.sf.toFixed(2), '$' + p.adRevMo.toFixed(2), '$' + p.netCost.toFixed(2), '$' + p.profit.toFixed(2), p.margin.toFixed(1) + '%']),
      ...hypo2Plans.filter(p => p.price > 0).map(p => ['HYPO 2', p.plan, '$' + p.price.toFixed(2), p.manE, p.narCredits, p.credits, '$' + p.platformCost.toFixed(2), '$' + p.sf.toFixed(2), '$' + p.adRevMo.toFixed(2), '$' + p.netCost.toFixed(2), '$' + p.profit.toFixed(2), p.margin.toFixed(1) + '%']),
      ...hypo3Plans.filter(p => p.price > 0).map(p => ['HYPO 3', p.plan, '$' + p.price.toFixed(2), p.manE, p.narCredits, p.credits, '$' + p.platformCost.toFixed(2), '$' + p.sf.toFixed(2), '$' + p.adRevMo.toFixed(2), '$' + p.netCost.toFixed(2), '$' + p.profit.toFixed(2), p.margin.toFixed(1) + '%']),
    ],
    [45, 50, 35, 30, 30, 35, 45, 40, 40, 45, 45, 40]);
  para(`Observer (free): All 3 hypotheticals retain the existing interstitial stop ad revenue (~$${AD_REV_PER_FREE_USER_MO.toFixed(2)}/free user/mo = ~$${(5000 * AD_REV_PER_FREE_USER_MO).toFixed(0)}/mo at 5,000 free users — see the "Interstitial" column in 11c). All 3 hypotheticals ALSO add the same narration-gating ad revenue (~$${HYPO1_OBSERVER_ADREV.toFixed(2)}/free user/mo from ads before each device narration) — Observer's ad-gated device narration is identical across HYPO 1, 2 & 3. The hypotheticals differ only on the PAID side: HYPO 1 keeps full enhanced + device fallback, HYPO 2 lets paid choose, HYPO 3 is device-only (no enhanced).`);
  para('11b. Trailblazer 30-Month ($239.99):');
  table(['Scenario', 'Credits', 'Platform', 'Store', 'Ad Rev', 'Net Cost', 'Profit', 'Margin'],
    [
      ['Baseline (100%)', trailblazerAnalysis.credits.toLocaleString(), '$' + trailblazerAnalysis.platformCost.toFixed(2), '$' + trailblazerAnalysis.sf.toFixed(2), '—', '$' + trailblazerAnalysis.totalCost.toFixed(2), '$' + trailblazerAnalysis.profit.toFixed(2), trailblazerAnalysis.margin.toFixed(1) + '%'],
      ['HYPO 1', hypo1Trail.credits.toLocaleString(), '$' + hypo1Trail.platformCost.toFixed(2), '$' + hypo1Trail.sf.toFixed(2), '$' + hypo1Trail.adRev.toFixed(2), '$' + hypo1Trail.netCost.toFixed(2), '$' + hypo1Trail.profit.toFixed(2), hypo1Trail.margin.toFixed(1) + '%'],
      ['HYPO 2', hypo2Trail.credits.toLocaleString(), '$' + hypo2Trail.platformCost.toFixed(2), '$' + hypo2Trail.sf.toFixed(2), '$' + hypo2Trail.adRev.toFixed(2), '$' + hypo2Trail.netCost.toFixed(2), '$' + hypo2Trail.profit.toFixed(2), hypo2Trail.margin.toFixed(1) + '%'],
      ['HYPO 3', hypo3Trail.credits.toLocaleString(), '$' + hypo3Trail.platformCost.toFixed(2), '$' + hypo3Trail.sf.toFixed(2), '$0.00', '$' + hypo3Trail.netCost.toFixed(2), '$' + hypo3Trail.profit.toFixed(2), hypo3Trail.margin.toFixed(1) + '%'],
    ],
    [55, 55, 50, 45, 45, 50, 50, 45]);
  para('11c. Mature Revenue Scenario (1,000 paid / 5,000 free, 70% util — keeps the existing rewarded-ad top-up system, consistent with section 9):');
  table(['Scenario', 'Sub Rev', 'Interstitial', 'Rewarded', 'Narration Ads', 'Total Rev', 'Credits', 'B44 Plan', 'Total Cost', 'Profit', 'Margin'],
    [
      ['Baseline', '$' + baselineMature.subRev.toFixed(0), '$' + baselineMature.interstitialAdRev.toFixed(0), '$' + baselineMature.rewardedAdRev.toFixed(0), '$0', '$' + baselineMature.totalRev.toFixed(0), baselineMature.totalCredits.toLocaleString(), baselineMature.base44Plan.plan, '$' + baselineMature.totalCost.toFixed(0), '$' + baselineMature.profit.toFixed(0), baselineMature.margin.toFixed(1) + '%'],
      ['HYPO 1', '$' + hypo1Mature.subRev.toFixed(0), '$' + hypo1Mature.interstitialAdRev.toFixed(0), '$' + hypo1Mature.rewardedAdRev.toFixed(0), '$' + hypo1Mature.narrationAdRev.toFixed(0), '$' + hypo1Mature.totalRev.toFixed(0), hypo1Mature.totalCredits.toLocaleString(), hypo1Mature.base44Plan.plan, '$' + hypo1Mature.totalCost.toFixed(0), '$' + hypo1Mature.profit.toFixed(0), hypo1Mature.margin.toFixed(1) + '%'],
      ['HYPO 2', '$' + hypo2Mature.subRev.toFixed(0), '$' + hypo2Mature.interstitialAdRev.toFixed(0), '$' + hypo2Mature.rewardedAdRev.toFixed(0), '$' + hypo2Mature.narrationAdRev.toFixed(0), '$' + hypo2Mature.totalRev.toFixed(0), hypo2Mature.totalCredits.toLocaleString(), hypo2Mature.base44Plan.plan, '$' + hypo2Mature.totalCost.toFixed(0), '$' + hypo2Mature.profit.toFixed(0), hypo2Mature.margin.toFixed(1) + '%'],
      ['HYPO 3', '$' + hypo3Mature.subRev.toFixed(0), '$' + hypo3Mature.interstitialAdRev.toFixed(0), '$' + hypo3Mature.rewardedAdRev.toFixed(0), '$' + hypo3Mature.narrationAdRev.toFixed(0), '$' + hypo3Mature.totalRev.toFixed(0), hypo3Mature.totalCredits.toLocaleString(), hypo3Mature.base44Plan.plan, '$' + hypo3Mature.totalCost.toFixed(0), '$' + hypo3Mature.profit.toFixed(0), hypo3Mature.margin.toFixed(1) + '%'],
    ],
    [50, 45, 45, 45, 50, 50, 50, 50, 50, 50, 45]);
  para(`Observer narration ad revenue (the "Narration Ads" column): ${OBSERVER_NARRATION_ADS_PER_TOUR} ads/tour x ${TOURS_PER_FREE_USER_HYPO} tours/mo x $${NARRATION_AD_INTERSTITIAL.toFixed(3)} = $${HYPO1_OBSERVER_ADREV.toFixed(2)}/free user/mo x 5,000 free users = $${(5000 * HYPO1_OBSERVER_ADREV).toLocaleString()}/mo. HYPO 3 shows exactly this amount; HYPO 1 and 2 show it plus paid-user ad revenue. Baseline has none (free users cannot narrate).`);
  para(`HYPO 1 adds ~$${(hypo1Mature.profit - baselineMature.profit).toFixed(0)}/mo profit vs baseline (ad revenue only — no credit savings since paid users keep full enhanced). HYPO 2 adds ~$${(hypo2Mature.profit - baselineMature.profit).toFixed(0)}/mo (halved narration credits + ad revenue, may drop a Base44 tier). HYPO 3 adds ~$${(hypo3Mature.profit - baselineMature.profit).toFixed(0)}/mo (zero narration credits — manifestation only — Observer narration ad revenue retained, but paid users lose the premium voice).`);

  heading('12. HYPO 2 + Toolkit AdGate — Combined Analysis (Oct 2026)');
  para('Combines the chosen narration hypothetical (HYPO 2 — paid users choose device-ad or enhanced, ~50/50) with the proposed toolkit AdMob gating change (6 ad-gatable device tools for Observer, 3 for Explorer; save-gate for Observer). Both are planning scenarios — no code changes made. Weather Monitor also moves from a 3-credit LLM call to free Open-Meteo (0 credits, no gate).');
  para('12a. Toolkit AdGate Model:');
  table(['Tier', 'Ad-Gatable Tools', 'Use Ads/mo', 'Ad Rev/mo', 'Save-Gate', 'Save Rev/mo', 'Save Cost/mo'],
    [
      ['Observer (Free)', '6 tools', '~10', '$' + TOOL_USE_ADREV_OBSERVER.toFixed(2), '~3 saves', '$' + TOOL_SAVE_ADREV_OBSERVER.toFixed(2), '$' + TOOL_SAVE_COST_OBSERVER.toFixed(3)],
      ['Explorer ($7.99)', '3 tools', '~5', '$' + TOOL_USE_ADREV_EXPLORER.toFixed(2), '— (has credits)', '—', '—'],
      ['Investigator+', '0 (all included)', '—', '—', '—', '—', '—'],
    ],
    [80, 60, 40, 45, 55, 45, 50]);
  para(`Device-only tools cost 0 credits. Term Sweeper stays paid-only. Save-gate math: each save ad earns $${ADMOB_REWARDED_PER_IMPRESSION.toFixed(3)}, each save costs ${UPLOAD_CREDITS_PER_SAVE} credit × $${COST_PER_CREDIT.toFixed(4)} = $${(UPLOAD_CREDITS_PER_SAVE * COST_PER_CREDIT).toFixed(3)} — every save nets +$${(ADMOB_REWARDED_PER_IMPRESSION - UPLOAD_CREDITS_PER_SAVE * COST_PER_CREDIT).toFixed(3)}. Weather moves to free Open-Meteo (0 credits) — no cost-model change, but free for all users (was Explorer+ perk).`);
  para('12b. Mature Scenario (1,000 paid / 5,000 free, 70% util):');
  table(['Scenario', 'Sub Rev', 'Interstitial', 'Rewarded', 'Narr Ads', 'Toolkit Ads', 'Save Cost', 'Total Rev', 'Credits', 'B44 Plan', 'Total Cost', 'Profit', 'Margin'],
    [
      ['Baseline', '$' + baselineMature.subRev.toFixed(0), '$' + baselineMature.interstitialAdRev.toFixed(0), '$' + baselineMature.rewardedAdRev.toFixed(0), '$0', '—', '—', '$' + baselineMature.totalRev.toFixed(0), baselineMature.totalCredits.toLocaleString(), baselineMature.base44Plan.plan + ' ($' + baselineMature.base44Plan.cost + ')', '$' + baselineMature.totalCost.toFixed(0), '$' + baselineMature.profit.toFixed(0), baselineMature.margin.toFixed(1) + '%'],
      ['HYPO 2', '$' + hypo2Mature.subRev.toFixed(0), '$' + hypo2Mature.interstitialAdRev.toFixed(0), '$' + hypo2Mature.rewardedAdRev.toFixed(0), '$' + hypo2Mature.narrationAdRev.toFixed(0), '—', '—', '$' + hypo2Mature.totalRev.toFixed(0), hypo2Mature.totalCredits.toLocaleString(), hypo2Mature.base44Plan.plan + ' ($' + hypo2Mature.base44Plan.cost + ')', '$' + hypo2Mature.totalCost.toFixed(0), '$' + hypo2Mature.profit.toFixed(0), hypo2Mature.margin.toFixed(1) + '%'],
      ['HYPO 2 + Toolkit', '$' + hypo2ToolkitMature.subRev.toFixed(0), '$' + hypo2ToolkitMature.interstitialAdRev.toFixed(0), '$' + hypo2ToolkitMature.rewardedAdRev.toFixed(0), '$' + hypo2ToolkitMature.narrationAdRev.toFixed(0), '$' + hypo2ToolkitMature.toolkitAdRev.toFixed(0), '$' + hypo2ToolkitMature.toolkitSaveCost.toFixed(0), '$' + hypo2ToolkitMature.totalRev.toFixed(0), hypo2ToolkitMature.totalCredits.toLocaleString(), hypo2ToolkitMature.base44Plan.plan + ' ($' + hypo2ToolkitMature.base44Plan.cost + ')', '$' + hypo2ToolkitMature.totalCost.toFixed(0), '$' + hypo2ToolkitMature.profit.toFixed(0), hypo2ToolkitMature.margin.toFixed(1) + '%'],
    ],
    [50, 30, 30, 25, 35, 30, 25, 35, 40, 55, 35, 35, 30]);
  para(`Deltas: HYPO 2 vs Baseline: +$${(hypo2Mature.profit - baselineMature.profit).toFixed(0)}/mo (narration credit halving drops Base44 ${baselineMature.base44Plan.plan} ($${baselineMature.base44Plan.cost}) → ${hypo2Mature.base44Plan.plan} ($${hypo2Mature.base44Plan.cost}), −$${(baselineMature.base44Plan.cost - hypo2Mature.base44Plan.cost).toFixed(0)}/mo platform + $${hypo2Mature.narrationAdRev.toFixed(0)}/mo narration ads). Toolkit vs HYPO 2: +$${(hypo2ToolkitMature.profit - hypo2Mature.profit).toFixed(0)}/mo (pure ad revenue from device-only tools + save-gate, no credit change). Total vs Baseline: +$${(hypo2ToolkitMature.profit - baselineMature.profit).toFixed(0)}/mo (${baselineMature.margin.toFixed(0)}% → ${hypo2ToolkitMature.margin.toFixed(0)}% margin).`);
  para('12d. Per-Plan Monthly Profit (100% Utilization):');
  table(['Scenario', 'Plan', 'Price', 'Nar Cr', 'Platform', 'Store', 'Ad Rev', 'Save Cost', 'Net Cost', 'Profit', 'Margin'],
    [
      ...monthlyAnalysis.map(r => ['Baseline', r.plan, '$' + r.price.toFixed(2), r.plan === 'Explorer' ? 500 : 1500, '$' + r.platformCost.toFixed(2), '$' + r.sf.toFixed(2), '—', '—', '$' + r.totalCost.toFixed(2), '$' + r.profit.toFixed(2), r.margin.toFixed(1) + '%']),
      ...hypo2Plans.filter(p => p.price > 0).map(p => ['HYPO 2', p.plan, '$' + p.price.toFixed(2), p.narCredits, '$' + p.platformCost.toFixed(2), '$' + p.sf.toFixed(2), '$' + p.adRevMo.toFixed(2), '—', '$' + p.netCost.toFixed(2), '$' + p.profit.toFixed(2), p.margin.toFixed(1) + '%']),
      ...hypo2ToolkitPlans.map(p => ['HYPO 2 + Toolkit', p.plan, '$' + p.price.toFixed(2), p.narCredits, '$' + p.platformCost.toFixed(2), '$' + p.sf.toFixed(2), '$' + p.adRevMo.toFixed(2), '$' + p.saveCost.toFixed(3), '$' + p.netCost.toFixed(2), '$' + p.profit.toFixed(2), p.margin.toFixed(1) + '%']),
    ],
    [55, 50, 30, 30, 40, 35, 40, 40, 40, 40, 35]);
  para(`Observer (free) under HYPO 2 + Toolkit: +$${(HYPO1_OBSERVER_ADREV + TOOL_USE_ADREV_OBSERVER + TOOL_SAVE_ADREV_OBSERVER - TOOL_SAVE_COST_OBSERVER).toFixed(2)}/mo net ad revenue per user at zero credit cost. Trailblazer unchanged from HYPO 2 (all 12 tools included): $${hypo2ToolkitTrail.profit.toFixed(2)} profit / ${hypo2ToolkitTrail.margin.toFixed(1)}% margin over 30 months.`);
  para(`12e. Verdict: The toolkit AdGate adds +$${(hypo2ToolkitMature.profit - hypo2Mature.profit).toFixed(0)}/mo at mature scale with near-zero risk. Device-only tools cost 0 credits (ad revenue is nearly pure profit). Save-gate is pre-paid by ad revenue (every save nets +$${(ADMOB_REWARDED_PER_IMPRESSION - UPLOAD_CREDITS_PER_SAVE * COST_PER_CREDIT).toFixed(3)}). No Base44 tier change. Improves free-tier value (6 tools via ad, was 2). Combined HYPO 2 + Toolkit: $${hypo2ToolkitMature.profit.toFixed(0)}/mo profit at ${hypo2ToolkitMature.margin.toFixed(1)}% margin — more than double the baseline's $${baselineMature.profit.toFixed(0)}/mo (${baselineMature.margin.toFixed(1)}%).`);

  heading('13. HYPO 2 + Toolkit AdGate — Revenue Scenarios (Monthly, 70% Utilization)');
  para('Same 4 scenarios as section 9, but under HYPO 2 (narration credit halving + Observer narration ads) + the proposed toolkit AdMob gating (device-tool use-time ads + Observer save-gate). Weather Monitor is free Open-Meteo (0 credits). No code changes made — planning scenarios.');
  table(['Scenario', 'Sub Rev', 'Interstitial', 'Rewarded', 'Narr Ads', 'Toolkit Ads', 'Total Rev', 'Credits', 'B44 Plan', 'Total Cost', 'Profit', 'Δ vs Base', 'Margin'],
    hypo2ToolkitScenarios.map((s, i) => [s.label, '$' + s.subRev.toFixed(0), '$' + s.interstitialAdRev.toFixed(0), '$' + s.rewardedAdRev.toFixed(0), '$' + s.narrationAdRev.toFixed(0), '$' + s.toolkitAdRev.toFixed(0), '$' + s.totalRev.toFixed(0), s.totalCredits.toLocaleString(), s.base44Plan.plan + ' ($' + s.base44Plan.cost + ')', '$' + s.totalCost.toFixed(0), '$' + s.profit.toFixed(0), '+$' + (s.profit - scenarios[i].profit).toFixed(0), s.margin.toFixed(1) + '%']),
    [50, 30, 30, 25, 30, 30, 35, 40, 50, 35, 35, 30, 30]);
  para('"Δ vs Base" = profit difference vs the baseline scenario (section 9) at the same scale. Free (Observer) users generate ad revenue (interstitial + narration + toolkit) but consume 0 credits. HYPO 2 halves narration credits vs baseline, dropping most scenarios a Base44 tier.');
  para('13a. Base44 Plan Required Per Scenario:');
  table(['Scenario', 'Sub Credits', 'Ad-Reward Cr', 'Total Credits', 'B44 Plan', 'Plan $/mo'],
    hypo2ToolkitScenarios.map(s => [s.label, (s.totalCredits - s.rewardedAdCredits).toLocaleString(), s.rewardedAdCredits.toLocaleString(), s.totalCredits.toLocaleString(), s.base44Plan.plan, '$' + s.base44Plan.cost]),
    [85, 50, 50, 50, 60, 45]);
  para('Device-only toolkit tools add 0 credits — the plan tier is driven by narration (halved by HYPO 2) + manifestation + ad-reward energy. HYPO 2 halves narration credits vs baseline, dropping the Base44 plan tier at every scale vs section 9a. The toolkit AdGate adds pure ad revenue without adding any credits.');

  heading('10. Key Takeaways');
  para('CREDIT CAPACITY: Builder plan (10k credits) supports only ~19 Explorer / ~6 Investigator / ~6 Trailblazer users at 100% utilization. Pro (20k) doubles that. Seeker and Technician users consume 0 AI credits (0 energy) — they do NOT count against credit capacity. Free (Observer) users are gated (0 credits). Must upgrade plans to scale AI features only.');
  para('NEW HIGH-MARGIN TIERS (Oct 2026): Seeker ($3.99/mo) and Technician ($5.99/mo) have 0 AI energy — they consume 0 platform credits. Their only cost is the 15% store fee. Seeker nets ~$3.39/mo, Technician ~$5.09/mo per user. These tiers capture ad-averse users who don\'t need AI features, adding high-margin revenue that subsidizes the credit-consuming Explorer+ tiers. Revenue scenarios now model a realistic mix: ~30% Seeker, ~20% Technician, ~30% Explorer, ~15% Investigator, ~5% Trailblazer.');
  para(`Store fees (15% IAP) are the largest non-platform cost — significantly higher than traditional payment processing (2.9% + $0.30). The app publishes natively via Apple/Google IAP.`);
  para(`Full narration cost: ~${FULL_TOUR_NARRATION_CREDITS} credits/tour = $${(FULL_TOUR_NARRATION_CREDITS * COST_PER_CREDIT).toFixed(2)}/tour. Explorer ~${TOURS_PER_ENERGY(500)} tour/mo, Investigator ~${TOURS_PER_ENERGY(1500)} tours/mo, Trailblazer ~${TOURS_PER_ENERGY(1500)} tours/mo.`);
  para(`Seeker yields ~${monthlyAnalysis[0].margin.toFixed(0)}% margin (0 platform credits — only 15% store fee). Technician ~${monthlyAnalysis[1].margin.toFixed(0)}%. Explorer ~${monthlyAnalysis[2].margin.toFixed(0)}% margin at full utilization; Investigator ~${monthlyAnalysis[3].margin.toFixed(0)}%. Seeker and Technician are the highest-margin tiers (0 AI energy = 0 platform cost). Both healthier when energy goes unused.`);
  para(`Trailblazer is profitable at 100% utilization (~${trailblazerAnalysis.margin.toFixed(0)}% margin = $${trailblazerAnalysis.profit.toFixed(0)} profit over 30 months). At 50% realistic usage, margin improves to ~${trailblazer50.margin.toFixed(0)}%. The 300-slot cap protects against credit cost exposure.`);
  para('AdMob interstitial revenue from free users meaningfully supplements subscription income — 5,000 free users generate ~$' + (5000 * AD_REV_PER_FREE_USER_MO).toFixed(0) + '/mo, offsetting platform and store costs.');
  para(`Rewarded ads (paid users) generate ~$${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in ad revenue, but granted energy costs ~$${AD_REWARD_COST_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in platform credits when consumed (net ~$${AD_REWARD_NET_PER_PAID_USER_MO.toFixed(2)}/paid user/mo). This is a retention investment, not a profit center — it keeps paid users engaged at energy gates. Ad-reward credits are included in the Base44 plan-tier calculation (section 9a).`);
  para('Fixed costs (~$' + fixedOngoingMonthly.toFixed(0) + '/mo ongoing) are negligible at scale but matter for small operations. First-year total: $' + fixedFirstYearTotal + ' (includes $' + DEV_UPFRONT_ONE_TIME + ' CatDoes upfront). Base44 plan costs are now shown as actual tier costs in section 9, not per-credit estimates.');
  para(`RevenueCat 1% above $2,500/mo is minimal vs. store fees — only ~$${revenuecatFee(7104).toFixed(0)}/mo at the Mature scenario.`);
  para(`RISK: Apple fee jumps to 30% above $${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr revenue. At that rate, Trailblazer becomes a small loss at 100% utilization (~-7% margin) but remains profitable at 50% realistic usage (~31% margin). Revisit pricing before crossing $${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M.`);
  para('Annual plans improve cash flow and reduce per-transaction store fee burden (one charge vs. twelve).');
  para('TOOLKIT VISIBILITY (Sept 2026): All 12 tools now visible to all users. Observer/Explorer see locked tools with upgrade prompts. Zero direct cost change — gating blocks consumption. Conversion funnel improvement: lower-tier users now see Term Sweeper, Alphabet Sweeper, Anomaly Camera, Vibration Communicator. See section 3e.');
  para('COMMUNITY MAP (Sept 2026): Author names resolve via backend function (no credit cost). Stacked markers grouped by coordinate. Sign-in simplified: Google/Apple OAuth removed — email/password only.');
  para(`TWO-PASS ENRICHMENT (Sept 2026): Single-site tours (landmark, ship, cold_spot) now run a second LLM pass (rewriteForStopFocus) to remove general property history and keep stop-specific content. This doubles the enrichment cost to ~${ENRICHMENT_CREDITS_SINGLE_SITE} credits for those tours. The user still pays 1 manifestation energy per stop — the extra cost is borne by the app owner. Blended average: ~${AVG_ENRICHMENT_CREDITS} credits/enrichment (was ${ENRICHMENT_CREDITS_MULTI_SITE}). Blended manifestation rate: ~${BLENDED_MANIFESTATION_CREDITS} credits/manifestation energy (was ${CREDITS_PER_MANIFESTATION}). One-time content_version upgrade: old tours regenerate at 2× cost when first opened by a paid user/admin — budget for a one-time credit spike when rolling out the new prompt.`);

  doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
  if (y > 760) { doc.addPage(); y = 50; }
  doc.text('AGES - Accessible Ghost Exploration Solutions  |  Confidential  |  ' + today, M, y + 20);

  doc.save('AGES-Plan-Analysis.pdf');
}

const th = 'text-left py-2 px-3 font-heading uppercase text-[11px] tracking-wider text-muted-foreground border-b border-border';
const td = 'py-2 px-3 text-sm border-b border-border/50';
const num = 'text-right tabular-nums';

export default function PlanAnalysis() {
  const [authState, setAuthState] = useState({ loading: true, isAdmin: false });

  useEffect(() => {
    base44.auth.me()
      .then((u) => setAuthState({ loading: false, isAdmin: u?.role === 'admin' }))
      .catch(() => setAuthState({ loading: false, isAdmin: false }));
  }, []);

  if (authState.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }
  if (!authState.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

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
            <Link
              to="/dashboard"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-foreground font-heading text-sm uppercase tracking-wider hover:bg-card/60 transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
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
            <p className="print-text"><span className="font-semibold">App Store / Google Play IAP fee:</span> {(STORE_FEE_PCT * 100).toFixed(0)}% of IAP revenue (both stores, small devs &lt; ${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr). Apple jumps to {(STORE_FEE_PCT_HIGH * 100).toFixed(0)}% above that; Google stays 15%. The app publishes natively via iOS/Android IAP.</p>
            <p className="print-text"><span className="font-semibold">RevenueCat:</span> {(REVENUECAT_FEE_PCT * 100).toFixed(0)}% of monthly subscription sales above ${REVENUECAT_THRESHOLD.toLocaleString()}/mo (IAP subscription management layer for iOS/Android)</p>
            <p className="print-text"><span className="font-semibold">Fixed costs:</span> Apple Developer ${APPLE_DEV_ANNUAL}/yr · Google Play ${GOOGLE_DEV_ONE_TIME} one-time · CatDoes ${DEV_UPFRONT_ONE_TIME} upfront (one-time, no profit share)</p>
            <p className="print-text text-xs italic"><span className="font-semibold">Note:</span> Base44 plan costs are shown as actual fixed monthly tier costs in section 9 (e.g. Builder $40/mo, Pro $80/mo, Elite $200/mo), determined by the total credits consumed. The per-credit rate (${COST_PER_CREDIT.toFixed(4)}/credit) is used only for per-plan and per-bundle profit analysis in sections 4–6.</p>
            <p className="print-text"><span className="font-semibold">AdMob:</span> ${ADMOB_ECPM}/1k interstitial impressions (eCPM). Free users see ads on stops 2+ (~{ADS_PER_TOUR} ads/tour × {TOURS_PER_FREE_USER_MO} tours/mo = ${AD_REV_PER_FREE_USER_MO.toFixed(3)}/free user/mo)</p>
            <p className="print-muted text-xs italic">Note: Credits are charged per action at runtime. Users who don't exhaust their monthly energy allotment cost less. Analysis shows 100% utilization (worst case) and 50–70% (realistic average).</p>
            <p className="print-text text-xs font-semibold text-green-500 mt-2">✓ Energy gating is now implemented. All actions below are gated — free (Observer) users are blocked, and paid users are limited by their monthly energy allotment. Costs shown reflect gated usage.</p>
            <p className="print-text text-xs mt-2"><span className="font-semibold text-amber-500">⚠ Two-Pass Stop Enrichment (Sept 2026):</span> Single-site tours (landmark, ship, cold_spot) now run a <span className="font-semibold">second LLM pass</span> (rewriteForStopFocus) to remove general property history and keep stop-specific content. This doubles the enrichment cost to ~{ENRICHMENT_CREDITS_SINGLE_SITE} credits for those tours (was {ENRICHMENT_CREDITS_MULTI_SITE}). Area/road_trip tours are unchanged (1 pass). <span className="font-semibold">The user still pays 1 manifestation energy per stop</span> — the extra cost is borne by the app owner. Blended average: ~{AVG_ENRICHMENT_CREDITS} credits/enrichment. Blended manifestation rate: ~{BLENDED_MANIFESTATION_CREDITS} credits/manifestation energy (was {CREDITS_PER_MANIFESTATION}). One-time content_version upgrade: old tours regenerate at 2× cost when first opened by a paid user/admin.</p>
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
                  const explorerCredits = 5 * BLENDED_MANIFESTATION_CREDITS + 500; // 520
                  const investigatorCredits = 15 * BLENDED_MANIFESTATION_CREDITS + 1500; // 1560
                  const trailblazerCredits = 15 * BLENDED_MANIFESTATION_CREDITS + 1500; // 1560 (same as Investigator)
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
              <p className="text-sm print-text mt-1">Builder (10k credits) supports: ~{Math.floor(10000 / ((5 * BLENDED_MANIFESTATION_CREDITS + 500) * 0.5))} Explorer, ~{Math.floor(10000 / ((15 * BLENDED_MANIFESTATION_CREDITS + 1500) * 0.5))} Investigator, ~{Math.floor(10000 / ((15 * BLENDED_MANIFESTATION_CREDITS + 1500) * 0.5))} Trailblazer users</p>
              <p className="text-sm print-text">Pro (20k credits) supports: ~{Math.floor(20000 / ((5 * BLENDED_MANIFESTATION_CREDITS + 500) * 0.5))} Explorer, ~{Math.floor(20000 / ((15 * BLENDED_MANIFESTATION_CREDITS + 1500) * 0.5))} Investigator, ~{Math.floor(20000 / ((15 * BLENDED_MANIFESTATION_CREDITS + 1500) * 0.5))} Trailblazer users</p>
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
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3b. Full Narration Cost Per Tour (All Tabs)</h2>
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

        {/* 3c. Credit Consumption Audit */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3c. Credit Consumption Audit — Every User Action</h2>
          <p className="text-xs print-muted mb-3">Complete inventory of every action that costs integration credits. "Gated = Yes" means the action is restricted by the energy system — free users are blocked, paid users are limited by their energy allotment. <span className="font-semibold text-green-500 print-text">All 12 toolkit tools are now visible to all users (Sept 2026)</span> — locked tools show an upgrade prompt instead of opening. See section 3e.</p>
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

        {/* 3e. Toolkit Visibility Change */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3e. Toolkit Visibility & AdGate (Oct 2026)</h2>
          <p className="text-xs print-muted mb-3">All 12 toolkit tools are visible to every user. <span className="font-semibold print-text">Observer (free)</span> gets 4 tools — 2 free (Equipment Guide, Safety Protocol) + 2 ad-gated (Audio Recorder, Radio Sweeper: 30s ad = 30s use, 300s/day cap per tool). <span className="font-semibold print-text">Seeker</span> gets the same 4 tools ad-free. <span className="font-semibold print-text">Technician & Explorer</span> get 10 of 12 tools. <span className="font-semibold print-text">Investigator+</span> get all 12. Tapping a locked tool shows an upgrade prompt. This is a <span className="font-semibold text-green-500 print-text">conversion funnel improvement</span> — energy gating still blocks credit consumption. Observer's ad-gated tools are device-only (0 integration credits), so the ad revenue is nearly pure profit.</p>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className={th}>Tier</th>
                  <th className={`${th} ${num}`}>Visible</th>
                  <th className={`${th} ${num}`}>Accessible</th>
                  <th className={`${th} ${num}`}>Locked</th>
                  <th className={th}>Accessible Tools</th>
                  <th className={th}>Locked Tools (Upgrade Prompt)</th>
                </tr>
              </thead>
              <tbody>
                {TOOLKIT_TIERS.map(t => (
                  <tr key={t.tier}>
                    <td className={`${td} font-semibold print-text`}>{t.tier}</td>
                    <td className={`${td} ${num} print-text`}>{t.visible}</td>
                    <td className={`${td} ${num} print-text`}>{t.accessible}</td>
                    <td className={`${td} ${num} print-text`}>{t.locked}</td>
                    <td className={`${td} text-xs print-muted`}>{t.accessibleTools}</td>
                    <td className={`${td} text-xs print-muted`}>{t.lockedTools}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 mt-4 print-text">Newly Visible Costly Tools (Previously Hidden from Observer/Explorer)</h3>
          <p className="text-xs print-muted mb-3">These 4 tools were previously invisible to Observer and Explorer users. They are now visible but gated — tapping them shows an upgrade prompt. Two of the four consume credits when used; the other two are sensor/camera-only (no credit cost).</p>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className={th}>Tool</th>
                  <th className={th}>Required Tier</th>
                  <th className={th}>Cost Type</th>
                  <th className={th}>Credits</th>
                  <th className={th}>Description</th>
                </tr>
              </thead>
              <tbody>
                {NEWLY_VISIBLE_COSTLY_TOOLS.map(t => (
                  <tr key={t.name}>
                    <td className={`${td} font-semibold print-text`}>{t.name}</td>
                    <td className={`${td} text-xs print-text`}>{t.tier}</td>
                    <td className={`${td} text-xs print-muted`}>{t.costType}</td>
                    <td className={`${td} text-xs print-text`}>{t.credits}</td>
                    <td className={`${td} text-xs print-muted`}>{t.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/30">
              <p className="text-[10px] font-heading uppercase tracking-wider text-green-500">Conversion Impact</p>
              <p className="text-xs print-text mt-1">Observer users who previously saw only 2 tools now see all 12 — including Term Sweeper and Alphabet Sweeper with live trigger voices. This creates a stronger "see what you're missing" upgrade incentive. Expected to increase Observer→Explorer and Explorer→Investigator conversion rates.</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/30">
              <p className="text-[10px] font-heading uppercase tracking-wider text-primary">Cost Impact</p>
              <p className="text-xs print-text mt-1"><span className="font-semibold">Zero direct cost change.</span> Gating still blocks unauthorized users from consuming credits. The only cost increase comes indirectly: if more users upgrade to use these tools, paid-user credit consumption rises proportionally — but so does subscription revenue. The net effect is positive: each upgraded user generates $7.99–$11.99/mo in revenue against ~$2–$4/mo in credit costs.</p>
            </div>
          </div>
          <p className="text-xs print-muted mt-2 italic">Term Sweeper is the most credit-intensive newly-visible tool: 3 credits (InvokeLLM) to build the location term bank + 1 credit per trigger voice (GenerateSpeech). A typical 15-minute session with 5 trigger events = 8 credits = $0.03. Alphabet Sweeper costs 1 credit per trigger voice only. Vibration Communicator and Anomaly Camera use phone sensors/camera with no LLM or speech credits.</p>
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
          <p className="text-xs print-muted mt-2 italic">Store fee (15%) applies to all IAP purchases. This is cheaper for small transactions (Flicker) than a flat $0.30 + 2.9% processing fee, but more expensive for larger ones.</p>
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
          <p className="text-xs print-muted mt-2 italic">Google Play's $25 is a one-time fee (not recurring). CatDoes charges ${DEV_UPFRONT_ONE_TIME} upfront (one-time, no profit share). Base44 plan costs are shown as actual tier costs in section 9, not listed here as fixed costs.</p>
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
                    <td className={`${td} ${num} print-text`}>${s.fixedCost.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>${s.totalCost.toFixed(0)}</td>
                    <td className={`${td} ${num} font-semibold print-text`}>${s.profit.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>{s.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mt-2 italic">Trailblazer revenue amortized over 30 months. 5:1 free-to-paid ratio assumed. "Base44 Plan" = actual monthly plan tier cost for paid-user credits (from section 9a). Ad revenue = interstitial (free users) + rewarded (paid users). Rewarded ad credits from consumed ad-reward energy are included in the Base44 plan-tier calculation. Free (Observer) users are gated and consume 0 credits. Store fees apply only to IAP subscription revenue, not AdMob. RevenueCat 1% applies above $2,500/mo in subscription sales. CatDoes is a one-time upfront fee (no profit share).</p>

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

        {/* 11. Device Narration Hypotheticals */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">11. Device Narration Hypotheticals (Oct 2026)</h2>
          <p className="text-xs print-muted mb-4">
            Narration is the single biggest platform cost (~{FULL_TOUR_NARRATION_CREDITS} credits per fully-narrated tour). Device Narration uses the device's built-in speechSynthesis — <span className="font-semibold text-green-500 print-text">0 GenerateSpeech credits</span>. Enhanced Narration uses server-side GenerateSpeech (1 credit/50 chars). An average tour has ~{NARRATION_OPPS_PER_TOUR} narration opportunities; a typical paid user narrates ~{NARRATION_OPPS_NARRATED} of them, while an Observer watches an ad before all ~{OBSERVER_NARRATION_ADS_PER_TOUR}. These 3 hypotheticals model offering device narration across all tiers with different AdMob gating strategies. <span className="font-semibold print-text">No code changes have been made — these are planning scenarios only.</span>
          </p>

          <div className="grid grid-cols-1 gap-3 mb-5">
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
              <p className="text-xs font-heading uppercase tracking-wider text-primary mb-1">HYPO 1 — Ad-Gated Device Narration</p>
              <p className="text-xs print-text"><span className="font-semibold">Observer:</span> AdMob ad before each narration (device voice, 0 credits). <span className="font-semibold">Explorer / Investigator / Trailblazer:</span> Enhanced narration until energy depleted, then ad-gated device narration. Paid users still consume their full enhanced energy allotment — device narration only extends access beyond depletion, adding ad revenue and improving retention without cutting credit costs.</p>
            </div>
            <div className="p-3 rounded-lg border border-accent/30 bg-accent/5">
              <p className="text-xs font-heading uppercase tracking-wider text-accent mb-1">HYPO 2 — Choice: Device (Ad) or Enhanced</p>
              <p className="text-xs print-text">HYPO 1 + paid tiers choose per-narration: watch an ad to use device narration OR spend enhanced energy. Modeled at ~50% device / 50% enhanced. <span className="font-semibold">Halves enhanced narration credits for paid users</span> — major cost savings — at the cost of ad friction on half of narrations.</p>
            </div>
            <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
              <p className="text-xs font-heading uppercase tracking-wider text-green-500 mb-1">HYPO 3 — Device Narration Only, No Enhanced</p>
              <p className="text-xs print-text">All plans use device narration exclusively. <span className="font-semibold">Zero narration credits for everyone</span> — only manifestation credits (tour generation, enrichment) are consumed. Observer still watches an ad before each narration; paid users see no narration ads. Lowest cost, but users lose the premium "storm" server voice and get device voices only.</p>
            </div>
          </div>

          {/* 11a. Per-plan comparison */}
          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 print-text">11a. Per-Plan Monthly Profit (100% Utilization)</h3>
          <p className="text-xs print-muted mb-3">Compares each hypothetical against the current baseline. "Nar Cr" = narration credits consumed. "Ad Rev" = ad revenue from narration gating. Net Cost = Platform + Store Fee − Ad Rev.</p>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr>
                  <th className={th}>Scenario</th>
                  <th className={th}>Plan</th>
                  <th className={`${th} ${num}`}>Price</th>
                  <th className={`${th} ${num}`}>Man Cr</th>
                  <th className={`${th} ${num}`}>Nar Cr</th>
                  <th className={`${th} ${num}`}>Total Cr</th>
                  <th className={`${th} ${num}`}>Platform</th>
                  <th className={`${th} ${num}`}>Store</th>
                  <th className={`${th} ${num}`}>Ad Rev</th>
                  <th className={`${th} ${num}`}>Net Cost</th>
                  <th className={`${th} ${num}`}>Profit</th>
                  <th className={`${th} ${num}`}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {monthlyAnalysis.map(r => (
                  <tr key={`base-${r.plan}`} className="bg-muted/20">
                    <td className={`${td} text-xs print-muted`}>Baseline</td>
                    <td className={`${td} text-xs font-semibold print-text`}>{r.plan}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${r.price.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{r.plan === 'Explorer' ? 5 : 15}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{r.plan === 'Explorer' ? 500 : 1500}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{r.credits}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${r.platformCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${r.sf.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-muted`}>—</td>
                    <td className={`${td} ${num} text-xs print-text`}>${r.totalCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs font-semibold print-text`}>${r.profit.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{r.margin.toFixed(1)}%</td>
                  </tr>
                ))}
                {hypo1Plans.filter(p => p.price > 0).map(p => (
                  <tr key={`h1-${p.plan}`} className="bg-primary/5">
                    <td className={`${td} text-xs text-primary print-text`}>HYPO 1</td>
                    <td className={`${td} text-xs font-semibold print-text`}>{p.plan}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.price.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.manE}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.narCredits}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.credits}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.platformCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.sf.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs text-green-500 print-text`}>${p.adRevMo.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.netCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs font-semibold print-text`}>${p.profit.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.margin.toFixed(1)}%</td>
                  </tr>
                ))}
                {hypo2Plans.filter(p => p.price > 0).map(p => (
                  <tr key={`h2-${p.plan}`} className="bg-accent/5">
                    <td className={`${td} text-xs text-accent print-text`}>HYPO 2</td>
                    <td className={`${td} text-xs font-semibold print-text`}>{p.plan}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.price.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.manE}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.narCredits}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.credits}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.platformCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.sf.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs text-green-500 print-text`}>${p.adRevMo.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.netCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs font-semibold print-text`}>${p.profit.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.margin.toFixed(1)}%</td>
                  </tr>
                ))}
                {hypo3Plans.filter(p => p.price > 0).map(p => (
                  <tr key={`h3-${p.plan}`} className="bg-green-500/5">
                    <td className={`${td} text-xs text-green-500 print-text`}>HYPO 3</td>
                    <td className={`${td} text-xs font-semibold print-text`}>{p.plan}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.price.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.manE}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.narCredits}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.credits}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.platformCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.sf.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-muted`}>—</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.netCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs font-semibold print-text`}>${p.profit.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mt-2 italic">Observer (free) rows omitted from the profit table (price $0). <span className="font-semibold print-text">All 3 hypotheticals retain the existing interstitial stop ad revenue</span> (~${AD_REV_PER_FREE_USER_MO.toFixed(2)}/free user/mo = ~${(5000 * AD_REV_PER_FREE_USER_MO).toFixed(0)}/mo at 5,000 free users — see the "Interstitial" column in 11c). <span className="font-semibold print-text">All 3 hypotheticals also add the same narration-gating ad revenue</span> (~${HYPO1_OBSERVER_ADREV.toFixed(2)}/free user/mo from ads before each device narration) — Observer's ad-gated device narration is identical across HYPO 1, 2 &amp; 3. The hypotheticals differ only on the PAID side (enhanced vs device credits).</p>

          {/* 11b. Trailblazer 30-month */}
          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 mt-6 print-text">11b. Trailblazer — 30-Month Lifetime ($239.99)</h3>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className={th}>Scenario</th>
                  <th className={`${th} ${num}`}>Credits (30 mo)</th>
                  <th className={`${th} ${num}`}>Platform</th>
                  <th className={`${th} ${num}`}>Store Fee</th>
                  <th className={`${th} ${num}`}>Ad Rev</th>
                  <th className={`${th} ${num}`}>Net Cost</th>
                  <th className={`${th} ${num}`}>Profit</th>
                  <th className={`${th} ${num}`}>Margin</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-muted/20">
                  <td className={`${td} text-xs font-semibold print-muted`}>Baseline (100%)</td>
                  <td className={`${td} ${num} text-xs print-text`}>{trailblazerAnalysis.credits.toLocaleString()}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${trailblazerAnalysis.platformCost.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${trailblazerAnalysis.sf.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>—</td>
                  <td className={`${td} ${num} text-xs print-text`}>${trailblazerAnalysis.totalCost.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${trailblazerAnalysis.profit.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{trailblazerAnalysis.margin.toFixed(1)}%</td>
                </tr>
                <tr className="bg-primary/5">
                  <td className={`${td} text-xs font-semibold text-primary print-text`}>HYPO 1</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo1Trail.credits.toLocaleString()}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo1Trail.platformCost.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo1Trail.sf.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs text-green-500 print-text`}>${hypo1Trail.adRev.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo1Trail.netCost.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo1Trail.profit.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo1Trail.margin.toFixed(1)}%</td>
                </tr>
                <tr className="bg-accent/5">
                  <td className={`${td} text-xs font-semibold text-accent print-text`}>HYPO 2</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo2Trail.credits.toLocaleString()}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo2Trail.platformCost.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo2Trail.sf.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs text-green-500 print-text`}>${hypo2Trail.adRev.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo2Trail.netCost.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo2Trail.profit.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo2Trail.margin.toFixed(1)}%</td>
                </tr>
                <tr className="bg-green-500/5">
                  <td className={`${td} text-xs font-semibold text-green-500 print-text`}>HYPO 3</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo3Trail.credits.toLocaleString()}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo3Trail.platformCost.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo3Trail.sf.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>$0.00</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo3Trail.netCost.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo3Trail.profit.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo3Trail.margin.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 11c. Mature revenue scenario */}
          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 mt-6 print-text">11c. Mature Revenue Scenario (1,000 paid / 5,000 free, 70% Utilization)</h3>
          <p className="text-xs print-muted mb-3">Keeps the existing rewarded-ad energy top-up system (consistent with section 9's Mature row) — the baseline here now matches section 9. "Rewarded" = paid-user rewarded-ad top-up revenue. "Narration Ads" = the new narration-gating ad revenue (Observer device-narration ads + paid post-depletion/choice ads), additive on top of the rewarded top-up.</p>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr>
                  <th className={th}>Scenario</th>
                  <th className={`${th} ${num}`}>Sub Rev</th>
                  <th className={`${th} ${num}`}>Interstitial</th>
                  <th className={`${th} ${num}`}>Rewarded</th>
                  <th className={`${th} ${num}`}>Narration Ads</th>
                  <th className={`${th} ${num}`}>Total Rev</th>
                  <th className={`${th} ${num}`}>Credits</th>
                  <th className={th}>B44 Plan</th>
                  <th className={`${th} ${num}`}>Total Cost</th>
                  <th className={`${th} ${num}`}>Profit</th>
                  <th className={`${th} ${num}`}>Margin</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-muted/20">
                  <td className={`${td} text-xs font-semibold print-muted`}>Baseline</td>
                  <td className={`${td} ${num} text-xs print-text`}>${baselineMature.subRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${baselineMature.interstitialAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${baselineMature.rewardedAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>$0</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${baselineMature.totalRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{baselineMature.totalCredits.toLocaleString()}</td>
                  <td className={`${td} text-xs print-text`}>{baselineMature.base44Plan.plan}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${baselineMature.totalCost.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${baselineMature.profit.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{baselineMature.margin.toFixed(1)}%</td>
                </tr>
                <tr className="bg-primary/5">
                  <td className={`${td} text-xs font-semibold text-primary print-text`}>HYPO 1</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo1Mature.subRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${hypo1Mature.interstitialAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${hypo1Mature.rewardedAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs text-green-500 print-text`}>${hypo1Mature.narrationAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo1Mature.totalRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo1Mature.totalCredits.toLocaleString()}</td>
                  <td className={`${td} text-xs print-text`}>{hypo1Mature.base44Plan.plan}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo1Mature.totalCost.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo1Mature.profit.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo1Mature.margin.toFixed(1)}%</td>
                </tr>
                <tr className="bg-accent/5">
                  <td className={`${td} text-xs font-semibold text-accent print-text`}>HYPO 2</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo2Mature.subRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${hypo2Mature.interstitialAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${hypo2Mature.rewardedAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs text-green-500 print-text`}>${hypo2Mature.narrationAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo2Mature.totalRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo2Mature.totalCredits.toLocaleString()}</td>
                  <td className={`${td} text-xs print-text`}>{hypo2Mature.base44Plan.plan}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo2Mature.totalCost.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo2Mature.profit.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo2Mature.margin.toFixed(1)}%</td>
                </tr>
                <tr className="bg-green-500/5">
                  <td className={`${td} text-xs font-semibold text-green-500 print-text`}>HYPO 3</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo3Mature.subRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${hypo3Mature.interstitialAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${hypo3Mature.rewardedAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs text-green-500 print-text`}>${hypo3Mature.narrationAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo3Mature.totalRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo3Mature.totalCredits.toLocaleString()}</td>
                  <td className={`${td} text-xs print-text`}>{hypo3Mature.base44Plan.plan}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo3Mature.totalCost.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo3Mature.profit.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo3Mature.margin.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs print-muted mt-2 italic">
            <span className="font-semibold print-text">Where the Observer narration ad revenue is:</span> the "Narration Ads" column. Observer math: {OBSERVER_NARRATION_ADS_PER_TOUR} ads/tour × {TOURS_PER_FREE_USER_HYPO} tours/mo × ${NARRATION_AD_INTERSTITIAL.toFixed(3)} = ${HYPO1_OBSERVER_ADREV.toFixed(2)}/free user/mo × 5,000 free users = <span className="font-semibold text-green-500 print-text">${(5000 * HYPO1_OBSERVER_ADREV).toLocaleString()}/mo</span>. HYPO 3 shows exactly that amount (paid users add no ads there); HYPO 1 and 2 show it plus paid-user ad revenue. Baseline has none because free users can't narrate.
          </p>

          {/* 11d. Savings summary cards */}
          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 mt-6 print-text">11d. Narration Credit Savings Summary (per user / month)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
              <p className="text-[10px] font-heading uppercase tracking-wider text-primary">HYPO 1 — Ad Revenue Only</p>
              <p className="text-xs print-text mt-1">Paid users keep full enhanced energy (no credit savings). Observer gains ~${HYPO1_OBSERVER_ADREV.toFixed(2)}/mo ad rev. Mature scenario: <span className="font-semibold text-green-500 print-text">+${(hypo1Mature.profit - baselineMature.profit).toFixed(0)}/mo</span> vs baseline.</p>
            </div>
            <div className="p-3 rounded-lg border border-accent/30 bg-accent/5">
              <p className="text-[10px] font-heading uppercase tracking-wider text-accent">HYPO 2 — 50% Credit Cut + Ads</p>
              <p className="text-xs print-text mt-1">Explorer saves 250 nar credits (${(250 * COST_PER_CREDIT).toFixed(2)}/mo). Investigator saves 750 (${(750 * COST_PER_CREDIT).toFixed(2)}/mo). Mature: <span className="font-semibold text-green-500 print-text">+${(hypo2Mature.profit - baselineMature.profit).toFixed(0)}/mo</span>.</p>
            </div>
            <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
              <p className="text-[10px] font-heading uppercase tracking-wider text-green-500">HYPO 3 — Zero Narration Credits</p>
              <p className="text-xs print-text mt-1">Explorer saves 500 nar credits (${(500 * COST_PER_CREDIT).toFixed(2)}/mo). Investigator saves 1500 (${(1500 * COST_PER_CREDIT).toFixed(2)}/mo). Observer still watches ~{OBSERVER_NARRATION_ADS_PER_TOUR} ads/tour for device narration — <span className="font-semibold text-green-500 print-text">~${HYPO1_OBSERVER_ADREV.toFixed(2)}/free user/mo</span> (≈ ${(5000 * HYPO1_OBSERVER_ADREV).toLocaleString()}/mo at 5,000 free users, same as HYPO 1/2). Mature: <span className="font-semibold text-green-500 print-text">+${(hypo3Mature.profit - baselineMature.profit).toFixed(0)}/mo</span>. But paid users lose the premium voice.</p>
            </div>
          </div>
          <p className="text-xs print-muted mt-3 italic">Trade-off: HYPO 3 maximizes profit but weakens the value prop (device voices only — quality varies by device and lacks the premium "storm" narrator). HYPO 2 balances savings with user choice. HYPO 1 improves retention without changing the core narration experience. All three assume the device-narration test on the Eisenhower Farm tour proves viable on real devices before rollout.</p>
        </section>

        {/* 12. HYPO 2 + Toolkit AdGate Combined Analysis */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">12. HYPO 2 + Toolkit AdGate — Combined Cost/Profit Analysis (Oct 2026)</h2>
          <p className="text-xs print-muted mb-4">
            This section combines the chosen narration hypothetical (<span className="font-semibold text-accent print-text">HYPO 2</span> — paid users choose device-ad or enhanced, ~50/50) with the <span className="font-semibold print-text">proposed toolkit AdMob gating change</span> (6 ad-gatable device tools for Observer, 3 for Explorer; save-gate for Observer). Both are <span className="font-semibold print-text">planning scenarios — no code changes have been made yet.</span> Weather Monitor also moves from a 3-credit LLM call to free Open-Meteo (0 credits, no gate).
          </p>

          {/* 12a. Toolkit AdGate model */}
          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 print-text">12a. Toolkit AdGate Model</h3>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto mb-4">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className={th}>Tier</th>
                  <th className={th}>Ad-Gatable Tools</th>
                  <th className={`${th} ${num}`}>Use Ads/mo</th>
                  <th className={`${th} ${num}`}>Ad Rev/mo</th>
                  <th className={`${th} ${num}`}>Save-Gate</th>
                  <th className={`${th} ${num}`}>Save Rev/mo</th>
                  <th className={`${th} ${num}`}>Save Cost/mo</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={`${td} font-semibold print-text`}>Observer (Free)</td>
                  <td className={`${td} text-xs print-muted`}>6 (Radio, Audio, Alphabet, Yes/No, Vibration, Anomaly Cam)</td>
                  <td className={`${td} ${num} text-xs print-text`}>~10</td>
                  <td className={`${td} ${num} text-xs print-text`}>${TOOL_USE_ADREV_OBSERVER.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>~3 saves</td>
                  <td className={`${td} ${num} text-xs print-text`}>${TOOL_SAVE_ADREV_OBSERVER.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${TOOL_SAVE_COST_OBSERVER.toFixed(3)}</td>
                </tr>
                <tr>
                  <td className={`${td} font-semibold print-text`}>Explorer ($7.99)</td>
                  <td className={`${td} text-xs print-muted`}>3 (Alphabet, Vibration, Anomaly Cam)</td>
                  <td className={`${td} ${num} text-xs print-text`}>~5</td>
                  <td className={`${td} ${num} text-xs print-text`}>${TOOL_USE_ADREV_EXPLORER.toFixed(2)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>— (has plan credits)</td>
                  <td className={`${td} ${num} text-xs print-muted`}>—</td>
                  <td className={`${td} ${num} text-xs print-muted`}>—</td>
                </tr>
                <tr>
                  <td className={`${td} font-semibold print-text`}>Investigator / Trailblazer</td>
                  <td className={`${td} text-xs print-muted`}>0 (all 12 tools included)</td>
                  <td className={`${td} ${num} text-xs print-muted`}>—</td>
                  <td className={`${td} ${num} text-xs print-muted`}>—</td>
                  <td className={`${td} ${num} text-xs print-muted`}>—</td>
                  <td className={`${td} ${num} text-xs print-muted`}>—</td>
                  <td className={`${td} ${num} text-xs print-muted`}>—</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mb-4 italic">Device-only tools (Radio, Audio, Alphabet, Yes/No, Vibration, Anomaly Cam) cost <span className="font-semibold print-text">0 integration credits</span> — no LLM, no GenerateSpeech. Term Sweeper stays paid-only (generative: 3 credits + 1/trigger). Save-gate math: each save ad earns ${ADMOB_REWARDED_PER_IMPRESSION.toFixed(3)}, each save costs {UPLOAD_CREDITS_PER_SAVE} credit × ${COST_PER_CREDIT.toFixed(4)} = ${(UPLOAD_CREDITS_PER_SAVE * COST_PER_CREDIT).toFixed(3)} — <span className="font-semibold text-green-500 print-text">every save nets +${(ADMOB_REWARDED_PER_IMPRESSION - UPLOAD_CREDITS_PER_SAVE * COST_PER_CREDIT).toFixed(3)}</span>. Weather Monitor moves to free Open-Meteo (0 credits) — no cost-model change (energy allotment is fixed), but Weather becomes free for all users (was Explorer+ perk).</p>

          {/* 12b. Mature scenario comparison */}
          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 print-text">12b. Mature Scenario (1,000 paid / 5,000 free, 70% Utilization)</h3>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto mb-3">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr>
                  <th className={th}>Scenario</th>
                  <th className={`${th} ${num}`}>Sub Rev</th>
                  <th className={`${th} ${num}`}>Interstitial</th>
                  <th className={`${th} ${num}`}>Rewarded</th>
                  <th className={`${th} ${num}`}>Narration Ads</th>
                  <th className={`${th} ${num}`}>Toolkit Ads</th>
                  <th className={`${th} ${num}`}>Save Cost</th>
                  <th className={`${th} ${num}`}>Total Rev</th>
                  <th className={`${th} ${num}`}>Credits</th>
                  <th className={th}>B44 Plan</th>
                  <th className={`${th} ${num}`}>Total Cost</th>
                  <th className={`${th} ${num}`}>Profit</th>
                  <th className={`${th} ${num}`}>Margin</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-muted/20">
                  <td className={`${td} text-xs font-semibold print-muted`}>Baseline (current)</td>
                  <td className={`${td} ${num} text-xs print-text`}>${baselineMature.subRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${baselineMature.interstitialAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${baselineMature.rewardedAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>$0</td>
                  <td className={`${td} ${num} text-xs print-muted`}>—</td>
                  <td className={`${td} ${num} text-xs print-muted`}>—</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${baselineMature.totalRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{baselineMature.totalCredits.toLocaleString()}</td>
                  <td className={`${td} text-xs print-text`}>{baselineMature.base44Plan.plan} (${baselineMature.base44Plan.cost})</td>
                  <td className={`${td} ${num} text-xs print-text`}>${baselineMature.totalCost.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${baselineMature.profit.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{baselineMature.margin.toFixed(1)}%</td>
                </tr>
                <tr className="bg-accent/5">
                  <td className={`${td} text-xs font-semibold text-accent print-text`}>HYPO 2 (narration only)</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo2Mature.subRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${hypo2Mature.interstitialAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${hypo2Mature.rewardedAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs text-green-500 print-text`}>${hypo2Mature.narrationAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>—</td>
                  <td className={`${td} ${num} text-xs print-muted`}>—</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo2Mature.totalRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo2Mature.totalCredits.toLocaleString()}</td>
                  <td className={`${td} text-xs print-text`}>{hypo2Mature.base44Plan.plan} (${hypo2Mature.base44Plan.cost})</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo2Mature.totalCost.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo2Mature.profit.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo2Mature.margin.toFixed(1)}%</td>
                </tr>
                <tr className="bg-green-500/5">
                  <td className={`${td} text-xs font-semibold text-green-500 print-text`}>HYPO 2 + Toolkit AdGate</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo2ToolkitMature.subRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${hypo2ToolkitMature.interstitialAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-muted`}>${hypo2ToolkitMature.rewardedAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs text-green-500 print-text`}>${hypo2ToolkitMature.narrationAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs text-green-500 print-text`}>${hypo2ToolkitMature.toolkitAdRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo2ToolkitMature.toolkitSaveCost.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo2ToolkitMature.totalRev.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo2ToolkitMature.totalCredits.toLocaleString()}</td>
                  <td className={`${td} text-xs print-text`}>{hypo2ToolkitMature.base44Plan.plan} (${hypo2ToolkitMature.base44Plan.cost})</td>
                  <td className={`${td} ${num} text-xs print-text`}>${hypo2ToolkitMature.totalCost.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs font-semibold print-text`}>${hypo2ToolkitMature.profit.toFixed(0)}</td>
                  <td className={`${td} ${num} text-xs print-text`}>{hypo2ToolkitMature.margin.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 12c. Deltas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-lg border border-accent/30 bg-accent/5">
              <p className="text-[10px] font-heading uppercase tracking-wider text-accent">HYPO 2 vs Baseline</p>
              <p className="text-lg font-bold text-green-500 print-text mt-1">+${(hypo2Mature.profit - baselineMature.profit).toFixed(0)}/mo</p>
              <p className="text-[10px] print-muted">Narration credit halving + Observer narration ads. Drops Base44 from {baselineMature.base44Plan.plan} (${baselineMature.base44Plan.cost}) to {hypo2Mature.base44Plan.plan} (${hypo2Mature.base44Plan.cost}) — −${(baselineMature.base44Plan.cost - hypo2Mature.base44Plan.cost).toFixed(0)}/mo platform.</p>
            </div>
            <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
              <p className="text-[10px] font-heading uppercase tracking-wider text-green-500">Toolkit vs HYPO 2</p>
              <p className="text-lg font-bold text-green-500 print-text mt-1">+${(hypo2ToolkitMature.profit - hypo2Mature.profit).toFixed(0)}/mo</p>
              <p className="text-[10px] print-muted">Pure ad revenue from device-only tools (0 credits) + save-gate (pre-paid by ads). No Base44 tier change.</p>
            </div>
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5">
              <p className="text-[10px] font-heading uppercase tracking-wider text-primary">Total vs Baseline</p>
              <p className="text-lg font-bold text-green-500 print-text mt-1">+${(hypo2ToolkitMature.profit - baselineMature.profit).toFixed(0)}/mo</p>
              <p className="text-[10px] print-muted">Combined HYPO 2 + Toolkit. More than doubles baseline profit ({baselineMature.margin.toFixed(0)}% → {hypo2ToolkitMature.margin.toFixed(0)}% margin).</p>
            </div>
          </div>

          {/* 12d. Per-plan */}
          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 print-text">12d. Per-Plan Monthly Profit (100% Utilization)</h3>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto mb-3">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr>
                  <th className={th}>Scenario</th>
                  <th className={th}>Plan</th>
                  <th className={`${th} ${num}`}>Price</th>
                  <th className={`${th} ${num}`}>Nar Cr</th>
                  <th className={`${th} ${num}`}>Platform</th>
                  <th className={`${th} ${num}`}>Store</th>
                  <th className={`${th} ${num}`}>Ad Rev</th>
                  <th className={`${th} ${num}`}>Save Cost</th>
                  <th className={`${th} ${num}`}>Net Cost</th>
                  <th className={`${th} ${num}`}>Profit</th>
                  <th className={`${th} ${num}`}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {monthlyAnalysis.map(r => (
                  <tr key={`b12-${r.plan}`} className="bg-muted/20">
                    <td className={`${td} text-xs print-muted`}>Baseline</td>
                    <td className={`${td} text-xs font-semibold print-text`}>{r.plan}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${r.price.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{r.plan === 'Explorer' ? 500 : 1500}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${r.platformCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${r.sf.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-muted`}>—</td>
                    <td className={`${td} ${num} text-xs print-muted`}>—</td>
                    <td className={`${td} ${num} text-xs print-text`}>${r.totalCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs font-semibold print-text`}>${r.profit.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{r.margin.toFixed(1)}%</td>
                  </tr>
                ))}
                {hypo2Plans.filter(p => p.price > 0).map(p => (
                  <tr key={`h2d-${p.plan}`} className="bg-accent/5">
                    <td className={`${td} text-xs text-accent print-text`}>HYPO 2</td>
                    <td className={`${td} text-xs font-semibold print-text`}>{p.plan}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.price.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.narCredits}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.platformCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.sf.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs text-green-500 print-text`}>${p.adRevMo.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-muted`}>—</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.netCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs font-semibold print-text`}>${p.profit.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.margin.toFixed(1)}%</td>
                  </tr>
                ))}
                {hypo2ToolkitPlans.map(p => (
                  <tr key={`h2tk-${p.plan}`} className="bg-green-500/5">
                    <td className={`${td} text-xs text-green-500 print-text`}>HYPO 2 + Toolkit</td>
                    <td className={`${td} text-xs font-semibold print-text`}>{p.plan}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.price.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.narCredits}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.platformCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.sf.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs text-green-500 print-text`}>${p.adRevMo.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.saveCost.toFixed(3)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${p.netCost.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs font-semibold print-text`}>{p.profit.toFixed(2)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{p.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mb-4 italic">Observer (free) under HYPO 2 + Toolkit generates <span className="font-semibold text-green-500 print-text">+${(HYPO1_OBSERVER_ADREV + TOOL_USE_ADREV_OBSERVER + TOOL_SAVE_ADREV_OBSERVER - TOOL_SAVE_COST_OBSERVER).toFixed(2)}/mo</span> in net ad revenue per user (narration ads + toolkit use-time + save-gate − save upload cost) at zero credit cost. Trailblazer is unchanged from HYPO 2 (all 12 tools included — no ad-gate, no save cost): ${hypo2ToolkitTrail.profit.toFixed(2)} profit / {hypo2ToolkitTrail.margin.toFixed(1)}% margin over 30 months.</p>

          {/* 12e. Verdict */}
          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 print-text">12e. Verdict — Is the Toolkit Change Worth Making?</h3>
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-2">
            <p className="text-sm font-semibold text-green-500 print-text">Yes — the toolkit AdGate adds +${(hypo2ToolkitMature.profit - hypo2Mature.profit).toFixed(0)}/mo at mature scale with near-zero risk.</p>
            <p className="text-xs print-text">• <span className="font-semibold">Device-only tools cost zero credits</span> (no LLM, no GenerateSpeech) — the ad revenue is nearly pure profit.</p>
            <p className="text-xs print-text">• <span className="font-semibold">Save-gate is pre-paid by ad revenue</span> — every save nets +${(ADMOB_REWARDED_PER_IMPRESSION - UPLOAD_CREDITS_PER_SAVE * COST_PER_CREDIT).toFixed(3)} (ad earns ${ADMOB_REWARDED_PER_IMPRESSION.toFixed(3)}, upload costs ${(UPLOAD_CREDITS_PER_SAVE * COST_PER_CREDIT).toFixed(3)}). You never spend more than the ad earned.</p>
            <p className="text-xs print-text">• <span className="font-semibold">No Base44 plan tier change</span> — credits are identical to HYPO 2 alone (device tools = 0 credits).</p>
            <p className="text-xs print-text">• <span className="font-semibold">Improves free-tier value</span> — Observers gain access to 6 tools (was 2) via ad-watching, strengthening the conversion funnel without giving away credit-consuming features.</p>
            <p className="text-xs print-text">• <span className="font-semibold">Weather Monitor</span> moves to free Open-Meteo (0 credits) — no cost-model change, but Weather becomes free for all users (was Explorer+ perk), improving the free experience.</p>
            <p className="text-xs print-text mt-2"><span className="font-semibold">Combined HYPO 2 + Toolkit:</span> ${hypo2ToolkitMature.profit.toFixed(0)}/mo profit at {hypo2ToolkitMature.margin.toFixed(1)}% margin — more than double the baseline's ${baselineMature.profit.toFixed(0)}/mo ({baselineMature.margin.toFixed(1)}%). The biggest single lever is HYPO 2's narration credit halving (drops Base44 ${baselineMature.base44Plan.cost}→${hypo2Mature.base44Plan.cost}/mo, −${(baselineMature.base44Plan.cost - hypo2Mature.base44Plan.cost).toFixed(0)}/mo); the toolkit change stacks cleanly on top for another +${(hypo2ToolkitMature.profit - hypo2Mature.profit).toFixed(0)}/mo of pure ad revenue.</p>
          </div>
        </section>

        {/* 13. HYPO 2 + Toolkit AdGate Revenue Scenarios */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">13. HYPO 2 + Toolkit AdGate — Revenue Scenarios (Monthly, 70% Utilization)</h2>
          <p className="text-xs print-muted mb-3">Same 4 scenarios as section 9, but under HYPO 2 (narration credit halving + Observer narration ads) + the proposed toolkit AdMob gating (device-tool use-time ads + Observer save-gate). Weather Monitor is free Open-Meteo (0 credits). <span className="font-semibold print-text">No code changes made — planning scenarios.</span></p>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr>
                  <th className={th}>Scenario</th>
                  <th className={`${th} ${num}`}>Sub Rev</th>
                  <th className={`${th} ${num}`}>Interstitial</th>
                  <th className={`${th} ${num}`}>Rewarded</th>
                  <th className={`${th} ${num}`}>Narr Ads</th>
                  <th className={`${th} ${num}`}>Toolkit Ads</th>
                  <th className={`${th} ${num}`}>Total Rev</th>
                  <th className={`${th} ${num}`}>Credits</th>
                  <th className={th}>B44 Plan</th>
                  <th className={`${th} ${num}`}>Total Cost</th>
                  <th className={`${th} ${num}`}>Profit</th>
                  <th className={`${th} ${num}`}>Δ vs Base</th>
                  <th className={`${th} ${num}`}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {hypo2ToolkitScenarios.map((s, i) => (
                  <tr key={s.label} className="bg-green-500/5">
                    <td className={`${td} text-xs font-semibold text-green-500 print-text whitespace-nowrap`}>{s.label}</td>
                    <td className={`${td} ${num} text-xs print-text`}>${s.subRev.toFixed(0)}</td>
                    <td className={`${td} ${num} text-xs print-muted`}>${s.interstitialAdRev.toFixed(0)}</td>
                    <td className={`${td} ${num} text-xs print-muted`}>${s.rewardedAdRev.toFixed(0)}</td>
                    <td className={`${td} ${num} text-xs text-green-500 print-text`}>${s.narrationAdRev.toFixed(0)}</td>
                    <td className={`${td} ${num} text-xs text-green-500 print-text`}>${s.toolkitAdRev.toFixed(0)}</td>
                    <td className={`${td} ${num} text-xs font-semibold print-text`}>${s.totalRev.toFixed(0)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{s.totalCredits.toLocaleString()}</td>
                    <td className={`${td} text-xs print-text`}>{s.base44Plan.plan} (${s.base44Plan.cost})</td>
                    <td className={`${td} ${num} text-xs print-text`}>${s.totalCost.toFixed(0)}</td>
                    <td className={`${td} ${num} text-xs font-semibold print-text`}>${s.profit.toFixed(0)}</td>
                    <td className={`${td} ${num} text-xs text-green-500 print-text`}>+${(s.profit - scenarios[i].profit).toFixed(0)}</td>
                    <td className={`${td} ${num} text-xs print-text`}>{s.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mt-2 italic">Trailblazer revenue amortized over 30 months. 5:1 free-to-paid ratio. "Δ vs Base" = profit difference vs the baseline scenario (section 9) at the same scale. Free (Observer) users generate ad revenue (interstitial + narration + toolkit) but consume 0 credits. HYPO 2 halves narration credits vs baseline, dropping most scenarios a Base44 tier.</p>

          {/* 13a. Base44 Plan Required */}
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <h3 className="font-heading text-sm font-semibold text-foreground mb-3 print-text">13a. Base44 Plan Required Per Scenario</h3>
            <p className="text-xs print-muted mb-3">Total monthly integration credits (paid-user credits at 70% util + ad-reward energy credits) and the minimum Base44 plan. Device-only toolkit tools add 0 credits — the plan tier is driven by narration (halved by HYPO 2) + manifestation + ad-reward energy.</p>
            <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr>
                    <th className={th}>Scenario</th>
                    <th className={`${th} ${num}`}>Sub Credits</th>
                    <th className={`${th} ${num}`}>Ad-Reward Cr</th>
                    <th className={`${th} ${num}`}>Total Credits</th>
                    <th className={th}>Base44 Plan</th>
                    <th className={`${th} ${num}`}>Plan Cost/mo</th>
                  </tr>
                </thead>
                <tbody>
                  {hypo2ToolkitScenarios.map(s => (
                    <tr key={s.label}>
                      <td className={`${td} font-semibold print-text whitespace-nowrap`}>{s.label}</td>
                      <td className={`${td} ${num} print-text`}>{(s.totalCredits - s.rewardedAdCredits).toLocaleString()}</td>
                      <td className={`${td} ${num} print-muted`}>{s.rewardedAdCredits.toLocaleString()}</td>
                      <td className={`${td} ${num} font-semibold print-text`}>{s.totalCredits.toLocaleString()}</td>
                      <td className={`${td} print-text`}><span className="font-semibold">{s.base44Plan.plan}</span></td>
                      <td className={`${td} ${num} print-text`}>${s.base44Plan.cost}/mo</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-green-500 print-text mt-3">✓ HYPO 2 halves narration credits, dropping the Base44 plan tier at every scale vs baseline (section 9a). The toolkit AdGate adds pure ad revenue without adding any credits (device-only tools = 0 credits).</p>
          </div>
        </section>

        {/* 10. Key Takeaways */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">10. Key Takeaways</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block p-4 space-y-2 text-sm print-text">
            <p>• <span className="font-semibold text-red-500">✓ CREDIT CAPACITY: Base44 Builder plan includes only 10,000 credits/mo.</span> At 100% utilization that supports just ~19 Explorer, ~6 Investigator, or ~6 Trailblazer users. Pro (20k credits) doubles capacity. Free (Observer) users are gated (0 credits) — upgrade plans as you scale paid users.</p>
            <p>• <span className="font-semibold text-green-500">✓ Energy gating is deployed.</span> All 27 credit-consuming actions are gated. Free (Observer) users are blocked from creating tours, narrating, enriching stops, and using sweepers. Paid users are limited by their monthly energy allotment.</p>
            <p>• <span className="font-semibold">27 credit-consuming actions identified</span> across 14 manifestation (InvokeLLM) and 13 narration (GenerateSpeech) actions. Full audit in section 3c. Key hidden costs: stop enrichment (auto-fires on 1st stop view, 3–6 credits each) and Haunted Locations discovery (auto-fires on every search, 3 credits each).</p>
            <p>• <span className="font-semibold">Store fees (15% IAP)</span> are the largest non-platform cost — significantly higher than traditional payment processing (2.9% + $0.30). The app publishes natively via Apple/Google IAP.</p>
            <p>• <span className="font-semibold">Full narration cost:</span> Each fully narrated tour (all 4 tabs per stop + intro + conclusion) costs ~{FULL_TOUR_NARRATION_CREDITS} credits = ${(FULL_TOUR_NARRATION_CREDITS * COST_PER_CREDIT).toFixed(2)}/tour in platform costs. Energy budgets support: Explorer ~{TOURS_PER_ENERGY(500)} tour/mo, Investigator ~{TOURS_PER_ENERGY(1500)} tours/mo, Trailblazer ~{TOURS_PER_ENERGY(1500)} tours/mo.</p>
            <p>• <span className="font-semibold">Explorer</span> yields ~{monthlyAnalysis[0].margin.toFixed(0)}% margin at full utilization; <span className="font-semibold">Investigator</span> ~{monthlyAnalysis[1].margin.toFixed(0)}%. Both healthier when energy goes unused.</p>
            <p>• <span className="font-semibold text-green-500">✓ Trailblazer is profitable at all utilization levels</span> (~{trailblazerAnalysis.margin.toFixed(0)}% margin at 100% = ${trailblazerAnalysis.profit.toFixed(0)} profit over 30 months; ~{trailblazer50.margin.toFixed(0)}% at 50% realistic usage). The 300-slot cap protects against credit cost exposure. Trailblazer matches Investigator energy at a locked-in discount.</p>
            <p>• <span className="font-semibold">AdMob revenue</span> from free users (interstitial) meaningfully supplements subscription income — 5,000 free users generate ~${(5000 * AD_REV_PER_FREE_USER_MO).toFixed(0)}/mo, offsetting platform and store costs.</p>
            <p>• <span className="font-semibold">Rewarded ads</span> (paid users) generate ~${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in ad revenue, but the granted energy costs ~${AD_REWARD_COST_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in platform credits when consumed (net ~${AD_REWARD_NET_PER_PAID_USER_MO.toFixed(2)}/paid user/mo). This is a <span className="font-semibold">retention investment</span>, not a profit center — it keeps paid users engaged at energy gates instead of churning. Ad-reward credits are included in the Base44 plan-tier calculation (section 9a), so high ad-reward usage can push the required plan tier higher.</p>
            <p>• <span className="font-semibold">Fixed costs</span> (~${fixedOngoingMonthly.toFixed(0)}/mo ongoing) are negligible at scale but matter for small operations. First-year total: ${fixedFirstYearTotal} (includes ${DEV_UPFRONT_ONE_TIME} CatDoes upfront — one-time, no profit share). Base44 plan costs are shown as actual tier costs in section 9, not per-credit estimates.</p>
            <p>• <span className="font-semibold">RevenueCat</span> 1% above $2,500/mo is minimal vs. store fees — only ~${revenuecatFee(7104).toFixed(0)}/mo at the Mature scenario.</p>
            <p>• <span className="font-semibold">RISK:</span> Apple's fee jumps to 30% above ${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr revenue. At that rate, Trailblazer becomes a small loss at 100% utilization (~-7% margin) but remains profitable at 50% realistic usage (~31% margin). Revisit pricing before crossing ${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M.</p>
            <p>• <span className="font-semibold">Annual plans</span> improve cash flow and reduce per-transaction store fee burden (one charge vs. twelve).</p>
            <p>• <span className="font-semibold text-green-500">✓ Toolkit visibility change (Sept 2026):</span> All 12 tools are now visible to every user — Observer and Explorer users see the full toolkit including Term Sweeper, Alphabet Sweeper, Anomaly Camera, and Vibration Communicator. Tapping a locked tool shows an upgrade prompt. This is a conversion funnel improvement with zero direct cost increase — gating still blocks credit consumption. The 4 newly-visible tools include 2 that consume credits (Term Sweeper: 3 + 1/trigger, Alphabet Sweeper: 1/trigger) and 2 that are sensor-only (Vibration Communicator, Anomaly Camera: 0 credits). See section 3e.</p>
            <p>• <span className="font-semibold text-green-500">✓ Community Map improvements (Sept 2026):</span> Author names now resolve via a service-role backend function (display_name → full_name → "Explorer" fallback), and stacked evidence markers at the same coordinates are grouped with a count badge. No credit cost impact — name resolution uses User.get() (no InvokeLLM), and marker grouping is client-side.</p>
            <p>• <span className="font-semibold">Sign-in simplified (Sept 2026):</span> Google and Apple OAuth buttons removed from Login and Register pages — email/password only. Reduces auth complexity and potential confusion. No cost impact.</p>
            <p>• <span className="font-semibold text-amber-500">⚠ Two-pass stop enrichment (Sept 2026):</span> Single-site tours (landmark, ship, cold_spot) now run a second LLM pass (rewriteForStopFocus) to remove general property history and keep stop-specific content. This doubles the enrichment cost to ~{ENRICHMENT_CREDITS_SINGLE_SITE} credits for those tours. The user still pays 1 manifestation energy per stop — the <span className="font-semibold">extra cost is borne by the app owner</span>, not the user. Blended average: ~{AVG_ENRICHMENT_CREDITS} credits/enrichment (was {ENRICHMENT_CREDITS_MULTI_SITE}). Blended manifestation rate: ~{BLENDED_MANIFESTATION_CREDITS} credits/manifestation energy (was {CREDITS_PER_MANIFESTATION}). One-time content_version upgrade: old tours regenerate at 2× cost when first opened by a paid user/admin — budget for a one-time credit spike when rolling out the new prompt.</p>
            <p>• <span className="font-semibold text-primary">DEVICE NARRATION HYPOTHETICALS (Oct 2026):</span> Three scenarios model offering device narration (0 GenerateSpeech credits) across all tiers. <span className="font-semibold">HYPO 1</span> (ad-gated device narration; paid keeps full enhanced): +~${(hypo1Mature.profit - baselineMature.profit).toFixed(0)}/mo at Mature scale (ad revenue only). <span className="font-semibold">HYPO 2</span> (paid chooses device-ad or enhanced, ~50/50): +~${(hypo2Mature.profit - baselineMature.profit).toFixed(0)}/mo (halves narration credits + ads). <span className="font-semibold">HYPO 3</span> (device-only, no enhanced): +~${(hypo3Mature.profit - baselineMature.profit).toFixed(0)}/mo (zero narration credits — manifestation only — Observer narration ad rev retained, but paid users lose the premium voice). See section 11 for full breakdown. No code changes made — planning scenarios pending the Eisenhower Farm device-narration test results.</p>
          </div>
        </section>

        <footer className="text-center text-xs print-muted pt-4 border-t border-border/50">
          AGES — Accessible Ghost Exploration Solutions · Confidential · {today}
        </footer>
      </div>
    </div>
  );
}