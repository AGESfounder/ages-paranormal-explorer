import React from 'react';
import { Sun, Home, Eye, Moon, Flashlight } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { SENSITIVITY_LEVELS } from '@/hooks/useSensitivity';

const ICONS = { 1: Sun, 2: Home, 3: Eye, 4: Moon, 5: Flashlight };

// Shared control for all 4 camera-based anomaly tools: the five presets as
// tappable buttons, plus a slider between them for finer control.
//
// The scale runs 0 = bright Daylight (left) to 100 = complete darkness (right),
// with the presets at 0 · 25 · 50 · 75 · 100. The torch switches on in the
// darkest band at the top of the scale. Buttons stay tappable so a known-good
// setting is one tap away; the slider is for tuning between them.
export default function SensitivityControl({ sensitivity, onChange }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Eye className="w-3 h-3" /> Detection Sensitivity
        </p>
        <span className="text-[10px] font-mono text-primary">{Math.round(sensitivity)}%</span>
      </div>
      <Slider
        value={[sensitivity]}
        min={0}
        max={100}
        step={1}
        onValueChange={([value]) => onChange(value)}
        aria-label="Brightness and sensitivity"
        className="py-1"
      />
      <div className="flex justify-between text-[9px] font-heading uppercase tracking-wider text-muted-foreground/50">
        <span>Bright daylight</span>
        <span>Complete darkness</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {SENSITIVITY_LEVELS.map(level => {
          const Icon = ICONS[level.id];
          const isActive = sensitivity === level.value;
          return (
            <button
              key={level.id}
              onClick={() => onChange(level.value)}
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
        Slide for finer control between presets. The Torch turns on at the darkest end. Setting persists across all tools.
      </p>
    </div>
  );
}