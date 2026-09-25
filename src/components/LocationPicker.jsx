import React, { useState } from 'react';
import { MapPin, Crosshair, Loader2, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { captureGPS, reverseGeocodePlace } from '@/lib/evidenceContext';

/**
 * Dropdown that lets the user choose how to mark where evidence was obtained:
 *  - "gps": capture current device GPS coordinates (reverse-geocoded to a place name)
 *  - "manual": type an address or location name by hand
 *
 * Props:
 *  - latitude / longitude: current number coords (or null/'' when none)
 *  - locationName: current place-name string
 *  - onChange({ latitude, longitude, location_name }): called with all three
 *    fields whenever the selection changes.
 */
export default function LocationPicker({ latitude, longitude, locationName, onChange }) {
  const hasGPS = typeof latitude === 'number' && typeof longitude === 'number';
  const [mode, setMode] = useState(hasGPS ? 'gps' : '');
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  const handleCapture = async () => {
    setCapturing(true);
    setError('');
    const coords = await captureGPS();
    if (coords) {
      const place = await reverseGeocodePlace(coords.latitude, coords.longitude);
      onChange({ latitude: coords.latitude, longitude: coords.longitude, location_name: place || '' });
    } else {
      setError('Could not capture GPS. Check location permissions.');
    }
    setCapturing(false);
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setError('');
    if (newMode === 'manual') {
      // Clear GPS coordinates, keep any existing typed name
      onChange({ latitude: null, longitude: null, location_name: locationName || '' });
    } else if (newMode === 'gps' && !hasGPS) {
      // Clear stale name so the user captures fresh
      onChange({ latitude: null, longitude: null, location_name: '' });
    }
  };

  return (
    <div>
      <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground block mb-1.5">Location</label>
      <div className="relative">
        <select
          value={mode}
          onChange={e => handleModeChange(e.target.value)}
          className="w-full appearance-none bg-card/50 border border-border/50 rounded-lg px-3 py-2.5 pr-10 text-sm text-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="">Select location method…</option>
          <option value="gps">Use Current Location (GPS)</option>
          <option value="manual">Type Address / Location</option>
        </select>
        <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>

      {error && <p className="text-[10px] text-red-400/80 mt-1.5">{error}</p>}

      {mode === 'gps' && (
        <div className="mt-2">
          {hasGPS ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-primary block">{Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}</span>
                {locationName && <span className="text-[10px] text-muted-foreground block truncate">{locationName}</span>}
              </div>
              <button onClick={handleCapture} disabled={capturing} className="text-[10px] text-muted-foreground hover:text-primary transition-colors shrink-0">
                {capturing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Update'}
              </button>
            </div>
          ) : (
            <button onClick={handleCapture} disabled={capturing} className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-border/60 bg-card/30 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50">
              {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
              <span className="text-xs font-heading uppercase tracking-wider">{capturing ? 'Capturing GPS…' : 'Capture My Location'}</span>
            </button>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="mt-2">
          <Input
            value={locationName || ''}
            onChange={e => onChange({ latitude: null, longitude: null, location_name: e.target.value })}
            placeholder="Enter address or location name"
            className="bg-card/50 border-border/50"
          />
        </div>
      )}
    </div>
  );
}