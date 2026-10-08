import { useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getDevicePosition, setLocationTrackingEnabled } from '@/lib/deviceCapabilities';
import LocationTrackingOffDialog from '@/components/LocationTrackingOffDialog';

/**
 * Wraps getDevicePosition with the "Location Tracking is Off" dialog.
 *
 * When the AGES Location Tracking setting is OFF, getDevicePosition returns
 * { ok: false, error: 'disabled' }. This hook intercepts that result and
 * shows LocationTrackingOffDialog before the caller ever sees the error.
 * If the user taps "Turn On & Continue", the setting is flipped (persisted
 * to the user record + in-memory flag) and the location request is retried
 * automatically. If the user cancels, the original 'disabled' result is
 * returned so the caller can abort gracefully.
 *
 * Usage:
 *   const { requestLocation, trackingOffDialog } = useLocationTrackingGate();
 *   const result = await requestLocation({ enableHighAccuracy: false });
 *   if (result.ok) { use result.coords }
 *   render trackingOffDialog in JSX
 */
export function useLocationTrackingGate() {
  const [showOffDialog, setShowOffDialog] = useState(false);
  const [turningOn, setTurningOn] = useState(false);
  const pendingResolve = useRef(null);
  const pendingOptions = useRef(null);

  const requestLocation = useCallback(async (options = {}) => {
    const result = await getDevicePosition(options);
    if (result?.error !== 'disabled') return result;

    // Show the tracking-off dialog and wait for the user's choice
    pendingOptions.current = options;
    return new Promise((resolve) => {
      pendingResolve.current = resolve;
      setShowOffDialog(true);
    });
  }, []);

  const handleTurnOn = useCallback(async () => {
    setTurningOn(true);
    try {
      // Persist the setting to the user record
      const me = await base44.auth.me();
      const settings = typeof me?.settings === 'string' ? JSON.parse(me.settings) : (me?.settings || {});
      settings.locationTracking = true;
      await base44.auth.updateMe({ settings: JSON.stringify(settings) });
    } catch { /* ignore — still flip the in-memory flag */ }
    setLocationTrackingEnabled(true);

    // Retry the original location request now that tracking is on
    const options = pendingOptions.current || {};
    const retryResult = await getDevicePosition(options);

    setTurningOn(false);
    setShowOffDialog(false);
    pendingResolve.current?.(retryResult);
    pendingResolve.current = null;
    pendingOptions.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setShowOffDialog(false);
    // Return the original 'disabled' result so the caller can abort
    pendingResolve.current?.({ ok: false, error: 'disabled', message: 'Location tracking is turned off.' });
    pendingResolve.current = null;
    pendingOptions.current = null;
  }, []);

  const trackingOffDialog = (
    <LocationTrackingOffDialog
      show={showOffDialog}
      turningOn={turningOn}
      onTurnOn={handleTurnOn}
      onCancel={handleCancel}
    />
  );

  return { requestLocation, trackingOffDialog };
}

export default useLocationTrackingGate;