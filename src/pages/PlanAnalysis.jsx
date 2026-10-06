import React, { useEffect, useState } from 'react';
import { Printer, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Navigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ArrowLeft } from 'lucide-react';
import StartHere from '@/components/planAnalysis/StartHere';
import ScenarioPnLTable from '@/components/planAnalysis/ScenarioPnLTable';
import { th, td, num } from '@/components/planAnalysis/tableStyles';

// ===== DATA (mirrors src/lib/plans.js + base44/shared/plans.js) =====
const PLANS = [
  { name: 'Observer', price: '$0', billing: 'Free forever', manE: 0, narE: 0,
    features: 'Browse all 50 states + international tours; view tour details, stops, maps, text; Device narration (an ad plays before each narration — ~27 ads per fully narrated tour); save favorites; 4-tool toolkit (2 ad-gated: Audio Recorder, Radio Sweeper — 30s ad = 30s use, 300s/day cap); evidence saves 10/day (ad-watched); evidence journal + dashboard' },
  { name: 'Seeker', price: '$3.99', billing: 'Monthly ($39.99/yr)', manE: 0, narE: 0,
    features: 'Everything in Observer, ad-free (no stop, narration, or tool ads); Device narration only (0 credits); 4-tool toolkit (no ads); community map posting; evidence saves 10/day (ad-watched, then Aura Save energy); Aura Bundle access (Save Energy only)' },
  { name: 'Technician', price: '$5.99', billing: 'Monthly ($59.99/yr)', manE: 0, narE: 0,
    features: 'Everything in Seeker (ad-free, Device narration only — 0 credits); 10 of 12 toolkit tools; Aura Bundle access (100% Save Energy); evidence saves 20/day, then Aura Save energy' },
  { name: 'Explorer', price: '$7.99', billing: 'Monthly ($79.99/yr)', manE: 5, narE: 500,
    features: 'Everything in Technician; Device narration (free) or Enhanced AI narration (~1 fully narrated tour/mo, all tabs); custom tour generation (1-2/mo); ranked tours; nearby + abroad; evidence journal; community map; leaderboard; 10-tool toolkit; aura bundles (80/20 narration/manifestation)' },
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
// rate rises from 3 to ~4 credits per manifestation energy unit.
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
const ADMOB_REWARDED_ECPM = 20;        // $20 per 1,000 rewarded impressions
const ADMOB_REWARDED_PER_IMPRESSION = ADMOB_REWARDED_ECPM / 1000;
const ADS_PER_PAID_USER_MO = 5;        // realistic: users watch ~5 ads/mo when hitting energy gates
const AD_REWARD_ENERGY = 10;           // energy granted per ad
const AD_REWARD_NARRATION = 8;        // 80% narration
const AD_REWARD_MANIFESTATION = 2;    // 20% manifestation
const AD_REWARD_CREDITS_PER_AD = AD_REWARD_NARRATION * CREDITS_PER_NARRATION
  + AD_REWARD_MANIFESTATION * BLENDED_MANIFESTATION_CREDITS; // 8 + 8 = 16 credits
const AD_REWARD_UTILIZATION = 0.7;    // % of granted energy actually consumed
const AD_REWARD_REV_PER_PAID_USER_MO = ADS_PER_PAID_USER_MO * ADMOB_REWARDED_PER_IMPRESSION;
const AD_REWARD_COST_PER_PAID_USER_MO = ADS_PER_PAID_USER_MO * AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION * COST_PER_CREDIT;
const AD_REWARD_NET_PER_PAID_USER_MO = AD_REWARD_REV_PER_PAID_USER_MO - AD_REWARD_COST_PER_PAID_USER_MO;

// ===== OBSERVER / SEEKER AD MODEL (the app as built) =====
// Observer Device narration plays one ad before each narration; a fully
// narrated tour is ~27 narration taps = 27 ads (interstitial rate, same
// 2 tours/mo assumption as the stop-ad model above).
const OBSERVER_NARRATION_ADS_PER_TOUR = 27;
const NARRATION_AD_REV_PER_FREE_USER_MO = OBSERVER_NARRATION_ADS_PER_TOUR * TOURS_PER_FREE_USER_MO * ADMOB_PER_IMPRESSION;
// Observer toolkit: Audio Recorder + Radio Sweeper, 30s ad = 30s use (rewarded rate).
const TOOL_USE_ADS_OBSERVER_MO = 10;
const TOOL_USE_AD_REV_OBSERVER_MO = TOOL_USE_ADS_OBSERVER_MO * ADMOB_REWARDED_PER_IMPRESSION;
// Evidence saves: Observer AND Seeker watch a rewarded ad per save (10/day cap).
// Each save uploads a file (~1 integration credit).
const SAVE_ADS_MO = 3;
const SAVE_AD_REV_MO = SAVE_ADS_MO * ADMOB_REWARDED_PER_IMPRESSION;
const SAVE_UPLOAD_CREDITS_MO = SAVE_ADS_MO * 1;
// Total monthly ad revenue per active free (Observer) user.
const OBSERVER_AD_REV_MO = AD_REV_PER_FREE_USER_MO + NARRATION_AD_REV_PER_FREE_USER_MO + TOOL_USE_AD_REV_OBSERVER_MO + SAVE_AD_REV_MO;

// ===== FULL NARRATION COST PER TOUR =====
const NARRATION_PER_STOP = 52;
const NARRATION_INTRO_CONCLUSION = 20;
const AVG_STOPS_PER_TOUR = 7;
const FULL_TOUR_NARRATION_CREDITS = NARRATION_INTRO_CONCLUSION + AVG_STOPS_PER_TOUR * NARRATION_PER_STOP; // 384
const TOURS_PER_ENERGY = (narE) => Math.floor(narE / FULL_TOUR_NARRATION_CREDITS);

// ===== TOOLKIT VISIBILITY & ADGATE (Oct 2026 — IMPLEMENTED) =====
const TOOLKIT_TIERS = [
  { tier: 'Observer (Free)', visible: 12, accessible: 4, locked: 8, accessibleTools: 'Audio Recorder (ad-gated), Radio Sweeper (ad-gated), Equipment Guide, Safety Protocol', lockedTools: 'Yes/No Sweeper, Vibration Communicator, Alphabet Sweeper, Weather Monitor, Moon Phase, Paranormal Research: Terms, Term Sweeper, Anomaly Camera' },
  { tier: 'Seeker ($3.99)', visible: 12, accessible: 4, locked: 8, accessibleTools: 'Audio Recorder, Radio Sweeper, Equipment Guide, Safety Protocol (all ad-free)', lockedTools: 'Yes/No Sweeper, Vibration Communicator, Alphabet Sweeper, Weather Monitor, Moon Phase, Paranormal Research: Terms, Term Sweeper, Anomaly Camera' },
  { tier: 'Technician ($5.99)', visible: 12, accessible: 10, locked: 2, accessibleTools: 'Audio Recorder, Radio Sweeper, Yes/No Sweeper, Vibration Communicator, Alphabet Sweeper, Weather Monitor, Moon Phase, Paranormal Research: Terms, Equipment Guide, Safety Protocol', lockedTools: 'Term Sweeper, Anomaly Camera' },
  { tier: 'Explorer ($7.99)', visible: 12, accessible: 10, locked: 2, accessibleTools: 'Audio Recorder, Radio Sweeper, Yes/No Sweeper, Vibration Communicator, Alphabet Sweeper, Weather Monitor, Moon Phase, Paranormal Research: Terms, Equipment Guide, Safety Protocol', lockedTools: 'Term Sweeper, Anomaly Camera' },
  { tier: 'Investigator ($11.99)', visible: 12, accessible: 12, locked: 0, accessibleTools: 'All 12 tools', lockedTools: '—' },
  { tier: 'Trailblazer ($239.99)', visible: 12, accessible: 12, locked: 0, accessibleTools: 'All 12 tools', lockedTools: '—' },
];

const NEWLY_VISIBLE_COSTLY_TOOLS = [
  { name: 'Term Sweeper', tier: 'Investigator+', costType: 'Manifest. + Narration', credits: '3 (build terms) + 1/trigger voice', desc: 'Location-based spirit dictation with LLM term generation + GenerateSpeech trigger voices' },
  { name: 'Alphabet Sweeper', tier: 'Investigator+', costType: 'Narration', credits: '1/trigger voice', desc: 'A→Z sweep with GenerateSpeech trigger voices' },
  { name: 'Vibration Communicator', tier: 'Investigator+', costType: 'No credits', credits: '0 (sensor-only)', desc: 'Phone sensor detection — no LLM or speech credits needed' },
  { name: 'Anomaly Camera', tier: 'Investigator+', costType: 'No credits', credits: '0 (camera-only)', desc: 'IR depth scan — no LLM or speech credits needed' },
];

// ===== CREDIT CONSUMPTION AUDIT =====
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
  totalCredits: 16 * AVG_ENRICHMENT_CREDITS + 16 * CREDITS_PER_MANIFESTATION + 40 * 20,
  monthlyCost: (16 * AVG_ENRICHMENT_CREDITS + 16 * CREDITS_PER_MANIFESTATION + 40 * 20) * COST_PER_CREDIT,
};
const UNGATED_TYPICAL = {
  manifestationCalls: 10, narrationCalls: 10, narrationAvgCredits: 15,
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
  { label: '50 Explorer+ users', users: 50 },
  { label: '200 Explorer+ users', users: 200 },
  { label: '500 Explorer+ users', users: 500 },
  { label: '1,000 Explorer+ users', users: 1000 },
].map(s => ({
  ...s,
  monthlyAdRev: s.users * AD_REWARD_REV_PER_PAID_USER_MO,
  monthlyEnergyCost: s.users * AD_REWARD_COST_PER_PAID_USER_MO,
  monthlyNet: s.users * AD_REWARD_NET_PER_PAID_USER_MO,
  monthlyCredits: Math.round(s.users * ADS_PER_PAID_USER_MO * AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION),
}));

