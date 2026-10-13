import React from 'react';
import { Play, Loader2, Moon, Info } from 'lucide-react';
import { SIEG_SESSIONS, SIEG_DESCRIPTOR, SIEG_TOOLS, SIEG_SETUP_STEPS } from '@/lib/siegSessions';
import { SIEG_LANES } from '@/lib/siegDisplay';

// The pre-session screen: what SIEG is, which seven tools it runs, how long a
// session lasts (and why each length was picked), and what to do before stepping
// away. Five named lengths rather than one setting, because the number is the
// thing an investigator remembers.
export default function SiegSessionPicker({ onStart, conditions, conditionsNote, fetching, error, cameraControls }) {
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-card/30 border border-border/30">
        <p className="text-[11px] text-muted-foreground leading-relaxed">{SIEG_DESCRIPTOR}</p>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {SIEG_TOOLS.map((tool) => (
            <span key={tool} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-heading uppercase tracking-wider">
              {tool}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          <span className="text-[9px] text-muted-foreground/70">Live lanes:</span>
          {SIEG_LANES.map((lane) => (
            <span key={lane.id} className="text-[9px] font-heading uppercase tracking-wider" style={{ color: lane.color }}>
              {lane.label}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10">
          <p className="text-[10px] text-amber-300 leading-relaxed">{error}</p>
        </div>
      )}

      {cameraControls}

      <div className="space-y-1.5">
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Choose a session</p>
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
          Five lengths, each chosen for what it gives an investigation.
        </p>
        {SIEG_SESSIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => onStart(s)}
            className="w-full flex items-start justify-between gap-3 p-2.5 rounded-lg bg-card/50 border border-border/40 hover:border-primary/40 hover:bg-card/70 transition-colors text-left"
          >
            <span className="flex items-start gap-3 min-w-0">
              <span className="font-heading font-bold text-xl text-primary w-11 shrink-0 leading-tight">
                {s.minutes}
                <span className="text-[9px] font-body text-muted-foreground ml-0.5">min</span>
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground">{s.name}</span>
                <span className="block text-[10px] text-muted-foreground">{s.purpose}</span>
                <span className="block text-[10px] text-muted-foreground/80 mt-1 leading-relaxed">{s.why}</span>
              </span>
            </span>
            <Play className="w-4 h-4 text-primary shrink-0 mt-0.5" />
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
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Moon className="w-3 h-3" /> Conditions
          {fetching && <Loader2 className="w-3 h-3 animate-spin" />}
        </p>
        <p className="text-xs text-foreground/90 mt-1.5">
          {conditions?.moon} · {conditions?.illumination}% illumination
          {conditions?.weather ? ` · ${conditions.weather}` : fetching ? ' · fetching local weather…' : ''}
        </p>
        {conditionsNote && (
          <p className="text-[9px] text-amber-400/80 mt-1 leading-relaxed">{conditionsNote}</p>
        )}
      </div>
    </div>
  );
}