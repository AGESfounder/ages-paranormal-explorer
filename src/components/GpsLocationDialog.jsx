import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Navigation, X, AlertTriangle, Loader2, MapPin } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { isNativeApp } from '@/lib/deviceCapabilities';
import { openDeviceSettings } from '@/lib/openDeviceSettings';

// Manual steps shown when Settings cannot be opened directly. iOS has no public
// deep link to the global Location Services switch (it can only open this app's
// Settings page), so iOS always shows its steps for the services-off case.
const MANUAL_STEPS = {
  ios: 'Open Settings → Privacy & Security → Location Services and turn it on, then open Settings → AGES → Location and choose "While Using the App".',
  android: "Open your phone's Settings → Location and turn it on, then allow Location for AGES under App permissions.",
};

/**
 * GPS-failed dialog — shown when device GPS cannot be captured.
 * Same four choices on Android and iOS:
 *   1. Retry GPS — re-attempt capture
 *   2. Turn On Location Services — open device settings (native only); GPS is
 *      retried automatically when the user returns to the app
 *   3. Use Current Tour Stop — use the tour stop's coordinates (labeled TOUR_STOP, not GPS)
 *   4. Save Without Location — private only, no coordinates, cannot be made public
 *
 * Props:
 *   errorType — 'denied' | 'services_off' | 'disabled' | 'unavailable' | 'timeout' | 'unsupported' | undefined
 *   message   — why the most recent Retry failed, so a failed retry is never silent
 */
export default function GpsLocationDialog({ show, onRetry, onUseTourStop, onSaveWithout, onCancel, hasTourStop, retrying, errorType, message }) {
  const denied = errorType === 'denied';
  const servicesOff = errorType === 'services_off';
  const disabled = errorType === 'disabled';
  const native = isNativeApp();
  const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  const showLocationServices = native && ['denied', 'services_off', 'unavailable', 'timeout', 'disabled'].includes(errorType);

  const [settingsFailed, setSettingsFailed] = useState(false);
  const waitingForSettings = useRef(false);
  const latest = useRef({});
  latest.current = { onRetry, retrying, disabled };

  // Returning from Settings retries GPS automatically. Not used for the in-app
  // 'disabled' case (its Retry opens the Location Tracking dialog instead).
  useEffect(() => {
    if (!show || !native) return undefined;
    let handle = null;
    let cancelled = false;
    import('@capacitor/app')
      .then(({ App }) => App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive || !waitingForSettings.current) return;
        waitingForSettings.current = false;
        const { onRetry: retry, retrying: busy, disabled: trackingOff } = latest.current;
        if (!busy && !trackingOff) retry?.();
      }))
      .then((h) => { if (cancelled) h.remove(); else handle = h; })
      .catch(() => {});
    return () => { cancelled = true; waitingForSettings.current = false; handle?.remove(); };
  }, [show, native]);

  const handleOpenSettings = async () => {
    setSettingsFailed(false);
    waitingForSettings.current = true;
    const opened = await openDeviceSettings(denied || disabled ? 'app' : 'location');
    if (!opened) {
      waitingForSettings.current = false;
      setSettingsFailed(true);
    }
  };

  const showSteps = native && (settingsFailed || (servicesOff && platform === 'ios'));

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm bg-card border border-amber-500/30 rounded-2xl shadow-2xl p-6"
          >
            {onCancel && (
              <button
                onClick={onCancel}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-amber-500/10 border border-amber-500/30">
                <AlertTriangle className="w-8 h-8 text-amber-400" />
              </div>
            </div>
            <h2 className="font-heading text-lg font-bold text-foreground mb-2 text-center">
              {denied ? 'Location Permission Denied' : servicesOff ? 'Location Services Are Off' : disabled ? 'Location Tracking Is Off' : 'Location Could Not Be Captured'}
            </h2>
            <p className="text-sm text-muted-foreground mb-5 leading-relaxed text-center">
              {denied
                ? 'AGES needs location access to tag your evidence. Enable location in your device settings, then retry — or use the tour stop coordinates, or save without a location.'
                : servicesOff
                  ? 'Location is turned off on this device. Turn it on, then retry — or use the tour stop coordinates, or save without a location.'
                  : disabled
                    ? 'Location Tracking is turned off in AGES Settings. Turn it on and retry, use the current tour stop coordinates, or save without a location.'
                    : "We couldn't determine your current GPS location. You can retry, turn on location services, use the current tour stop's coordinates, or save this evidence without a location."}
            </p>
            {message && !retrying && (
              <p className="text-xs text-amber-300 mb-3 leading-relaxed text-center">Still no location: {message}</p>
            )}
            <div className="space-y-2">
              <button
                onClick={onRetry}
                disabled={retrying}
                className="w-full py-3 rounded-lg bg-primary/15 border border-primary/40 text-primary font-heading text-sm uppercase tracking-wider hover:bg-primary/25 transition-colors min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {retrying ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Retrying…</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Retry GPS</>
                )}
              </button>
              {showLocationServices && (
                <button
                  onClick={handleOpenSettings}
                  className="w-full py-3 rounded-lg bg-secondary/50 border border-border text-foreground font-heading text-sm uppercase tracking-wider hover:bg-secondary transition-colors min-h-[44px] flex items-center justify-center gap-2"
                >
                  <MapPin className="w-4 h-4" /> Turn On Location Services
                </button>
              )}
              {showSteps && (
                <p className="text-[11px] text-muted-foreground leading-relaxed text-center">
                  {settingsFailed ? "Couldn't open Settings automatically. " : ''}{MANUAL_STEPS[platform]} Then come back and tap Retry GPS.
                </p>
              )}
              {hasTourStop && (
                <button
                  onClick={onUseTourStop}
                  className="w-full py-3 rounded-lg bg-accent/15 border border-accent/40 text-accent-foreground font-heading text-sm uppercase tracking-wider hover:bg-accent/25 transition-colors min-h-[44px] flex items-center justify-center gap-2"
                >
                  <Navigation className="w-4 h-4" /> Use Current Tour Stop
                </button>
              )}
              <button
                onClick={onSaveWithout}
                className="w-full py-3 rounded-lg border border-border text-muted-foreground font-heading text-sm uppercase tracking-wider hover:bg-secondary/50 transition-colors min-h-[44px] flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" /> Save Without Location
              </button>
            </div>
            {hasTourStop && (
              <p className="text-[10px] text-muted-foreground/70 mt-3 text-center leading-relaxed">
                Tour stop coordinates are not your device GPS. They will be labeled as the tour stop's location on the Community Map.
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}