// Revenue scenarios (monthly, 70% avg utilization, includes ad revenue + all costs)
// Mix includes all 6 tiers. Seeker ($3.99, 0 energy) and Technician ($5.99, 0 energy)
// are high-margin (0 platform credits, only 15% store fee).
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
  // Only Explorer+ hold energy, so only they take rewarded energy top-ups.
  const energyUsers = s.mix.explorer + s.mix.investigator + s.mix.trailblazer;
  // Observer ads: stop interstitials + one ad before every Device narration.
  const interstitialAdRev = s.freeUsers * AD_REV_PER_FREE_USER_MO;
  const narrationAdRev = s.freeUsers * NARRATION_AD_REV_PER_FREE_USER_MO;
  // Observer tool-use ads + ad-watched evidence saves (Observer and Seeker).
  const toolSaveAdRev = s.freeUsers * (TOOL_USE_AD_REV_OBSERVER_MO + SAVE_AD_REV_MO) + s.mix.seeker * SAVE_AD_REV_MO;
  const rewardedAdRev = energyUsers * AD_REWARD_REV_PER_PAID_USER_MO;
  const adRev = interstitialAdRev + narrationAdRev + toolSaveAdRev + rewardedAdRev;
  const totalRev = subRev + adRev;
  const rewardedAdCredits = Math.round(energyUsers * ADS_PER_PAID_USER_MO * AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION);
  const saveCredits = (s.freeUsers + s.mix.seeker) * SAVE_UPLOAD_CREDITS_MO; // 1 upload credit per ad-watched save
  // Seeker and Technician have 0 AI energy — 0 platform credits
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

// Per-user monthly economics for every tier (70% utilization of Explorer+ energy, flat $/credit).
const perUserCreditCost = (manE, narE) =>
  calcCosts(manE * 0.7, narE * 0.7, 1).platformCost + AD_REWARD_COST_PER_PAID_USER_MO;
