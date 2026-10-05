import React from 'react';
import { Crown, Ghost, Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStopAdGate } from '@/hooks/useStopAdGate';
import UpgradePrompt from '@/components/UpgradePrompt';

/**
 * Gates children behind a server-authoritative rewarded ad for free (Observer)
 * users on stops 2+. Stop 1 and all paid tiers render children directly.
 *
 * Server-authoritative flow:
 *   1. Observer user opens a stop 2+ → gate UI shows.
 *   2. User watches a rewarded ad (fail-closed — must complete to unlock).
 *   3. Client calls grant-stop-access → server increments stop_ad_views_count
 *      (capped at 10/day) → content reveals.
 *   4. Daily cap reached → UpgradePrompt shown.
 *
 * Usage: <AdGate stopNumber={stop.stop_number}>...paranormal content...</AdGate>
 */
export default function AdGate({ stopNumber, children }) {
  const navigate = useNavigate();
  const {
    needsAd,
    phase,
    adError,
    showUpgrade,
    setShowUpgrade,
    remaining,
    cap,
    watchAd,
  } = useStopAdGate(stopNumber);

  // No ad needed (paid user, admin, or stop 1) — render content directly
  if (!needsAd || phase === 'revealed') return children;

  if (phase === 'ad') {
    return (
      <div className="p-4 rounded-xl border border-border/40 bg-card/30 flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground animate-glow-pulse">Loading ad…</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 rounded-xl border border-border/40 bg-card/30 flex flex-col items-center justify-center py-8 gap-4">
        <Ghost className="w-8 h-8 text-primary/60" />
        <div className="text-center space-y-1">
          <p className="text-sm font-heading uppercase tracking-wider text-foreground">Unlock Paranormal Findings</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Watch a short ad to reveal the ghost stories at this stop.
          </p>
          {remaining > 0 && (
            <p className="text-[10px] text-primary/70 font-heading uppercase tracking-wider">
              {remaining}/{cap} free stops remaining today
            </p>
          )}
        </div>
        {adError && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-[11px] max-w-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{adError}</span>
          </div>
        )}
        <button
          onClick={watchAd}
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
      <UpgradePrompt
        show={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason="plan"
      />
    </>
  );
}