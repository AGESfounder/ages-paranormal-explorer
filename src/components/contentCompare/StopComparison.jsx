import React from 'react';
import { wordCount } from '@/lib/compareDryRun';

const STATUS = {
  accepted: { label: 'Batcher accepted', cls: 'bg-green-500/15 text-green-500 border-green-500/30' },
  rejected: { label: 'Check rejected — per-stop path', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  single: { label: 'Odd stop — per-stop path', cls: 'bg-muted text-muted-foreground border-border' },
  error: { label: 'Call failed — per-stop path', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
};

const FALLBACK_NOTE = 'Nothing new was produced, so the app writes this stop one at a time — the exact output you get today.';

function Pane({ title, tone, text, note }) {
  return (
    <div className={`rounded-md border p-2.5 ${tone}`}>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">{title}</span>
        <span className="text-[10px] text-muted-foreground shrink-0">{wordCount(text)} words</span>
      </div>
      {text ? (
        <p className="text-xs leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto toolkit-scroll">{text}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground">{note}</p>
      )}
    </div>
  );
}

function Field({ label, liveText, newText, fallback }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-heading uppercase tracking-widest text-primary/80">{label}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Pane title="Live tour · saved now" tone="border-border/40 bg-secondary/20" text={liveText} note="No content saved on this stop yet." />
        <Pane title="Batched · not saved" tone="border-primary/30 bg-primary/5" text={newText} note={FALLBACK_NOTE} />
      </div>
    </div>
  );
}

export default function StopComparison({ entry }) {
  const { stop, status, generated } = entry;
  const meta = STATUS[status] || STATUS.error;
  const livePeople = (stop.people || []).map((p) => p.name).filter(Boolean);
  const newPeople = (generated?.people || []).map((p) => p.name).filter(Boolean);

  return (
    <div className="rounded-lg border border-border/40 bg-card/40 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            <span className="text-muted-foreground mr-1.5">#{stop.stop_number}</span>
            {stop.name}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {[stop.address].filter(Boolean).join(' · ') || 'No address on record'}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full border shrink-0 ${meta.cls}`}>{meta.label}</span>
      </div>

      <Field
        label="Historical info"
        liveText={stop.historical_info}
        newText={generated?.historical_info}
        fallback={FALLBACK_NOTE}
      />
      <Field
        label="Paranormal info"
        liveText={stop.paranormal_info}
        newText={generated?.paranormal_info}
        fallback={FALLBACK_NOTE}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded-md border border-border/40 bg-secondary/20 p-2.5">
          <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1">
            Notable people · live ({livePeople.length})
          </p>
          <p className="text-xs text-foreground/80">{livePeople.join(', ') || '—'}</p>
        </div>
        <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
          <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1">
            Notable people · batched ({newPeople.length})
          </p>
          <p className="text-xs text-foreground/80">{newPeople.join(', ') || '—'}</p>
        </div>
      </div>
    </div>
  );
}