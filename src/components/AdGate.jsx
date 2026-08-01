import React, { useState } from 'react';
import { Crown, Ghost, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { shouldShowAd, showInterstitial } from '@/lib/adService';

/**
 * Gates children behind an interstitial ad for free (Observer) users on
 * stops 2+. Stop 1 and all paid tiers render children directly.
 *
 * Usage: <AdGate stopNumber={stop.stop_number}>...paranormal content...</AdGate>
 */
export default function AdGate({ stopNumber, children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('gate'); // gate | ad | revealed

  const needsAd = shouldShowAd(user, stopNumber);

  // No ad needed (paid user or stop 1) — render content directly
  if (!needsAd || phase === 'revealed') return children;

  const handleWatchAd = async () => {
    setPhase('ad');
    try {
      await showInterstitial();
    } catch (e) {
      // ad failed — still unlock content (never block on ad failure)
    }
    setPhase('revealed');
  };

  if (phase === 'ad') {
    return (
      <div className="p-4 rounded-xl border border-border/40 bg-card/30 flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground animate-glow-pulse">Loading ad…</p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-border/40 bg-card/30 flex flex-col items-center justify-center py-8 gap-4">
      <Ghost className="w-8 h-8 text-primary/60" />
      <div className="text-center space-y-1">
        <p className="text-sm font-heading uppercase tracking-wider text-foreground">Unlock Paranormal Findings</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Watch a short ad to reveal the ghost stories at this stop.
        </p>
      </div>
      <button
        onClick={handleWatchAd}
        className="px-4 py-2.5 rounded-lg bg-primary/15 border border-primary/40 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/25 transition-colors min-h-[44px] flex items-center gap-2"
      >
        <Ghost className="w-4 h-4" /> Watch Ad to Continue
      </button>
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-heading uppercase tracking-wider hover:bg-amber-500/20 transition-colors min-h-[44px]"
      >
        <Crown className="w-3.5 h-3.5" /> Upgrade to Remove Ads
      </button>
    </div>
  );
}