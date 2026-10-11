import React from 'react';
import { Coins, Zap } from 'lucide-react';
import { isSingleSiteCategory } from '@/lib/enrichBatch';

// Old way vs batched credits for the stops that were just compared.
export default function CreditsComparison({ cost, category }) {
  const singleSite = isSingleSiteCategory(category);
  const callSet = `the content call${singleSite ? ' plus the focus-rewrite call' : ''}`;
  const saved = cost.savedCredits;

  const tone = saved > 0
    ? 'border-green-500/30 bg-green-500/5'
    : saved === 0
      ? 'border-border/40 bg-secondary/20'
      : 'border-amber-500/30 bg-amber-500/5';
  const toneText = saved > 0 ? 'text-green-500' : saved === 0 ? 'text-muted-foreground' : 'text-amber-500';

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${tone}`}>
      <div className="flex items-center gap-2">
        <Coins className="w-4 h-4 text-muted-foreground shrink-0" />
        <p className="font-heading text-sm uppercase tracking-wider text-foreground">
          Credits to write these {cost.stops} stops
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-border/40 bg-card/40 p-2.5">
          <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Old way</p>
          <p className="text-lg font-bold text-foreground">~{cost.oldCredits}</p>
          <p className="text-[10px] text-muted-foreground">
            one call-set per stop ({cost.stops} × ~{cost.perCallSet})
          </p>
        </div>

        <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
          <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Batched</p>
          <p className="text-lg font-bold text-foreground">~{cost.newCredits}</p>
          <p className="text-[10px] text-muted-foreground">
            {cost.fallbackStops > 0
              ? `${cost.pairs} pair call-set${cost.pairs === 1 ? '' : 's'} (~${cost.batchCredits}) + ~${cost.fallbackCredits} for the ${cost.fallbackStops} stop${cost.fallbackStops === 1 ? '' : 's'} written one at a time`
              : `${cost.pairs} pair call-set${cost.pairs === 1 ? '' : 's'} (~${cost.perCallSet} each)`}
          </p>
        </div>

        <div className="rounded-md border border-border/40 bg-card/40 p-2.5">
          <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Difference</p>
          <p className={`text-lg font-bold ${toneText}`}>
            {saved > 0 ? `-${saved}` : saved === 0 ? 'none' : `+${Math.abs(saved)}`}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {saved > 0
              ? `${cost.savedPercent}% fewer credits`
              : saved === 0
                ? 'same credits on these stops'
                : `${cost.savedPercent}% more — the batch was thrown away and re-run per stop`}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-border/40 bg-card/40 p-2.5">
        <Zap className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-foreground/80">
          User energy for the same stops:{' '}
          <span className="font-semibold">{cost.oldEnergy} unit{cost.oldEnergy === 1 ? '' : 's'} → {cost.newEnergy} unit{cost.newEnergy === 1 ? '' : 's'}</span>
          {' '}(one per stop before, one per pair now).
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground">
        A call-set is {callSet}{singleSite ? ' — single-property tours run two passes' : ''}. The old way paid for one
        call-set per stop; batching pays for one per pair and covers both stops with it.
        {cost.fallbackStops > 0 && ' Rejected pairs still pay for the calls they wasted before falling back, so a rejected pair can cost more than the old way for those stops — never worse content, just a wasted call.'}
      </p>
    </div>
  );
}