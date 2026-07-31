import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Navigation, MapPin, Loader2, Sparkles, Building2, Search } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import SwipeableTourCard from '../components/SwipeableTourCard';
import TourCategoryBadge from '@/components/TourCategoryBadge';
import { base44 } from '@/api/base44Client';
import PullToRefresh from '@/components/PullToRefresh';
import ExistingTourDialog from '@/components/ExistingTourDialog';
import { findExistingTour } from '@/lib/generateTour';

const RADIUS_MILES = 30;

export default function NearbyLandmarks() {
  const navigate = useNavigate();
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(true);
  const [searchCenter, setSearchCenter] = useState(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [existingTour, setExistingTour] = useState(null);
  const [zipCode, setZipCode] = useState('');

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported — enter a zip code below');
      setLocating(false);
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSearchCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'your location' });
        setLocating(false);
      },
      () => {
        setError('Location access denied — enter a zip code below');
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  useEffect(() => { requestLocation(); }, []);
  useEffect(() => { if (searchCenter) loadLandmarks(); }, [searchCenter]);

  const loadLandmarks = async () => {
    if (!searchCenter) return;
    setLoading(true);
    const all = await base44.entities.Tour.list();
    const landmarks = all
      .filter(t => t.tour_category === 'landmark')
      .map(t => {
        if (!t.start_latitude || !t.start_longitude) return { ...t, distance: Infinity };
        const dist = getDistance(searchCenter.lat, searchCenter.lng, t.start_latitude, t.start_longitude);
        return { ...t, distance: dist };
      })
      .filter(t => t.distance <= RADIUS_MILES)
      .sort((a, b) => a.distance - b.distance);
    setTours(landmarks);
    setLoading(false);
  };

  const refreshLandmarks = async () => {
    if (searchCenter) await loadLandmarks();
  };

  const handleRefreshTour = async (tourId) => {
    const results = await base44.entities.Tour.filter({ id: tourId });
    if (results.length > 0) setTours(prev => prev.map(t => t.id === tourId ? results[0] : t));
    if (searchCenter) loadLandmarks();
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

  const handleZipSearch = async () => {
    if (!zipCode.trim() || zipCode.length < 5) return;
    setError('');
    try {
      const resp = await fetch(`https://api.zippopotam.us/us/${zipCode.trim()}`);
      if (!resp.ok) throw new Error('not found');
      const data = await resp.json();
      const place = data.places?.[0];
      if (!place) throw new Error('not found');
      setSearchCenter({
        lat: parseFloat(place.latitude),
        lng: parseFloat(place.longitude),
        label: `${place['place name']}, ${place['state abbreviation']}`
      });
    } catch (e) {
      setError('Could not find that zip code. Please check and try again.');
    }
  };

  const generateLandmark = async () => {
    if (!searchCenter || generating) return;
    setGenerating(true);
    setError('');
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate exactly 1 paranormal LANDMARK tour within ${RADIUS_MILES} miles of ${searchCenter.label} (latitude ${searchCenter.lat}, longitude ${searchCenter.lng}). Find a real haunted landmark — a single specific property (asylum, hotel, bridge, cemetery, museum, prison, battlefield, furnace, mansion) within ${RADIUS_MILES} miles of these coordinates.

This is a LANDMARK tour — one specific haunted property. ALL stops must be specific areas, rooms, buildings, wings, or sections within or on the grounds of that one location, and all stops share the same street address. Set tour_type to "walking".

Include:
- title: a creative, spooky tour name
- tour_category: "landmark"
- city: the town/city where the landmark is located
- state: full state name
- tour_type: "walking"
- description: 2-3 compelling sentences about the landmark's haunted history
- introduction: historical overview + paranormal overview (each 3-4 paragraphs, rich with dates, specific events, eyewitness accounts, local legends) + safety info. Mention "A.G.E.S. (Accessible Ghost Exploration Solutions) encourages explorers to conduct respectful paranormal investigations while preserving historic locations."
- conclusion: closing paragraph ending with "Thank you for exploring with A.G.E.S. — Accessible Ghost Exploration Solutions. Remember that every legend has a story, every location has a history, and every investigation adds to the mystery."
- difficulty: "easy", "moderate", or "challenging"
- estimated_duration: e.g. "2-3 hours"
- total_distance: e.g. "0.5 miles"
- start_location_name, start_latitude, start_longitude (real coordinates at the landmark, within ${RADIUS_MILES} miles of (${searchCenter.lat}, ${searchCenter.lng}))
- tags: array of relevant tags
- safety_info: important safety notes
- best_time: "Dusk to midnight"

ROUTING & ACCESS RULES — FOLLOW EXACTLY:
1. DISTANCE MINIMIZATION: All stops are within the same property/site. Every consecutive walking stop MUST be ≤0.33 miles from the previous.
2. WALKING TOURS: Walking tours form a logical loop — stops start and end near the same point.
3. PUBLIC ACCESS AFTER 7 PM: ALL locations must be publicly accessible after 7 PM. At minimum, investigators must be able to be outside the building after 7 PM.
4. MOST POPULAR STOPS: Include the most popular, most talked-about paranormal hotspots at this landmark.

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
                  tour_category: { type: "string" },
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
      const existing = await findExistingTour(tourData.title, tourData.state);
      if (existing) {
        setExistingTour(existing);
        setGenerating(false);
        return;
      }
      const saved = await base44.entities.Tour.create({ ...tourData, tour_category: 'landmark' });
      setGenerating(false);
      navigate(`/tour/${saved.id}`);
    } catch (err) {
      setGenerating(false);
      setError(err.message || 'Failed to generate landmark. Please try again.');
    }
  };

  return (
    <PageContainer>
      <SectionHeader title="Nearby Landmarks" subtitle={searchCenter ? `Within ${RADIUS_MILES} miles of ${searchCenter.label}` : 'Haunted landmarks near you'} showBack />
      <PullToRefresh onRefresh={refreshLandmarks}>
        <div className="px-4 pb-28 space-y-3 pt-3">

          <div className="space-y-2">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Search by Zip Code</p>
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
                onClick={handleZipSearch}
                disabled={zipCode.length < 5}
                className="px-4 py-2 rounded-lg bg-card border border-border hover:border-primary/40 text-foreground disabled:opacity-40 font-heading text-xs uppercase tracking-wider transition-colors flex items-center gap-1"
              >
                <Search className="w-3.5 h-3.5" />
                Search
              </button>
            </div>
          </div>

          {searchCenter && (
            <button
              onClick={generateLandmark}
              disabled={!!generating}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider hover:bg-primary/80 transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? 'Creating…' : `Create New Landmark · Within ${RADIUS_MILES} mi`}
            </button>
          )}

          {!searchCenter && !locating && (
            <button
              onClick={requestLocation}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border bg-card/40 text-foreground hover:bg-card/60 transition-colors"
            >
              <Navigation className="w-4 h-4 text-primary" />
              <span className="text-xs font-heading uppercase tracking-wider">Try my location again</span>
            </button>
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
          ) : tours.length === 0 ? (
            <div className="text-center py-16">
              <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">{error || `No landmark tours within ${RADIUS_MILES} miles.`}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Tap "Create New Landmark" to generate one.</p>
            </div>
          ) : (
            tours.map((tour, i) => (
              <motion.div key={tour.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <SwipeableTourCard tour={tour} onRefresh={handleRefreshTour} onDelete={handleDeleteTour}>
                  <Link to={`/tour/${tour.id}`} className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/40 hover:border-primary/40 hover:bg-card/50 transition-all group">
                    <div className="p-2.5 rounded-lg bg-primary/10">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">{tour.title}</p>
                        <TourCategoryBadge category="landmark" />
                      </div>
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
      <ExistingTourDialog tour={existingTour} onClose={() => setExistingTour(null)} />
      <NavBar />
    </PageContainer>
  );
}