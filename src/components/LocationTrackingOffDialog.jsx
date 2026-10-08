import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPinOff, X, Loader2 } from 'lucide-react';

/**
 * Shown when the user's AGES "Location Tracking" setting is OFF and they
 * attempt a location-dependent action. Offers "Turn On & Continue" (calls
 * onTurnOn, which flips the setting and retries) and "Cancel".
 *
 * This is distinct from LocationAccessDialog (OS-level permission denied)
 * and GpsLocationDialog (GPS hardware failure). This dialog is about the
 * in-app setting only.
 */
export default function LocationTrackingOffDialog({ show, onTurnOn, onCancel, turningOn }) {
  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
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
                <MapPinOff className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h2 className="font-heading text-lg font-bold text-foreground mb-2">
              Location Tracking is Off
            </h2>
            <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
              Location Tracking is turned off in AGES Settings. Turn it on to use this feature.
            </p>
            <div className="space-y-2">
              <button
                onClick={onTurnOn}
                disabled={turningOn}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors min-h-[44px] flex items-center justify-center gap-2"
              >
                {turningOn ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Turning on…</>
                ) : (
                  <><MapPinOff className="w-4 h-4" /> Turn On &amp; Continue</>
                )}
              </button>
              <button
                onClick={onCancel}
                disabled={turningOn}
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