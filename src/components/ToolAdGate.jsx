import React from 'react';
import { Ghost, Play, Loader2, Clock, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TOOL_AD_DURATION, TOOL_DAILY_CAP } from '@/lib/toolAccess';

/**
 * Ad-gate UI shown when an Observer user taps an ad-gated tool with no
 * remaining time. Offers a rewarded ad (30s of use) or an upgrade link.
 *
 * Props match the state returned by useToolAdGate.
 */
export default function ToolAdGate({
  toolName,
  watching,
  granting,
  adError,
  onWatchAd,
  earned,
}) {
  const navigate = useNavigate();
  const capReached = earned >= TOOL_DAILY_CAP;

  return (
    <div className="p-4 rounded-xl border border-border/40 bg-card/30 flex flex-col items-center justify-center py-8 gap-4">
      <Ghost className="w-8 h-8 text-primary/60" />
      <div className="text-center space-y-1">
        <p className="text-sm font-heading uppercase tracking-wider text-foreground">{toolName}</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Watch a short ad to use this tool for {TOOL_AD_DURATION} seconds.
        </p>
      </div>

      {adError && <p className="text-[11px] text-destructive text-center max-w-xs">{adError}</p>}

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span>Daily cap: {earned}s / {TOOL_DAILY_CAP}s</span>
      </div>

      <button
        onClick={onWatchAd}
        disabled={watching || granting || capReached}
        className="px-4 py-2.5 rounded-lg bg-primary/15 border border-primary/40 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/25 transition-colors min-h-[44px] flex items-center gap-2 disabled:opacity-50"
      >
        {watching ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Loading ad…</>
        ) : granting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Granting…</>
        ) : capReached ? (
          'Daily cap reached'
        ) : (
          <><Play className="w-4 h-4" /> Watch Ad for {TOOL_AD_DURATION}s</>
        )}
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