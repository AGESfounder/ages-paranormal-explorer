import React from 'react';
import { Eye, DoorOpen } from 'lucide-react';

const OPTIONS = [
  { value: 'exterior_interior', label: 'Exterior / Interior', icon: DoorOpen, description: 'Full access — exterior grounds and interior rooms/areas (may require paid admission)' },
  { value: 'exterior_only', label: 'Exterior Only', icon: Eye, description: 'Free 24/7 exterior access — grounds and perimeter only, no interior entry needed' },
];

export default function AccessTypePicker({ value, onChange }) {
  return (
    <div className="space-y-2">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
            value === opt.value
              ? 'border-primary bg-primary/10'
              : 'border-border/40 bg-card/40 hover:border-primary/30'
          }`}
        >
          <opt.icon className={`w-4 h-4 mt-0.5 shrink-0 ${value === opt.value ? 'text-primary' : 'text-muted-foreground'}`} />
          <div>
            <p className={`text-xs font-heading uppercase tracking-wider ${value === opt.value ? 'text-primary' : 'text-foreground'}`}>{opt.label}</p>
            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{opt.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}