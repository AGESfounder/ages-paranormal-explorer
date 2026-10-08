import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getActiveContext } from '@/lib/evidenceContext';
import GpsLocationDialog from '@/components/GpsLocationDialog';
import { useLocationTrackingGate } from '@/hooks/useLocationTrackingGate';

/**
 * Shared GPS capture + dialog hook for Toolkit tool evidence saves.
 *
 * When the user saves evidence from a Toolkit tool, this hook:
 *   1. Tries to capture device GPS (high accuracy, then low accuracy fallback)
 *   2. If GPS succeeds → returns { latitude, longitude, location_source: 'GPS' }
 *   3. If GPS fails (any reason) → shows GpsLocationDialog with three choices:
 *      Retry GPS / Use Current Tour Stop / Save Without Location.
 *      For denied permission, an "Open Device Settings" button is also shown.
 *   4. Returns the user's choice or null if cancelled
 *
 * Usage:
 *   const { captureGpsForSave, gpsDialog } = useToolGpsSave();
 *   const gpsResult = await captureGpsForSave();
 *   if (!gpsResult) return; // user cancelled
 *   const ctx = await buildEvidenceContext(gpsResult, { skipGps: true });
 *   await base44.entities.Evidence.create({ ...fields, ...gpsResult, ...ctx });
 *   // render {gpsDialog} in JSX
 */
export function useToolGpsSave() {
  const [showGpsDialog, setShowGpsDialog] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [denied, setDenied] = useState(false);
  const [tourStopCoords, setTourStopCoords] = useState(null);
  const [resolver, setResolver] = useState(null);
  const { requestLocation, trackingOffDialog } = useLocationTrackingGate();

  const settle = (result) => {
    setShowGpsDialog(false);
    setDenied(false);
    setResolver(prev => {
      prev?.resolve(result);
      return null;
    });
  };

  const tryGps = async () => {
    let result = await requestLocation({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    if (!result?.ok && result?.error !== 'disabled') {
      result = await requestLocation({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
    }
    return result;
  };

  const fetchTourStopCoords = async () => {
    const activeCtx = await getActiveContext();
    if (!activeCtx.stop_id) return null;
    try {
      const stop = await base44.entities.TourStop.get(activeCtx.stop_id);
      if (stop?.latitude && stop?.longitude) {
        return { latitude: stop.latitude, longitude: stop.longitude };
      }
    } catch { /* ignore */ }
    return null;
  };

  const captureGpsForSave = useCallback(async () => {
    const result = await tryGps();

    if (result.ok) {
      return { latitude: result.coords.lat, longitude: result.coords.lng, location_source: 'GPS' };
    }

    // Location Tracking is OFF and the user dismissed the tracking-off dialog.
    // Abort the save — don't show the generic GPS-failure dialog.
    if (result.error === 'disabled') {
      return null;
    }

    // GPS failed — show the three-choice dialog for all error types.
    // For denied permission, pass denied=true so the Settings button appears.
    const stopCoords = await fetchTourStopCoords();
    setTourStopCoords(stopCoords);
    setDenied(result.error === 'denied');
    return new Promise(resolve => {
      setResolver({ resolve });
      setShowGpsDialog(true);
    });
  }, []);

  const onGpsRetry = useCallback(async () => {
    setRetrying(true);
    const result = await tryGps();
    setRetrying(false);
    if (result.ok) {
      settle({ latitude: result.coords.lat, longitude: result.coords.lng, location_source: 'GPS' });
    } else {
      // Still no GPS — update denied flag in case the error type changed
      setDenied(result.error === 'denied');
    }
    // If still no GPS, keep dialog open
  }, []);

  const onGpsUseTourStop = useCallback(() => {
    if (tourStopCoords) {
      settle({ latitude: tourStopCoords.latitude, longitude: tourStopCoords.longitude, location_source: 'TOUR_STOP' });
    }
  }, [tourStopCoords]);

  const onGpsSaveWithout = useCallback(() => {
    settle({ location_source: 'NONE' });
  }, []);

  const onCancel = useCallback(() => {
    settle(null);
  }, []);

  const gpsDialog = (
    <GpsLocationDialog
      show={showGpsDialog}
      hasTourStop={!!tourStopCoords}
      retrying={retrying}
      denied={denied}
      onRetry={onGpsRetry}
      onUseTourStop={onGpsUseTourStop}
      onSaveWithout={onGpsSaveWithout}
      onCancel={onCancel}
    />
  );

  return { captureGpsForSave, gpsDialog, trackingOffDialog };
}