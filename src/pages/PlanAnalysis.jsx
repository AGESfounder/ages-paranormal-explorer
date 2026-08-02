import React from 'react';
import { Printer, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';

// ===== DATA (mirrors src/lib/plans.js + base44/shared/plans.js) =====
const PLANS = [
  { name: 'Observer', price: '$0', billing: 'Free forever', manE: 0, narE: 0,
    features: 'Browse all 50 states + international tours; view tour details, stops, maps, text; save favorites' },
  { name: 'Explorer', price: '$5.99', billing: 'Monthly ($59.99/yr)', manE: 5, narE: 300,
    features: 'AI narration (~1 tour/mo); custom tour generation (1-2/mo); ranked tours; nearby + abroad; evidence journal; community map; leaderboard; 8-tool toolkit; aura bundles' },
  { name: 'Investigator', price: '$9.99', billing: 'Monthly ($99.99/yr)', manE: 15, narE: 1000,
    features: 'Everything in Explorer; AI narration (~4 tours/mo); custom tours (up to 5/mo); full 12-tool toolkit; evidence dashboard analytics; aura bundles' },
  { name: 'Trailblazer', price: '$199.99', billing: 'One-time, 30 months (max 300 slots)', manE: 25, narE: 1200,
    features: 'Everything in Investigator; AI narration (~5 tours/mo); custom tours (up to 8/mo); exclusive badge; early access; 30-mo price lock; 20% off aura bundles' },
];

const AURA_BUNDLES = [
  { name: 'Flicker', energy: 100, price: '$1.99' },
  { name: 'Apparition', energy: 400, price: '$4.99' },
  { name: 'Haunting', energy: 1000, price: '$10.99' },
  { name: 'Spectral', energy: 2000, price: '$18.99' },
];

// ===== COST ASSUMPTIONS =====
const CREDITS_PER_MANIFESTATION = 3;   // 1 InvokeLLM call (Automatic model) = ~3 credits
const CREDITS_PER_NARRATION = 1;       // 1 narration energy = 1 GenerateSpeech credit
const COST_PER_CREDIT = 0.004;         // Builder/Pro plan: $40-80/mo ÷ 10k-20k credits

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
const MEDIAN_CO_FIRST_YEAR = 569;
const MEDIAN_CO_ANNUAL = 399;
const BASE44_MONTHLY = 40;           // Base44 Builder plan subscription

// AdMob (interstitial ads for free users — stop 2+ paranormal history on each tour)
const ADMOB_ECPM = 15;                 // $15 per 1,000 interstitial impressions
const ADMOB_PER_IMPRESSION = ADMOB_ECPM / 1000;
const ADS_PER_TOUR = 7;                // stops 2-8 on avg 8-stop tour (stop 1 is free)
const TOURS_PER_FREE_USER_MO = 2;
const AD_REV_PER_FREE_USER_MO = ADS_PER_TOUR * TOURS_PER_FREE_USER_MO * ADMOB_PER_IMPRESSION;

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
  { plan: 'Explorer', price: 5.99, manE: 5, narE: 300 },
  { plan: 'Investigator', price: 9.99, manE: 15, narE: 1000 },
].map(p => {
  const { credits, platformCost } = calcCosts(p.manE, p.narE, 1);
  const sf = storeFee(p.price);
  const totalCost = platformCost + sf;
  const profit = p.price - totalCost;
  return { ...p, credits, platformCost, sf, totalCost, profit, margin: (profit / p.price * 100) };
});

// Trailblazer (36 months, 100% utilization)
const trailblazerAnalysis = (() => {
  const price = 199.99;
  const { credits, platformCost } = calcCosts(25, 1200, 30);
  const sf = storeFee(price);
  const totalCost = platformCost + sf;
  const profit = price - totalCost;
  return { price, credits, platformCost, sf, totalCost, profit, margin: (profit / price * 100) };
})();

