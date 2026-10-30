import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import correctTourAddresses, { needsAddressCorrection } from '@/lib/correctTourAddresses';

export default function TourAddressCorrection({ tour, stops, onCorrected }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setStatus('');
    setError('');
    if (navigator.onLine === false || !needsAddressCorrection(tour, stops)) return;
    setStatus('checking');
    correctTourAddresses(tour.id).then(result => {
      if (!active) return;
      if (result.updates.length) onCorrected(result.updates);
      setError(result.error || '');
      setStatus('');
    });
    return () => { active = false; };
    // One check per opening, not after every pin update or user action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id]);
  if (!status && !error) return null;
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">
      {status && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />}
      {status ? 'Checking confirmed addresses…' : error}
    </p>
  );
}