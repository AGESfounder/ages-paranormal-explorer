import React from 'react';
import { ScanFace, Ruler, Maximize2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

// The depth method's two controls, and only these two: how far a figure has to stand
// in front of the surface behind it before it counts, and the smallest figure
// counted. This is deliberately not the contrast control under a different label —
// the depth sensor lights the scene itself and reports real distances, so there is no
// brightness to tune; these move the detector's own gates, and both are judged on
// screen, in the view the investigator is looking at.
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
          <span>Catches figures closer to a surface</span>
          <span>Only clearly forward</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Maximize2 className="w-3 h-3" /> Smallest figure
          </span>
          <span className="text-[10px] font-mono text-primary">{Math.round(minSize)}% of view</span>
        </div>
        <Slider
          value={[minSize]}
          min={15}
          max={60}
          step={5}
          onValueChange={([value]) => onChange({ minSize: value })}
          aria-label="Smallest figure counted, as a percent of the view"
          className="py-1"
        />
        <div className="flex justify-between text-[9px] font-heading uppercase tracking-wider text-muted-foreground/50">
          <span>Smaller figures</span>
          <span>Only larger figures</span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
        Only a figure the phone's body recognition confirms is marked: a person-shaped body, standing at least this far in front of the surface behind it and filling at least this much of the view. Furniture, doorways and wall fittings are never labelled — they stay part of the room's depth image. Lower the stand-out distance to catch a figure standing closer to a wall; raise it to count only figures that clearly come forward. The figure itself needs some light on it, the depth reading does not. Both settings are kept for your next depth scan.
      </p>
    </div>
  );
}