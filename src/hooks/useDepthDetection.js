import { useEffect, useRef, useState } from 'react';
import { setDepthDetection } from '@/lib/nativeDepth';

// The depth method's two gates, set by the investigator and remembered between
// sessions: how far a form must stand in front of the surface behind it before it
// counts (metres), and the smallest form counted (percent of the frame height).
//
// There is no brightness scale here — the sensor lights the scene itself and
// reports real distances — so these move the detector's own gates rather than
// re-tuning a colour reading.
//
// Values go to the native depth module whenever they change, so a change takes
// effect on the next frame, including mid-session. The push is held briefly while
// a slider is dragged (one push per drag, not one per pixel), and it is also sent
// when the tool opens, so last session's setting is in force before the first
// frame arrives.
const RANGE = { protrusion: [0.1, 1.2], minSize: [15, 60] };
export const DEPTH_DETECTION_DEFAULTS = { protrusion: 0.35, minSize: 30 };
const STORAGE_KEY = 'ages_depth_detection';

/** @param {number} value @param {number[]} range */
const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value));

export default function useDepthDetection() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && Number.isFinite(saved.protrusion) && Number.isFinite(saved.minSize)) {
        return {
          protrusion: clamp(saved.protrusion, RANGE.protrusion),
          minSize: clamp(saved.minSize, RANGE.minSize),
        };
      }
    } catch {}
    return DEPTH_DETECTION_DEFAULTS;
  });
  const pushTimer = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(
      () => setDepthDetection(settings.protrusion, settings.minSize / 100),
      120,
    );
    return () => { if (pushTimer.current) clearTimeout(pushTimer.current); };
  }, [settings]);

  return { ...settings, update: (patch) => setSettings((prev) => ({ ...prev, ...patch })) };
}