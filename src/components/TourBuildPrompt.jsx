import React from 'react';
import { RefreshCw } from 'lucide-react';

export default function TourBuildPrompt({ canBuild, onBuild }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3 text-center">
      <p className="text-sm text-foreground">This tour has no investigation stops yet.</p>
      <p className="text-xs text-muted-foreground">Opening a tour no longer starts or retries a build automatically.</p>
      {canBuild ? (
        <button onClick={onBuild} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground text-xs font-heading uppercase tracking-wider">
          <RefreshCw className="w-3.5 h-3.5" /> Build Tour Stops
        </button>
      ) : <p className="text-xs text-muted-foreground">A paid member or administrator can build its stops.</p>}
    </div>
  );
}