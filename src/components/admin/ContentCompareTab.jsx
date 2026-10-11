import React, { useState } from 'react';
import { Loader2, Play, AlertTriangle, MapPin } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TourPicker from '@/components/contentCompare/TourPicker';
import ComparisonReport from '@/components/contentCompare/ComparisonReport';
import {
  runBatchedComparison,
  enrichableStops,
  estimateComparisonCredits,
  pairCount,
  creditsPerPair,
} from '@/lib/compareDryRun';

// Admin tool: pick a live tour and see the batched stop enrichment rebuilt
// beside the content that is saved today. Read-only — no writes, no energy.
export default function ContentCompareTab() {
  const [tour, setTour] = useState(null);
  const [stops, setStops] = useState([]);
  const [loadingStops, setLoadingStops] = useState(false);
  const [scope, setScope] = useState('1');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const selectTour = async (t) => {
    setTour(t);
    setReport(null);
    setError(null);
    setStops([]);
    setScope('1');
    if (!t) return;
    setLoadingStops(true);
    try {
      const page = await base44.entities.TourStop.filter({ tour_id: t.id }, { sort: 'stop_number', limit: 100 });
      setStops(enrichableStops(page.items || []));
    } catch (e) {
      setError(e?.message || 'Could not load this tour\u2019s stops.');
    } finally {
      setLoadingStops(false);
    }
  };

  const run = async () => {
    if (!tour || stops.length === 0) return;
    setRunning(true);
    setError(null);
    setReport(null);
    setProgress({ done: 0, total: 0 });
    try {
      const result = await runBatchedComparison(tour, stops, {
        pairLimit: scope === 'all' ? null : Number(scope),
        onPair: (done, total) => setProgress({ done, total }),
      });
      setReport(result);
    } catch (e) {
      setError(e?.message || 'The comparison failed.');
    } finally {
      setRunning(false);
    }
  };

  const pairs = pairCount(stops.length);
  const limited = scope === 'all' ? null : Number(scope);
  const credits = estimateComparisonCredits(tour?.tour_category, stops.length, limited);

  const scopeItems = [];
  if (pairs >= 1) scopeItems.push({ value: '1', label: 'First pair (2 stops)' });
  if (pairs >= 2) scopeItems.push({ value: '2', label: 'First 2 pairs (4 stops)' });
  if (pairs >= 3) scopeItems.push({ value: '3', label: 'First 3 pairs (6 stops)' });
  if (pairs > 1) scopeItems.push({ value: 'all', label: `All ${pairs} pairs (${stops.length} stops)` });

  if (report) {
    return <ComparisonReport tour={tour} report={report} onReset={() => setReport(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/40 bg-card/40 p-3">
        <p className="text-xs text-foreground/80">
          <span className="font-semibold">Quality check.</span> Pick an existing tour and the app rebuilds its stop
          content the new batched way, then shows the two side by side — same stops, two generations.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Read-only preview: no tour, stop, or saved narration is ever changed, and no user energy is spent.
        </p>
      </div>

      {!tour ? (
        <TourPicker selectedId={undefined} onSelect={selectTour} />
      ) : (
        <>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{tour.title}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{tour.city}, {tour.state}</span>
                  <span className="uppercase tracking-wider text-[10px]">{tour.tour_category || 'uncategorized'}</span>
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => selectTour(null)} className="text-xs shrink-0">
                Change tour
              </Button>
            </div>

            {loadingStops ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading stops...
              </div>
            ) : stops.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                This tour has no enrichable stops (parking and shuttle stops are never enriched).
              </p>
            ) : (
              <p className="text-xs text-foreground/80">
                <span className="font-semibold">{stops.length}</span> enrichable stops · {pairs} pair{pairs === 1 ? '' : 's'} ·
                {' '}{creditsPerPair(tour.tour_category)} credits per pair
              </p>
            )}
          </div>

          {stops.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-card/40 p-3 space-y-3">
              <div>
                <p className="text-xs font-heading uppercase tracking-wider text-muted-foreground mb-1.5">How much to compare</p>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger className="bg-secondary/50 border-border/40 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {scopeItems.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-foreground/80">
                  This makes real AI calls worth about <span className="font-semibold">{credits} integration credits</span>.
                  Nothing is saved, so the only cost is those credits.
                </p>
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              {running && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Comparing pair {Math.max(progress.done, 1)} of {progress.total || limited || pairs}...
                </p>
              )}

              <Button onClick={run} disabled={running} className="w-full text-xs gap-2">
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                {running ? 'Comparing...' : 'Run comparison'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}