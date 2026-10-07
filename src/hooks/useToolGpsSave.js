import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getDevicePosition } from '@/lib/deviceCapabilities';
import { getActiveContext } from '@/lib/evidenceContext';
import GpsLocationDialog from '@/components/GpsLocationDialog';
import LocationAccessDialog from '@/components/LocationAccessDialog';

/**
 * Shared GPS capture + dialog hook for Toolkit tool evidence saves.
 *
 * When the user saves evidence from a Toolkit tool, this hook:
 *   1. Tries to capture device GPS (high accuracy, then low accuracy fallback)
 *   2. If GPS succeeds → returns { latitude, longitude, location_source: 'GPS' }
 *   3. If GPS denied → shows LocationAccessDialog (Try Again / Open Settings)
 *   4. If GPS unavailable/timeout → shows GpsLocationDialog (Retry / Use Tour Stop / Save Without)
 *   5. Returns the user's choice or null if cancelled
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
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [tourStopCoords, setTourStopCoords] = useState(null);
  const [resolver, setResolver] = useState(null);

  const settle = (result) => {
    setShowGpsDialog(false);
    setShowLocationDialog(false);
    setResolver(prev => {
      prev?.resolve(result);
      return null;
    });
  };

  const tryGps = async () => {
    let result = await getDevicePosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    if (!result?.ok) {
      result = await getDevicePosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
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

    // GPS failed — check error type
    if (result.error === 'denied') {
      return new Promise(resolve => {
        setResolver({ resolve });
        setShowLocationDialog(true);
      });
    }

    // Other error (timeout, unavailable, unsupported) — show GpsLocationDialog
    const stopCoords = await fetchTourStopCoords();
    setTourStopCoords(stopCoords);
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

  const onLocationRetry = useCallback(async () => {
    setRetrying(true);
    const result = await tryGps();
    setRetrying(false);
    if (result.ok) {
      settle({ latitude: result.coords.lat, longitude: result.coords.lng, location_source: 'GPS' });
    }
    // If still denied, keep dialog open
  }, []);

  const onCancel = useCallback(() => {
    settle(null);
  }, []);

  const gpsDialog = (
    <>
      <GpsLocationDialog
        show={showGpsDialog}
        hasTourStop={!!tourStopCoords}
        retrying={retrying}
        onRetry={onGpsRetry}
        onUseTourStop={onGpsUseTourStop}
        onSaveWithout={onGpsSaveWithout}
      />
      <LocationAccessDialog
        show={showLocationDialog}
        retrying={retrying}
        onRetry={onLocationRetry}
        onCancel={onCancel}
      />
    </>
  );

  return { captureGpsForSave, gpsDialog };
}