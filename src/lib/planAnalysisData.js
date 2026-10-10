// Unified display data for the Plan Analysis page. Produces a flat object with
// every field the view needs, for either Cost Analysis A (current app-store
// energy) or Cost Analysis B (Option E — Hybrid energy). buildModel(OPTION_A)
// reproduces A's numbers exactly, so the two views are comparable like for
// like. Only the energy values, enrichment batch size, and Aura split differ.

import {
  buildModel, OPTION_A, OPTION_E, AURA_BUNDLES,
  CREDITS_PER_MANIFESTATION, CREDITS_PER_NARRATION, COST_PER_CREDIT,
  ENRICHMENT_CREDITS_SINGLE_SITE, ENRICHMENT_CREDITS_MULTI_SITE,
  SINGLE_SITE_FRACTION, ENRICHMENT_CALL_FRACTION,
  FULL_TOUR_NARRATION_CREDITS, A_FULL_TOUR_NARRATION_CREDITS,
  BASE44_PLANS, STORE_FEE_PCT, STORE_FEE_PCT_HIGH, STORE_HIGH_THRESHOLD,
  REVENUECAT_FEE_PCT, REVENUECAT_THRESHOLD,
  APPLE_DEV_ANNUAL, GOOGLE_DEV_ONE_TIME, DEV_UPFRONT_ONE_TIME,
  ADMOB_ECPM, ADMOB_PER_IMPRESSION, ADS_PER_TOUR, TOURS_PER_FREE_USER_MO,
  AD_REV_PER_FREE_USER_MO, ADMOB_REWARDED_ECPM, ADMOB_REWARDED_PER_IMPRESSION,
  ADS_PER_PAID_USER_MO, AD_REWARD_ENERGY, AD_REWARD_NARRATION, AD_REWARD_MANIFESTATION,
  AD_REWARD_UTILIZATION, OBSERVER_NARRATION_ADS_PER_TOUR, NARRATION_AD_REV_PER_FREE_USER_MO,
  TOOL_USE_ADS_OBSERVER_MO, TOOL_USE_AD_REV_OBSERVER_MO, SAVE_ADS_MO, SAVE_AD_REV_MO,
  SAVE_UPLOAD_CREDITS_MO, SAVE_UPLOAD_COST_MO, OBSERVER_AD_REV_MO,
  FIXED_FIRST_YEAR, FIXED_FIRST_YEAR_TOTAL, FIXED_ONGOING_ANNUAL, FIXED_ONGOING_MONTHLY,
} from '@/lib/costAnalysisModel';
import { TOOLKIT_TIERS, creditAudit } from '@/lib/costAnalysisStatic';

const NARRATION_PER_STOP = 52;
const NARRATION_INTRO_CONCLUSION = 20;
const AVG_STOPS_PER_TOUR = 7;

const NEWLY_VISIBLE_COSTLY_TOOLS = [
  { name: 'Term Sweeper', tier: 'Investigator+', costType: 'Manifest. + Narration', credits: '3 (build terms) + 1/trigger voice', desc: 'Location-based spirit dictation with LLM term generation + GenerateSpeech trigger voices' },
  { name: 'Alphabet Sweeper', tier: 'Investigator+', costType: 'Narration', credits: '1/trigger voice', desc: 'A→Z sweep with GenerateSpeech trigger voices' },
  { name: 'Vibration Communicator', tier: 'Investigator+', costType: 'No credits', credits: '0 (sensor-only)', desc: 'Phone sensor detection — no LLM or speech credits needed' },
  { name: 'Anomaly Camera', tier: 'Investigator+', costType: 'No credits', credits: '0 (camera-only)', desc: 'IR depth scan — no LLM or speech credits needed' },
];

function buildPlans(option, toursPerEnergy, auraSplit) {
  const { explorer, investigator, trailblazer } = option;
  return [
    { name: 'Observer', price: '$0', billing: 'Free forever', manE: 0, narE: 0,
      features: 'Browse all 50 states + international tours; view tour details, stops, maps, text; Device narration (an ad plays before each narration — ~27 ads per fully narrated tour); save favorites; 4-tool toolkit (2 ad-gated: Audio Recorder, Radio Sweeper — 30s ad = 30s use, 300s/day cap); evidence saves 10/day (ad-watched); evidence journal + dashboard' },
    { name: 'Seeker', price: '$3.99', billing: 'Monthly ($39.99/yr)', manE: 0, narE: 0,
      features: 'Everything in Observer, ad-free (no stop, narration, or tool ads); Device narration only (0 credits); 4-tool toolkit (no ads); community map posting; evidence saves 10/day (ad-watched, then Aura Save energy); Aura Bundle access (Save Energy only)' },
    { name: 'Technician', price: '$5.99', billing: 'Monthly ($59.99/yr)', manE: 0, narE: 0,
      features: 'Everything in Seeker (ad-free, Device narration only — 0 credits); 10 of 12 toolkit tools; Aura Bundle access (100% Save Energy); evidence saves 20/day, then Aura Save energy' },
    { name: 'Explorer', price: '$7.99', billing: 'Monthly ($79.99/yr)', ...explorer,
      features: `Everything in Technician; Device narration (free) or Enhanced AI narration (~${toursPerEnergy(explorer.narE)} fully narrated tour/mo, all tabs); custom tour generation; ranked tours; nearby + abroad; evidence journal; community map; leaderboard; 10-tool toolkit; aura bundles (${auraSplit} narration/manifestation)` },
    { name: 'Investigator', price: '$11.99', billing: 'Monthly ($119.99/yr)', ...investigator,
      features: `Everything in Explorer; AI narration (~${toursPerEnergy(investigator.narE)} fully narrated tours/mo, all tabs); custom tours; full 12-tool toolkit; evidence dashboard analytics; aura bundles (${auraSplit})` },
    { name: 'Trailblazer', price: '$239.99', billing: 'One-time, 30 months (6 months free, max 300 slots)', ...trailblazer,
      features: `Everything in Investigator; AI narration (~${toursPerEnergy(trailblazer.narE)} fully narrated tours/mo, all tabs); custom tours; exclusive badge; early access; 30-mo price lock (6 months free); 20% off aura bundles` },
  ];
}

