import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Play, X, Loader2, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { showRewardedAd } from '@/lib/adService';

/**
 * Ad gate modal for Observer/Seeker evidence saves.
 *
 * Shows when a free user taps "Save Evidence" and is under the daily cap.
 * The user watches a 30s rewarded ad, then the server function
 * spend-evidence-save increments their daily counter.
 *
 * Props:
 *   show      — boolean, whether to render the modal
 *   remaining — number of daily saves remaining (including this one)
 *   onSuccess — callback after ad watched + server function succeeds
 *   onClose   — callback when user cancels or ad fails
 */
export default function EvidenceSaveAdGate({ show, remaining, onSuccess, onClose }) {
  const [watching, setWatching] = useState(false);
  const [spending, setSpending] = useState(false);
  const [error, setError] = useState(null);

  const handleWatchAd = async () => {
    if (watching || spending) return;
    setError(null);
    setWatching(true);
    try {
      const result = await showRewardedAd();
      if (!result.rewarded) {
        setError(
          result.reason === 'no_fill'
            ? 'No ad available right now — try again later.'
            : result.reason === 'skipped'
              ? 'Ads are not ready yet. Try again in a moment.'
              : 'Ad was not completed. Try again.'
        );
        setWatching(false);
        return;
      }
      setWatching(false);
      setSpending(true);
      const res = await base44.functions.invoke('spend-evidence-save', {});
      if (res.data?.success) {
        onSuccess?.();
      } else {
        setError(res.data?.error || res.data?.reason || 'Failed to save.');
      }
    } catch (e) {
      console.error('Evidence save ad gate error:', e);
      setError(e.response?.data?.error || e.message || 'Something went wrong.');
      setWatching(false);
    } finally {
      setSpending(false);
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
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm bg-card border border-primary/30 rounded-2xl shadow-2xl p-6 text-center"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-primary/10 border border-primary/30">
                <ShieldCheck className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h2 className="font-heading text-lg font-bold text-foreground mb-2">
              Save Evidence
            </h2>
            <p className="text-sm text-muted-foreground mb-1 leading-relaxed">
              Watch a quick ad to save this evidence entry to your journal.
            </p>
            <p className="text-[11px] text-primary font-heading uppercase tracking-wider mb-5">
              {remaining} {remaining === 1 ? 'save' : 'saves'} remaining today
            </p>

            {error && <p className="text-[11px] text-destructive mb-3">{error}</p>}

            <div className="space-y-2">
              <button
                onClick={handleWatchAd}
                disabled={watching || spending}
                className="w-full py-3 rounded-lg bg-primary/15 border border-primary/40 text-primary font-heading text-sm uppercase tracking-wider hover:bg-primary/25 transition-colors min-h-[44px] flex items-center justify-center gap-2"
              >
                {watching ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Watching ad…</>
                ) : spending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                ) : (
                  <><Play className="w-4 h-4" /> Watch Ad to Save</>
                )}
              </button>
              <Link
                to="/dashboard"
                onClick={onClose}
                className="block w-full py-3 rounded-lg bg-primary text-primary-foreground font-heading text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors min-h-[44px] flex items-center justify-center"
              >
                Upgrade for Unlimited Saves
              </Link>
              <button
                onClick={onClose}
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