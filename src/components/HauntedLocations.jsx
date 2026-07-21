import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ghost, Navigation, Search, Loader2, Clock, DollarSign, MapPin, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function HauntedLocations() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [zipMode, setZipMode] = useState(false);
  const [zip, setZip] = useState('');
  const [originLabel, setOriginLabel] = useState('');

  const fetchStops = async () => {
    const stops = await base44.entities.TourStop.list('-created_date', 500);
    return stops.filter(s => s.latitude && s.longitude);
  };

  const runSearch = async (lat, lon, label) => {
    const stops = await fetchStops();
    const nearby = stops
      .map(s => ({ ...s, _dist: haversineDistance(lat, lon, s.latitude, s.longitude) }))
      .filter(s => s._dist <= 30)
      .sort((a, b) => a._dist - b._dist);
    setOriginLabel(label);
    setResults(nearby);
    if (nearby.length === 0) setError('No haunted locations found within 30 miles.');
  };

  const handleNearby = async () => {
    setError(''); setZipMode(false); setResults(null);
    if (!navigator.geolocation) { setError('Location is not supported on this device. Try Zip Code instead.'); return; }
    setLoading(true);
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
      );
      await runSearch(pos.coords.latitude, pos.coords.longitude, 'Your location');
    } catch (e) {
      setError(e.message?.includes('denied') || e.code === 1
        ? 'Location permission denied. Try Zip Code instead.'
        : 'Could not determine your location.');
    }
    setLoading(false);
  };

  const handleZip = async () => {
    setError('');
    const z = zip.trim();
    if (!/^\d{5}$/.test(z)) { setError('Enter a valid 5-digit U.S. zip code.'); return; }
    setLoading(true); setResults(null);
    try {
      const resp = await fetch(`https://api.zippopotam.us/us/${z}`);
      if (!resp.ok) throw new Error('not found');
      const data = await resp.json();
      const place = data.places?.[0];
      if (!place) throw new Error('not found');
      const lat = parseFloat(place.latitude);
      const lon = parseFloat(place.longitude);
      await runSearch(lat, lon, `Zip ${z} — ${place['place name']}, ${place['state abbreviation']}`);
    } catch (e) {
      setError('Could not find that zip code. Please check and try again.');
    }
    setLoading(false);
  };

  return (
    <motion.div
      className="w-full max-w-sm px-6 mb-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
    >
      <div className="rounded-xl border border-accent/30 bg-accent/5 overflow-hidden">
        <div className="p-3 flex items-center gap-2 border-b border-accent/20">
          <Ghost className="w-4 h-4 text-accent" />
          <p className="font-heading text-xs font-semibold tracking-wide uppercase text-foreground">Haunted Locations</p>
          <span className="ml-auto text-[9px] text-muted-foreground font-heading uppercase tracking-wider">Within 30 mi</span>
        </div>

        <div className="p-3 flex gap-2">
          <button
            onClick={handleNearby}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-primary/15 border border-primary/40 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/25 transition-colors disabled:opacity-50"
          >
            {loading && !zipMode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
            Nearby
          </button>
          <button
            onClick={() => { setZipMode(v => !v); setError(''); }}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-accent/15 border border-accent/40 text-accent-foreground font-heading text-xs uppercase tracking-wider hover:bg-accent/25 transition-colors disabled:opacity-50"
          >
            <Search className="w-3.5 h-3.5" />
            Zip Code
          </button>
        </div>

        <AnimatePresence>
          {zipMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 flex gap-2">
                <input
                  value={zip}
                  onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  onKeyDown={e => { if (e.key === 'Enter') handleZip(); }}
                  placeholder="Enter 5-digit zip"
                  inputMode="numeric"
                  className="flex-1 px-3 py-2 rounded-lg bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
                <button
                  onClick={handleZip}
                  disabled={loading}
                  className="px-3 py-2 rounded-lg bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider hover:bg-primary/80 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Go'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="px-3 pb-3">
            <p className="text-[11px] text-yellow-400/90 flex items-center gap-1.5"><X className="w-3 h-3" /> {error}</p>
          </div>
        )}

        {results && results.length > 0 && (
          <div className="px-3 pb-3">
            <p className="text-[10px] text-muted-foreground mb-2 font-heading uppercase tracking-wider">
              {results.length} location{results.length === 1 ? '' : 's'} — {originLabel}
            </p>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {results.map((s, i) => (
                <div key={s.id} className="p-2.5 rounded-lg border border-border/40 bg-card/40">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-foreground leading-snug">{i + 1}. {s.name}</p>
                    <span className="shrink-0 text-[10px] text-primary font-heading">{s._dist.toFixed(1)} mi</span>
                  </div>
                  {s.address && (
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-start gap-1">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0" /> {s.address}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                    {s.hours_of_operation && (
                      <span className="text-[10px] text-amber-400/90 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {s.hours_of_operation}
                      </span>
                    )}
                    {s.entry_fee && (
                      <span className="text-[10px] text-green-400/90 flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> {s.entry_fee}
                      </span>
                    )}
                    {!s.hours_of_operation && !s.entry_fee && (
                      <span className="text-[10px] text-muted-foreground/70">Open access · Free</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}