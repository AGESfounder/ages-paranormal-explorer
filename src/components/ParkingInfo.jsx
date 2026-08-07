import React from 'react';
import { Navigation, MapPin, CheckCircle2 } from 'lucide-react';

const PARKING_TYPE_LABELS = {
  street: 'Street Parking',
  parking_lot: 'Parking Lot',
  parking_garage: 'Parking Garage',
};

export default function ParkingInfo({ tour }) {
  if (!tour?.parking_latitude || !tour?.parking_longitude) return null;

  const openInMaps = () => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${tour.parking_latitude},${tour.parking_longitude}`, '_blank');
  };

  return (
    <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 shrink-0">
          <span className="font-heading text-base font-bold text-amber-400">P</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-heading uppercase tracking-wider text-amber-400">Parking</p>
          <p className="text-sm text-foreground truncate">{tour.parking_name || 'Parking Area'}</p>
        </div>
        {tour.parking_verified && (
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
        )}
      </div>

      {/* Type and Cost sections */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-lg bg-card/40 border border-border/30">
          <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1">Type</p>
          <p className="text-xs text-foreground">{PARKING_TYPE_LABELS[tour.parking_type] || tour.parking_type || '—'}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-card/40 border border-border/30">
          <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1">Cost</p>
          <p className="text-xs text-foreground">{tour.parking_cost || '—'}</p>
        </div>
      </div>

      {tour.parking_address && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="w-3 h-3 shrink-0" /> {tour.parking_address}
        </p>
      )}

      <button onClick={openInMaps} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-heading uppercase tracking-wider hover:bg-amber-500/20 transition-colors">
        <Navigation className="w-3.5 h-3.5" /> Navigate to Parking
      </button>
    </div>
  );
}