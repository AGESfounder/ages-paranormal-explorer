import React from 'react';
import TierEconomicsTable from './TierEconomicsTable';

const GUIDE = [
  ['Per-user numbers, all 6 tiers', 'The table above, then sections 4–6'],
  ['Projections at 4 user scales', 'Section 9 (monthly profit & loss) and 9a (Base44 plan needed)'],
  ['Ad revenue assumptions', 'Sections 3 and 8'],
  ['Reference: credit capacity, narration cost, credit audit, toolkit', 'Sections 3a–3e'],
];

export default function StartHere({ tiers, scenarios }) {
  return (
    <section className="mb-10 rounded-lg border border-primary/40 bg-primary/5 print-block p-4">
      <h2 className="font-heading text-lg font-semibold text-foreground mb-1 print-text">Start Here — The App As Built</h2>
      <p className="text-xs print-muted mb-3">Observer is free and ad-supported (ad before every Device narration). Seeker and Technician use Device narration only: 0 AI credits, no stop or narration ads. Explorer, Investigator and Trailblazer can use Device (free) or Enhanced narration (spends energy).</p>
      <h3 className="font-heading text-sm font-semibold text-foreground mb-2 print-text">Per-user monthly economics (70% utilization)</h3>
      <TierEconomicsTable tiers={tiers} />
      <h3 className="font-heading text-sm font-semibold text-foreground mb-2 mt-4 print-text">Projected monthly profit</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {scenarios.map((s) => (
          <a key={s.label} href="#projections" className="p-3 rounded-lg bg-card/40 border border-border/40 text-center hover:border-primary/50 transition-colors">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="text-lg font-bold text-green-500 print-text">${Math.round(s.profit).toLocaleString()}/mo</p>
            <p className="text-[10px] text-muted-foreground print-muted">{s.margin.toFixed(0)}% margin</p>
          </a>
        ))}
      </div>
      <ul className="mt-4 space-y-1">
        {GUIDE.map(([what, where]) => (
          <li key={what} className="text-xs print-text"><span className="font-semibold">{what}:</span> <span className="print-muted">{where}</span></li>
        ))}
      </ul>
    </section>
  );
}