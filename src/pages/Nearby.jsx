import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Navigation, MapPin, Loader2, Ghost, Compass } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';

export default function Nearby() {
  const navigate = useNavigate();
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(true);
  const [coords, setCoords] = useState(null);
  const [error, setError] = useState('');
  const [generatingRange, setGeneratingRange] = useState(null);

  const distanceRanges = [
    { label: '1-15 Miles', min: 1, max: 15, icon: Compass },
    { label: '16-30 Miles', min: 16, max: 30, icon: MapPin },
    { label: '31-45 Miles', min: 31, max: 45, icon: Navigation },
    { label: '46-60 Miles', min: 46, max: 60, icon: Ghost },
  ];

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
- introduction: historical overview + paranormal overview (each 3-4 paragraphs, rich with dates, specific events, eyewitness accounts, local legends) + safety info. Mention "Ages (A.G.E.S. - Affordable Ghost Exploration Solutions) encourages explorers to conduct respectful paranormal investigations while preserving historic locations."
- conclusion: closing paragraph ending with "Thank you for exploring with Ages — A.G.E.S., Affordable Ghost Exploration Solutions. Remember that every legend has a story, every location has a history, and every investigation adds to the mystery."
- difficulty: "easy", "moderate", or "challenging"
- estimated_duration: e.g. "2-3 hours"
- total_distance: e.g. "1.5 miles"
- start_location_name, start_latitude, start_longitude (real coordinates at a location ${range.min}-${range.max} miles from (${coords.lat}, ${coords.lng}))
- tags: array of relevant tags
- safety_info: important safety notes
- best_time: "Dusk to midnight"

IMPORTANT: All locations must be publicly accessible after dark. Do NOT use locations that close at dusk or have restricted nighttime access. Use real locations with documented paranormal history only.`,
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

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLocating(false);
      loadAllTours();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError('Location access denied');
        setLocating(false);
        loadAllTours();
      }
    );
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
    setTours(withDist.slice(0, 10));
    setLoading(false);
  };

  const loadAllTours = async () => {
    const all = await base44.entities.Tour.list('-created_date', 10);
    setTours(all);
    setLoading(false);
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  return (
    <PageContainer>
      <SectionHeader title="Nearby Tours" subtitle={coords ? 'Sorted by distance' : 'Recent tours'} showBack />
      <div className="px-4 pb-28 space-y-3 pt-3">

        {coords && (
          <div className="space-y-2">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Generate Tour by Distance</p>
            <div className="grid grid-cols-2 gap-2">
              {distanceRanges.map((range) => {
                const Icon = range.icon;
                const isGenerating = generatingRange === range.label;
                return (
                  <button
                    key={range.label}
                    onClick={() => generateTourForRange(range)}
                    disabled={!!generatingRange}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all disabled:opacity-40 ${
                      isGenerating
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border/40 bg-card/40 hover:border-primary/30 hover:bg-card/50 text-foreground'
                    }`}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    ) : (
                      <Icon className="w-5 h-5 text-primary" />
                    )}
                    <span className="font-heading text-xs tracking-wide">{range.label}</span>
                  </button>
                );
              })}
            </div>
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
        ) : error && tours.length === 0 ? (
          <div className="text-center py-16">
            <Navigation className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">{error}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Explore states to browse all tours</p>
          </div>
        ) : (
          tours.map((tour, i) => (
            <motion.div key={tour.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/tour/${tour.id}`} className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/40 hover:border-primary/40 hover:bg-card/50 transition-all group">
                <div className="p-2.5 rounded-lg bg-primary/10">
                  <Navigation className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{tour.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5" /> {tour.city}, {tour.state}
                  </p>
                </div>
                {tour.distance !== undefined && tour.distance < Infinity && (
                  <span className="text-xs text-primary font-heading tracking-wide">{Math.round(tour.distance)} mi</span>
                )}
              </Link>
            </motion.div>
          ))
        )}
      </div>
      <NavBar />
    </PageContainer>
  );
}