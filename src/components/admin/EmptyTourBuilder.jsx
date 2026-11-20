import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import buildTourStops from '@/lib/buildTourStops';
import { Loader2, Hammer, CheckCircle2, AlertTriangle } from 'lucide-react';

const BATCH = 5;

// Rebuilds the area tours that were created without any stops. The build itself
// is the app's own pipeline (buildTourStops), run one tour at a time so a slow
// generation never overlaps another and a failure stops at that tour only.
export default function EmptyTourBuilder() {
  const [empty, setEmpty] = useState(null);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState(null);
  const [results, setResults] = useState([]);

  const loadEmpty = async () => {
    const tours = [];
    let cursor = null;
    for (let i = 0; i < 10; i++) {
      const page = await base44.entities.Tour.list({ sort: 'created_date', limit: 200, ...(cursor ? { cursor } : {}) });
      tours.push(...(page.items || []));
      if (!page.has_more) break;
      cursor = page.next_cursor;
    }
    const withStops = new Set();
    let sc = null;
    for (let i = 0; i < 40; i++) {
      const page = await base44.entities.TourStop.list({ limit: 200, ...(sc ? { cursor: sc } : {}) });
      (page.items || []).forEach((s) => withStops.add(s.tour_id));
      if (!page.has_more) break;
      sc = page.next_cursor;
    }
    setEmpty(tours.filter((t) => t.tour_category === 'area' && t.verified !== true && !withStops.has(t.id)));
  };

  useEffect(() => { loadEmpty(); }, []);

  const run = async () => {
    const batch = (empty || []).slice(0, BATCH);
    if (!batch.length || running) return;
    setRunning(true);
    setResults([]);
    const out = [];
    for (const tour of batch) {
      setCurrent(tour);
      try {
        const built = await buildTourStops(tour);
        const stops = (built?.stops || []).filter((s) => s.stop_type !== 'parking').length;
        out.push({ id: tour.id, title: tour.title, ok: true, stops });
      } catch (error) {
        out.push({ id: tour.id, title: tour.title, ok: false, error: error?.response?.data?.error || error?.message || 'Build failed' });
      }
      setResults([...out]);
    }
    setCurrent(null);
    setRunning(false);
    loadEmpty();
  };

  if (!empty || empty.length === 0) return null;

  return (
    <div className="mb-4 p-3 rounded-lg border border-border/40 bg-card/40 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-heading uppercase tracking-wider text-primary">Empty Area Tours</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {empty.length} area {empty.length === 1 ? 'tour has' : 'tours have'} no stops yet. The next {Math.min(BATCH, empty.length)} build one at a time.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground font-heading text-[10px] uppercase tracking-wider hover:bg-primary/80 transition-colors disabled:opacity-50"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hammer className="w-3.5 h-3.5" />}
          {running ? 'Building…' : `Build ${Math.min(BATCH, empty.length)}`}
        </button>
      </div>

      {current && (
        <p className="text-[11px] text-foreground/80 truncate">
          Building {current.title} — {current.city}, {current.state}
        </p>
      )}

      {!running && results.length > 0 && (
        <ul className="space-y-1">
          {results.map((r) => (
            <li key={r.id} className="flex items-start gap-1.5 text-[11px]">
              {r.ok
                ? <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-green-400" />
                : <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-yellow-500" />}
              <span className={r.ok ? 'text-foreground/80' : 'text-yellow-400'}>
                <span className="truncate">{r.title}</span> — {r.ok ? `${r.stops} stops built` : r.error}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!running && results.length === 0 && (
        <ul className="space-y-0.5">
          {empty.slice(0, BATCH).map((t) => (
            <li key={t.id} className="text-[11px] text-muted-foreground truncate">
              {t.title} — {t.city}, {t.state}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}