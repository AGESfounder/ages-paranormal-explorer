import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Navigation, X, AlertTriangle, Loader2, Settings } from 'lucide-react';
import { isNativeApp } from '@/lib/deviceCapabilities';

/**
 * GPS-failed dialog — shown when device GPS cannot be captured.
 * Offers three explicit choices:
 *   1. Retry GPS — re-attempt capture
 *   2. Use Current Tour Stop — use the tour stop's coordinates (labeled TOUR_STOP, not GPS)
 *   3. Save Without Location — private only, no coordinates, cannot be made public
 */
export default function GpsLocationDialog({ show, onRetry, onUseTourStop, onSaveWithout, onCancel, hasTourStop, retrying, denied }) {
  const handleOpenSettings = async () => {
    if (!isNativeApp()) return;
    try {
      const { App } = await import('@capacitor/app');
      if (App?.openUrl) {
        const platform = (await import('@capacitor/core')).Capacitor.getPlatform();
        if (platform === 'ios') {
          await App.openUrl({ url: 'app-settings:' });
        } else {
          await App.openUrl({ url: 'package:com.ages.explorer' });
        }
      }
    } catch { /* user can open settings manually */ }
  };

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
              {denied ? 'Location Permission Denied' : 'Location Could Not Be Captured'}
            </h2>
            <p className="text-sm text-muted-foreground mb-5 leading-relaxed text-center">
              {denied
                ? 'AGES needs location access to tag your evidence. Enable location in your device settings, then retry — or use the tour stop coordinates, or save without a location.'
                : "We couldn't determine your current GPS location. You can retry, use the current tour stop's coordinates, or save this evidence without a location."}
            </p>
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
              {denied && isNativeApp() && (
                <button
                  onClick={handleOpenSettings}
                  className="w-full py-3 rounded-lg bg-secondary/50 border border-border text-foreground font-heading text-sm uppercase tracking-wider hover:bg-secondary transition-colors min-h-[44px] flex items-center justify-center gap-2"
                >
                  <Settings className="w-4 h-4" /> Open Device Settings
                </button>
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