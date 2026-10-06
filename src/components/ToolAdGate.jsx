import React from 'react';
import { Ghost, Play, Loader2, Clock, Crown, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TOOL_AD_DURATION, TOOL_DAILY_CAP } from '@/lib/toolAccess';

/**
 * Ad-gate UI shown when an Observer user taps an ad-gated tool with no
 * remaining time. Offers a rewarded ad (30s of Tool Time) or an upgrade link.
 *
 * Stock-up flow: after the first rewarded ad grants 30s, the user chooses
 * "Use Tool Now" (opens the tool) or "Stock Up More Time" (watch another ad
 * to build the balance, up to the 300s daily cap). The balance is shown as
 * "<Tool> Tool Time: <remaining> / 300 seconds".
 *
 * Props match the state returned by useToolAdGate.
 */
export default function ToolAdGate({
  toolName,
  remaining = 0,
  earned = 0,
  watching,
  granting,
  adError,
  onWatchAd,
  onUseNow,
}) {
  const navigate = useNavigate();
  const capReached = earned >= TOOL_DAILY_CAP;
  const hasBalance = remaining > 0;
  const busy = watching || granting;

  return (
    <div className="p-4 rounded-xl border border-border/40 bg-card/30 flex flex-col items-center justify-center py-8 gap-4">
      <Ghost className="w-8 h-8 text-primary/60" />
      <div className="text-center space-y-1">
        <p className="text-sm font-heading uppercase tracking-wider text-foreground">{toolName}</p>
        {!hasBalance ? (
          <>
            <p className="text-xs text-muted-foreground max-w-xs">
              Watch a {TOOL_AD_DURATION}-second ad to get {TOOL_AD_DURATION} seconds of Tool Time.
            </p>
            <p className="text-[11px] text-primary/80 max-w-xs">
              Keep watching ads to stock up to {TOOL_DAILY_CAP} seconds of Tool Time today.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground max-w-xs">
            You have Tool Time ready. Use it now, or stock up more (up to {TOOL_DAILY_CAP}s today).
          </p>
        )}
      </div>

      {adError && <p className="text-[11px] text-destructive text-center max-w-xs">{adError}</p>}

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span>{toolName} Tool Time: {remaining} / {TOOL_DAILY_CAP} seconds</span>
      </div>

      {hasBalance ? (
        <div className="flex flex-col w-full max-w-xs gap-2">
          <button
            onClick={onUseNow}
            disabled={busy}
            className="px-4 py-2.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/30 transition-colors min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {granting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Use Tool Now
          </button>
          <button
            onClick={onWatchAd}
            disabled={busy || capReached}
            className="px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {watching ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Loading ad…</>
            ) : capReached ? (
              'Daily cap reached'
            ) : (
              <><Plus className="w-4 h-4" /> Stock Up More Time</>
            )}
          </button>
        </div>
      ) : (
        <button
          onClick={onWatchAd}
          disabled={busy || capReached}
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
      )}

      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-heading uppercase tracking-wider hover:bg-amber-500/20 transition-colors min-h-[44px]"
      >
        <Crown className="w-3.5 h-3.5" /> Upgrade to Remove Ads
      </button>
    </div>
  );
}