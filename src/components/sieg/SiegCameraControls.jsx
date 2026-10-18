import React from 'react';
import { ScanFace } from 'lucide-react';
import AnomalyModePicker from '@/components/AnomalyModePicker';
import SensitivityControl from '@/components/SensitivityControl';
import DepthSensitivityControl from '@/components/DepthSensitivityControl';

// The figure scan's own controls, on the setup screen, above the session lengths:
// whichever camera method the session will use is the one tuned here. The contrast
// camera takes the brightness scale (with the torch at its darkest end); a depth
// sensor has no brightness to tune, so it takes the detector's two distance gates.
// Both are the shared settings the standalone Anomaly Camera uses, so a session
// starts with the tuning that tool is already on.
export default function SiegCameraControls({
  mode, onModeChange, depthAvailable, sensitivity, onSensitivityChange, depthDetection,
}) {
  return (
    <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 space-y-3">
      <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <ScanFace className="w-3 h-3" /> Figure Scan Camera
      </p>
      <AnomalyModePicker mode={mode} onChange={onModeChange} depthAvailable={depthAvailable} />
      {mode === 'contrast' ? (
        <SensitivityControl sensitivity={sensitivity} onChange={onSensitivityChange} />
      ) : mode === 'depth' ? (
        <DepthSensitivityControl
          protrusion={depthDetection.protrusion}
          minSize={depthDetection.minSize}
          onChange={depthDetection.update}
        />
      ) : null}
    </div>
  );
}