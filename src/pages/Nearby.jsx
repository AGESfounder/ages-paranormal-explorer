import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Navigation, MapPin, Loader2, Ghost, Compass, Sparkles } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import SwipeableTourCard from '../components/SwipeableTourCard';
import { base44 } from '@/api/base44Client';
import PullToRefresh from '@/components/PullToRefresh';

export default function Nearby() {
  const navigate = useNavigate();
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(true);
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState('');
  const [generatingRange, setGeneratingRange] = useState(null);

  const [zipCode, setZipCode] = useState('');
  const [zipMode, setZipMode] = useState(false);

  const distanceRanges = [
    { label: '1-20 Miles', min: 0, max: 20, icon: Compass },
    { label: '21-40 Miles', min: 21, max: 40, icon: MapPin },
    { label: '41-60 Miles', min: 41, max: 60, icon: Navigation },
  ];
  const [selectedRange, setSelectedRange] = useState(distanceRanges[0]);

  const generateTourForRange = async (range) => {
    if (!coords || generatingRange) return;
    setGeneratingRange(range.label);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate exactly 1 paranormal tour with a start location ${range.min}-${range.max} miles from these coordinates: (${coords.lat}, ${coords.lng}). The tour's start_latitude and start_longitude MUST place it ${range.min}-${range.max} miles away — pick a real town or city in that distance band.

Include:
- title: a creative, spooky tour name
- city: the town/city where the tour starts
- state: full state name
- tour_type: "walking", "driving", or "mixed"
- description: 2-3 compelling sentences about the tour's haunted locations
- introduction: historical overview + paranormal overview (each 3-4 paragraphs, rich with dates, specific events, eyewitness accounts, local legends) + safety info. Mention "A.G.E.S. (Accessible Ghost Exploration Solutions) encourages explorers to conduct respectful paranormal investigations while preserving historic locations."
- conclusion: closing paragraph ending with "Thank you for exploring with A.G.E.S. — Accessible Ghost Exploration Solutions. Remember that every legend has a story, every location has a history, and every investigation adds to the mystery."
- difficulty: "easy", "moderate", or "challenging"
- estimated_duration: e.g. "2-3 hours"
- total_distance: e.g. "1.5 miles"
- start_location_name, start_latitude, start_longitude (real coordinates at a location ${range.min}-${range.max} miles from (${coords.lat}, ${coords.lng}))
- tags: array of relevant tags
- safety_info: important safety notes
- best_time: "Dusk to midnight"

ROUTING & ACCESS RULES — FOLLOW EXACTLY:

1. DISTANCE MINIMIZATION: Minimize distance from stop to stop AND overall tour length. Every consecutive walking stop MUST be ≤0.33 miles from the previous. Arrange stops in the most efficient order possible — shortest total route wins.

2. WALKING TOURS: Walking tours form a logical loop — stops start and end near the same point with no crisscrossing. Route proceeds in an efficient circle so investigators return to their starting point.

3. DRIVING-ONLY TOURS: Stops follow a logical linear progression — each stop advances in a single direction with no doubling back. Minimize total driving distance.

4. MIXED TOURS: The tour can start by driving to a parking area near a walking cluster, then walking stops form a logical loop (≤0.33 miles between stops, returning to that parking area). Remaining driving stops continue in a linear progression. Use this pattern when it makes the most logical sense — drive to where the walking cluster is, walk the loop, then drive to remaining stops. Minimize both walking and driving distances.

5. PUBLIC ACCESS AFTER 7 PM: ALL locations must be publicly accessible after 7 PM. Ghost hunts occur at night. Do NOT use locations that close before 7 PM, have locked gates, or prohibit nighttime access (e.g. national battlefields, state parks closing at sunset, gated cemeteries, museums closing at 5 PM). At minimum, investigators must be able to be outside the building after 7 PM. Verify nighttime access for every location.

6. MOST POPULAR STOPS: Include the most popular, most talked-about paranormal hotspots — the locations where paranormal activity and ghosts have been observed, recorded, and discussed most. Prioritize locations with the richest documented paranormal history and famous ghost sightings. Do NOT include obscure or unknown locations.

Use real locations with documented paranormal history only.`,
        response_json_schema: {
          type: "object",
          properties: {
            tours: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                  tour_type: { type: "string" },
                  description: { type: "string" },
                  introduction: { type: "string" },
                  conclusion: { type: "string" },
                  difficulty: { type: "string" },
                  estimated_duration: { type: "string" },
                  total_distance: { type: "string" },
                  start_location_name: { type: "string" },
                  start_latitude: { type: "number" },
                  start_longitude: { type: "number" },
                  tags: { type: "array", items: { type: "string" } },
                  safety_info: { type: "string" },
                  best_time: { type: "string" }
                }
              }
            }
          }
        },
        model: "gemini_3_flash",
        add_context_from_internet: true
      });

      const tourData = result.tours?.[0];
      if (!tourData) throw new Error('No tour generated');
      const saved = await base44.entities.Tour.create(tourData);
      setGeneratingRange(null);
      navigate(`/tour/${saved.id}`);
    } catch (err) {
      setGeneratingRange(null);
      setError(err.message || 'Failed to generate tour. Please try again.');
    }
  };

  const generateTourForZip = async () => {
    if (!zipCode.trim() || generatingRange || zipCode.length < 5) return;
    setGeneratingRange('Custom Zip Code');
    try {
      let zipLat, zipLon, zipLabel;
      try {
        const resp = await fetch(`https://api.zippopotam.us/us/${zipCode.trim()}`);
        if (!resp.ok) throw new Error('not found');
        const data = await resp.json();
        const place = data.places?.[0];
        if (!place) throw new Error('not found');
        zipLat = parseFloat(place.latitude);
        zipLon = parseFloat(place.longitude);
        zipLabel = `${place['place name']}, ${place['state abbreviation']}`;
      } catch (e) {
        setGeneratingRange(null);
        setError('Could not find that zip code. Please check and try again.');
        return;
      }
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate exactly 1 paranormal tour within a 30-mile radius of ${zipLabel} (latitude ${zipLat}, longitude ${zipLon}, zip code ${zipCode.trim()}). Find a real haunted location within 30 miles of these coordinates.

Include:
- title: a creative, spooky tour name
- city: the town/city where the tour starts
- state: full state name
- tour_type: "walking", "driving", or "mixed"
- description: 2-3 compelling sentences about the tour's haunted locations
- introduction: historical overview + paranormal overview (each 3-4 paragraphs, rich with dates, specific events, eyewitness accounts, local legends) + safety info. Mention "A.G.E.S. (Accessible Ghost Exploration Solutions) encourages explorers to conduct respectful paranormal investigations while preserving historic locations."
- conclusion: closing paragraph ending with "Thank you for exploring with A.G.E.S. — Accessible Ghost Exploration Solutions. Remember that every legend has a story, every location has a history, and every investigation adds to the mystery."
- difficulty: "easy", "moderate", or "challenging"
- estimated_duration: e.g. "2-3 hours"
- total_distance: e.g. "1.5 miles"
- start_location_name, start_latitude, start_longitude (real coordinates within 30 miles of ${zipLabel} (${zipLat}, ${zipLon}))
- tags: array of relevant tags
- safety_info: important safety notes
- best_time: "Dusk to midnight"

ROUTING & ACCESS RULES — FOLLOW EXACTLY:

1. DISTANCE MINIMIZATION: Minimize distance from stop to stop AND overall tour length. Every consecutive walking stop MUST be ≤0.33 miles from the previous. Arrange stops in the most efficient order possible — shortest total route wins.

2. WALKING TOURS: Walking tours form a logical loop — stops start and end near the same point with no crisscrossing. Route proceeds in an efficient circle so investigators return to their starting point.

3. DRIVING-ONLY TOURS: Stops follow a logical linear progression — each stop advances in a single direction with no doubling back. Minimize total driving distance.

4. MIXED TOURS: The tour can start by driving to a parking area near a walking cluster, then walking stops form a logical loop (≤0.33 miles between stops, returning to that parking area). Remaining driving stops continue in a linear progression. Use this pattern when it makes the most logical sense — drive to where the walking cluster is, walk the loop, then drive to remaining stops. Minimize both walking and driving distances.

5. PUBLIC ACCESS AFTER 7 PM: ALL locations must be publicly accessible after 7 PM. Ghost hunts occur at night. Do NOT use locations that close before 7 PM, have locked gates, or prohibit nighttime access (e.g. national battlefields, state parks closing at sunset, gated cemeteries, museums closing at 5 PM). At minimum, investigators must be able to be outside the building after 7 PM. Verify nighttime access for every location.

6. MOST POPULAR STOPS: Include the most popular, most talked-about paranormal hotspots — the locations where paranormal activity and ghosts have been observed, recorded, and discussed most. Prioritize locations with the richest documented paranormal history and famous ghost sightings. Do NOT include obscure or unknown locations.

Use real locations with documented paranormal history only.`,
        response_json_schema: {
          type: "object",
          properties: {
            tours: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                  tour_type: { type: "string" },
                  description: { type: "string" },
                  introduction: { type: "string" },
                  conclusion: { type: "string" },
                  difficulty: { type: "string" },
                  estimated_duration: { type: "string" },
                  total_distance: { type: "string" },
                  start_location_name: { type: "string" },
                  start_latitude: { type: "number" },
                  start_longitude: { type: "number" },
                  tags: { type: "array", items: { type: "string" } },
                  safety_info: { type: "string" },
                  best_time: { type: "string" }
                }
              }
            }
          }
        },
        model: "gemini_3_flash",
        add_context_from_internet: true
      });

      const tourData = result.tours?.[0];
      if (!tourData) throw new Error('No tour generated');
      const saved = await base44.entities.Tour.create(tourData);
      setGeneratingRange(null);
      setZipCode('');
      setZipMode(false);
      navigate(`/tour/${saved.id}`);
    } catch (err) {
      setGeneratingRange(null);
      setError(err.message || 'Failed to generate tour. Please try again.');
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLocating(false);
      loadAllTours();
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError('Location access denied');
        setLocating(false);
        loadAllTours();
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    requestLocation();
  }, []);

  useEffect(() => {
    if (coords) loadNearby();
  }, [coords]);

  const loadNearby = async () => {
    const all = await base44.entities.Tour.list();
    const withDist = all.map(t => {
      if (!t.start_latitude || !t.start_longitude) return { ...t, distance: Infinity };
      const dist = getDistance(coords.lat, coords.lng, t.start_latitude, t.start_longitude);
      return { ...t, distance: dist };
    });
    withDist.sort((a, b) => a.distance - b.distance);
    setTours(withDist);
    setLoading(false);
  };

  const loadAllTours = async () => {
    const all = await base44.entities.Tour.list('-created_date', 10);
    setTours(all);
    setLoading(false);
  };

  const refreshNearby = async () => {
    if (coords) await loadNearby();
    else await loadAllTours();
  };

  const handleRefreshTour = async (tourId) => {
    const results = await base44.entities.Tour.filter({ id: tourId });
    if (results.length > 0) setTours(prev => prev.map(t => t.id === tourId ? results[0] : t));
    if (coords) loadNearby();
  };

  const handleDeleteTour = async (tourId) => {
    setTours(prev => prev.filter(t => t.id !== tourId));
    try {
      const stops = await base44.entities.TourStop.filter({ tour_id: tourId });
      for (const s of stops) await base44.entities.TourStop.delete(s.id);
      const favs = await base44.entities.Favorite.filter({ tour_id: tourId });
      for (const f of favs) await base44.entities.Favorite.delete(f.id);
      await base44.entities.Tour.delete(tourId);
    } catch (e) { /* silently handled */ }
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const visibleTours = coords && selectedRange
    ? tours.filter((t) => t.distance >= selectedRange.min && t.distance <= selectedRange.max)
    : tours;

  return (
    <PageContainer>
      <SectionHeader title="Nearby Tours" subtitle={coords ? 'Sorted by distance' : 'Recent tours'} showBack />
      <PullToRefresh onRefresh={refreshNearby}>
      <div className="px-4 pb-28 space-y-3 pt-3">

        {coords && (
          <div className="space-y-2">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Generate Tour by Distance</p>
            <div className="grid grid-cols-2 gap-2">
              {distanceRanges.map((range) => {
                const Icon = range.icon;
                const isSelected = selectedRange?.label === range.label;
                return (
                  <button
                    key={range.label}
                    onClick={() => { setZipMode(false); setSelectedRange(range); }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border/40 bg-card/40 hover:border-primary/30 hover:bg-card/50 text-foreground'
                    }`}
                  >
                    <Icon className="w-5 h-5 text-primary" />
                    <span className="font-heading text-xs tracking-wide">{range.label}</span>
                  </button>
                );
              })}
              <button
                onClick={() => { setZipMode(!zipMode); setError(''); }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                  zipMode
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/40 bg-card/40 hover:border-primary/30 hover:bg-card/50 text-foreground'
                }`}
              >
                <Ghost className="w-5 h-5 text-primary" />
                <span className="font-heading text-xs tracking-wide">Custom Zip</span>
              </button>
            </div>
            <button
              onClick={() => generateTourForRange(selectedRange)}
              disabled={!!generatingRange || !selectedRange}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider hover:bg-primary/80 transition-colors disabled:opacity-50"
            >
              {generatingRange ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generatingRange ? 'Creating…' : `Create New Tour${selectedRange ? ` · ${selectedRange.label}` : ''}`}
            </button>
            {zipMode && (
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="Enter zip code"
                  className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  maxLength={5}
                />
                <button
                  onClick={generateTourForZip}
                  disabled={!!generatingRange || zipCode.length < 5}
                  className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 disabled:opacity-40 text-primary-foreground font-heading text-xs uppercase tracking-wider transition-colors"
                >
                  {generatingRange === 'Custom Zip Code' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                </button>
              </div>
            )}
          </div>
        )}

        {!locating && !coords && (
          <div className="space-y-2">
            <p className="text-xs font-heading uppercase tracking-wider text-muted-foreground">Generate a Tour Near You</p>
            <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">Couldn't get your location. Enter a zip code to generate a tour nearby, or try again.</p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="Enter zip code"
                className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                maxLength={5}
              />
              <button
                onClick={generateTourForZip}
                disabled={!!generatingRange || zipCode.length < 5}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 disabled:opacity-40 text-primary-foreground font-heading text-xs uppercase tracking-wider transition-colors"
              >
                {generatingRange === 'Custom Zip Code' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
              </button>
            </div>
            <button
              onClick={requestLocation}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border bg-card/40 text-foreground hover:bg-card/60 transition-colors"
            >
              <Navigation className="w-4 h-4 text-primary" />
              <span className="text-xs font-heading uppercase tracking-wider">Try my location again</span>
            </button>
          </div>
        )}

        {locating ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
              <Loader2 className="w-8 h-8 text-primary" />
            </motion.div>
            <p className="text-sm text-muted-foreground">Locating you...</p>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>
        ) : visibleTours.length === 0 ? (
          <div className="text-center py-16">
            <Navigation className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">{error || `No existing tours within ${selectedRange?.label || 'this range'}.`}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Tap “Create New Tour” to generate one.</p>
          </div>
        ) : (
          visibleTours.map((tour, i) => (
            <motion.div key={tour.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <SwipeableTourCard tour={tour} onRefresh={handleRefreshTour} onDelete={handleDeleteTour}>
              <Link to={`/tour/${tour.id}`} className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/40 hover:border-primary/40 hover:bg-card/50 transition-all group">
                <div className="p-2.5 rounded-lg bg-primary/10">
                  <Navigation className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">{tour.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5" /> {tour.city}, {tour.state}
                  </p>
                </div>
                {tour.distance !== undefined && tour.distance < Infinity && (
                  <span className="text-xs text-primary font-heading tracking-wide">{Math.round(tour.distance)} mi</span>
                )}
              </Link>
            </SwipeableTourCard>
            </motion.div>
          ))
        )}
      </div>
      </PullToRefresh>
      <NavBar />
    </PageContainer>
  );
}