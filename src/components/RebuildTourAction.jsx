import React, { useState } from 'react';
import { RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import buildTourStops from '@/lib/buildTourStops';
import readTourSnapshot from '@/lib/readTourSnapshot';
import { toast } from '@/components/ui/use-toast';

// Rebuilds a tour that already has stops by clearing its investigation stops and
// running the normal build pipeline again. The pipeline itself refuses to save
// fewer than 5 stops, so a rebuild that finds too few properties leaves the tour
// empty and flagged for review instead of shipping a stub.
export default function RebuildTourAction({ tour, onRebuilt }) {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState('');

  const run = async () => {
    if (running) return;
    setConfirming(false);
    setRunning(true);
    setSummary('');
    try {
      await base44.entities.TourStop.deleteMany({ tour_id: tour.id, stop_type: { $nin: ['parking', 'shuttle'] } });
      const built = await buildTourStops(tour);
      const count = (built?.stops || []).filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle').length;
      setSummary(`${count} stops rebuilt.`);
      onRebuilt?.(built);
      toast({ title: 'Tour rebuilt', description: `${count} stops rebuilt.` });
    } catch (error) {
      const message = error?.response?.data?.error || error?.message || 'The rebuild could not be completed.';
      setSummary(message);
      // A build that fails after its stops were saved still leaves them on the
      // tour, so show what is actually stored instead of an empty list.
      const snapshot = await readTourSnapshot(tour.id).catch(() => null);
      if (snapshot?.tour) onRebuilt?.({ tour: snapshot.tour, stops: snapshot.stops });
      else onRebuilt?.({ tour: { ...tour, build_status: 'needs_review' }, stops: [] });
      toast({ title: 'Rebuild failed', description: message, variant: 'destructive' });
    }
    setRunning(false);
  };

  return (
    <div className="mb-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-heading uppercase tracking-wider text-destructive">Rebuild Stops</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Deletes the current stops and builds this tour again from scratch. If too few properties are found, it stays empty and needs review.
          </p>
        </div>
        {!confirming && (
          <button
            onClick={() => setConfirming(true)}
            disabled={running}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-destructive text-destructive-foreground font-heading text-xs uppercase tracking-wider hover:bg-destructive/80 transition-colors disabled:opacity-50"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {running ? 'Rebuilding…' : 'Rebuild'}
          </button>
        )}
      </div>
      {confirming && !running && (
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
          <p className="text-[10px] text-foreground/80 flex-1">Delete the current stops and rebuild?</p>
          <button onClick={run} className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground font-heading text-[10px] uppercase tracking-wider">
            Yes, rebuild
          </button>
          <button onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded-lg border border-border/60 text-foreground font-heading text-[10px] uppercase tracking-wider">
            Cancel
          </button>
        </div>
      )}
      {running && <p className="text-[10px] text-muted-foreground">Be patient: stops are generated and routed again, which can take a minute.</p>}
      {summary && <p className="text-[10px] text-foreground/80">{summary}</p>}
    </div>
  );
}