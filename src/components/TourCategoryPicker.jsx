import React from 'react';
import { Building2, MapPinned, Route } from 'lucide-react';

const CATEGORIES = [
  { value: 'landmark', label: 'Property', icon: Building2, description: 'One specific property — stops within the same site' },
  { value: 'area', label: 'Area', icon: MapPinned, description: 'Walking or close driving — different locations, 1-3 miles' },
  { value: 'road_trip', label: 'Road Trip', icon: Route, description: 'Driving across a wider region — 8+ stops, higher mileage' },
];

export default function TourCategoryPicker({ value, onChange }) {
  return (
    <div className="space-y-2">
      {CATEGORIES.map(cat => (
        <button
          key={cat.value}
          type="button"
          onClick={() => onChange(cat.value)}
          className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
            value === cat.value
              ? 'border-primary bg-primary/10'
              : 'border-border/40 bg-card/40 hover:border-primary/30'
          }`}
        >
          <cat.icon className={`w-4 h-4 mt-0.5 shrink-0 ${value === cat.value ? 'text-primary' : 'text-muted-foreground'}`} />
          <div>
            <p className={`text-xs font-heading uppercase tracking-wider ${value === cat.value ? 'text-primary' : 'text-foreground'}`}>{cat.label}</p>
            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{cat.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}