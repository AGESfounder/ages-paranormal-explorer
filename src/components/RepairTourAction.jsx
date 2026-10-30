import React, { useState } from 'react';
import { Wrench, Loader2 } from 'lucide-react';
import repairTour from '@/lib/repairTour';
import { toast } from '@/components/ui/use-toast';

export default function RepairTourAction({ tour, onRepaired }) {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState('');

  const run = async () => {
    if (running) return;
    setRunning(true);
    setSummary('');
    try {
      const result = await repairTour(tour);
      const stopCount = (result.stops || []).filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle').length;
      const removed = (result.removed || []).length;
      const message = `${stopCount} stops checked${removed ? `, ${removed} duplicate removed` : ''}.`;
      setSummary(message);
      onRepaired?.(result);
      toast({ title: 'Tour repaired', description: message });
    } catch (error) {
      const message = error?.response?.data?.error || error?.message || 'The repair could not be completed.';
      setSummary(message);
      toast({ title: 'Repair failed', description: message, variant: 'destructive' });
    }
    setRunning(false);
  };

  return (
    <div className="mb-3 p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-heading uppercase tracking-wider text-primary">Repair This Tour</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Re-checks coordinates, duplicate stops, walking vs driving, order and parking. Nothing runs unless you start it.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider hover:bg-primary/80 transition-colors disabled:opacity-50"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
          {running ? 'Repairing…' : 'Repair'}
        </button>
      </div>
      {running && <p className="text-[10px] text-muted-foreground">Be patient: every stop is checked again, which can take a minute.</p>}
      {summary && <p className="text-[10px] text-foreground/80">{summary}</p>}
    </div>
  );
}