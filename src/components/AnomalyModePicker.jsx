import React from 'react';
import { ScanFace, Layers } from 'lucide-react';

// The Anomaly Camera's two methods. Contrast Scan is the camera-image reader that
// runs everywhere; Depth Scan is the LiDAR reader and is only ever offered on a
// device that actually has a depth sensor.
const MODES = [
  {
    id: 'contrast',
    label: 'Contrast Scan',
    icon: ScanFace,
    desc: 'Reads the live camera image and outlines skin-toned, figure-sized regions. Works on every device.',
  },
  {
    id: 'depth',
    label: 'Depth Scan',
    icon: Layers,
    desc: 'Reads the phone\'s LiDAR depth sensor and outlines solid, figure-sized forms standing out from the background. Anything outlined is physically in the space, and the sensor supplies its own illumination, so it works in the dark with no torch. Depth readings are shown in metres, straight from the sensor.',
  },
];

export default function AnomalyModePicker({ mode, onChange, depthAvailable }) {
  const modes = depthAvailable ? MODES : MODES.slice(0, 1);
  const current = modes.find((m) => m.id === mode) || modes[0];

  return (
    <div className="space-y-2">
      {modes.length > 1 && (
        <div className="flex gap-1.5">
          {modes.map((m) => {
            const Icon = m.icon;
            const isActive = m.id === current.id;
            return (
              <button
                key={m.id}
                onClick={() => onChange(m.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-heading uppercase tracking-wider transition-colors ${
                  isActive
                    ? 'bg-primary/20 border border-primary/40 text-primary'
                    : 'bg-card/30 border border-border/40 text-muted-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {m.label}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{current.desc}</p>
    </div>
  );
}