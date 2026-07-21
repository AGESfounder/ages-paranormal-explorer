import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Ghost, Navigation, Search, Loader2, Clock, DollarSign, MapPin, X, ChevronDown, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { generateLocationTour } from '@/lib/generateTour';

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normAddr(a) {
  return (a || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// A single-destination tour (e.g. one asylum/house) shares one address across its stops.
// We collapse those into ONE overall location instead of listing rooms individually.
function isSingleDestination(stops) {
  if (stops.length < 2) return false;
  const addrs = stops.map(s => normAddr(s.address)).filter(Boolean);
  if (addrs.length < 2) return false;
  const counts = {};
  addrs.forEach(a => { counts[a] = (counts[a] || 0) + 1; });
  return Math.max(...Object.values(counts)) / addrs.length >= 0.8;
}

// Merge stops that sit within `radiusMi` of each other (rooms / areas of one landmark).
function clusterStops(stops, radiusMi) {
  const assigned = new Array(stops.length).fill(false);
  const clusters = [];
  for (let i = 0; i < stops.length; i++) {
    if (assigned[i]) continue;
    const cluster = [stops[i]];
    assigned[i] = true;
    const queue = [i];
    while (queue.length) {
      const idx = queue.shift();
      for (let j = 0; j < stops.length; j++) {
        if (assigned[j]) continue;
        const d = haversineDistance(stops[idx].latitude, stops[idx].longitude, stops[j].latitude, stops[j].longitude);
        if (d <= radiusMi) { assigned[j] = true; cluster.push(stops[j]); queue.push(j); }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function representative(cluster) {
  return cluster.reduce((best, s) => {
    if (!best) return s;
    const a = (s.historical_info || '').length + (s.paranormal_info || '').length;
    const b = (best.historical_info || '').length + (best.paranormal_info || '').length;
    return a > b ? s : best;
  }, null);
}

function truncate(text, n) {
  const t = (text || '').trim();
  return t.length > n ? t.slice(0, n).trim() + '…' : t;
}

export default function HauntedLocations() {
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [zipMode, setZipMode] = useState(false);
  const [zip, setZip] = useState('');
  const [originLabel, setOriginLabel] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [expandedOverviews, setExpandedOverviews] = useState({});
  const [creatingId, setCreatingId] = useState(null);
  const navigate = useNavigate();

  const buildLocations = async (lat, lon) => {
    const [tours, stops] = await Promise.all([
      base44.entities.Tour.list('-created_date', 500),
      base44.entities.TourStop.list('-created_date', 500),
    ]);
    const tourMap = {};
    tours.forEach(t => { tourMap[t.id] = t; });
    const byTour = {};
    stops.filter(s => s.latitude && s.longitude).forEach(s => { (byTour[s.tour_id] ||= []).push(s); });

    const locations = [];
    for (const tid of Object.keys(byTour)) {
      const tour = tourMap[tid];
      if (!tour) continue;
      const ts = byTour[tid];

      if (isSingleDestination(ts)) {
        const clat = ts.reduce((a, s) => a + s.latitude, 0) / ts.length;
        const clon = ts.reduce((a, s) => a + s.longitude, 0) / ts.length;
        const dist = haversineDistance(lat, lon, clat, clon);
        if (dist > 30) continue;
        locations.push({
          id: `tour-${tour.id}`,
          kind: 'tour',
          name: tour.title,
          address: ts[0].address || '',
          dist,
          overview: [tour.description, tour.introduction].filter(Boolean).join('\n\n'),
          hours: ts.map(s => s.hours_of_operation).filter(Boolean)[0] || '',
          fee: ts.map(s => s.entry_fee).filter(Boolean)[0] || '',
          city: tour.city,
          createName: tour.title,
          createState: tour.state,
          existingTourId: tour.id,
        });
      } else {
        clusterStops(ts, 0.15).forEach(cluster => {
          const rep = representative(cluster);
          const clat = cluster.reduce((a, s) => a + s.latitude, 0) / cluster.length;
          const clon = cluster.reduce((a, s) => a + s.longitude, 0) / cluster.length;
          const dist = haversineDistance(lat, lon, clat, clon);
          if (dist > 30) return;
          locations.push({
            id: `stop-${rep.id}`,
            kind: 'stop',
            name: rep.name,
            address: rep.address || '',
            dist,
            overview: [rep.historical_info, rep.paranormal_info].filter(Boolean).join('\n\n'),
            hours: rep.hours_of_operation || '',
            fee: rep.entry_fee || '',
            city: tour.city,
            createName: rep.name,
            createState: tour.state,
          });
        });
      }
    }
    locations.sort((a, b) => a.dist - b.dist);
    return locations;
  };

  const runSearch = async (lat, lon, label) => {
    setError('');
    setSearching(true);
    setResults(null);
    try {
      const locs = await buildLocations(lat, lon);
      setOriginLabel(label);
      setResults(locs);
      if (locs.length === 0) setError('No haunted locations found within 30 miles.');
    } catch (e) {
      setError('Could not load locations. Please try again.');
    }
    setSearching(false);
  };

  const handleNearby = async () => {
    setError(''); setZipMode(false); setResults(null);
    if (!navigator.geolocation) { setError('Location is not supported on this device. Try Zip Code instead.'); return; }
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
      );
      await runSearch(pos.coords.latitude, pos.coords.longitude, 'Your location');
    } catch (e) {
      setError(e.code === 1 || (e.message || '').includes('denied')
        ? 'Location permission denied. Try Zip Code instead.'
        : 'Could not determine your location.');
    }
  };

  const handleZip = async () => {
    setError('');
    const z = zip.trim();
    if (!/^\d{5}$/.test(z)) { setError('Enter a valid 5-digit U.S. zip code.'); return; }
    try {
      const resp = await fetch(`https://api.zippopotam.us/us/${z}`);
      if (!resp.ok) throw new Error('not found');
      const data = await resp.json();
      const place = data.places?.[0];
      if (!place) throw new Error('not found');
      await runSearch(parseFloat(place.latitude), parseFloat(place.longitude), `Zip ${z} — ${place['place name']}, ${place['state abbreviation']}`);
    } catch (e) {
      setError('Could not find that zip code. Please check and try again.');
    }
  };

  const handleCreateTour = async (loc) => {
    setError('');
    setCreatingId(loc.id);
    try {
      const newTour = await generateLocationTour(loc.createName, loc.createState);
      navigate(`/tour/${newTour.id}`);
    } catch (e) {
      console.error('Tour creation failed:', e);
      setError(e?.message ? `Failed to create tour: ${e.message}` : 'Failed to create tour. Please try again.');
    }
    setCreatingId(null);
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
            disabled={searching}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-primary/15 border border-primary/40 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/25 transition-colors disabled:opacity-50"
          >
            {searching && !zipMode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
            Nearby
          </button>
          <button
            onClick={() => { setZipMode(v => !v); setError(''); }}
            disabled={searching}
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
                  disabled={searching}
                  className="px-3 py-2 rounded-lg bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider hover:bg-primary/80 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Go'}
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
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {results.map((loc, i) => {
                const open = expandedId === loc.id;
                return (
                  <div key={loc.id} className="rounded-lg border border-border/40 bg-card/40 overflow-hidden">
                    <button
                      onClick={() => setExpandedId(open ? null : loc.id)}
                      className="w-full p-2.5 text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-foreground leading-snug flex items-center gap-1">
                          {i + 1}. {loc.name}
                          {loc.kind === 'tour' && <span className="text-[8px] text-accent font-heading uppercase">Landmark</span>}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-primary font-heading">{loc.dist.toFixed(1)} mi</span>
                          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                        </div>
                      </div>
                      {loc.address && (
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-start gap-1">
                          <MapPin className="w-3 h-3 mt-0.5 shrink-0" /> {loc.address}{loc.city ? ` · ${loc.city}` : ''}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                        {loc.hours && (
                          <span className="text-[10px] text-amber-400/90 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {loc.hours}
                          </span>
                        )}
                        {loc.fee && (
                          <span className="text-[10px] text-green-400/90 flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> {loc.fee}
                          </span>
                        )}
                        {!loc.hours && !loc.fee && (
                          <span className="text-[10px] text-muted-foreground/70">Open access · Free</span>
                        )}
                      </div>
                    </button>

                    <AnimatePresence>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-2.5 pb-2.5">
                            {loc.overview ? (() => {
                              const full = loc.overview.trim();
                              const cut = truncate(full, 500);
                              const isCut = cut !== full;
                              const isOpen = expandedOverviews[loc.id];
                              return (
                                <div className="text-[11px] text-foreground/70 leading-relaxed bg-background/40 rounded-md p-2 whitespace-pre-line">
                                  {isCut && !isOpen ? cut : full}
                                  {isCut && !isOpen && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setExpandedOverviews(s => ({ ...s, [loc.id]: true })); }}
                                      className="text-primary hover:underline underline-offset-2 ml-1 font-heading"
                                    >
                                      Show more
                                    </button>
                                  )}
                                </div>
                              );
                            })() : (
                              <p className="text-[11px] text-muted-foreground italic p-2">No overview available.</p>
                            )}
                            {loc.existingTourId ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/tour/${loc.existingTourId}`); }}
                                className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-accent text-accent-foreground font-heading text-[11px] uppercase tracking-wider hover:bg-accent/80 transition-colors"
                              >
                                <MapPin className="w-3.5 h-3.5" /> Go to Existing Tour
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCreateTour(loc); }}
                                disabled={creatingId === loc.id}
                                className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-primary-foreground font-heading text-[11px] uppercase tracking-wider hover:bg-primary/80 transition-colors disabled:opacity-60"
                              >
                                {creatingId === loc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                {creatingId === loc.id ? 'Creating Tour…' : 'Create Tour of This Location'}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}