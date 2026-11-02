import React from 'react';
import { Loader2 } from 'lucide-react';

export default function RecordingPreparation({ preparing, error, retry, retryCount = 0 }) {
  if (!preparing && !error) return null;
  return (
    <div role={error && !preparing ? 'alert' : 'status'} aria-live="polite" aria-atomic="true" aria-busy={preparing} className="rounded border border-border/40 p-2 text-[11px] text-muted-foreground">
      {preparing ? (
        <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />{retryCount ? `Retrying preparation from the original recording (retry ${retryCount})…` : 'Preparing recording on this device…'}</span>
      ) : (
        <>
          {retryCount > 0 && <p className="font-medium text-destructive">Retry {retryCount} finished, but preparation failed again.</p>}
          <p className="text-destructive">{error}</p>
          <button type="button" onClick={() => retry?.()} disabled={!retry} className="min-h-11 text-primary underline hover:no-underline active:opacity-80 focus-visible:outline focus-visible:outline-2 disabled:opacity-50">Retry preparation</button>
          <p>Your original recording is still kept until you discard it. If retries keep failing, use Recover original below if available.</p>
        </>
      )}
    </div>
  );
}