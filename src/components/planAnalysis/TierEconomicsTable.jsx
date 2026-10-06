import React from 'react';
import { th, td, num } from './tableStyles';

const usd = (n) => '$' + n.toFixed(2);

// Per-user monthly economics for every tier (the app as built).
export default function TierEconomicsTable({ tiers }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr>
            <th className={th}>Tier</th>
            <th className={th}>Price / mo</th>
            <th className={th}>Narration</th>
            <th className={th}>Ads that earn money</th>
            <th className={`${th} ${num}`}>Ad rev</th>
            <th className={`${th} ${num}`}>AI credit cost</th>
            <th className={`${th} ${num}`}>Store fee</th>
            <th className={`${th} ${num}`}>Net / user / mo</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => (
            <tr key={t.tier}>
              <td className={`${td} font-semibold print-text`}>{t.tier}</td>
              <td className={`${td} print-text`}>{t.priceLabel}</td>
              <td className={`${td} text-xs print-muted`}>{t.narration}</td>
              <td className={`${td} text-xs print-muted`}>{t.ads}</td>
              <td className={`${td} ${num} print-text`}>{usd(t.adRev)}</td>
              <td className={`${td} ${num} print-text`}>{usd(t.creditCost)}</td>
              <td className={`${td} ${num} print-text`}>{usd(t.store)}</td>
              <td className={`${td} ${num} font-semibold print-text`}>{usd(t.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}