import React from 'react';
import { Building2, MapPinned, Route, Ship, Snowflake } from 'lucide-react';

const CATEGORIES = [
  { value: 'cold_spot', label: 'Cold Spot', icon: Snowflake, description: 'A short tour with 1-4 stops — a single haunted location or small cluster' },
  { value: 'landmark', label: 'Property', icon: Building2, description: 'One specific property — all stops on the same site' },
  { value: 'area', label: 'Area', icon: MapPinned, description: 'Various properties in a local area — no repeat stops' },
  { value: 'road_trip', label: 'Road Trip', icon: Route, description: 'Extensive distance — 5+ miles between most stops, 8-10 stops' },
  { value: 'ship', label: 'Ship', icon: Ship, description: 'A haunted ship or vessel — all stops on the same vessel' },
];

export default function TourCategoryPicker({ value, onChange }) {
  return (
    <div className="space-y-2">
      {CATEGORIES.map(cat => (
        <button
          key={cat.value}
          type="button"
          onClick={() => onChange(cat.value)}
          className={`w-full flex items-start gap-3 min-h-[44px] p-3 rounded-lg border text-left transition-colors ${
            value === cat.value
              ? 'border-primary bg-primary/10'
              : 'border-border/40 bg-card/40 hover:border-primary/30'
          }`}
        >
          <cat.icon className={`w-4 h-4 mt-0.5 shrink-0 ${value === cat.value ? 'text-primary' : 'text-muted-foreground'}`} />
          <div>
            <p className={`text-xs font-heading uppercase tracking-wider ${value === cat.value ? 'text-primary' : 'text-foreground'}`}>{cat.label}</p>
            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{cat.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}