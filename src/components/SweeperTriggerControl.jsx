import React from 'react';
import { Layers, ScanFace } from 'lucide-react';
import SensitivityControl from '@/components/SensitivityControl';
import DepthSensitivityControl from '@/components/DepthSensitivityControl';

// The sweepers' anomaly trigger, on their setup screen: which method watches for a
// figure, and the tuning that belongs to that method — the brightness scale (with the
// torch at its darkest end) for the camera-image scan, the detector's two distance
// gates for the depth sensor.
//
// The depth sensor is the default wherever the phone has one, because it confirms a
// person-shaped body standing in front of the surface behind it rather than a contrast
// reading of the same scene. The torch band is the one exception, shown as such: with
// the torch up, the depth module owns the camera and cannot light the room, so the
// contrast scan is what actually runs.
export default function SweeperTriggerControl({ trigger, sensitivity, onSensitivityChange, depthDetection }) {
  const { mode, preference, setPreference, depthAvailable, torchForcesContrast } = trigger;
  const depthSelected = mode === 'depth';

  const note = torchForcesContrast
    ? 'Torch setting: the Contrast Scan is watching while the torch is on, because the depth sensor needs some light on a figure to confirm one and cannot drive the torch itself. Bring the brightness back below the torch band and the Depth Scan returns.'
    : !depthAvailable
      ? 'No depth sensor on this device, so the Contrast Scan reads the camera image for figure-sized shapes — the detection the Anomaly Camera uses, and the one that works with the torch in the dark.'
      : depthSelected
        ? 'Depth Scan: the phone\'s own body recognition confirms a person-shaped body standing in front of the surface behind it, and marks it on screen as a figure. Furniture, doorways and wall fittings are never marked. The figure needs some light on it — the depth reading does not.'
        : 'Contrast Scan: reads the camera image for figure-sized shapes. Works on every device, and in the dark with the torch.';

  return (
    <div className="p-3 rounded-lg bg-card/30 border border-border/30 space-y-3">
      <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <ScanFace className="w-3 h-3" /> Anomaly Trigger
      </p>
      <div className="flex gap-1.5">
        <button
          onClick={() => setPreference('depth')}
          disabled={!depthAvailable || torchForcesContrast}
          aria-pressed={depthSelected}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-heading uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            depthSelected
              ? 'bg-primary/20 border border-primary/40 text-primary'
              : 'bg-card/30 border border-border/40 text-muted-foreground'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Depth Scan
        </button>
        <button
          onClick={() => setPreference('contrast')}
          aria-pressed={!depthSelected}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-heading uppercase tracking-wider transition-colors ${
            !depthSelected
              ? 'bg-primary/20 border border-primary/40 text-primary'
              : 'bg-card/30 border border-border/40 text-muted-foreground'
          }`}
        >
          <ScanFace className="w-3.5 h-3.5" /> Contrast Scan
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{note}</p>
      {mode === 'depth' ? (
        <DepthSensitivityControl
          protrusion={depthDetection.protrusion}
          minSize={depthDetection.minSize}
          onChange={depthDetection.update}
        />
      ) : (
        <SensitivityControl sensitivity={sensitivity} onChange={onSensitivityChange} />
      )}
      {preference === 'contrast' && depthAvailable && (
        <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
          Depth Scan stays available on this device — tap it to switch back.
        </p>
      )}
    </div>
  );
}