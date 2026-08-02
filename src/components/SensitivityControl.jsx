import React from 'react';
import { Sun, Home, Eye, Moon } from 'lucide-react';
import { SENSITIVITY_LEVELS } from '@/hooks/useSensitivity';

const ICONS = { 1: Sun, 2: Home, 3: Eye, 4: Moon };

// Segmented sensitivity selector shared by all 4 camera-based anomaly tools.
// Level 1 (Daylight) = least sensitive; Level 4 (Dark) = most sensitive.
export default function SensitivityControl({ sensitivity, onChange }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Eye className="w-3 h-3" /> IR Sensitivity
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {SENSITIVITY_LEVELS.map(level => {
          const Icon = ICONS[level.id];
          const isActive = sensitivity === level.id;
          return (
            <button
              key={level.id}
              onClick={() => onChange(level.id)}
              aria-label={`Sensitivity: ${level.label}`}
              className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-heading uppercase tracking-wider transition-colors min-h-[44px] justify-center ${
                isActive
                  ? 'bg-primary/20 border-primary/50 text-primary'
                  : 'bg-card/30 border-border/30 text-muted-foreground hover:border-primary/30'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {level.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
        Lower for bright/daylight. Setting persists across all tools.
      </p>
    </div>
  );
}