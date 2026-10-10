import React from 'react';

/**
 * Tier header used on the Dashboard — both the Current Plan panel and each
 * upgrade card.
 *
 * Layout contract: the tier name sits centered on its own full-width line,
 * and the tier's selling-point banner sits centered beneath it. Keeping the
 * name on its own line stops longer tiers (INVESTIGATOR, TRAILBLAZER) from
 * wrapping mid-word inside a narrow box on phones.
 */
export default function PlanTierHeader({ planId, name, labelClass = '', highlight }) {
  return (
    <div className="flex flex-col gap-2 mb-3">
      <div className={`flex flex-col items-center justify-center px-3 py-2 rounded-lg border ${labelClass}`}>
        <span className="font-heading font-bold uppercase text-sm tracking-wide sm:text-lg sm:tracking-wider leading-tight text-center break-words max-w-full">
          {name}
        </span>
        {planId === 'trailblazer' && (
          <span className="text-[9px] text-amber-400 font-heading mt-0.5">30-Month Elite · 6 Months Free</span>
        )}
      </div>
      {highlight && (
        <div className="flex items-center px-3 py-2 rounded-lg bg-primary/15 border border-primary/40">
          <p className="text-sm font-bold text-primary tracking-wide leading-tight text-center w-full">{highlight}</p>
        </div>
      )}
    </div>
  );
}