import { jsPDF } from 'jspdf';
import { buildDisplayData } from '@/lib/planAnalysisData';

// Generates the Cost Analysis A PDF. Moved here from PlanAnalysis.jsx so the
// page could be slimmed to a toggle shell. All data comes from the shared
// data layer (buildDisplayData('A')), which reproduces A's original numbers.
export function downloadPlanAnalysisA() {
  const data = buildDisplayData('A');
  const {
    plans: PLANS, auraBundles: AURA_BUNDLES, creditAudit: CREDIT_AUDIT,
    toolkitTiers: TOOLKIT_TIERS, tierEconomics: TIER_ECONOMICS,
    freeUserBreakdown: FREE_USER_BREAKDOWN, freeUserBreakdownTotal: FREE_USER_BREAKDOWN_TOTAL,
    freeUserBreakdownCost: FREE_USER_BREAKDOWN_COST, ungatedTypical: UNGATED_TYPICAL,
    ungatedWorstCase: UNGATED_WORST_CASE, avgEnrichmentCredits: AVG_ENRICHMENT_CREDITS,
    blendedManifestationCredits: BLENDED_MANIFESTATION_CREDITS,
    fullTourNarrationCredits: FULL_TOUR_NARRATION_CREDITS, toursPerEnergy: TOURS_PER_ENERGY,
    monthlyAnalysis, trailblazerAnalysis, trailblazer50, bundleAnalysis, scenarios, pnlRows,
    adMobScenarios, rewardedAdScenarios, fixedCostsFirstYear, fixedFirstYearTotal,
    fixedCostsOngoing, fixedOngoingAnnual, fixedOngoingMonthly,
    CREDITS_PER_MANIFESTATION, COST_PER_CREDIT, ENRICHMENT_CREDITS_SINGLE_SITE,
    STORE_FEE_PCT, STORE_FEE_PCT_HIGH, STORE_HIGH_THRESHOLD,
    REVENUECAT_FEE_PCT, REVENUECAT_THRESHOLD,
    APPLE_DEV_ANNUAL, GOOGLE_DEV_ONE_TIME, DEV_UPFRONT_ONE_TIME,
    ADMOB_ECPM, ADS_PER_TOUR, TOURS_PER_FREE_USER_MO, AD_REV_PER_FREE_USER_MO,
    ADMOB_REWARDED_ECPM, ADS_PER_PAID_USER_MO, AD_REWARD_ENERGY, AD_REWARD_UTILIZATION,
    AD_REWARD_CREDITS_PER_AD, AD_REWARD_REV_PER_PAID_USER_MO,
    AD_REWARD_COST_PER_PAID_USER_MO, AD_REWARD_NET_PER_PAID_USER_MO,
    OBSERVER_NARRATION_ADS_PER_TOUR, NARRATION_AD_REV_PER_FREE_USER_MO,
    TOOL_USE_ADS_OBSERVER_MO, TOOL_USE_AD_REV_OBSERVER_MO, SAVE_ADS_MO, SAVE_AD_REV_MO,
    OBSERVER_AD_REV_MO, NARRATION_PER_STOP, AVG_STOPS_PER_TOUR, revenuecatFee,
    trailblazerMaxSlots,
  } = data;

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

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
  para(`AdMob Observer narration: Device narration plays one ad before each narration; a fully narrated tour is ~${OBSERVER_NARRATION_ADS_PER_TOUR} ads. ${OBSERVER_NARRATION_ADS_PER_TOUR} ads x ${TOURS_PER_FREE_USER_MO} tours/mo x $${(ADMOB_ECPM / 1000).toFixed(3)} = $${NARRATION_AD_REV_PER_FREE_USER_MO.toFixed(2)}/free user/mo.`);
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
  para(`Trailblazer is profitable at 100% utilization (~${trailblazerAnalysis.margin.toFixed(0)}% margin = $${trailblazerAnalysis.profit.toFixed(0)} profit over 30 months). At 50% realistic usage, margin improves to ~${trailblazer50.margin.toFixed(0)}%. The ${trailblazerMaxSlots}-slot cap protects against credit cost exposure.`);
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