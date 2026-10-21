import React from 'react';
import { Loader2 } from 'lucide-react';

export default function RecordingPreparation({ preparing, error, retry }) {
  if (!preparing && !error) return null;
  return (
    <div role="status" className="rounded border border-border/40 p-2 text-[11px] text-muted-foreground">
      {preparing ? <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Preparing recording on this device…</span> : (
        <><p className="text-destructive">{error}</p><button onClick={retry} className="min-h-11 text-primary underline focus-visible:outline focus-visible:outline-2">Retry preparation</button><p>Your original recording is still kept until you discard it. On iPhone, use Recover original below if preparation keeps failing.</p></>
      )}
    </div>
  );
}