const SAVE_UPLOAD_COST_MO = SAVE_UPLOAD_CREDITS_MO * COST_PER_CREDIT;
const TIER_ECONOMICS = [
  { tier: 'Observer', price: 0, narration: `Device only — one ad before each narration (~${OBSERVER_NARRATION_ADS_PER_TOUR} per tour)`, ads: 'Stop ads, narration ads, 2 ad-gated tools, ad-watched saves', adRev: OBSERVER_AD_REV_MO, creditCost: SAVE_UPLOAD_COST_MO },
  { tier: 'Seeker', price: 3.99, narration: 'Device only, no ads (0 credits)', ads: 'Ad-watched evidence saves only', adRev: SAVE_AD_REV_MO, creditCost: SAVE_UPLOAD_COST_MO },
  { tier: 'Technician', price: 5.99, narration: 'Device only, no ads (0 credits)', ads: 'None (ad-free)', adRev: 0, creditCost: 0 },
  { tier: 'Explorer', price: 7.99, narration: 'Device (free) or Enhanced (500 energy)', ads: 'Optional rewarded energy top-ups', adRev: AD_REWARD_REV_PER_PAID_USER_MO, creditCost: perUserCreditCost(5, 500) },
  { tier: 'Investigator', price: 11.99, narration: 'Device (free) or Enhanced (1,500 energy)', ads: 'Optional rewarded energy top-ups', adRev: AD_REWARD_REV_PER_PAID_USER_MO, creditCost: perUserCreditCost(15, 1500) },
  { tier: 'Trailblazer', price: 239.99 / 30, priceLabel: '$8.00 ($239.99 ÷ 30)', narration: 'Device (free) or Enhanced (1,500 energy)', ads: 'Optional rewarded energy top-ups', adRev: AD_REWARD_REV_PER_PAID_USER_MO, creditCost: perUserCreditCost(15, 1500) },
].map(t => {
  const store = t.price * STORE_FEE_PCT;
  return { ...t, priceLabel: t.priceLabel || (t.price === 0 ? 'Free' : '$' + t.price.toFixed(2)), store, net: t.price + t.adRev - store - t.creditCost };
});

