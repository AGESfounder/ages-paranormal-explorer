import React from 'react';
import { ScanFace, Ruler, Maximize2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

// The depth method's two controls, and only these two: how far a form has to
// stand in front of the surface behind it before it counts, and the smallest form
// counted. This is deliberately not the contrast control under a different label —
// the depth sensor lights the scene itself and reports real distances, so there is
// no brightness to tune; these move the detector's own gates.
//
// Both go to the native depth module and apply to the next frame, so a change is
// visible in the live view while a session runs.
export default function DepthSensitivityControl({ protrusion, minSize, onChange }) {
  const inches = Math.round(protrusion * 39.37);
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <ScanFace className="w-3 h-3" /> Depth Detection
      </p>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Ruler className="w-3 h-3" /> Stand-out distance
          </span>
          <span className="text-[10px] font-mono text-primary">{protrusion.toFixed(2)} m · {inches} in</span>
        </div>
        <Slider
          value={[protrusion]}
          min={0.1}
          max={1.2}
          step={0.05}
          onValueChange={([value]) => onChange({ protrusion: value })}
          aria-label="Stand-out distance in metres"
          className="py-1"
        />
        <div className="flex justify-between text-[9px] font-heading uppercase tracking-wider text-muted-foreground/50">
          <span>Catches subtler forms</span>
          <span>Only clear-cut</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Maximize2 className="w-3 h-3" /> Smallest form
          </span>
          <span className="text-[10px] font-mono text-primary">{Math.round(minSize)}% of view</span>
        </div>
        <Slider
          value={[minSize]}
          min={15}
          max={60}
          step={5}
          onValueChange={([value]) => onChange({ minSize: value })}
          aria-label="Smallest form counted, as a percent of the view"
          className="py-1"
        />
        <div className="flex justify-between text-[9px] font-heading uppercase tracking-wider text-muted-foreground/50">
          <span>Smaller forms</span>
          <span>Only larger forms</span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
        Lower the stand-out distance to catch subtler forms, at the cost of picking up furniture and wall fittings; raise it to count only forms that clearly come forward. A smaller minimum catches smaller forms and more noise. Both settings are kept for your next depth scan.
      </p>
    </div>
  );
}