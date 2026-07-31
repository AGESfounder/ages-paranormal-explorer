import React from 'react';

const COLOR_CLASSES = {
  primary: 'bg-primary',
  accent: 'bg-accent',
  amber: 'bg-amber-500',
  cyan: 'bg-cyan-glow',
  rose: 'bg-rose-500',
};

export default function EnergyMeter({ label, current, max, icon: Icon, color = 'primary', subtitle }) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const colorClass = COLOR_CLASSES[color] || COLOR_CLASSES.primary;

  return (
    <div className="p-3 rounded-lg border border-border/40 bg-card/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          {Icon && <Icon className={`w-3.5 h-3.5 text-${color}`} />}
          {label}
        </span>
        <span className="text-xs font-mono text-foreground">
          {current}<span className="text-muted-foreground"> / {max}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary/40 overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClass} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {subtitle && <p className="text-[10px] text-muted-foreground/60 mt-1.5">{subtitle}</p>}
    </div>
  );
}