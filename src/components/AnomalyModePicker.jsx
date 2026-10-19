import React from 'react';
import { ScanFace, Layers, Video } from 'lucide-react';

// The Anomaly Camera's three methods. Contrast Scan is the camera-image reader
// that runs everywhere; Depth Scan uses LiDAR or supported ARCore depth;
// Device Camera records a standard
// video with no figure detection or overlay.
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
    desc: 'Reads the phone\'s depth sensor — LiDAR where the device carries one, Google\'s AR depth estimation on supported Android phones — and marks human figures: the phone\'s own body recognition confirms a person-shaped body standing in front of the surface behind it, and only then is it outlined, with the skeleton it found drawn over it. Everything else the sensor sees stays as the room\'s own depth image, so furniture and doorways are never labelled. The figure needs some light on it; the depth reading itself does not. Where there is no LiDAR sensor the map builds over the first few seconds: slowly sweep the phone across the room to start it.',
    requiresDepth: true,
  },
  {
    id: 'device',
    label: 'Device Camera',
    icon: Video,
    desc: 'Records a standard video from the device camera with no figure detection or overlay. Use this when you prefer a plain video recording.',
  },
];

export default function AnomalyModePicker({ mode, onChange, depthAvailable }) {
  const modes = MODES.filter((m) => !m.requiresDepth || depthAvailable || m.id === mode);
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
                disabled={m.requiresDepth && !depthAvailable}
                aria-pressed={isActive}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-heading uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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