// Monthly profit & loss rows (one column per scenario) — shared by the page and the PDF.
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
  { label: 'Observer stop ads (paranormal, stops 2+)', val: s => usd0(s.interstitialAdRev) },
  { label: `Observer narration ads (${OBSERVER_NARRATION_ADS_PER_TOUR} per tour)`, val: s => usd0(s.narrationAdRev) },
  { label: 'Observer tool ads + Observer/Seeker save ads', val: s => usd0(s.toolSaveAdRev) },
  { label: 'Explorer+ rewarded energy top-ups', val: s => usd0(s.rewardedAdRev) },
  { label: 'Ad total', val: s => usd0(s.adRev), bold: true },
  { label: 'TOTAL REVENUE', val: s => usd0(s.totalRev), bold: true },
  { section: 'Costs' },
  { label: 'AI credits used -> Base44 plan needed', val: s => `${s.totalCredits.toLocaleString()} -> ${s.base44Plan.plan}` },
  { label: 'Base44 plan cost', val: s => usd0(s.platformCosts) },
  { label: 'Store fees (15% of subscriptions)', val: s => usd0(s.storeCosts) },
  { label: 'RevenueCat (1% above $2,500)', val: s => usd0(s.revcatCost) },
  { label: 'Apple developer (fixed)', val: s => usd0(s.fixedCost) },
  { label: 'TOTAL COST', val: s => usd0(s.totalCost), bold: true },
  { section: 'Result' },
  { label: 'PROFIT / MONTH', val: s => usd0(s.profit), bold: true },
  { label: 'Margin', val: s => s.margin.toFixed(1) + '%' },
];

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

  heading('Start Here: The App As Built (per user, per month, 70% utilization)');
  table(['Tier', 'Price/mo', 'Ad Rev', 'Credit Cost', 'Store Fee', 'Net/user'],
    TIER_ECONOMICS.map(t => [t.tier, t.priceLabel.split(' ')[0], '$' + t.adRev.toFixed(2), '$' + t.creditCost.toFixed(2), '$' + t.store.toFixed(2), '$' + t.net.toFixed(2)]),
    [90, 70, 70, 80, 70, 70]);
  TIER_ECONOMICS.forEach(t => para(`${t.tier}: ${t.narration}. Ads: ${t.ads}.`));
  para('Projections at four user scales (monthly profit and loss) are in section 9.');

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
  para(`AdMob Observer narration: Device narration plays one ad before each narration; a fully narrated tour is ~${OBSERVER_NARRATION_ADS_PER_TOUR} ads. ${OBSERVER_NARRATION_ADS_PER_TOUR} ads x ${TOURS_PER_FREE_USER_MO} tours/mo x $${ADMOB_PER_IMPRESSION.toFixed(3)} = $${NARRATION_AD_REV_PER_FREE_USER_MO.toFixed(2)}/free user/mo.`);
  para(`AdMob Observer tools + saves: Audio Recorder / Radio Sweeper (30s ad = 30s use) ~${TOOL_USE_ADS_OBSERVER_MO} ads/mo = $${TOOL_USE_AD_REV_OBSERVER_MO.toFixed(2)}; ad-watched evidence saves (Observer and Seeker) ~${SAVE_ADS_MO}/mo = $${SAVE_AD_REV_MO.toFixed(2)}, each save costs 1 upload credit. Total Observer ad revenue: $${OBSERVER_AD_REV_MO.toFixed(2)}/free user/mo.`);
  para('Narration modes: Seeker and Technician use Device narration only (0 credits, no ads). Explorer / Investigator / Trailblazer can use Device (free) or Enhanced (spends narration energy). Rewarded energy top-up ads apply to Explorer+ only.');
  para('Credits charged per action at runtime. 100% utilization = worst case; 50-70% = realistic average.');
  para(`Two-Pass Stop Enrichment (Sept 2026): Single-site tours (landmark, ship, cold_spot) run a second LLM pass (rewriteForStopFocus). Doubles enrichment cost to ~${ENRICHMENT_CREDITS_SINGLE_SITE} credits for those tours. Blended average: ~${AVG_ENRICHMENT_CREDITS} credits/enrichment. Blended manifestation rate: ~${BLENDED_MANIFESTATION_CREDITS} credits/manifestation energy.`);

  heading('3a. Base44 Credit Capacity — When to Upgrade');
  para('Integration credits are hard-capped per plan. Actions FAIL when exhausted — no pay-per-credit overflow.');
  para(`Builder ($40/mo, 10k credits): ~${Math.floor(10000 / (5 * BLENDED_MANIFESTATION_CREDITS + 500))} Explorer, ~${Math.floor(10000 / (15 * BLENDED_MANIFESTATION_CREDITS + 1500))} Investigator, ~${Math.floor(10000 / (15 * BLENDED_MANIFESTATION_CREDITS + 1500))} Trailblazer users at 100% utilization`);
  para(`Pro ($80/mo, 20k credits): ~${Math.floor(20000 / (5 * BLENDED_MANIFESTATION_CREDITS + 500))} Explorer, ~${Math.floor(20000 / (15 * BLENDED_MANIFESTATION_CREDITS + 1500))} Investigator, ~${Math.floor(20000 / (15 * BLENDED_MANIFESTATION_CREDITS + 1500))} Trailblazer users at 100% utilization`);
  para('Free (Observer) users are gated — 0 credits. Seeker and Technician have 0 AI energy — 0 credits. Only Explorer+ credits determine the required plan tier.');

  heading('3b. Full Narration Cost Per Tour (All Tabs)');
  para(`Per stop: Ghost Story ~6 + History ~20 + Paranormal ~20 + Investigate ~6 = ${NARRATION_PER_STOP} credits/stop`);
  para(`Tour intro ~10 + conclusion ~10. Average tour (${AVG_STOPS_PER_TOUR} stops): ${FULL_TOUR_NARRATION_CREDITS} credits = $${(FULL_TOUR_NARRATION_CREDITS * COST_PER_CREDIT).toFixed(2)}/tour`);
  para(`Explorer: ${TOURS_PER_ENERGY(500)} tours/mo | Investigator: ${TOURS_PER_ENERGY(1500)} tours/mo | Trailblazer: ${TOURS_PER_ENERGY(1500)} tours/mo`);

  heading('3c. Credit Consumption Audit');
  para('Energy gating is implemented. All 27 credit-consuming actions are gated — free (Observer) users are blocked, paid users limited by energy allotment. All 12 toolkit tools are visible to all users (Oct 2026), with upgrade prompts on locked tools.');
  para(`Typical cost per active paid user (energy-limited): ${UNGATED_TYPICAL.totalCredits} credits = $${UNGATED_TYPICAL.monthlyCost.toFixed(2)}/mo`);
  para(`Heavy cost per active paid user: ${UNGATED_WORST_CASE.totalCredits} credits = $${UNGATED_WORST_CASE.monthlyCost.toFixed(2)}/mo`);
  table(['Action', 'Page', 'Type', 'Integration', 'Credits', 'Gated'],
    CREDIT_AUDIT.map(a => [a.action, a.page, a.type, a.integration, a.credits, a.gated]),
    [120, 100, 50, 120, 50, 40]);

  heading('3d. Per-Action Breakdown — Credits Now Saved by Gating');
  para(`Itemized monthly credits saved by gating for a typical free (Observer) user. Total saved: ${FREE_USER_BREAKDOWN_TOTAL} credits = $${FREE_USER_BREAKDOWN_COST.toFixed(2)}/mo per free user.`);
  table(['Action', 'Trigger', 'Freq/mo', 'Cr Each', 'Total Cr', 'Cost/mo', 'Fix (Gate With)'],
    [...FREE_USER_BREAKDOWN.map(r => [r.action, r.trigger, r.freq, r.creditsEach, r.totalCredits, '$' + r.monthlyCost.toFixed(2), r.fix]),
     ['TOTAL per free user/mo', '', '', '', FREE_USER_BREAKDOWN_TOTAL, '$' + FREE_USER_BREAKDOWN_COST.toFixed(2), '']],
    [110, 100, 35, 35, 45, 45, 110]);

  heading('3e. Toolkit Visibility & AdGate (Oct 2026 — IMPLEMENTED)');
  para('All 12 toolkit tools are visible to every user. Observer (free) gets 4 tools — 2 free (Equipment Guide, Safety Protocol) + 2 ad-gated (Audio Recorder, Radio Sweeper: 30s ad = 30s use, 300s/day cap per tool). Seeker gets the same 4 tools ad-free. Technician and Explorer get 10 of 12 tools. Investigator+ get all 12. Observer ad-gated tools are device-only — 0 integration credits, so ad revenue is nearly pure profit.');
  table(['Tier', 'Visible', 'Accessible', 'Locked'],
    TOOLKIT_TIERS.map(t => [t.tier, t.visible, t.accessible, t.locked]),
    [120, 40, 40, 40]);
  para('Seeker ($3.99/mo) and Technician ($5.99/mo) are ad-free tiers with 0 AI energy — they consume 0 platform credits. High-margin tiers that capture ad-averse users without AI features.');

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

  heading('8b. AdMob Rewarded Ad Revenue (Explorer+ — Energy Top-Ups)');
  table(['Explorer+ Users', 'Ad Rev/mo', 'Energy Cost/mo', 'Net/mo', 'Credits/mo'],
    rewardedAdScenarios.map(s => [s.label, '$' + s.monthlyAdRev.toFixed(2), '$' + s.monthlyEnergyCost.toFixed(2), '$' + s.monthlyNet.toFixed(2), s.monthlyCredits.toLocaleString()]),
    [90, 70, 70, 60, 60]);

  heading('9. Revenue Scenarios (Monthly Profit & Loss, 70% Utilization)');
  para('The app as built, at four user scales. Mix: ~30% Seeker, ~20% Technician, ~30% Explorer, ~15% Investigator, ~5% Trailblazer.');
  table(['Monthly P&L', ...scenarios.map(s => s.label.split(' ')[0])],
    pnlRows.map(r => r.section ? [r.section.toUpperCase(), '', '', '', ''] : [r.label, ...scenarios.map(s => r.val(s))]),
    [230, 70, 70, 70, 70]);

  heading('9a. Base44 Plan Required Per Scenario');
  para('Total monthly integration credits consumed by paid users (70% utilization) plus credits from consumed ad-reward energy, and the minimum Base44 plan needed. Seeker and Technician have 0 AI energy — 0 credits. Free (Observer) users are gated — 0 credits.');
  table(['Scenario', 'Paid Credits', 'Ad-Reward Cr', 'Base44 Plan', 'Plan $/mo'],
    scenarios.map(s => [s.label, (s.totalCredits - s.rewardedAdCredits).toLocaleString(), s.rewardedAdCredits.toLocaleString(), s.base44Plan.plan, '$' + s.base44Plan.cost]),
    [85, 50, 50, 60, 45]);

  heading('10. Key Takeaways');
  para('CREDIT CAPACITY: Builder plan (10k credits) supports only ~19 Explorer / ~6 Investigator / ~6 Trailblazer users at 100% utilization. Pro (20k) doubles that. Seeker and Technician users consume 0 AI credits (0 energy) — they do NOT count against credit capacity. Free (Observer) users are gated (0 credits). Must upgrade plans to scale AI features only.');
  para('NEW HIGH-MARGIN TIERS (Oct 2026): Seeker ($3.99/mo) and Technician ($5.99/mo) have 0 AI energy — they consume 0 platform credits. Their only cost is the 15% store fee. Seeker nets ~$3.39/mo, Technician ~$5.09/mo per user. These tiers capture ad-averse users who don\'t need AI features, adding high-margin revenue that subsidizes the credit-consuming Explorer+ tiers.');
  para(`OBSERVER AD REVENUE (as built): each free user earns ~$${OBSERVER_AD_REV_MO.toFixed(2)}/mo: stop ads $${AD_REV_PER_FREE_USER_MO.toFixed(2)} + narration ads $${NARRATION_AD_REV_PER_FREE_USER_MO.toFixed(2)} (${OBSERVER_NARRATION_ADS_PER_TOUR} ads per fully narrated tour) + tool ads $${TOOL_USE_AD_REV_OBSERVER_MO.toFixed(2)} + save ads $${SAVE_AD_REV_MO.toFixed(2)}. At 5,000 free users that is ~$${Math.round(5000 * OBSERVER_AD_REV_MO).toLocaleString()}/mo. Seeker and Technician use Device narration only: 0 AI credits and no stop or narration ads (Seeker earns only ad-watched evidence saves).`);
  para(`Store fees (15% IAP) are the largest non-platform cost — significantly higher than traditional payment processing (2.9% + $0.30). The app publishes natively via Apple/Google IAP.`);
  para(`Full narration cost: ~${FULL_TOUR_NARRATION_CREDITS} credits/tour = $${(FULL_TOUR_NARRATION_CREDITS * COST_PER_CREDIT).toFixed(2)}/tour. Explorer ~${TOURS_PER_ENERGY(500)} tour/mo, Investigator ~${TOURS_PER_ENERGY(1500)} tours/mo, Trailblazer ~${TOURS_PER_ENERGY(1500)} tours/mo.`);
  para(`Seeker yields ~${monthlyAnalysis[0].margin.toFixed(0)}% margin (0 platform credits — only 15% store fee). Technician ~${monthlyAnalysis[1].margin.toFixed(0)}%. Explorer ~${monthlyAnalysis[2].margin.toFixed(0)}% margin at full utilization; Investigator ~${monthlyAnalysis[3].margin.toFixed(0)}%. Seeker and Technician are the highest-margin tiers (0 AI energy = 0 platform cost).`);
  para(`Trailblazer is profitable at 100% utilization (~${trailblazerAnalysis.margin.toFixed(0)}% margin = $${trailblazerAnalysis.profit.toFixed(0)} profit over 30 months). At 50% realistic usage, margin improves to ~${trailblazer50.margin.toFixed(0)}%. The 300-slot cap protects against credit cost exposure.`);
  para('AdMob interstitial revenue from free users meaningfully supplements subscription income — 5,000 free users generate ~$' + (5000 * AD_REV_PER_FREE_USER_MO).toFixed(0) + '/mo, offsetting platform and store costs.');
  para(`Rewarded ads (Explorer+ users) generate ~$${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in ad revenue, but granted energy costs ~$${AD_REWARD_COST_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in platform credits when consumed (net ~$${AD_REWARD_NET_PER_PAID_USER_MO.toFixed(2)}/paid user/mo). This is a retention investment, not a profit center.`);
  para('Fixed costs (~$' + fixedOngoingMonthly.toFixed(0) + '/mo ongoing) are negligible at scale but matter for small operations. First-year total: $' + fixedFirstYearTotal + ' (includes $' + DEV_UPFRONT_ONE_TIME + ' CatDoes upfront).');
  para(`RevenueCat 1% above $2,500/mo is minimal vs. store fees — only ~$${revenuecatFee(7104).toFixed(0)}/mo at the Mature scenario.`);
  para(`RISK: Apple fee jumps to 30% above $${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr revenue. At that rate, Trailblazer becomes a small loss at 100% utilization (~-7% margin) but remains profitable at 50% realistic usage (~31% margin). Revisit pricing before crossing $${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M.`);
  para('TOOLKIT ADGATE (Oct 2026 — IMPLEMENTED): Observer gets 4 tools (2 ad-gated: Audio Recorder, Radio Sweeper). Seeker gets 4 ad-free. Technician/Explorer get 10. Investigator+ get all 12. Device-only ad-gated tools cost 0 credits — ad revenue is nearly pure profit. See section 3e.');
  para('TWO-PASS ENRICHMENT (Sept 2026): Single-site tours run a second LLM pass. Blended average ~' + AVG_ENRICHMENT_CREDITS + ' credits/enrichment. Blended manifestation rate ~' + BLENDED_MANIFESTATION_CREDITS + ' credits/manifestation energy.');

  doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
  if (y > 760) { doc.addPage(); y = 50; }
  doc.text('AGES - Accessible Ghost Exploration Solutions  |  Confidential  |  ' + today, M, y + 20);

  doc.save('AGES-Plan-Analysis.pdf');
}

