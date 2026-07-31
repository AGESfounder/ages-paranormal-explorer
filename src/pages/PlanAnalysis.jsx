import React from 'react';
import { Printer, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';

// ===== DATA (mirrors src/lib/plans.js + base44/shared/plans.js) =====
const PLANS = [
  {
    name: 'Observer', price: '$0', billing: 'Free forever',
    manE: 0, narE: 0,
    features: 'Browse all 50 states + international tours; view tour details, stops, maps, text; save favorites',
  },
  {
    name: 'Explorer', price: '$4.99', billing: 'Monthly ($49.99/yr)',
    manE: 5, narE: 300,
    features: 'AI narration (~1 tour/mo); custom tour generation (1-2/mo); ranked tours; nearby + abroad; evidence journal; community map; leaderboard; 8-tool toolkit; aura bundles',
  },
  {
    name: 'Investigator', price: '$9.99', billing: 'Monthly ($99.99/yr)',
    manE: 15, narE: 1000,
    features: 'Everything in Explorer; AI narration (~4 tours/mo); custom tours (up to 5/mo); full 12-tool toolkit; evidence dashboard analytics; aura bundles',
  },
  {
    name: 'Trailblazer', price: '$199.99', billing: 'One-time, 3 years (max 300 slots)',
    manE: 25, narE: 1200,
    features: 'Everything in Investigator; AI narration (~5 tours/mo); custom tours (up to 8/mo); exclusive badge; early access; 3-yr price lock; 20% off aura bundles',
  },
];

const AURA_BUNDLES = [
  { name: 'Flicker', energy: 100, price: '$0.99' },
  { name: 'Apparition', energy: 400, price: '$3.99' },
  { name: 'Haunting', energy: 1000, price: '$9.99' },
  { name: 'Spectral', energy: 2000, price: '$17.99' },
];

// ===== COST ASSUMPTIONS =====
const CREDITS_PER_MANIFESTATION = 3;   // 1 InvokeLLM call (Automatic model) = ~3 credits
const CREDITS_PER_NARRATION = 1;       // 1 narration energy = 1 GenerateSpeech credit (1 credit / 50 chars)
const COST_PER_CREDIT = 0.004;         // Builder/Pro plan: $40-80/mo ÷ 10k-20k credits
const PAYMENT_FEE_PCT = 0.029;         // Wix/Stripe processing
const PAYMENT_FEE_FLAT = 0.30;

function calcCosts(manE, narE, months) {
  const credits = (manE * CREDITS_PER_MANIFESTATION + narE * CREDITS_PER_NARRATION) * months;
  const platformCost = credits * COST_PER_CREDIT;
  return { credits, platformCost };
}

function paymentFee(price) {
  return price * PAYMENT_FEE_PCT + PAYMENT_FEE_FLAT;
}

// Per-plan monthly profit (1 month, 100% utilization)
const monthlyAnalysis = [
  { plan: 'Explorer', price: 4.99, manE: 5, narE: 300 },
  { plan: 'Investigator', price: 9.99, manE: 15, narE: 1000 },
].map(p => {
  const { credits, platformCost } = calcCosts(p.manE, p.narE, 1);
  const pf = paymentFee(p.price);
  const totalCost = platformCost + pf;
  const profit = p.price - totalCost;
  return { ...p, credits, platformCost, pf, totalCost, profit, margin: (profit / p.price * 100) };
});

// Trailblazer (36 months, 100% utilization)
const trailblazerAnalysis = (() => {
  const price = 199.99;
  const { credits, platformCost } = calcCosts(25, 1200, 36);
  const pf = paymentFee(price);
  const totalCost = platformCost + pf;
  const profit = price - totalCost;
  return { price, credits, platformCost, pf, totalCost, profit, margin: (profit / price * 100) };
})();

// Trailblazer at 50% utilization
const trailblazer50 = (() => {
  const price = 199.99;
  const { credits, platformCost } = calcCosts(12.5, 600, 36);
  const pf = paymentFee(price);
  const totalCost = platformCost + pf;
  const profit = price - totalCost;
  return { price, credits, platformCost, pf, totalCost, profit, margin: (profit / price * 100) };
})();

// Aura bundle profit (100% utilization)
const bundleAnalysis = AURA_BUNDLES.map(b => {
  const price = parseFloat(b.price.replace('$', ''));
  const credits = b.energy;
  const platformCost = credits * COST_PER_CREDIT;
  const pf = paymentFee(price);
  const totalCost = platformCost + pf;
  const profit = price - totalCost;
  return { ...b, priceNum: price, credits, platformCost, pf, totalCost, profit, margin: (profit / price * 100) };
});

// Revenue scenarios (monthly recurring, blended mix)
const scenarios = [
  { label: 'Small (50 users)', mix: { explorer: 30, investigator: 15, trailblazer: 5 } },
  { label: 'Growing (200 users)', mix: { explorer: 130, investigator: 55, trailblazer: 15 } },
  { label: 'Scale (500 users)', mix: { explorer: 330, investigator: 140, trailblazer: 30 } },
  { label: 'Mature (1,000 users)', mix: { explorer: 680, investigator: 270, trailblazer: 50 } },
].map(s => {
  const explorerRev = s.mix.explorer * 4.99;
  const investigatorRev = s.mix.investigator * 9.99;
  const trailblazerRev = s.mix.trailblazer * (199.99 / 36); // amortized monthly
  const totalRev = explorerRev + investigatorRev + trailblazerRev;
  // Cost at 70% avg utilization
  const explorerCost = s.mix.explorer * calcCosts(5 * 0.7, 300 * 0.7, 1).platformCost;
  const investigatorCost = s.mix.investigator * calcCosts(15 * 0.7, 1000 * 0.7, 1).platformCost;
  const trailblazerCost = s.mix.trailblazer * calcCosts(25 * 0.7, 1200 * 0.7, 1).platformCost;
  const paymentCosts = (s.mix.explorer * paymentFee(4.99)) + (s.mix.investigator * paymentFee(9.99)) + (s.mix.trailblazer * paymentFee(199.99) / 36);
  const totalCost = explorerCost + investigatorCost + trailblazerCost + paymentCosts;
  const profit = totalRev - totalCost;
  return { ...s, explorerRev, investigatorRev, trailblazerRev, totalRev, totalCost, profit, margin: (profit / totalRev * 100) };
});

const today = new Date('2026-07-31').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

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

  // Title
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
  para(`Payment processing: ${(PAYMENT_FEE_PCT * 100).toFixed(1)}% + $${PAYMENT_FEE_FLAT.toFixed(2)} per transaction`);
  para('Credits charged per action at runtime. 100% utilization = worst case; 50-70% = realistic average.');

  heading('4. Per-Plan Profit - Monthly, 100% Utilization');
  table(['Plan', 'Price', 'Credits', 'Platform', 'Fee', 'Cost', 'Profit', 'Margin'],
    monthlyAnalysis.map(r => ['$' + r.price.toFixed(2), r.credits, '$' + r.platformCost.toFixed(2), '$' + r.pf.toFixed(2), '$' + r.totalCost.toFixed(2), '$' + r.profit.toFixed(2), r.margin.toFixed(1) + '%']).map((r, i) => [monthlyAnalysis[i].plan, ...r]),
    [65, 45, 50, 55, 45, 55, 55, 55, 50]);

  heading('5. Trailblazer - 3-Year ($199.99)');
  table(['Utilization', 'Credits', 'Platform', 'Fee', 'Cost', 'Profit', 'Margin'],
    [['100%', trailblazerAnalysis.credits.toLocaleString(), '$' + trailblazerAnalysis.platformCost.toFixed(2), '$' + trailblazerAnalysis.pf.toFixed(2), '$' + trailblazerAnalysis.totalCost.toFixed(2), '$' + trailblazerAnalysis.profit.toFixed(2), trailblazerAnalysis.margin.toFixed(1) + '%'],
     ['50%', trailblazer50.credits.toLocaleString(), '$' + trailblazer50.platformCost.toFixed(2), '$' + trailblazer50.pf.toFixed(2), '$' + trailblazer50.totalCost.toFixed(2), '$' + trailblazer50.profit.toFixed(2), trailblazer50.margin.toFixed(1) + '%']],
    [65, 65, 55, 45, 55, 55, 50]);

  heading('6. Aura Bundle Profit - 100% Utilization');
  table(['Bundle', 'Price', 'Credits', 'Platform', 'Fee', 'Profit', 'Margin'],
    bundleAnalysis.map(r => [r.name, '$' + r.priceNum.toFixed(2), r.credits, '$' + r.platformCost.toFixed(2), '$' + r.pf.toFixed(2), '$' + r.profit.toFixed(2), r.margin.toFixed(1) + '%']),
    [65, 45, 45, 55, 45, 55, 50]);

  heading('7. Revenue Scenarios (Monthly, 70% Utilization)');
  table(['Scenario', 'Explorer', 'Investigator', 'Trailblazer', 'Total Rev', 'Total Cost', 'Profit', 'Margin'],
    scenarios.map(s => [s.label, '$' + s.explorerRev.toFixed(0), '$' + s.investigatorRev.toFixed(0), '$' + s.trailblazerRev.toFixed(0), '$' + s.totalRev.toFixed(0), '$' + s.totalCost.toFixed(0), '$' + s.profit.toFixed(0), s.margin.toFixed(1) + '%']),
    [90, 60, 65, 65, 60, 60, 55, 50]);

  heading('8. Key Takeaways');
  para('Explorer is the volume driver - 66% margin at full utilization, higher when energy goes unused.');
  para('Investigator delivers 52% margin at max use; higher price absorbs the larger energy allotment.');
  para('Trailblazer breaks near-even at 100% utilization but ~51% margin at realistic (50%) usage. 300-slot cap protects credits.');
  para('Aura Bundles are high-margin at $3.99+; Flicker ($0.99) is thin due to fixed payment fees.');
  para('Annual plans improve cash flow and reduce per-transaction fee burden.');
  para('Risk: users who max out narration energy monthly are costliest. Cache generated audio (replay saved URLs) to avoid repeat TTS charges.');

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
            <p className="print-text"><span className="font-semibold">Platform cost:</span> ${COST_PER_CREDIT.toFixed(4)}/credit (Builder/Pro plan: $40–80/mo ÷ 10k–20k credits)</p>
            <p className="print-text"><span className="font-semibold">Payment processing:</span> {(PAYMENT_FEE_PCT*100).toFixed(1)}% + ${PAYMENT_FEE_FLAT.toFixed(2)} per transaction</p>
            <p className="print-muted text-xs italic">Note: Credits are charged per action at runtime. Users who don't exhaust their monthly energy allotment cost less. Analysis below shows 100% utilization (worst case) and 50–70% (realistic average).</p>
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
                  <th className={`${th} ${num}`}>Payment Fee</th>
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
                    <td className={`${td} ${num} print-text`}>${r.pf.toFixed(2)}</td>
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
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">5. Trailblazer — 3-Year Lifetime ($199.99)</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Utilization</th>
                  <th className={`${th} ${num}`}>Credits (36 mo)</th>
                  <th className={`${th} ${num}`}>Platform Cost</th>
                  <th className={`${th} ${num}`}>Payment Fee</th>
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
                  <td className={`${td} ${num} print-text`}>${trailblazerAnalysis.pf.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>${trailblazerAnalysis.totalCost.toFixed(2)}</td>
                  <td className={`${td} ${num} font-semibold print-text`}>${trailblazerAnalysis.profit.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>{trailblazerAnalysis.margin.toFixed(1)}%</td>
                </tr>
                <tr>
                  <td className={`${td} font-semibold print-text`}>50% (realistic)</td>
                  <td className={`${td} ${num} print-text`}>{trailblazer50.credits.toLocaleString()}</td>
                  <td className={`${td} ${num} print-text`}>${trailblazer50.platformCost.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>${trailblazer50.pf.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>${trailblazer50.totalCost.toFixed(2)}</td>
                  <td className={`${td} ${num} font-semibold print-text`}>${trailblazer50.profit.toFixed(2)}</td>
                  <td className={`${td} ${num} print-text`}>{trailblazer50.margin.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mt-2 italic">Trailblazer is capped at 300 slots to protect long-term credit viability. At 100% utilization it breaks nearly even; at realistic usage it yields strong margin.</p>
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
                  <th className={`${th} ${num}`}>Payment Fee</th>
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
                    <td className={`${td} ${num} print-text`}>${r.pf.toFixed(2)}</td>
                    <td className={`${td} ${num} font-semibold print-text`}>${r.profit.toFixed(2)}</td>
                    <td className={`${td} ${num} print-text`}>{r.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mt-2 italic">Flicker's $0.99 price carries a high relative payment-fee burden. Larger bundles have stronger margins.</p>
        </section>

        {/* 7. Revenue Scenarios */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">7. Revenue Scenarios (Monthly, 70% Avg Utilization)</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Scenario</th>
                  <th className={`${th} ${num}`}>Explorer Rev</th>
                  <th className={`${th} ${num}`}>Investigator Rev</th>
                  <th className={`${th} ${num}`}>Trailblazer (amort.)</th>
                  <th className={`${th} ${num}`}>Total Rev</th>
                  <th className={`${th} ${num}`}>Total Cost</th>
                  <th className={`${th} ${num}`}>Profit</th>
                  <th className={`${th} ${num}`}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <tr key={s.label}>
                    <td className={`${td} font-semibold print-text`}>{s.label}</td>
                    <td className={`${td} ${num} print-text`}>${s.explorerRev.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>${s.investigatorRev.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>${s.trailblazerRev.toFixed(0)}</td>
                    <td className={`${td} ${num} font-semibold print-text`}>${s.totalRev.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>${s.totalCost.toFixed(0)}</td>
                    <td className={`${td} ${num} font-semibold print-text`}>${s.profit.toFixed(0)}</td>
                    <td className={`${td} ${num} print-text`}>{s.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs print-muted mt-2 italic">Trailblazer revenue amortized over 36 months. Costs assume 70% average energy utilization across all paying users.</p>
        </section>

        {/* 8. Key Takeaways */}
        <section className="mb-8">
          <h2 className="font-heading text-lg font-semibold text-foreground mb-3 print-text">8. Key Takeaways</h2>
          <div className="rounded-lg border border-border bg-card/40 print-block p-4 space-y-2 text-sm print-text">
            <p>• <span className="font-semibold">Explorer</span> is the volume driver — 66% margin at full utilization, higher when users don't exhaust energy.</p>
            <p>• <span className="font-semibold">Investigator</span> delivers 52% margin at max use; the higher price absorbs the larger energy allotment.</p>
            <p>• <span className="font-semibold">Trailblazer</span> breaks near-even at 100% utilization but yields ~51% margin at realistic (50%) usage. The 300-slot cap protects against credit overruns.</p>
            <p>• <span className="font-semibold">Aura Bundles</span> are high-margin at the $3.99+ tiers; Flicker ($0.99) is thin due to fixed payment fees.</p>
            <p>• <span className="font-semibold">Annual plans</span> improve cash flow and reduce per-transaction fee burden (one payment vs. twelve).</p>
            <p>• <span className="font-semibold">Risk factor:</span> users who max out narration energy every month are the costliest. Caching generated audio (replay saved URLs) is critical to avoid repeat TTS charges.</p>
          </div>
        </section>

        <footer className="text-center text-xs print-muted pt-4 border-t border-border/50">
          AGES — Accessible Ghost Exploration Solutions · Confidential · {today}
        </footer>
      </div>
    </div>
  );
}