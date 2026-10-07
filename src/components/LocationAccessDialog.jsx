import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Settings, Loader2, X } from 'lucide-react';
import { isNativeApp } from '@/lib/deviceCapabilities';

/**
 * Location Access Required dialog — shown when location permission has been
 * denied (Don't Allow). Offers Try Again and Open Device Settings.
 */
export default function LocationAccessDialog({ show, onRetry, retrying, onCancel }) {
  const handleOpenSettings = async () => {
    if (!isNativeApp()) return;
    try {
      const { App } = await import('@capacitor/app');
      if (App?.openUrl) {
        // iOS: app-settings: opens the app's settings page
        // Android: the package intent opens the app's settings page
        const platform = (await import('@capacitor/core')).Capacitor.getPlatform();
        if (platform === 'ios') {
          await App.openUrl({ url: 'app-settings:' });
        } else {
          await App.openUrl({ url: 'package:com.ages.explorer' });
        }
      }
    } catch {
      // If we can't open settings programmatically, the user can do it manually
    }
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
            className="relative w-full max-w-sm bg-card border border-primary/30 rounded-2xl shadow-2xl p-6 text-center"
          >
            <button
              onClick={onCancel}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-primary/10 border border-primary/30">
                <MapPin className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h2 className="font-heading text-lg font-bold text-foreground mb-2">
              Location Access Required
            </h2>
            <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
              AGES needs your current location to use this feature. Enable location access in your device settings, then try again.
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
                  <><MapPin className="w-4 h-4" /> Try Again</>
                )}
              </button>
              {isNativeApp() && (
                <button
                  onClick={handleOpenSettings}
                  className="w-full py-3 rounded-lg bg-secondary/50 border border-border text-foreground font-heading text-sm uppercase tracking-wider hover:bg-secondary transition-colors min-h-[44px] flex items-center justify-center gap-2"
                >
                  <Settings className="w-4 h-4" /> Open Device Settings
                </button>
              )}
              <button
                onClick={onCancel}
                className="w-full py-2.5 rounded-lg border border-border text-muted-foreground text-sm hover:bg-secondary/50 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}