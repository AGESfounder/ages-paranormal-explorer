import { useState, useEffect, useCallback } from 'react';
import { getNarrationMode, setNarrationMode, canUseEnhanced } from '@/lib/narrationMode';

// React hook for narration mode (Device vs Enhanced). Persists to localStorage.
// Falls back to Device when the user can't use Enhanced (no paid access or
// no narration energy). Paid users default to Enhanced on first visit.
export function useNarrationMode(user) {
  const [mode, setModeState] = useState(() => getNarrationMode());

  // When user first loads, if no mode was saved, set the default
  useEffect(() => {
    if (!user) return;
    if (!localStorage.getItem('ages_narration_mode')) {
      const defaultMode = canUseEnhanced(user) ? 'enhanced' : 'device';
      setModeState(defaultMode);
      setNarrationMode(defaultMode);
    }
  }, [user]);

  const setMode = useCallback((newMode) => {
    setModeState(newMode);
    setNarrationMode(newMode);
  }, []);

  // If user can't use enhanced, force device mode regardless of saved state
  const effectiveMode = (user && !canUseEnhanced(user)) ? 'device' : mode;

  return { mode: effectiveMode, setMode };
}