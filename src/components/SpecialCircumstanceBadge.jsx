import React from 'react';
import { Compass } from 'lucide-react';

// A tour that finished correctly but is smaller than a full tour because the
// area genuinely lacks the stops — not a broken build, so it does not wear the
// needs-review treatment. The reason travels with the label so a visitor reads
// the shortness as candor rather than a defect.
const LABELS = { area: 'Special Circumstance Area Tour' };

export default function SpecialCircumstanceBadge({ tour }) {
  if (!tour?.special_circumstance) return null;
  const label = LABELS[tour.tour_category] || 'Special Circumstance Tour';
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-heading uppercase tracking-wider text-amber-400">
        <Compass className="w-3 h-3" /> {label}
      </p>
      {tour.special_circumstance_reason && (
        <p className="text-[11px] text-muted-foreground leading-snug mt-1">{tour.special_circumstance_reason}</p>
      )}
    </div>
  );
}