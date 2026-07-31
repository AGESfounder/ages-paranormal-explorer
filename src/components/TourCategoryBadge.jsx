import React from 'react';
import { Building2, MapPin, Car, Ship, Snowflake } from 'lucide-react';

const LABELS = { landmark: 'Property', area: 'Area', road_trip: 'Road Trip', ship: 'Ship', cold_spot: 'Cold Spot' };
const ICONS = { landmark: Building2, area: MapPin, road_trip: Car, ship: Ship, cold_spot: Snowflake };
const STYLES = {
  landmark: 'bg-primary/20 text-primary border border-primary/40',
  area: 'bg-accent/20 text-accent-foreground border border-accent/40',
  road_trip: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
  ship: 'bg-cyan-glow/20 text-cyan-glow border border-cyan-glow/40',
  cold_spot: 'bg-sky-400/20 text-sky-300 border border-sky-400/40',
};

export default function TourCategoryBadge({ category, className = '', showIcon = true }) {
  if (!category || !LABELS[category]) return null;
  const Icon = ICONS[category];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-heading font-bold uppercase tracking-wider whitespace-nowrap ${STYLES[category]} ${className}`}>
      {showIcon && <Icon className="w-3 h-3" />}
      {LABELS[category]}
    </span>
  );
}