export function buildDisplayData(optionKey) {
  const option = optionKey === 'A' ? OPTION_A : OPTION_E;
  const m = buildModel(option);
  const fullTourNarrationCredits = optionKey === 'A' ? A_FULL_TOUR_NARRATION_CREDITS : FULL_TOUR_NARRATION_CREDITS;
  const toursPerEnergy = (narE) => Math.floor(narE / fullTourNarrationCredits);
  const auraSplit = `${Math.round(option.auraNarShare * 100)}/${Math.round((1 - option.auraNarShare) * 100)}`;

  return {
    // Option identity
    optionKey,
    option,
    auraSplit,
    batch: m.batch,
    // Narration tour sizing
    fullTourNarrationCredits,
    toursPerEnergy,
    NARRATION_PER_STOP,
    NARRATION_INTRO_CONCLUSION,
    AVG_STOPS_PER_TOUR,
    // Display data
    plans: buildPlans(option, toursPerEnergy, auraSplit),
    auraBundles: AURA_BUNDLES,
    creditAudit: creditAudit(m.batch),
    toolkitTiers: TOOLKIT_TIERS,
    newlyVisibleCostlyTools: NEWLY_VISIBLE_COSTLY_TOOLS,
    // Computed analysis (from model)
    monthlyAnalysis: m.monthlyAnalysis,
    trailblazerAnalysis: m.trailblazer100,
    trailblazer50: m.trailblazer50,
    trailblazer100HighFee: m.trailblazer100HighFee,
    trailblazer50HighFee: m.trailblazer50HighFee,
    bundleAnalysis: m.bundleAnalysis,
    scenarios: m.scenarios,
    tierEconomics: m.tierEconomics,
    pnlRows: m.pnlRows,
    adMobScenarios: m.adMobScenarios,
    rewardedAdScenarios: m.rewardedAdScenarios,
    freeUserBreakdown: m.freeUserBreakdown,
    freeUserBreakdownTotal: m.freeUserTotal,
    freeUserBreakdownCost: m.freeUserCost,
    ungatedTypical: { totalCredits: m.ungatedTypical, monthlyCost: m.ungatedTypicalCost },
    ungatedWorstCase: { totalCredits: m.ungatedWorst, monthlyCost: m.ungatedWorstCost },
    perUser100: m.perUser100,
    avgEnrichmentCredits: m.avgEnrichmentCredits,
    blendedManifestationCredits: m.blended,
    enrichShare: m.enrichShare,
    // Ad reward aliases (page uses AD_REWARD_* names)
    AD_REWARD_CREDITS_PER_AD: m.adReward.creditsPerAd,
    AD_REWARD_REV_PER_PAID_USER_MO: m.adReward.rev,
    AD_REWARD_COST_PER_PAID_USER_MO: m.adReward.cost,
    AD_REWARD_NET_PER_PAID_USER_MO: m.adReward.net,
    // Fixed costs
    fixedCostsFirstYear: FIXED_FIRST_YEAR,
    fixedFirstYearTotal: FIXED_FIRST_YEAR_TOTAL,
    fixedCostsOngoing: [{ item: 'Apple Developer Program', cost: APPLE_DEV_ANNUAL, period: 'Annual' }],
    fixedOngoingAnnual: FIXED_ONGOING_ANNUAL,
    fixedOngoingMonthly: FIXED_ONGOING_MONTHLY,
    // Shared constants (identical for A and B)
    CREDITS_PER_MANIFESTATION, CREDITS_PER_NARRATION, COST_PER_CREDIT,
    ENRICHMENT_CREDITS_SINGLE_SITE, ENRICHMENT_CREDITS_MULTI_SITE,
    SINGLE_SITE_FRACTION, ENRICHMENT_CALL_FRACTION,
    BASE44_PLANS, STORE_FEE_PCT, STORE_FEE_PCT_HIGH, STORE_HIGH_THRESHOLD,
    REVENUECAT_FEE_PCT, REVENUECAT_THRESHOLD,
    APPLE_DEV_ANNUAL, GOOGLE_DEV_ONE_TIME, DEV_UPFRONT_ONE_TIME,
    ADMOB_ECPM, ADMOB_PER_IMPRESSION, ADS_PER_TOUR, TOURS_PER_FREE_USER_MO,
    AD_REV_PER_FREE_USER_MO, ADMOB_REWARDED_ECPM, ADMOB_REWARDED_PER_IMPRESSION,
    ADS_PER_PAID_USER_MO, AD_REWARD_ENERGY, AD_REWARD_NARRATION, AD_REWARD_MANIFESTATION,
    AD_REWARD_UTILIZATION, OBSERVER_NARRATION_ADS_PER_TOUR, NARRATION_AD_REV_PER_FREE_USER_MO,
    TOOL_USE_ADS_OBSERVER_MO, TOOL_USE_AD_REV_OBSERVER_MO, SAVE_ADS_MO, SAVE_AD_REV_MO,
    SAVE_UPLOAD_CREDITS_MO, SAVE_UPLOAD_COST_MO, OBSERVER_AD_REV_MO,
    // Helper functions (from model)
    calcCosts: m.calcCosts,
    storeFee: m.storeFee,
    revenuecatFee: m.revenuecatFee,
    requiredBase44Plan: m.requiredBase44Plan,
  };
}