import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, CheckCircle2, Loader2, Lock, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const VALIDATION_CHECKS = [
  { id: 'stops_exist', label: 'Access to stops is accurate to stop descriptions' },
  { id: 'stops_marked', label: 'All stops are correctly marked on the map at their real locations' },
  { id: 'info_accurate', label: 'All stop information (history, paranormal details, hours, fees) is accurate' },
  { id: 'route_logical', label: 'The tour route is logical, safe, and walkable/drivable as marked' },
];

export default function ValidateTourCard({ tour, stops, userId, onValidated }) {
  const [expanded, setExpanded] = useState(false);
  const [checks, setChecks] = useState({});
  const [validating, setValidating] = useState(false);
  const [locallyValidated, setLocallyValidated] = useState(false);

  const alreadyValidated = tour?.verified || locallyValidated;
  const allChecked = VALIDATION_CHECKS.every(c => checks[c.id]);
  const hasNeedsPlacement = stops.some(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle' && s.needs_placement);

  const handleValidate = async () => {
    if (!allChecked || validating) return;
    setValidating(true);
    try {
      const tourStops = stops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
      const now = new Date().toISOString();
      const updates = tourStops.map(s => ({
        id: s.id,
        user_verified: true,
        geocoded: true,
        needs_placement: false,
        verified_by_id: userId,
        verified_date: now,
      }));
      if (updates.length > 0) {
        await base44.entities.TourStop.bulkUpdate(updates);
      }
      await base44.entities.Tour.update(tour.id, { verified: true });
      setLocallyValidated(true);
      onValidated?.();
    } catch (e) {
      console.error('Tour validation failed:', e);
    }
    setValidating(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-4 rounded-xl border space-y-3 ${alreadyValidated ? 'border-green-500/30 bg-green-500/5' : 'border-dim-purple/30 bg-dim-purple/5'}`}
    >
      {alreadyValidated ? (
        <>
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck className="w-6 h-6 text-green-400" />
            <p className="font-heading text-sm font-bold text-green-400 uppercase tracking-wider">Tour Validated</p>
          </div>
          <p className="text-xs text-muted-foreground text-center">All stops have been verified by a paid investigator or admin.</p>
        </>
      ) : (
        <>
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck className="w-5 h-5 text-dim-purple" />
            <p className="font-heading text-sm font-bold text-foreground uppercase tracking-wider">Validate Entire Tour</p>
          </div>
          <p className="text-xs text-muted-foreground text-center">Confirm that this tour is accurate and ready for other investigators.</p>
          {hasNeedsPlacement && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-pink-500/10 border border-pink-500/30">
              <AlertTriangle className="w-3.5 h-3.5 text-pink-400 shrink-0" />
              <p className="text-[10px] text-pink-300">Some stops need placement on the map. Drag them to the correct location before validating.</p>
            </div>
          )}
          {!expanded ? (
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-dim-purple hover:bg-dim-purple/80 text-foreground font-heading text-sm uppercase tracking-wider transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              Start Validation
            </button>
          ) : (
            <div className="space-y-2">
              {VALIDATION_CHECKS.map(check => (
                <label key={check.id} className="flex items-start gap-3 p-3 rounded-lg bg-card/40 border border-border/40 cursor-pointer hover:bg-card/60 transition-colors">
                  <input
                    type="checkbox"
                    checked={!!checks[check.id]}
                    onChange={(e) => setChecks(prev => ({ ...prev, [check.id]: e.target.checked }))}
                    className="mt-0.5 w-4 h-4 rounded border-border accent-dim-purple"
                  />
                  <span className="text-xs text-foreground/80 leading-relaxed">{check.label}</span>
                </label>
              ))}
              <button
                onClick={handleValidate}
                disabled={!allChecked || validating}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-dim-purple hover:bg-dim-purple/80 text-foreground font-heading text-sm uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {validating ? 'Validating…' : 'Confirm Validation'}
              </button>
              {!allChecked && (
                <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Check all boxes to confirm
                </p>
              )}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}