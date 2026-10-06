import React from 'react';
import { th, td, num } from './tableStyles';

// Monthly profit & loss: one column per user scale, rows read top to bottom
// (users -> subscription revenue -> ad revenue -> costs -> profit).
export default function ScenarioPnLTable({ scenarios, rows }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 print-block overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr>
            <th className={th}>Monthly P&amp;L</th>
            {scenarios.map((s) => (
              <th key={s.label} className={`${th} ${num}`}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) =>
            r.section ? (
              <tr key={i} className="bg-muted/20">
                <td colSpan={scenarios.length + 1} className={`${td} text-xs font-heading uppercase tracking-wider text-primary print-text`}>{r.section}</td>
              </tr>
            ) : (
              <tr key={i} className={r.bold ? 'font-semibold' : ''}>
                <td className={`${td} print-text`}>{r.label}</td>
                {scenarios.map((s) => (
                  <td key={s.label} className={`${td} ${num} print-text`}>{r.val(s)}</td>
                ))}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}