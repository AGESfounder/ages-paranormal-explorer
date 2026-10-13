import React from 'react';
import { Link2 } from 'lucide-react';
import { SIEG_LANES } from '@/lib/siegDisplay';

const laneOf = (id) => SIEG_LANES.find((l) => l.id === id);

// One list, used both live and after the session: every lane's trigger lands here
// with its own clock time, so the log is the session's spine whether or not the
// chart is on screen. Correlated entries are marked — two lanes moving together
// is worth seeing at a glance, and worth treating as a marker rather than proof.
export default function SiegEventLog({ events, emptyText = 'No events logged yet.' }) {
  if (!events?.length) {
    return <p className="text-[10px] text-muted-foreground/70 py-2 text-center">{emptyText}</p>;
  }
  return (
    <div className="space-y-1">
      {events.map((e) => {
        const lane = laneOf(e.lane);
        return (
          <div key={e.id} className="flex items-start gap-2 p-1.5 rounded bg-card/30 border border-border/30">
            <span className="text-[9px] font-mono text-muted-foreground shrink-0 pt-0.5">{e.time}</span>
            <span className="text-[9px] font-heading uppercase tracking-wider shrink-0 pt-0.5" style={{ color: lane?.color }}>
              {lane?.label || e.lane}
            </span>
            <span className="text-[10px] text-foreground/80 flex-1 leading-snug">{e.label}</span>
            {e.correlated && <Link2 className="w-3 h-3 text-foreground shrink-0 mt-0.5" />}
          </div>
        );
      })}
    </div>
  );
}