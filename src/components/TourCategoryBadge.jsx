import React from 'react';
import { Building2, MapPin, Car } from 'lucide-react';

const LABELS = { landmark: 'Landmark', area: 'Area', road_trip: 'Road Trip' };
const ICONS = { landmark: Building2, area: MapPin, road_trip: Car };
const STYLES = {
  landmark: 'bg-primary/20 text-primary border border-primary/40',
  area: 'bg-accent/20 text-accent-foreground border border-accent/40',
  road_trip: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
};

export default function TourCategoryBadge({ category, className = '', showIcon = true }) {
  if (!category || !LABELS[category]) return null;
  const Icon = ICONS[category];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-heading font-bold uppercase tracking-wider whitespace-nowrap ${STYLES[category]} ${className}`}>
      {showIcon && <Icon className="w-3 h-3" />}
      {LABELS[category]}
    </span>
  );
}