import React from 'react';
import { DollarSign, Footprints, Eye, DoorOpen, DoorClosed } from 'lucide-react';

function normalizeFee(fee) {
  return (fee || '').trim().toLowerCase();
}

function extractExteriorHours(hours) {
  if (!hours) return '';
  let m = hours.match(/exterior accessible\s+([^,;]+)/i);
  if (m) return m[1].trim();
  m = hours.match(/grounds open\s+([^,;]+)/i);
  if (m) return m[1].trim();
  m = hours.match(/perimeter\s+([^,;]+)/i);
  if (m) return m[1].trim();
  return '';
}

function hasFreeExterior(hours) {
  if (!hours) return false;
  const h = hours.toLowerCase();
  return h.includes('exterior accessible') || h.includes('grounds open') || h.includes('perimeter');
}

export default function TourAccessInfo({ tour, stops }) {
  if (!tour || !stops || stops.length === 0) return null;

  const fees = stops.map(s => normalizeFee(s.entry_fee)).filter(Boolean);
  const uniqueFees = [...new Set(fees)];
  const hasCommonFee = uniqueFees.length === 1;
  const commonFee = hasCommonFee ? stops.find(s => s.entry_fee)?.entry_fee : null;

  const freeExteriorStops = stops.filter(s => hasFreeExterior(s.hours_of_operation));
  const hasFreePerimeter = freeExteriorStops.length > 0;
  const exteriorHours = hasFreePerimeter ? extractExteriorHours(freeExteriorStops[0].hours_of_operation) : '';
  const entryCost = hasFreePerimeter ? (freeExteriorStops[0].entry_fee || '') : '';

  if (!hasCommonFee && !hasFreePerimeter && !tour.access_type) return null;

  return (
    <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
      {tour.access_type && (
        <div className="flex items-center gap-2">
          {tour.access_type === 'exterior_only' ? <Eye className="w-3.5 h-3.5 text-cyan-glow shrink-0" />
            : tour.access_type === 'interior_only' ? <DoorClosed className="w-3.5 h-3.5 text-accent shrink-0" />
            : <DoorOpen className="w-3.5 h-3.5 text-primary shrink-0" />}
          <p className="text-xs">
            <span className="font-heading uppercase tracking-wider text-primary text-[11px]">Access: </span>
            <span className="text-foreground/80">
              {tour.access_type === 'exterior_only'
                ? 'Exterior Only — grounds and perimeter'
                : tour.access_type === 'interior_only'
                ? 'Interior Only — inside the building'
                : 'Exterior & Interior — full property access'}
            </span>
          </p>
        </div>
      )}
      {hasCommonFee && commonFee && (
        <div className="flex items-center gap-2">
          <DollarSign className="w-3.5 h-3.5 text-green-400 shrink-0" />
          <p className="text-xs">
            <span className="font-heading uppercase tracking-wider text-primary text-[11px]">Common Entry Fee: </span>
            <span className="text-foreground/80">{commonFee}</span>
          </p>
        </div>
      )}
      {hasFreePerimeter && (
        <div className="flex items-start gap-2">
          <Footprints className="w-3.5 h-3.5 text-cyan-glow shrink-0 mt-0.5" />
          <p className="text-xs">
            <span className="font-heading uppercase tracking-wider text-cyan-glow text-[11px]">Free Perimeter Access: </span>
            <span className="text-foreground/80">
              Walk the exterior{exteriorHours ? ` ${exteriorHours}` : ''} at no cost
              {entryCost && entryCost.toLowerCase() !== 'free' && ` · Cost to enter: ${entryCost}`}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}