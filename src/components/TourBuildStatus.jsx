import React from 'react';

export default function TourBuildStatus({ status }) {
  if (!['building', 'needs_review'].includes(status)) return null;
  return (
    <div role="status" className="rounded-lg border border-border bg-card p-3 space-y-1">
      <p className="text-xs font-heading text-primary uppercase tracking-wider">{status === 'building' ? 'Build not finished' : 'Tour needs review'}</p>
      <p className="text-xs text-muted-foreground">{status === 'building'
        ? 'A build was started but has not been confirmed complete. Reopen after it finishes; no second build will start automatically.'
        : 'Some build checks could not be confirmed. Saved stops are preserved; opening this tour will not move or regenerate them.'}</p>
    </div>
  );
}