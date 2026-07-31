import React from 'react';

const LABELS = { landmark: 'Landmark', area: 'Area', road_trip: 'Road Trip' };
const STYLES = {
  landmark: 'bg-primary/10 text-primary border border-primary/20',
  area: 'bg-accent/10 text-accent-foreground border border-accent/20',
  road_trip: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
};

export default function TourCategoryBadge({ category, className = '' }) {
  if (!category || !LABELS[category]) return null;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-heading uppercase tracking-wider whitespace-nowrap ${STYLES[category]} ${className}`}>
      {LABELS[category]}
    </span>
  );
}