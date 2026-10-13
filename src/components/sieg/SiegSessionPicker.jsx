import React from 'react';
import { Play, MapPin, Loader2, Moon, Info } from 'lucide-react';
import { SIEG_SESSIONS, SIEG_DESCRIPTOR, SIEG_SETUP_STEPS } from '@/lib/siegSessions';
import { SIEG_LANES } from '@/lib/siegDisplay';

// The pre-session screen: what SIEG is, which four lanes it runs, how long a
// session lasts, and what to do before stepping away. Five named lengths rather
// than one setting, because the number is the thing an investigator remembers.
export default function SiegSessionPicker({ onStart, conditions, onFetchConditions, fetching, error }) {
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-card/30 border border-border/30">
        <p className="text-[11px] text-muted-foreground leading-relaxed">{SIEG_DESCRIPTOR}</p>
        <div className="grid grid-cols-2 gap-1.5 mt-2.5">
          {SIEG_LANES.map((lane) => (
            <div key={lane.id} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: lane.color }} />
              <span className="text-[9px] font-heading uppercase tracking-wider" style={{ color: lane.color }}>{lane.label}</span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10">
          <p className="text-[10px] text-amber-300 leading-relaxed">{error}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Choose a session</p>
        {SIEG_SESSIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => onStart(s)}
            className="w-full flex items-center justify-between gap-3 p-2.5 rounded-lg bg-card/50 border border-border/40 hover:border-primary/40 hover:bg-card/70 transition-colors text-left"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="font-heading font-bold text-xl text-primary w-11 shrink-0">
                {s.minutes}
                <span className="text-[9px] font-body text-muted-foreground ml-0.5">min</span>
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground truncate">{s.name}</span>
                <span className="block text-[10px] text-muted-foreground">{s.purpose}</span>
              </span>
            </span>
            <Play className="w-4 h-4 text-primary shrink-0" />
          </button>
        ))}
        <p className="text-[9px] text-muted-foreground/70 text-center pt-0.5">
          Sessions start measuring after a shared 10-second baseline, and stop themselves at the end.
        </p>
      </div>

      <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 space-y-1.5">
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Info className="w-3 h-3" /> Before you step away
        </p>
        {SIEG_SETUP_STEPS.map((step, i) => (
          <p key={i} className="text-[10px] text-muted-foreground leading-relaxed flex gap-1.5">
            <span className="text-primary/70">{i + 1}.</span>
            <span>{step}</span>
          </p>
        ))}
      </div>

      <div className="p-2.5 rounded-lg bg-card/30 border border-border/30">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Moon className="w-3 h-3" /> Conditions
          </p>
          <button
            onClick={onFetchConditions}
            disabled={fetching}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/30 text-primary font-heading text-[9px] uppercase tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {fetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
            {fetching ? 'Fetching' : 'Add local weather'}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {conditions
            ? `${conditions.moon} · ${conditions.illumination}% illumination${conditions.weather ? ` · ${conditions.weather}` : ''}`
            : 'Moon phase shown in every session. Weather is optional and fetched once before you start.'}
        </p>
      </div>
    </div>
  );
}