// Table class names (th / td / num) live in @/components/planAnalysis/tableStyles

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

        <StartHere tiers={TIER_ECONOMICS} scenarios={scenarios} />

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
            <p className="print-text"><span className="font-semibold">AdMob (Observer narration):</span> Device narration plays one ad before each narration — a fully narrated tour is ~{OBSERVER_NARRATION_ADS_PER_TOUR} ads. {OBSERVER_NARRATION_ADS_PER_TOUR} ads × {TOURS_PER_FREE_USER_MO} tours/mo × ${ADMOB_PER_IMPRESSION.toFixed(3)} = ${NARRATION_AD_REV_PER_FREE_USER_MO.toFixed(2)}/free user/mo</p>
            <p className="print-text"><span className="font-semibold">AdMob (Observer tools + saves):</span> Audio Recorder / Radio Sweeper (30s ad = 30s use) ~{TOOL_USE_ADS_OBSERVER_MO} ads/mo = ${TOOL_USE_AD_REV_OBSERVER_MO.toFixed(2)}; ad-watched evidence saves (Observer and Seeker) ~{SAVE_ADS_MO}/mo = ${SAVE_AD_REV_MO.toFixed(2)}, each save costs 1 upload credit. <span className="font-semibold">Total Observer ad revenue: ${OBSERVER_AD_REV_MO.toFixed(2)}/free user/mo.</span></p>
            <p className="print-text"><span className="font-semibold">Narration modes:</span> Seeker and Technician use Device narration only (0 credits, no ads). Explorer / Investigator / Trailblazer can use Device (free) or Enhanced (spends narration energy). Rewarded energy top-up ads apply to Explorer+ only.</p>
            <p className="print-muted text-xs italic">Note: Credits are charged per action at runtime. Users who don't exhaust their monthly energy allotment cost less. Analysis shows 100% utilization (worst case) and 50–70% (realistic average).</p>
            <p className="print-text text-xs font-semibold text-green-500 mt-2">✓ Energy gating is implemented. All actions below are gated — free (Observer) users are blocked, and paid users are limited by their monthly energy allotment. Costs shown reflect gated usage.</p>
            <p className="print-text text-xs mt-2"><span className="font-semibold text-amber-500">⚠ Two-Pass Stop Enrichment (Sept 2026):</span> Single-site tours (landmark, ship, cold_spot) now run a <span className="font-semibold">second LLM pass</span> (rewriteForStopFocus) to remove general property history and keep stop-specific content. This doubles the enrichment cost to ~{ENRICHMENT_CREDITS_SINGLE_SITE} credits for those tours (was {ENRICHMENT_CREDITS_MULTI_SITE}). Area/road_trip tours are unchanged (1 pass). <span className="font-semibold">The user still pays 1 manifestation energy per stop</span> — the extra cost is borne by the app owner. Blended average: ~{AVG_ENRICHMENT_CREDITS} credits/enrichment. Blended manifestation rate: ~{BLENDED_MANIFESTATION_CREDITS} credits/manifestation energy (was {CREDITS_PER_MANIFESTATION}).</p>
          </div>
        </section>

        {/* 3a. Base44 Credit Capacity */}
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
                  const explorerCredits = 5 * BLENDED_MANIFESTATION_CREDITS + 500;
                  const investigatorCredits = 15 * BLENDED_MANIFESTATION_CREDITS + 1500;
                  const trailblazerCredits = 15 * BLENDED_MANIFESTATION_CREDITS + 1500;
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
              <p className="text-xs text-green-500 print-text mt-1">✓ Free (Observer), Seeker, and Technician users consume 0 AI credits — only Explorer+ credits determine the required plan tier.</p>
            </div>
          </div>
          <p className="text-xs print-muted mt-2 italic">Credits reset monthly with no carryover. Seeker and Technician have 0 AI energy — 0 credits. Free (Observer) users are gated — 0 credits. Elite pricing is estimated — check base44.com/pricing for current rates.</p>
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
          <p className="text-xs print-muted mb-3">Complete inventory of every action that costs integration credits. "Gated = Yes" means the action is restricted by the energy system — free users are blocked, paid users are limited by their energy allotment. <span className="font-semibold text-green-500 print-text">All 12 toolkit tools are visible to all users (Oct 2026)</span> — locked tools show an upgrade prompt. See section 3e.</p>
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
            <p className="text-xs print-text">Energy gating is implemented. Free (Observer) users are blocked from credit-consuming actions. Estimated monthly platform cost per active <span className="font-semibold">paid</span> user (energy-limited):</p>
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
          </div>
        </section>

        {/* 3e. Toolkit Visibility & AdGate */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">3e. Toolkit Visibility & AdGate (Oct 2026 — IMPLEMENTED)</h2>
          <p className="text-xs print-muted mb-3">All 12 toolkit tools are visible to every user. <span className="font-semibold print-text">Observer (free)</span> gets 4 tools — 2 free (Equipment Guide, Safety Protocol) + 2 ad-gated (Audio Recorder, Radio Sweeper: 30s ad = 30s use, 300s/day cap per tool). <span className="font-semibold print-text">Seeker</span> gets the same 4 tools ad-free. <span className="font-semibold print-text">Technician & Explorer</span> get 10 of 12 tools. <span className="font-semibold print-text">Investigator+</span> get all 12. Tapping a locked tool shows an upgrade prompt. Observer's ad-gated tools are device-only (0 integration credits), so the ad revenue is nearly pure profit.</p>
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
              <p className="text-xs print-text mt-1">Observer users who previously saw only 2 tools now see all 12 — including Term Sweeper and Alphabet Sweeper with live trigger voices. This creates a stronger "see what you're missing" upgrade incentive.</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/30">
              <p className="text-[10px] font-heading uppercase tracking-wider text-primary">Cost Impact</p>
              <p className="text-xs print-text mt-1"><span className="font-semibold">Zero direct cost change.</span> Gating still blocks unauthorized users from consuming credits. Observer ad-gated tools (Audio Recorder, Radio Sweeper) are device-only — 0 integration credits. Ad revenue from tool-use ads is nearly pure profit.</p>
            </div>
          </div>
        </section>

        {/* 4. Per-Plan Profit */}
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
          <p className="text-xs print-muted mt-2 italic">Seeker and Technician have 0 AI energy — 0 platform credits. Their only cost is the 15% store fee, making them the highest-margin tiers. Explorer and Investigator consume platform credits (manifestation + narration) at 100% utilization.</p>
        </section>

        {/* 5. Trailblazer */}
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
          <p className="text-xs print-muted mt-2 italic">With 1500 narration energy/month over 30 months, Trailblazer is profitable at 100% utilization (~{trailblazerAnalysis.margin.toFixed(0)}% margin = ${trailblazerAnalysis.profit.toFixed(0)} profit). At 50% realistic usage, margin improves to ~{trailblazer50.margin.toFixed(0)}%. The 300-slot cap protects against credit cost exposure.</p>
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
          <p className="text-xs print-muted mt-2 italic">Store fee (15%) applies to all IAP purchases. Aura bundles are one-time energy top-ups available to Seeker+ tiers (Technician routes 100% to Save Energy; Explorer+ splits 80/20 narration/manifestation).</p>
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

          <h3 className="font-heading text-sm font-semibold text-foreground mb-2 mt-6 print-text">8b. Rewarded Ads (Explorer+ — Energy Top-Ups)</h3>
          <p className="text-xs print-muted mb-3">Explorer+ users who hit an energy gate can watch a rewarded ad for +{AD_REWARD_ENERGY} energy (up to {5}/day). Each ad generates ${ADMOB_REWARDED_PER_IMPRESSION.toFixed(3)} in ad revenue, but the granted energy costs {AD_REWARD_CREDITS_PER_AD} credits ({Math.round(AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION)} at {Math.round(AD_REWARD_UTILIZATION * 100)}% utilization) = ${((AD_REWARD_CREDITS_PER_AD * AD_REWARD_UTILIZATION * COST_PER_CREDIT)).toFixed(3)} in platform costs when consumed. <span className="font-semibold">Net: ${AD_REWARD_NET_PER_PAID_USER_MO.toFixed(3)}/paid user/mo</span> — a small retention cost that prevents churn at energy gates.</p>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className={th}>Explorer+ Users</th>
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
          <p className="text-xs print-muted mt-2 italic">Model: {ADS_PER_PAID_USER_MO} ads/paid user/mo × ${ADMOB_REWARDED_PER_IMPRESSION.toFixed(3)}/impression = ${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(3)} ad rev/paid user/mo. The net cost is a retention investment — ad-reward credits are included in the Base44 plan-tier calculation in section 9a.</p>
        </section>

        {/* 9. Revenue Scenarios */}
        <section id="projections" className="mb-8 scroll-mt-4">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">9. Revenue Scenarios (Monthly, 70% Avg Utilization)</h2>
          <p className="text-xs print-muted mb-3">Monthly profit and loss for the <span className="font-semibold print-text">app as built</span>, at four user scales (70% utilization of Explorer+ energy). Mix: ~30% Seeker, ~20% Technician, ~30% Explorer, ~15% Investigator, ~5% Trailblazer. Read down a column: users → subscription revenue → ad revenue → costs → profit.</p>
          <ScenarioPnLTable scenarios={scenarios} rows={pnlRows} />
          <p className="text-xs print-muted mt-2 italic">Trailblazer revenue amortized over 30 months. 5:1 free-to-paid ratio assumed. "Base44 Plan" = actual monthly plan tier cost for paid-user credits (from section 9a). Ad revenue = Observer stop ads + Observer narration ads + Observer tool ads + Observer/Seeker save ads + Explorer+ rewarded top-ups. Seeker and Technician use Device narration only and have 0 AI energy — 0 platform credits. Free (Observer) users are gated — 0 AI credits. Store fees apply only to IAP subscription revenue, not AdMob. RevenueCat 1% applies above $2,500/mo in subscription sales.</p>

          {/* 9a. Base44 Plan Required Per Scenario */}
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <h3 className="font-heading text-sm font-semibold text-foreground mb-3 print-text">9a. Base44 Plan Required Per Scenario</h3>
            <p className="text-xs print-muted mb-3">Total monthly integration credits consumed by paid users (at 70% utilization) plus credits from consumed ad-reward energy, and the minimum Base44 plan needed to support them. Seeker and Technician have 0 AI energy — 0 credits. Free (Observer) users are gated — 0 credits.</p>
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
            <p className="text-xs text-green-500 print-text mt-3">✓ Energy gating is deployed — free (Observer), Seeker, and Technician users consume 0 AI credits. Only Explorer+ credits determine the required Base44 plan tier.</p>
            <p className="text-xs print-muted mt-1 italic">"Ad-Reward Credits" = credits from consumed ad-reward energy (paid users watching rewarded ads for +{AD_REWARD_ENERGY} energy top-ups). These are included in the total and can push the required Base44 plan tier higher. Elite pricing is estimated — check base44.com/pricing for current rates.</p>
          </div>
        </section>

        {/* 10. Key Takeaways */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">10. Key Takeaways</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block p-4 space-y-2 text-sm print-text">
            <p>• <span className="font-semibold text-red-500">✓ CREDIT CAPACITY: Base44 Builder plan includes only 10,000 credits/mo.</span> At 100% utilization that supports just ~19 Explorer, ~6 Investigator, or ~6 Trailblazer users. Pro (20k credits) doubles capacity. Free (Observer), Seeker, and Technician users consume 0 AI credits — upgrade plans as you scale Explorer+ users only.</p>
            <p>• <span className="font-semibold text-green-500">✓ Energy gating is deployed.</span> All 27 credit-consuming actions are gated. Free (Observer) users are blocked from creating tours, narrating, enriching stops, and using sweepers. Paid users are limited by their monthly energy allotment.</p>
            <p>• <span className="font-semibold text-green-500">✓ NEW HIGH-MARGIN TIERS (Oct 2026):</span> Seeker ($3.99/mo) and Technician ($5.99/mo) have 0 AI energy — they consume 0 platform credits. Their only cost is the 15% store fee. Seeker nets ~$3.39/mo, Technician ~$5.09/mo per user. These tiers capture ad-averse users without AI features, adding high-margin revenue that subsidizes the credit-consuming Explorer+ tiers.</p>
            <p>• <span className="font-semibold text-green-500">✓ OBSERVER AD REVENUE (as built):</span> each free user earns ~${OBSERVER_AD_REV_MO.toFixed(2)}/mo — stop ads ${AD_REV_PER_FREE_USER_MO.toFixed(2)} + narration ads ${NARRATION_AD_REV_PER_FREE_USER_MO.toFixed(2)} ({OBSERVER_NARRATION_ADS_PER_TOUR} ads per fully narrated tour) + tool ads ${TOOL_USE_AD_REV_OBSERVER_MO.toFixed(2)} + save ads ${SAVE_AD_REV_MO.toFixed(2)}. At 5,000 free users that is ~${Math.round(5000 * OBSERVER_AD_REV_MO).toLocaleString()}/mo. Seeker and Technician use Device narration only: 0 AI credits and no stop or narration ads (Seeker earns only ad-watched evidence saves).</p>
            <p>• <span className="font-semibold">27 credit-consuming actions identified</span> across 14 manifestation (InvokeLLM) and 13 narration (GenerateSpeech) actions. Full audit in section 3c.</p>
            <p>• <span className="font-semibold">Store fees (15% IAP)</span> are the largest non-platform cost — significantly higher than traditional payment processing (2.9% + $0.30). The app publishes natively via Apple/Google IAP.</p>
            <p>• <span className="font-semibold">Full narration cost:</span> Each fully narrated tour (all 4 tabs per stop + intro + conclusion) costs ~{FULL_TOUR_NARRATION_CREDITS} credits = ${(FULL_TOUR_NARRATION_CREDITS * COST_PER_CREDIT).toFixed(2)}/tour in platform costs. Energy budgets support: Explorer ~{TOURS_PER_ENERGY(500)} tour/mo, Investigator ~{TOURS_PER_ENERGY(1500)} tours/mo, Trailblazer ~{TOURS_PER_ENERGY(1500)} tours/mo.</p>
            <p>• <span className="font-semibold">Per-plan margins at 100% utilization:</span> Seeker ~{monthlyAnalysis[0].margin.toFixed(0)}% (0 credits), Technician ~{monthlyAnalysis[1].margin.toFixed(0)}% (0 credits), Explorer ~{monthlyAnalysis[2].margin.toFixed(0)}%, Investigator ~{monthlyAnalysis[3].margin.toFixed(0)}%. Seeker and Technician are the highest-margin tiers (0 AI energy = 0 platform cost). All tiers are healthier when energy goes unused.</p>
            <p>• <span className="font-semibold text-green-500">✓ Trailblazer is profitable at all utilization levels</span> (~{trailblazerAnalysis.margin.toFixed(0)}% margin at 100% = ${trailblazerAnalysis.profit.toFixed(0)} profit over 30 months; ~{trailblazer50.margin.toFixed(0)}% at 50% realistic usage). The 300-slot cap protects against credit cost exposure.</p>
            <p>• <span className="font-semibold">AdMob revenue</span> from free users (interstitial) meaningfully supplements subscription income — 5,000 free users generate ~${(5000 * AD_REV_PER_FREE_USER_MO).toFixed(0)}/mo, offsetting platform and store costs.</p>
            <p>• <span className="font-semibold">Rewarded ads</span> (Explorer+ users) generate ~${AD_REWARD_REV_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in ad revenue, but the granted energy costs ~${AD_REWARD_COST_PER_PAID_USER_MO.toFixed(2)}/paid user/mo in platform credits when consumed (net ~${AD_REWARD_NET_PER_PAID_USER_MO.toFixed(2)}/paid user/mo). This is a <span className="font-semibold">retention investment</span>, not a profit center.</p>
            <p>• <span className="font-semibold">Fixed costs</span> (~${fixedOngoingMonthly.toFixed(0)}/mo ongoing) are negligible at scale but matter for small operations. First-year total: ${fixedFirstYearTotal} (includes ${DEV_UPFRONT_ONE_TIME} CatDoes upfront).</p>
            <p>• <span className="font-semibold">RevenueCat</span> 1% above $2,500/mo is minimal vs. store fees — only ~${revenuecatFee(7104).toFixed(0)}/mo at the Mature scenario.</p>
            <p>• <span className="font-semibold">RISK:</span> Apple's fee jumps to 30% above ${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr revenue. At that rate, Trailblazer becomes a small loss at 100% utilization (~-7% margin) but remains profitable at 50% realistic usage (~31% margin). Revisit pricing before crossing ${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M.</p>
            <p>• <span className="font-semibold text-green-500">✓ Toolkit AdGate (Oct 2026 — IMPLEMENTED):</span> Observer gets 4 tools (2 ad-gated: Audio Recorder, Radio Sweeper — 30s ad = 30s use, 300s/day cap). Seeker gets 4 ad-free. Technician/Explorer get 10. Investigator+ get all 12. Device-only ad-gated tools cost 0 credits — ad revenue is nearly pure profit. See section 3e.</p>
            <p>• <span className="font-semibold text-amber-500">⚠ Two-pass stop enrichment (Sept 2026):</span> Single-site tours run a second LLM pass. Blended average ~{AVG_ENRICHMENT_CREDITS} credits/enrichment. Blended manifestation rate ~{BLENDED_MANIFESTATION_CREDITS} credits/manifestation energy (was {CREDITS_PER_MANIFESTATION}). The extra cost is borne by the app owner, not the user.</p>
          </div>
        </section>

        <footer className="text-center text-xs print-muted pt-4 border-t border-border/50">
          AGES — Accessible Ghost Exploration Solutions · Confidential · {today}
        </footer>
      </div>
    </div>
  );
}