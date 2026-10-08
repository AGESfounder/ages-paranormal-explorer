import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getActiveContext } from '@/lib/evidenceContext';
import GpsLocationDialog from '@/components/GpsLocationDialog';
import { useLocationTrackingGate } from '@/hooks/useLocationTrackingGate';

/**
 * Shared GPS capture + dialog hook for Toolkit tool evidence saves.
 *
 * Accepts an optional external `requestLocation` function (from a parent's
 * useLocationTrackingGate instance). When provided, the hook uses it instead
 * of creating its own useLocationTrackingGate, and returns trackingOffDialog
 * as null — the parent is responsible for rendering its own trackingOffDialog.
 * This avoids two separate useLocationTrackingGate instances in the same
 * component (which caused the Location Tracking OFF dialog to never render
 * in Toolkit.jsx, hanging the save forever).
 *
 * When no external requestLocation is provided (tool components like
 * SLSCamera, LocationTermBank, etc.), the hook creates its own
 * useLocationTrackingGate and returns its trackingOffDialog for the component
 * to render.
 *
 * Usage (parent provides requestLocation — e.g. Toolkit.jsx):
 *   const { requestLocation: requestGps, trackingOffDialog } = useLocationTrackingGate();
 *   const { captureGpsForSave, gpsDialog } = useToolGpsSave(requestGps);
 *   // render {trackingOffDialog} (from the parent's useLocationTrackingGate)
 *
 * Usage (standalone — e.g. SLSCamera):
 *   const { captureGpsForSave, gpsDialog, trackingOffDialog } = useToolGpsSave();
 *   // render {gpsDialog} and {trackingOffDialog}
 */
export function useToolGpsSave(externalRequestLocation) {
  const [showGpsDialog, setShowGpsDialog] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [errorType, setErrorType] = useState(null);
  const [tourStopCoords, setTourStopCoords] = useState(null);
  const [resolver, setResolver] = useState(null);
  // Always call useLocationTrackingGate (Rules of Hooks). When an external
  // requestLocation is provided, we use it instead and suppress our own
  // trackingOffDialog (the parent renders its own).
  const ownGate = useLocationTrackingGate();
  const requestLocation = externalRequestLocation || ownGate.requestLocation;
  const trackingOffDialog = externalRequestLocation ? null : ownGate.trackingOffDialog;

  const settle = (result) => {
    setShowGpsDialog(false);
    setErrorType(null);
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

    // GPS failed — show the four-choice dialog for all error types.
    // errorType drives which optional buttons appear (e.g. Turn On Location Services).
    const stopCoords = await fetchTourStopCoords();
    setTourStopCoords(stopCoords);
    setErrorType(result.error || null);
    return new Promise(resolve => {
      setResolver({ resolve });
      setShowGpsDialog(true);
    });
  }, [requestLocation]);

  const onGpsRetry = useCallback(async () => {
    setRetrying(true);
    const result = await tryGps();
    setRetrying(false);
    if (result.ok) {
      settle({ latitude: result.coords.lat, longitude: result.coords.lng, location_source: 'GPS' });
    } else {
      // Still no GPS — update error type in case it changed
      setErrorType(result.error || null);
    }
    // If still no GPS, keep dialog open
  }, [requestLocation]);

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
      errorType={errorType}
      onRetry={onGpsRetry}
      onUseTourStop={onGpsUseTourStop}
      onSaveWithout={onGpsSaveWithout}
      onCancel={onCancel}
    />
  );

  return { captureGpsForSave, gpsDialog, trackingOffDialog };
}