import React from 'react';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StopComparison from '@/components/contentCompare/StopComparison';
import CreditsComparison from '@/components/contentCompare/CreditsComparison';

// Admin-only side-by-side of a live tour's saved stop content against what the
// batched enrichment produces for the same stops. Read-only preview.
export default function ComparisonReport({ tour, report, onReset }) {
  const entries = report.pairs.flatMap((p) => p.entries);
  const accepted = entries.filter((e) => e.status === 'accepted').length;
  const fellBack = entries.filter((e) => e.status !== 'accepted');

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-heading text-sm uppercase tracking-wider text-foreground">Comparison result</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tour.title} · {report.enrichableCount} enrichable stops · compared {report.ranPairs} of {report.pairCount} pairs
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onReset} className="text-xs gap-2 shrink-0">
            <RotateCcw className="w-3 h-3" /> Run again
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-border/40 bg-card/40 p-2.5">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Stops compared</p>
            <p className="text-lg font-bold text-foreground">{entries.length}</p>
          </div>
          <div className="rounded-md border border-green-500/30 bg-green-500/5 p-2.5">
            <p className="text-[10px] font-heading uppercase tracking-wider text-green-500">Batcher accepted</p>
            <p className="text-lg font-bold text-green-500">{accepted}</p>
          </div>
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
            <p className="text-[10px] font-heading uppercase tracking-wider text-amber-500">Fell back per-stop</p>
            <p className="text-lg font-bold text-amber-500">{fellBack.length}</p>
          </div>
        </div>

        <p className="text-xs text-foreground/80">
          {fellBack.length === 0
            ? 'Every stop passed the free cross-check, so the batched content beside it is what the app would save.'
            : `${fellBack.length} stop${fellBack.length === 1 ? '' : 's'} would be written one at a time instead, producing exactly the content you get today. The app still charges one energy per pair, so a rejected pair costs it extra calls but never a quality drop.`}
        </p>
        <p className="text-xs text-muted-foreground">Nothing was saved to this tour.</p>
      </div>

      <CreditsComparison cost={report.cost} category={tour.tour_category} />

      <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-3">
        <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />
        <p className="text-xs text-foreground/80">
          Preview only — the live tour, its stops, and every saved narration are untouched, and no user energy was spent.
        </p>
      </div>

      <div className="space-y-3">
        {entries.map((entry) => (
          <StopComparison key={entry.stop.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}