import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'ages_anomaly_sensitivity';

export const SENSITIVITY_LEVELS = [
  { id: 1, label: 'Daylight' },
  { id: 2, label: 'Indoor' },
  { id: 3, label: 'Dim' },
  { id: 4, label: 'Dark' },
];

// Shared sensitivity state for all 4 camera-based anomaly tools.
// Persists to localStorage so the user sets it once and it applies everywhere.
// Returns a ref so the requestAnimationFrame detection loop always reads the
// latest value without needing to restart the loop on every change.
export default function useSensitivity() {
  const [sensitivity, setSensitivity] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      return v >= 1 && v <= 4 ? v : 4;
    } catch { return 4; }
  });
  const sensitivityRef = useRef(sensitivity);

  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, String(sensitivity)); } catch {} }, [sensitivity]);

  return { sensitivity, setSensitivity, sensitivityRef };
}