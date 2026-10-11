import { useState, useEffect, useRef } from 'react';
import { BRIGHTNESS_MARKS, DEFAULT_BRIGHTNESS } from '@/lib/anomalyDetect';

// Shared brightness/sensitivity setting for all 4 camera-based anomaly tools:
// Anomaly Camera (SLS), Term Sweeper, Yes/No/IDK Sweeper and Alphabet Sweeper.
// Set it once and it applies everywhere (persisted to localStorage).
//
// The scale runs 0 = bright Daylight to 100 = complete darkness, with the five
// original presets sitting at the marks below. The marks come from the detector
// itself, so the buttons can never drift out of step with the tunings they pick.
const STORAGE_KEY = 'ages_anomaly_brightness';
const LEGACY_KEY = 'ages_anomaly_sensitivity'; // the old 1-5 button scale

export const TORCH_BAND_MIN = 90; // the torch switches on in the darkest 10%

const LABELS = ['Daylight', 'Indoor', 'Dim', 'Dark', 'Torch'];

export const SENSITIVITY_LEVELS = BRIGHTNESS_MARKS.map((value, i) => ({
  id: i + 1, // stable key for the button icons
  value,
  label: LABELS[i],
}));

// A setting saved on the old 1-5 scale, mapped to its mark on the new one.
const LEGACY_MAP = { 1: 0, 2: 25, 3: 50, 4: 75, 5: 100 };

// True when the setting sits in the torch band at the darkest end of the scale.
export function isTorchActive(value) {
  return value >= TORCH_BAND_MIN;
}

export default function useSensitivity() {
  const [sensitivity, setSensitivity] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      if (saved >= 0 && saved <= 100) return saved;
      const legacy = parseInt(localStorage.getItem(LEGACY_KEY), 10);
      if (LEGACY_MAP[legacy] != null) return LEGACY_MAP[legacy];
    } catch {}
    return DEFAULT_BRIGHTNESS;
  });
  const sensitivityRef = useRef(sensitivity);

  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, String(sensitivity)); } catch {} }, [sensitivity]);

  return { sensitivity, setSensitivity, sensitivityRef };
}