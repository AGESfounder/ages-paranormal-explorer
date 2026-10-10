import { jsPDF } from 'jspdf';
import * as M from '@/lib/costAnalysisModel';
import { TOOLKIT_TIERS, creditAudit } from '@/lib/costAnalysisStatic';

// ===== COST ANALYSIS B — Option E (Hybrid) energy =====
// Same sections, same plans, same prices, same assumptions as Cost Analysis A.
// Only the Option E inputs change (see src/lib/costAnalysisModel.js):
//   Explorer 15 man / 800 nar, Investigator + Trailblazer 45 man / 2,400 nar,
//   stop enrichment 1 energy per 2 stops, Aura bundles 90/10 narration/manifestation,
//   Trailblazer 27 months (3 free), rewarded ads +5 energy (4 nar / 1 man).

const usd = (n) => (n < 0 ? '-$' + Math.abs(n).toFixed(2) : '$' + n.toFixed(2));
const usd0 = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
const pct0 = (n) => n.toFixed(0) + '%';
const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

export function downloadHybridPDF() {
  const A = M.buildModel(M.OPTION_A);
  const B = M.buildModel(M.OPTION_E);
  const { P } = B;
  const aPlan = (name) => A.monthlyAnalysis.find((r) => r.plan === name);
  const bPlan = (name) => B.monthlyAnalysis.find((r) => r.plan === name);
  const tours = (narE) => narE / M.FULL_TOUR_NARRATION_CREDITS;
  const auraSplit = `${Math.round(P.auraNarShare * 100)}/${Math.round((1 - P.auraNarShare) * 100)}`;
  const auraSplitA = `${Math.round(M.OPTION_A.auraNarShare * 100)}/${Math.round((1 - M.OPTION_A.auraNarShare) * 100)}`;
  const fmtE = (p) => `${p.manE} man / ${p.narE.toLocaleString()} nar`;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setLineHeightFactor(1.25);
  const W = doc.internal.pageSize.getWidth();
  const L = 40;
  let y = 50;
  const newPage = () => { doc.addPage(); y = 50; };

  const heading = (text, size = 14) => {
    if (y > 730) newPage();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.text(text, L, y); y += size + 6;
  };
  const para = (text, size = 9) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size);
    doc.splitTextToSize(text, W - L * 2).forEach((line) => { if (y > 790) newPage(); doc.text(line, L, y); y += 14; });
    y += 2;
  };
  // rows: arrays of cells, or { cells, bold }. Cells wrap inside their column.
  const table = (headers, rows, widths) => {
    const drawRow = (cells, bold) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8);
      const wrapped = cells.map((c, i) => doc.splitTextToSize(String(c), widths[i] - 6));
      const h = Math.max(1, ...wrapped.map((l) => l.length)) * 10;
      if (y + h > 790) newPage();
      let x = L;
      wrapped.forEach((lines, i) => { doc.text(lines, x, y); x += widths[i]; });
      y += h + 3;
    };
    drawRow(headers, true);
    doc.setLineWidth(0.5); doc.line(L, y - 1, W - L, y - 1); y += 6;
    rows.forEach((r) => (Array.isArray(r) ? drawRow(r, false) : drawRow(r.cells, r.bold)));
    y += 8;
  };

  // ---------- Title ----------
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('AGES Subscription Plan & Profit Analysis - Cost Analysis B', L, y); y += 22;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(`Generated ${today}`, L, y); y += 14;
  doc.text('Option E - Hybrid energy. Same tiers and prices as Cost Analysis A (no new plans); energy, Trailblazer duration, and ad reward change.', L, y); y += 20;

  heading('What Changed From Cost Analysis A');
  table(['Input', 'Cost Analysis A', 'Cost Analysis B'],
    [
      ['Explorer ($7.99) energy', fmtE(M.OPTION_A.explorer), fmtE(P.explorer)],
      ['Investigator ($11.99) energy', fmtE(M.OPTION_A.investigator), fmtE(P.investigator)],
      ['Trailblazer energy', fmtE(M.OPTION_A.trailblazer), fmtE(P.trailblazer)],
      ['Trailblazer duration', `${M.OPTION_A.trailblazerMonths} months (${M.OPTION_A.trailblazerMonths - 24} free)`, `${P.trailblazerMonths} months (${P.trailblazerMonths - 24} free)`],
      ['Rewarded ad energy', `+${M.OPTION_A.adRewardEnergy} (${M.OPTION_A.adRewardNarration} nar / ${M.OPTION_A.adRewardManifestation} man)`, `+${P.adRewardEnergy} (${P.adRewardNarration} nar / ${P.adRewardManifestation} man)`],
      ['Stop enrichment (manifestation energy)', '1 energy per stop', `1 energy per ${B.batch} stops`],
      ['Aura bundles (narration/manifestation)', auraSplitA, auraSplit],
      ['Plans and prices', 'Seeker, Technician, Explorer, Investigator, Trailblazer', 'Unchanged - no new plans'],
      ['Full narrated tour (narration credits)', `~${M.A_FULL_TOUR_NARRATION_CREDITS} (7-stop average)`, `~${M.FULL_TOUR_NARRATION_CREDITS} (Centralia PA, 8 stops)`],
    ],
    [190, 160, 160]);
  para('The last row only changes how many fully narrated tours each plan\'s narration energy buys (section 3b). It does not change any dollar cost: dollars come from energy x credits per energy x $0.004.');

  // ---------- Start Here ----------
  heading('Start Here: The App With Option E Energy (per user, per month, 70% utilization)');
  table(['Tier', 'Price/mo', 'Ad Rev', 'Credit Cost', 'Store Fee', 'Net/user'],
    B.tierEconomics.map((t) => [t.tier, t.priceLabel.split(' ')[0], usd(t.adRev), usd(t.creditCost), usd(t.store), usd(t.net)]),
    [90, 70, 70, 80, 70, 70]);
  B.tierEconomics.forEach((t) => para(`${t.tier}: ${t.narration}. Ads: ${t.ads}.`));
  para('Projections at four user scales (monthly profit and loss) are in section 9.');

  // ---------- 1 ----------
  const plans = [
    { name: 'Observer', price: '$0', billing: 'Free forever', manE: 0, narE: 0,
      features: 'Browse all 50 states + international tours; view tour details, stops, maps, text; Device narration (an ad plays before each narration - ~27 ads per fully narrated tour); save favorites; 4-tool toolkit (2 ad-gated: Audio Recorder, Radio Sweeper - 30s ad = 30s use, 300s/day cap); evidence saves 10/day (ad-watched); evidence journal + dashboard' },
    { name: 'Seeker', price: '$3.99', billing: 'Monthly ($39.99/yr)', manE: 0, narE: 0,
      features: 'Everything in Observer, ad-free (no stop, narration, or tool ads); Device narration only (0 credits); 4-tool toolkit (no ads); community map posting; evidence saves 10/day (ad-watched, then Aura Save energy); Aura Bundle access (Save Energy only)' },
    { name: 'Technician', price: '$5.99', billing: 'Monthly ($59.99/yr)', manE: 0, narE: 0,
      features: 'Everything in Seeker (ad-free, Device narration only - 0 credits); 10 of 12 toolkit tools; Aura Bundle access (100% Save Energy); evidence saves 20/day, then Aura Save energy' },
    { name: 'Explorer', price: '$7.99', billing: 'Monthly ($79.99/yr)', ...P.explorer,
      features: `Everything in Technician; Device narration (free) or Enhanced AI narration (~${tours(P.explorer.narE).toFixed(1)} fully narrated tour/mo, all tabs); custom tour generation; ranked tours; nearby + abroad; evidence journal; community map; leaderboard; 10-tool toolkit; aura bundles (${auraSplit} narration/manifestation)` },
    { name: 'Investigator', price: '$11.99', billing: 'Monthly ($119.99/yr)', ...P.investigator,
      features: `Everything in Explorer; AI narration (~${tours(P.investigator.narE).toFixed(1)} fully narrated tours/mo, all tabs); custom tours; full 12-tool toolkit; evidence dashboard analytics; aura bundles (${auraSplit})` },
    { name: 'Trailblazer', price: '$239.99', billing: `One-time, ${P.trailblazerMonths} months (${P.trailblazerMonths - 24} months free, max ${M.TRAILBLAZER_MAX_SLOTS} slots)`, ...P.trailblazer,
      features: `Everything in Investigator; AI narration (~${tours(P.trailblazer.narE).toFixed(1)} fully narrated tours/mo, all tabs); custom tours; exclusive badge; early access; ${P.trailblazerMonths}-mo price lock (${P.trailblazerMonths - 24} months free); 20% off aura bundles` },
  ];
  heading('1. Subscription Tiers');
  // (Trailblazer max-slot cap is referenced in the billing line above via M.TRAILBLAZER_MAX_SLOTS — kept in sync from costAnalysisModel.js)
  table(['Plan', 'Price', 'Billing', 'Man. E', 'Narr. E'],
    plans.map((p) => [p.name, p.price, p.billing, p.manE, p.narE.toLocaleString()]), [70, 50, 190, 60, 60]);
  plans.forEach((p) => para(`${p.name}: ${p.features}`));

  // ---------- 2 ----------
  heading('2. Aura Bundles');
  table(['Bundle', 'Energy', `Narration (${Math.round(P.auraNarShare * 100)}%)`, `Manifestation (${Math.round((1 - P.auraNarShare) * 100)}%)`, 'Price', '$/Energy'],
    B.bundleAnalysis.map((b) => [b.name, b.energy, b.narEnergy, b.manEnergy, b.price, '$' + (b.priceNum / b.energy).toFixed(4)]),
    [80, 60, 90, 100, 50, 70]);

  // ---------- 3 ----------
  heading('3. Cost Assumptions');
  para(`Manifestation Energy: 1 unit = 1 InvokeLLM call (Automatic) ~ ${M.CREDITS_PER_MANIFESTATION} integration credits`);
  para('Narration Energy: 1 unit = 1 GenerateSpeech credit (1 credit / 50 chars)');
  para(`Platform cost: $${M.COST_PER_CREDIT.toFixed(4)}/credit (Builder/Pro: $40-80/mo / 10k-20k credits)`);
  para(`App Store / Google Play IAP fee: ${(M.STORE_FEE_PCT * 100).toFixed(0)}% of IAP revenue (Apple & Google, small devs < $1M/yr). Apple jumps to ${(M.STORE_FEE_PCT_HIGH * 100).toFixed(0)}% above $${(M.STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr; Google stays 15%. The app publishes natively via iOS/Android IAP.`);
  para(`RevenueCat: ${(M.REVENUECAT_FEE_PCT * 100).toFixed(0)}% of monthly subscription sales above $${M.REVENUECAT_THRESHOLD.toLocaleString()}/mo (IAP subscription management layer)`);
  para(`Apple Developer: $${M.APPLE_DEV_ANNUAL}/yr | Google Play Developer: $${M.GOOGLE_DEV_ONE_TIME} one-time | CatDoes: $${M.DEV_UPFRONT_ONE_TIME} upfront (one-time, no profit share)`);
  para(`Base44 plan costs are shown as actual fixed monthly tier costs in section 9 (Builder $40/mo, Pro $80/mo, Elite $200/mo), determined by total credits consumed. The per-credit rate ($${M.COST_PER_CREDIT.toFixed(4)}/credit) is used only for per-plan and per-bundle profit analysis in sections 4-6.`);
  para(`AdMob Interstitial: $${M.ADMOB_ECPM}/1k impressions (eCPM). Free users see ads on stops 2+ (~${M.ADS_PER_TOUR} ads/tour, ~${M.TOURS_PER_FREE_USER_MO} tours/mo = $${M.AD_REV_PER_FREE_USER_MO.toFixed(3)}/free user/mo)`);
  para(`AdMob Rewarded: $${M.ADMOB_REWARDED_ECPM}/1k impressions. Paid users watch ~${M.ADS_PER_PAID_USER_MO} ads/mo for +${P.adRewardEnergy} energy each (${P.adRewardNarration} narration / ${P.adRewardManifestation} manifestation). Ad rev: $${B.adReward.rev.toFixed(3)}/paid user/mo. Energy cost: ${B.adReward.creditsPerAd.toFixed(2)} credits/ad x ${Math.round(M.AD_REWARD_UTILIZATION * 100)}% utilization x $${M.COST_PER_CREDIT.toFixed(4)} = $${B.adReward.cost.toFixed(3)}/paid user/mo. Net: ${usd(B.adReward.net)}/paid user/mo (retention investment, not profit).`);
  para(`AdMob Observer narration: Device narration plays one ad before each narration; a fully narrated tour is ~${M.OBSERVER_NARRATION_ADS_PER_TOUR} ads. ${M.OBSERVER_NARRATION_ADS_PER_TOUR} ads x ${M.TOURS_PER_FREE_USER_MO} tours/mo x $${M.ADMOB_PER_IMPRESSION.toFixed(3)} = $${M.NARRATION_AD_REV_PER_FREE_USER_MO.toFixed(2)}/free user/mo.`);
  para(`AdMob Observer tools + saves: Audio Recorder / Radio Sweeper (30s ad = 30s use) ~${M.TOOL_USE_ADS_OBSERVER_MO} ads/mo = $${M.TOOL_USE_AD_REV_OBSERVER_MO.toFixed(2)}; ad-watched evidence saves (Observer and Seeker) ~${M.SAVE_ADS_MO}/mo = $${M.SAVE_AD_REV_MO.toFixed(2)}, each save costs 1 upload credit. Total Observer ad revenue: $${M.OBSERVER_AD_REV_MO.toFixed(2)}/free user/mo.`);
  para('Narration modes: Seeker and Technician use Device narration only (0 credits, no ads). Explorer / Investigator / Trailblazer can use Device (free) or Enhanced (spends narration energy). Rewarded energy top-up ads apply to Explorer+ only.');
  para('Credits charged per action at runtime. 100% utilization = worst case; 50-70% = realistic average.');
  para(`Two-Pass Stop Enrichment (Sept 2026, unchanged): single-site tours run a second LLM pass. One enrichment call costs ~${M.ENRICHMENT_CREDITS_SINGLE_SITE} credits single-site, ~${M.ENRICHMENT_CREDITS_MULTI_SITE} multi-site; blended ~${B.avgEnrichmentCredits} credits per call.`);
  para(`OPTION E - STOP ENRICHMENT: 1 manifestation energy now covers ${B.batch} stops (was 1 per stop). Assumption: the ${B.batch} stops are enriched in ONE batched call, so a call still costs ~${B.avgEnrichmentCredits} credits but now covers ${B.batch} stops - ~${(B.avgEnrichmentCredits / B.batch).toFixed(1)} credits per stop (was ~${A.avgEnrichmentCredits}). An 8-stop tour needs ${8 / B.batch} enrichment energy (was 8).`);
  para(`OPTION E - BLENDED RATE: enrichment now uses half the energy per stop, so it falls from ~${Math.round(A.enrichShare * 100)}% to ~${Math.round(B.enrichShare * 100)}% of manifestation energy spent. Blended manifestation rate: ~${B.blended.toFixed(2)} credits per manifestation energy (A: ${A.blended.toFixed(2)}). This feeds every credit figure below.`);

  // ---------- 3a ----------
  const cap = (credits, perUser) => Math.floor(credits / perUser);
  const capLine = (b44) => `${b44.name} ($${b44.monthlyCost}/mo, ${(b44.credits / 1000).toFixed(0)}k credits): ~${cap(b44.credits, B.perUser100.explorer)} Explorer, ~${cap(b44.credits, B.perUser100.investigator)} Investigator, ~${cap(b44.credits, B.perUser100.trailblazer)} Trailblazer users at 100% utilization (A: ~${cap(b44.credits, A.perUser100.explorer)} / ~${cap(b44.credits, A.perUser100.investigator)} / ~${cap(b44.credits, A.perUser100.trailblazer)})`;
  heading('3a. Base44 Credit Capacity - When to Upgrade');
  para('Integration credits are hard-capped per plan. Actions FAIL when exhausted - no pay-per-credit overflow.');
  para(`Credits per user per month at 100% utilization: Explorer ${Math.round(B.perUser100.explorer).toLocaleString()} (A: ${Math.round(A.perUser100.explorer).toLocaleString()}), Investigator ${Math.round(B.perUser100.investigator).toLocaleString()} (A: ${Math.round(A.perUser100.investigator).toLocaleString()}), Trailblazer ${Math.round(B.perUser100.trailblazer).toLocaleString()} (A: ${Math.round(A.perUser100.trailblazer).toLocaleString()}).`);
  M.BASE44_PLANS.forEach((b44) => para(capLine(b44)));
  para(`At 50% realistic utilization, Builder (10k credits) supports: ~${cap(10000, B.perUser100.explorer * 0.5)} Explorer, ~${cap(10000, B.perUser100.investigator * 0.5)} Investigator, ~${cap(10000, B.perUser100.trailblazer * 0.5)} Trailblazer users.`);
  para('Free (Observer) users are gated - 0 credits. Seeker and Technician have 0 AI energy - 0 credits. Only Explorer+ credits determine the required plan tier.');

  // ---------- 3b ----------
  const perStop = (M.FULL_TOUR_NARRATION_CREDITS - 20) / 8;
  heading('3b. Full Narration Cost Per Tour (All Tabs)');
  para(`A fully narrated tour = every tab at every stop (Ghost Story, History, Paranormal, Investigate) + tour intro + conclusion, Enhanced narration. Reference case: Centralia PA, 8 stops, ~${M.FULL_TOUR_NARRATION_CREDITS} narration credits = $${(M.FULL_TOUR_NARRATION_CREDITS * M.COST_PER_CREDIT).toFixed(2)}/tour (~${perStop.toFixed(0)} credits per stop plus ~20 for intro and conclusion). Cost Analysis A assumed ~${M.A_FULL_TOUR_NARRATION_CREDITS} credits for a 7-stop tour (52 per stop).`);
  table(['Plan', 'Narration energy', 'Fully narrated tours/mo', 'Calculation'],
    [
      ['Explorer', P.explorer.narE.toLocaleString(), '~' + tours(P.explorer.narE).toFixed(1), `${P.explorer.narE} / ${M.FULL_TOUR_NARRATION_CREDITS} credits per tour (A: ${M.OPTION_A.explorer.narE} = ${tours(M.OPTION_A.explorer.narE).toFixed(1)})`],
      ['Investigator', P.investigator.narE.toLocaleString(), '~' + tours(P.investigator.narE).toFixed(1), `${P.investigator.narE} / ${M.FULL_TOUR_NARRATION_CREDITS} credits per tour (A: ${M.OPTION_A.investigator.narE} = ${tours(M.OPTION_A.investigator.narE).toFixed(1)})`],
      ['Trailblazer', P.trailblazer.narE.toLocaleString(), '~' + tours(P.trailblazer.narE).toFixed(1), `${P.trailblazer.narE} / ${M.FULL_TOUR_NARRATION_CREDITS} credits per tour (A: ${M.OPTION_A.trailblazer.narE} = ${tours(M.OPTION_A.trailblazer.narE).toFixed(1)})`],
    ], [80, 90, 110, 230]);
  para(`Users who only narrate ghost stories (not all tabs) stretch energy several times further. Manifestation side: enriching an 8-stop tour now costs ${8 / B.batch} manifestation energy (was 8).`);

  // ---------- 3c ----------
  heading('3c. Credit Consumption Audit');
  para('Energy gating is implemented. All 27 credit-consuming actions are gated - free (Observer) users are blocked, paid users limited by energy allotment. All 12 toolkit tools are visible to all users (Oct 2026), with upgrade prompts on locked tools.');
  para(`Typical cost per active paid user (energy-limited): ${B.ungatedTypical} credits = $${B.ungatedTypicalCost.toFixed(2)}/mo (A: ${A.ungatedTypical} credits = $${A.ungatedTypicalCost.toFixed(2)})`);
  para(`Heavy cost per active paid user: ${B.ungatedWorst} credits = $${B.ungatedWorstCost.toFixed(2)}/mo (A: ${A.ungatedWorst} credits = $${A.ungatedWorstCost.toFixed(2)})`);
  table(['Action', 'Page', 'Type', 'Integration', 'Credits', 'Gated'],
    creditAudit(B.batch).map((a) => [a.action, a.page, a.type, a.integration, a.credits, a.gated]),
    [130, 100, 50, 120, 70, 35]);

  // ---------- 3d ----------
  heading('3d. Per-Action Breakdown - Credits Now Saved by Gating');
  para(`Itemized monthly credits saved by gating for a typical free (Observer) user. Total saved: ${B.freeUserTotal} credits = $${B.freeUserCost.toFixed(2)}/mo per free user (A: ${A.freeUserTotal} credits = $${A.freeUserCost.toFixed(2)}).`);
  table(['Action', 'Trigger', 'Freq/mo', 'Cr Each', 'Total Cr', 'Cost/mo', 'Fix (Gate With)'],
    [...B.freeUserBreakdown.map((r) => [r.action, r.trigger, r.freq, r.creditsEach, r.totalCredits, usd(r.monthlyCost), r.fix]),
      { cells: ['TOTAL per free user/mo', '', '', '', B.freeUserTotal, usd(B.freeUserCost), ''], bold: true }],
    [105, 95, 35, 35, 45, 45, 125]);

  // ---------- 3e ----------
  heading('3e. Toolkit Visibility & AdGate (Oct 2026 - IMPLEMENTED)');
  para('All 12 toolkit tools are visible to every user. Observer (free) gets 4 tools - 2 free (Equipment Guide, Safety Protocol) + 2 ad-gated (Audio Recorder, Radio Sweeper: 30s ad = 30s use, 300s/day cap per tool). Seeker gets the same 4 tools ad-free. Technician and Explorer get 10 of 12 tools. Investigator+ get all 12. Observer ad-gated tools are device-only - 0 integration credits, so ad revenue is nearly pure profit.');
  table(['Tier', 'Visible', 'Accessible', 'Locked'], TOOLKIT_TIERS.map((t) => [t.tier, t.visible, t.accessible, t.locked]), [160, 60, 70, 60]);
  para('Seeker ($3.99/mo) and Technician ($5.99/mo) are ad-free tiers with 0 AI energy - they consume 0 platform credits. High-margin tiers that capture ad-averse users without AI features.');

  // ---------- 4 ----------
  heading('4. Per-Plan Profit - Monthly, 100% Utilization');
  table(['Plan', 'Price', 'Credits', 'Platform', 'Store Fee', 'Cost', 'Profit', 'Margin'],
    B.monthlyAnalysis.map((r) => [r.plan, usd(r.price), Math.round(r.credits).toLocaleString(), usd(r.platformCost), usd(r.sf), usd(r.totalCost), usd(r.profit), r.margin.toFixed(1) + '%']),
    [70, 50, 55, 55, 55, 55, 55, 50]);
  table(['Plan', 'Cost Analysis A credits', 'A platform cost', 'A profit', 'A margin', 'B profit', 'B margin'],
    ['Explorer', 'Investigator'].map((n) => [n, Math.round(aPlan(n).credits).toLocaleString(), usd(aPlan(n).platformCost), usd(aPlan(n).profit), aPlan(n).margin.toFixed(1) + '%', usd(bPlan(n).profit), bPlan(n).margin.toFixed(1) + '%']),
    [70, 110, 80, 65, 60, 65, 60]);

  // ---------- 5 ----------
  heading(`5. Trailblazer - ${P.trailblazerMonths}-Month ($239.99)`);
  const tbRow = (label, c) => [label, Math.round(c.credits).toLocaleString(), usd(c.platformCost), usd(c.sf), usd(c.totalCost), usd(c.profit), c.margin.toFixed(1) + '%'];
  table(['Utilization', `Credits (${P.trailblazerMonths} mo)`, 'Platform', 'Store Fee', 'Cost', 'Profit', 'Margin'],
    [tbRow('100% (max use)', B.trailblazer100), tbRow('50% (realistic)', B.trailblazer50), tbRow('A: 100%', A.trailblazer100), tbRow('A: 50%', A.trailblazer50)],
    [90, 80, 65, 60, 65, 65, 55]);

  // ---------- 6 ----------
  heading(`6. Aura Bundle Profit - 100% Utilization (${auraSplit} split)`);
  table(['Bundle', 'Price', 'Nar / Man energy', 'Credits', 'Platform', 'Store Fee', 'Profit', 'Margin'],
    B.bundleAnalysis.map((r) => [r.name, usd(r.priceNum), `${r.narEnergy} / ${r.manEnergy}`, Math.round(r.credits).toLocaleString(), usd(r.platformCost), usd(r.sf), usd(r.profit), r.margin.toFixed(1) + '%']),
    [65, 45, 85, 50, 55, 55, 50, 50]);
  para(`Explorer+ bundle energy is split ${auraSplit} narration/manifestation; each manifestation energy costs ~${B.blended.toFixed(2)} credits, each narration energy 1 credit. Cost Analysis A priced every bundle energy at a flat 1 credit, so the split now shows up in the cost. Seeker and Technician bundles route to Save Energy (1 credit per energy), so their bundle credits equal the bundle energy.`);

  // ---------- 7 ----------
  heading('7. Fixed Operating Costs');
  table(['Item', 'Cost', 'Period'],
    [...M.FIXED_FIRST_YEAR.map((c) => [c.item, '$' + c.cost, c.period]),
      ['First-Year Total', '$' + M.FIXED_FIRST_YEAR_TOTAL, ''],
      ['Apple Developer Program (Year 2+)', '$' + M.APPLE_DEV_ANNUAL, 'Annual'],
      ['Ongoing Annual Total', '$' + M.FIXED_ONGOING_ANNUAL, '$' + M.FIXED_ONGOING_MONTHLY.toFixed(2) + '/mo']],
    [200, 60, 120]);

  // ---------- 8 ----------
  heading('8a. AdMob Interstitial Ad Revenue (Free Users)');
  table(['Free Users', 'Monthly Rev', 'Annual Rev'], B.adMobScenarios.map((s) => [s.label, usd(s.monthlyRev), usd(s.annualRev)]), [120, 80, 80]);
  heading('8b. AdMob Rewarded Ad Revenue (Explorer+ - Energy Top-Ups)');
  table(['Explorer+ Users', 'Ad Rev/mo', 'Energy Cost/mo', 'Net/mo', 'Credits/mo'],
    B.rewardedAdScenarios.map((s) => [s.label, usd(s.monthlyAdRev), usd(s.monthlyEnergyCost), usd(s.monthlyNet), s.monthlyCredits.toLocaleString()]),
    [110, 70, 80, 70, 70]);

  // ---------- 9 ----------
  heading('9. Revenue Scenarios (Monthly Profit & Loss, 70% Utilization)');
  para('Same four user scales and plan mix as Cost Analysis A: ~30% Seeker, ~20% Technician, ~30% Explorer, ~15% Investigator, ~5% Trailblazer. Only the energy numbers differ.');
  table(['Monthly P&L', ...B.scenarios.map((s) => s.label.split(' ')[0])],
    B.pnlRows.map((r) => (r.section ? { cells: [r.section.toUpperCase(), '', '', '', ''], bold: true } : { cells: [r.label, ...B.scenarios.map((s) => r.val(s))], bold: r.bold })),
    [230, 70, 70, 70, 70]);

  heading('9a. Base44 Plan Required Per Scenario');
  para('Total monthly integration credits consumed by paid users (70% utilization) plus credits from consumed ad-reward energy, and the minimum Base44 plan needed. Seeker and Technician have 0 AI energy - 0 credits. Free (Observer) users are gated - 0 credits.');
  table(['Scenario', 'Paid Credits', 'Ad-Reward Cr', 'Base44 Plan', 'Plan $/mo'],
    B.scenarios.map((s) => [s.label, (s.totalCredits - s.rewardedAdCredits).toLocaleString(), s.rewardedAdCredits.toLocaleString(), s.base44Plan.plan, '$' + s.base44Plan.cost]),
    [150, 80, 80, 80, 70]);

  // ---------- 10 ----------
  heading('10. Key Takeaways');
  heading('Cost Analysis A vs B at a glance (monthly profit, 70% utilization)', 10);
  table(['Scenario', 'A profit/mo', 'A margin', 'A Base44 plan', 'B profit/mo', 'B margin', 'B Base44 plan', 'Change'],
    B.scenarios.map((s, i) => [s.label.split(' ')[0], usd0(A.scenarios[i].profit), A.scenarios[i].margin.toFixed(1) + '%', `${A.scenarios[i].base44Plan.plan} ($${A.scenarios[i].base44Plan.cost})`, usd0(s.profit), s.margin.toFixed(1) + '%', `${s.base44Plan.plan} ($${s.base44Plan.cost})`, usd0(s.profit - A.scenarios[i].profit)]),
    [50, 60, 50, 80, 60, 50, 80, 60]);

  const planLine = (n) => `${n}: ${Math.round(aPlan(n).credits).toLocaleString()} -> ${Math.round(bPlan(n).credits).toLocaleString()} credits/user/mo (${usd(aPlan(n).platformCost)} -> ${usd(bPlan(n).platformCost)}); profit ${usd(aPlan(n).profit)} (${pct0(aPlan(n).margin)}) -> ${usd(bPlan(n).profit)} (${pct0(bPlan(n).margin)}) at 100% utilization.`;
  para(`NEW ENERGY COST PER PLAN: ${planLine('Explorer')} ${planLine('Investigator')} Trailblazer (A: ${M.OPTION_A.trailblazerMonths} mo -> B: ${P.trailblazerMonths} mo): ${Math.round(A.trailblazer100.credits).toLocaleString()} -> ${Math.round(B.trailblazer100.credits).toLocaleString()} credits; profit ${usd(A.trailblazer100.profit)} (${pct0(A.trailblazer100.margin)}) -> ${usd(B.trailblazer100.profit)} (${pct0(B.trailblazer100.margin)}) at 100%, and ${usd(A.trailblazer50.profit)} (${pct0(A.trailblazer50.margin)}) -> ${usd(B.trailblazer50.profit)} (${pct0(B.trailblazer50.margin)}) at 50%.`);
  // Months of full-energy use the price (after store fee) can pay for.
  const break100 = (B.trailblazer100.price - B.trailblazer100.sf) / (B.trailblazer100.platformCost / P.trailblazerMonths);
  para(`TRAILBLAZER BREAK-EVEN: at 100% utilization each Trailblazer costs ${usd(B.trailblazer100.totalCost)} against $239.99 collected, a loss of ${usd(Math.abs(B.trailblazer100.profit))} per user. The price covers full-energy use for about ${break100.toFixed(0)} of the ${P.trailblazerMonths} months. Trailblazer breaks even at about ${Math.round((B.trailblazer100.price - B.trailblazer100.sf) / B.trailblazer100.platformCost * 100)}% average utilization. Worst case if all ${M.TRAILBLAZER_MAX_SLOTS} slots sell and every user maxes energy every month: ${usd0(M.TRAILBLAZER_MAX_SLOTS * B.trailblazer100.profit)} total.`);
  const mA = A.scenarios[3], mB = B.scenarios[3];
  para(`CREDIT CAPACITY: Builder plan (10k credits) supports only ~${cap(10000, B.perUser100.explorer)} Explorer, ~${cap(10000, B.perUser100.investigator)} Investigator, or ~${cap(10000, B.perUser100.trailblazer)} Trailblazer users at 100% utilization (A: ~${cap(10000, A.perUser100.explorer)} / ~${cap(10000, A.perUser100.investigator)} / ~${cap(10000, A.perUser100.trailblazer)}). At the Mature scale, credits used rise from ${mA.totalCredits.toLocaleString()} to ${mB.totalCredits.toLocaleString()} per month, taking the Base44 bill from ${mA.base44Plan.plan} ($${mA.base44Plan.cost}/mo) to ${mB.base44Plan.plan} ($${mB.base44Plan.cost}/mo). Free (Observer), Seeker, and Technician users consume 0 AI credits.`);
  para('Energy gating is deployed. All 27 credit-consuming actions are gated. Free (Observer) users are blocked from creating tours, narrating, enriching stops, and using sweepers. Paid users are limited by their monthly energy allotment.');
  para(`Seeker ($3.99/mo) and Technician ($5.99/mo) have 0 AI energy - they consume 0 platform credits and are unaffected by Option E. Their only cost is the 15% store fee: Seeker nets ~${usd(bPlan('Seeker').profit)}/mo, Technician ~${usd(bPlan('Technician').profit)}/mo per user.`);
  para(`OBSERVER AD REVENUE (unchanged): each free user earns ~$${M.OBSERVER_AD_REV_MO.toFixed(2)}/mo - stop ads $${M.AD_REV_PER_FREE_USER_MO.toFixed(2)} + narration ads $${M.NARRATION_AD_REV_PER_FREE_USER_MO.toFixed(2)} + tool ads $${M.TOOL_USE_AD_REV_OBSERVER_MO.toFixed(2)} + save ads $${M.SAVE_AD_REV_MO.toFixed(2)}. At 5,000 free users that is ~$${Math.round(5000 * M.OBSERVER_AD_REV_MO).toLocaleString()}/mo.`);
  para(`Store fees (15% IAP) are the largest non-platform cost. Rewarded ads (Explorer+) generate ~$${B.adReward.rev.toFixed(2)}/paid user/mo against ~$${B.adReward.cost.toFixed(2)}/paid user/mo in credits when consumed (net ${usd(B.adReward.net)}) - a retention investment, not a profit center.`);
  para(`AURA BUNDLES: the ${auraSplit} split sends more bundle energy to narration (1 credit) and less to manifestation (~${B.blended.toFixed(2)} credits). Bundle margins at 100% utilization: ${B.bundleAnalysis.map((b) => `${b.name} ${pct0(b.margin)}`).join(', ')}.`);
  const hf = B.trailblazer100HighFee;
  para(`RISK: Apple's fee jumps to 30% above $${(M.STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr revenue. At that rate Trailblazer is ${usd(hf.profit)} (${pct0(hf.margin)}) at 100% utilization and ${usd(B.trailblazer50HighFee.profit)} (${pct0(B.trailblazer50HighFee.margin)}) at 50%. Revisit pricing before crossing $${(M.STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M.`);
  para(`Fixed costs (~$${M.FIXED_ONGOING_MONTHLY.toFixed(0)}/mo ongoing) are negligible at scale. First-year total: $${M.FIXED_FIRST_YEAR_TOTAL} (includes $${M.DEV_UPFRONT_ONE_TIME} CatDoes upfront). RevenueCat 1% above $2,500/mo is ~$${Math.round(mB.revcatCost)}/mo at the Mature scenario.`);

  doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
  if (y > 760) newPage();
  doc.text('AGES - Accessible Ghost Exploration Solutions  |  Cost Analysis B (Option E - Hybrid energy)  |  Confidential  |  ' + today, L, y + 20);

  doc.save('AGES-Cost-Analysis-B.pdf');
}