// Trailblazer at 50% utilization
const trailblazer50 = (() => {
  const price = 199.99;
  const { credits, platformCost } = calcCosts(12.5, 600, 30);
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
  { item: 'Median.co (App Builder)', cost: MEDIAN_CO_FIRST_YEAR, period: 'Annual — Year 1' },
  { item: 'Base44 Builder Plan', cost: BASE44_MONTHLY * 12, period: 'Annual ($' + BASE44_MONTHLY + '/mo)' },
];
const fixedCostsOngoing = [
  { item: 'Apple Developer Program', cost: APPLE_DEV_ANNUAL, period: 'Annual' },
  { item: 'Median.co (App Builder)', cost: MEDIAN_CO_ANNUAL, period: 'Annual — Year 2+' },
  { item: 'Base44 Builder Plan', cost: BASE44_MONTHLY * 12, period: 'Annual ($' + BASE44_MONTHLY + '/mo)' },
];
const fixedFirstYearTotal = APPLE_DEV_ANNUAL + GOOGLE_DEV_ONE_TIME + MEDIAN_CO_FIRST_YEAR + (BASE44_MONTHLY * 12);
const fixedOngoingAnnual = APPLE_DEV_ANNUAL + MEDIAN_CO_ANNUAL + (BASE44_MONTHLY * 12);
const fixedOngoingMonthly = fixedOngoingAnnual / 12;

// AdMob revenue projections at different free-user counts
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

// Revenue scenarios (monthly, 70% avg utilization, includes ad revenue + all costs)
const scenarios = [
  { label: 'Small (50 paid / 250 free)', mix: { explorer: 30, investigator: 15, trailblazer: 5 }, freeUsers: 250 },
  { label: 'Growing (200 paid / 1,000 free)', mix: { explorer: 130, investigator: 55, trailblazer: 15 }, freeUsers: 1000 },
  { label: 'Scale (500 paid / 2,500 free)', mix: { explorer: 330, investigator: 140, trailblazer: 30 }, freeUsers: 2500 },
  { label: 'Mature (1,000 paid / 5,000 free)', mix: { explorer: 680, investigator: 270, trailblazer: 50 }, freeUsers: 5000 },
].map(s => {
  const explorerRev = s.mix.explorer * 5.99;
  const investigatorRev = s.mix.investigator * 9.99;
  const trailblazerRev = s.mix.trailblazer * (199.99 / 30);
  const subRev = explorerRev + investigatorRev + trailblazerRev;
  const adRev = s.freeUsers * AD_REV_PER_FREE_USER_MO;
  const totalRev = subRev + adRev;
  // Platform costs at 70% utilization
  const platformCosts = s.mix.explorer * calcCosts(5 * 0.7, 300 * 0.7, 1).platformCost
    + s.mix.investigator * calcCosts(15 * 0.7, 1000 * 0.7, 1).platformCost
    + s.mix.trailblazer * calcCosts(25 * 0.7, 1200 * 0.7, 1).platformCost;
  // Store fees (15% on IAP subscription revenue; ad revenue not subject to store fees)
  const storeCosts = subRev * STORE_FEE_PCT;
  // RevenueCat (1% above $2,500/month in subscription sales)
  const revcatCost = revenuecatFee(subRev);
  // Fixed costs (ongoing monthly)
  const fixedCost = fixedOngoingMonthly;
  const totalCost = platformCosts + storeCosts + revcatCost + fixedCost;
  const profit = totalRev - totalCost;
  return { ...s, explorerRev, investigatorRev, trailblazerRev, subRev, adRev, totalRev, platformCosts, storeCosts, revcatCost, fixedCost, totalCost, profit, margin: (profit / totalRev * 100) };
});

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
  para(`Apple Developer: $${APPLE_DEV_ANNUAL}/yr | Google Play Developer: $${GOOGLE_DEV_ONE_TIME} one-time | Median.co: $${MEDIAN_CO_FIRST_YEAR} Year 1, $${MEDIAN_CO_ANNUAL}/yr after | Base44 Builder: $${BASE44_MONTHLY}/mo`);
  para(`AdMob: $${ADMOB_ECPM}/1k interstitial impressions (eCPM). Free users see ads on stops 2+ (~${ADS_PER_TOUR} ads/tour, ~${TOURS_PER_FREE_USER_MO} tours/mo = $${AD_REV_PER_FREE_USER_MO.toFixed(3)}/free user/mo)`);
  para('Credits charged per action at runtime. 100% utilization = worst case; 50-70% = realistic average.');

  heading('4. Per-Plan Profit - Monthly, 100% Utilization');
  table(['Plan', 'Price', 'Credits', 'Platform', 'Store Fee', 'Cost', 'Profit', 'Margin'],
    monthlyAnalysis.map(r => [r.plan, '$' + r.price.toFixed(2), r.credits, '$' + r.platformCost.toFixed(2), '$' + r.sf.toFixed(2), '$' + r.totalCost.toFixed(2), '$' + r.profit.toFixed(2), r.margin.toFixed(1) + '%']),
    [65, 45, 45, 55, 50, 50, 50, 45]);

  heading('5. Trailblazer - 30-Month ($199.99)');
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
     ...fixedCostsOngoing.map(c => [c.item, '$' + c.cost, c.period]),
     ['Ongoing Annual Total', '$' + fixedOngoingAnnual, '$' + fixedOngoingMonthly.toFixed(2) + '/mo']],
    [160, 60, 120]);

  heading('8. AdMob Ad Revenue (Free Users)');
  table(['Free Users', 'Monthly Rev', 'Annual Rev'],
    adMobScenarios.map(s => [s.label, '$' + s.monthlyRev.toFixed(2), '$' + s.annualRev.toFixed(2)]),
    [120, 80, 80]);
  para(`Model: ${ADS_PER_TOUR} ads/tour x ${TOURS_PER_FREE_USER_MO} tours/mo x $${ADMOB_PER_IMPRESSION.toFixed(3)}/impression = $${AD_REV_PER_FREE_USER_MO.toFixed(3)}/free user/mo. Stop 1 paranormal history is free; stops 2+ show interstitial ads.`);

  heading('9. Revenue Scenarios (Monthly, 70% Utilization)');
  table(['Scenario', 'Sub Rev', 'Ad Rev', 'Total Rev', 'Platform', 'Store', 'RevCat', 'Fixed', 'Total Cost', 'Profit', 'Margin'],
    scenarios.map(s => [s.label, '$' + s.subRev.toFixed(0), '$' + s.adRev.toFixed(0), '$' + s.totalRev.toFixed(0), '$' + s.platformCosts.toFixed(0), '$' + s.storeCosts.toFixed(0), '$' + s.revcatCost.toFixed(0), '$' + s.fixedCost.toFixed(0), '$' + s.totalCost.toFixed(0), '$' + s.profit.toFixed(0), s.margin.toFixed(1) + '%']),
    [100, 45, 45, 50, 50, 40, 40, 40, 50, 50, 45]);

  heading('10. Key Takeaways');
  para('Store fees (15%) are the largest non-platform cost — significantly higher than traditional payment processing (2.9% + $0.30).');
  para('Explorer yields ~64% margin at full utilization; Investigator ~43%. Both healthier when energy goes unused.');
  para('Trailblazer yields a thin ~9% margin at 100% utilization (30-month duration helps). At 50% realistic usage, margin improves to ~47%. The 300-slot cap is critical.');
  para('AdMob revenue from free users meaningfully supplements subscription income — 5,000 free users generate ~$' + (5000 * AD_REV_PER_FREE_USER_MO).toFixed(0) + '/mo, offsetting platform and store costs.');
  para('Fixed costs (~$' + fixedOngoingMonthly.toFixed(0) + '/mo ongoing) are negligible at scale but matter for small operations. First-year total: $' + fixedFirstYearTotal + '.');
  para('RevenueCat 1% above $2,500/mo is minimal vs. store fees — only ~$' + revenuecatFee(7104).toFixed(0) + '/mo at the Mature scenario.');
  para('RISK: Apple fee jumps to 30% above $1M/yr revenue. At that point, Trailblazer becomes deeply unprofitable even at 50% utilization — revisit pricing before crossing $1M.');
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
            {/* Hidden — kept for future use. Remove "hidden" class to re-enable. */}
            <button
              onClick={downloadPDF}
              className="hidden flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors min-h-[44px]"
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
            <p className="print-text"><span className="font-semibold">Platform cost:</span> ${COST_PER_CREDIT.toFixed(4)}/credit (Builder/Pro plan: $40–80/mo ÷ 10k–20k credits)</p>
            <p className="print-text"><span className="font-semibold">App Store / Google Play fee:</span> {(STORE_FEE_PCT * 100).toFixed(0)}% of IAP revenue (both stores, small devs &lt; $1M/yr). Apple jumps to {(STORE_FEE_PCT_HIGH * 100).toFixed(0)}% above ${(STORE_HIGH_THRESHOLD / 1000000).toFixed(0)}M/yr; Google stays 15%.</p>
            <p className="print-text"><span className="font-semibold">RevenueCat:</span> {(REVENUECAT_FEE_PCT * 100).toFixed(0)}% of monthly subscription sales above ${REVENUECAT_THRESHOLD.toLocaleString()}/mo</p>
            <p className="print-text"><span className="font-semibold">Fixed costs:</span> Apple Developer ${APPLE_DEV_ANNUAL}/yr · Google Play ${GOOGLE_DEV_ONE_TIME} one-time · Median.co ${MEDIAN_CO_FIRST_YEAR} Year 1, ${MEDIAN_CO_ANNUAL}/yr after · Base44 Builder ${BASE44_MONTHLY}/mo (${BASE44_MONTHLY * 12}/yr)</p>
            <p className="print-text"><span className="font-semibold">AdMob:</span> ${ADMOB_ECPM}/1k interstitial impressions (eCPM). Free users see ads on stops 2+ (~{ADS_PER_TOUR} ads/tour × {TOURS_PER_FREE_USER_MO} tours/mo = ${AD_REV_PER_FREE_USER_MO.toFixed(3)}/free user/mo)</p>
            <p className="print-muted text-xs italic">Note: Credits are charged per action at runtime. Users who don't exhaust their monthly energy allotment cost less. Analysis shows 100% utilization (worst case) and 50–70% (realistic average).</p>
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
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">5. Trailblazer — 30-Month Lifetime ($199.99)</h2>
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
          <p className="text-xs print-muted mt-2 italic">With the 15% store fee and shorter 30-month duration, Trailblazer yields a thin ~9% margin at 100% utilization. At 50% realistic usage, margin improves to ~47%. The 300-slot cap remains critical. At Apple's 30% rate (above $1M/yr), this tier returns to a loss even at 50% utilization.</p>
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
          <p className="text-xs print-muted mt-2 italic">Google Play's $25 is a one-time fee (not recurring). Median.co drops from $569 (Year 1) to $399/yr after. Base44 Builder plan ($40/mo) covers app hosting, database, auth, and integrations.</p>
        </section>

        {/* 8. AdMob Ad Revenue */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">8. AdMob Ad Revenue (Free Users)</h2>
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
                  <th className={`${th} ${num}`}>Ad Rev</th>
                  <th className={`${th} ${num}`}>Total Rev</th>
                  <th className={`${th} ${num}`}>Platform</th>
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
                    <td className={`${td} ${num} print-text`}>${s.adRev.toFixed(0)}</td>
                    <td className={`${td} ${num} font-semibold print-text`}>${s.totalRev.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>${s.platformCosts.toFixed(0)}</td>
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
          <p className="text-xs print-muted mt-2 italic">Trailblazer revenue amortized over 30 months. 5:1 free-to-paid ratio assumed. Store fees apply only to IAP subscription revenue, not AdMob. RevenueCat 1% applies above $2,500/mo in subscription sales.</p>
        </section>

        {/* 10. Key Takeaways */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">10. Key Takeaways</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block p-4 space-y-2 text-sm print-text">
            <p>• <span className="font-semibold">Store fees (15%)</span> are the largest non-platform cost — significantly higher than traditional payment processing (2.9% + $0.30).</p>
            <p>• <span className="font-semibold">Explorer</span> yields ~64% margin at full utilization; <span className="font-semibold">Investigator</span> ~43%. Both healthier when energy goes unused.</p>
            <p>• <span className="font-semibold">Trailblazer</span> yields a thin ~{trailblazerAnalysis.margin.toFixed(0)}% margin at 100% utilization (30-month duration helps). At 50% realistic usage, margin improves to ~{trailblazer50.margin.toFixed(0)}%. The 300-slot cap remains critical.</p>
            <p>• <span className="font-semibold">AdMob revenue</span> from free users meaningfully supplements subscription income — 5,000 free users generate ~${(5000 * AD_REV_PER_FREE_USER_MO).toFixed(0)}/mo, offsetting platform and store costs.</p>
            <p>• <span className="font-semibold">Fixed costs</span> (~${fixedOngoingMonthly.toFixed(0)}/mo ongoing) are negligible at scale but matter for small operations. First-year total: ${fixedFirstYearTotal}.</p>
            <p>• <span className="font-semibold">RevenueCat</span> 1% above $2,500/mo is minimal vs. store fees — only ~${revenuecatFee(7104).toFixed(0)}/mo at the Mature scenario.</p>
            <p>• <span className="font-semibold">RISK:</span> Apple's fee jumps to 30% above $1M/yr revenue. At that point, Trailblazer becomes deeply unprofitable even at 50% utilization — revisit pricing before crossing $1M.</p>
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