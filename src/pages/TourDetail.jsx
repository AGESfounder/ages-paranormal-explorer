import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Clock, Footprints, Car, Heart, Ghost, Loader2, ChevronRight, Volume2, VolumeX, Navigation, Zap, AlertTriangle, RefreshCw, Map, Info, DollarSign } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import TourMap from '../components/TourMap';
import useGhostVoice from '../hooks/useGhostVoice';
import { base44 } from '@/api/base44Client';

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function orderStopsByProximity(stops) {
  if (stops.length <= 1) return stops;
  const ordered = [stops[0]];
  const remaining = stops.slice(1);
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineDistance(last.latitude, last.longitude, remaining[i].latitude, remaining[i].longitude);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }
  return ordered;
}

function enforceWalkingDistance(stops, tourType) {
  if (!stops.length) return stops;
  const WALKING_LIMIT = 0.33;

  if (tourType === 'driving') {
    return orderStopsByProximity(stops).map((s, i) => ({ ...s, travel_method: 'driving', stop_number: i + 1 }));
  }

  if (tourType === 'walking') {
    const ordered = orderStopsByProximity(stops);
    return ordered.map((s, i) => {
      if (i === 0) return { ...s, travel_method: 'walking', stop_number: i + 1 };
      const prev = ordered[i - 1];
      const dist = haversineDistance(prev.latitude, prev.longitude, s.latitude, s.longitude);
      return { ...s, travel_method: dist <= WALKING_LIMIT ? 'walking' : 'driving', stop_number: i + 1 };
    });
  }

  // MIXED TOURS: keep original stop order from LLM, label travel_method by proximity
  // Stops within 0.33 miles of their neighbor in the sequence are walking, others driving
  const sorted = [...stops].sort((a, b) => a.stop_number - b.stop_number);
  const labeled = sorted.map((s, i) => {
    if (i === sorted.length - 1) {
      // Last stop: same method as previous if close, otherwise driving
      const prev = i > 0 ? sorted[i - 1] : null;
      if (prev && haversineDistance(prev.latitude, prev.longitude, s.latitude, s.longitude) <= WALKING_LIMIT) {
        return { ...s, travel_method: 'walking' };
      }
      return { ...s, travel_method: 'driving' };
    }
    const nextDist = haversineDistance(s.latitude, s.longitude, sorted[i + 1].latitude, sorted[i + 1].longitude);
    return { ...s, travel_method: nextDist <= WALKING_LIMIT ? 'walking' : 'driving' };
  });

  return labeled.map((s, i) => ({ ...s, stop_number: i + 1 }));
}

export default function TourDetail() {
  const { tourId } = useParams();
  const [tour, setTour] = useState(null);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingStops, setGeneratingStops] = useState(false);
  const [stopsError, setStopsError] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const { isSpeaking, isGenerating, narrate } = useGhostVoice();

  useEffect(() => {
    loadTour();
    return () => { /* hook handles its own cleanup */ };
  }, [tourId]);

  const loadTour = async () => {
    setLoading(true);
    const tourData = await base44.entities.Tour.filter({ id: tourId });
    if (tourData.length > 0) {
      setTour(tourData[0]);
      const favs = await base44.entities.Favorite.filter({ tour_id: tourId });
      setIsFavorite(favs.length > 0);
      const tourStops = await base44.entities.TourStop.filter({ tour_id: tourId });
      if (tourStops.length === 0) {
        await generateStops(tourData[0]);
      } else {
        const reordered = enforceWalkingDistance(tourStops, tourData[0].tour_type);
        // Update stop_numbers in the database if they changed
        for (const s of reordered) {
          const existing = tourStops.find(ts => ts.id === s.id);
          if (existing && existing.stop_number !== s.stop_number) {
            await base44.entities.TourStop.update(s.id, { stop_number: s.stop_number, travel_method: s.travel_method });
          }
        }
        setStops(reordered);
      }
    }
    setLoading(false);
  };

  const generateStops = async (tourData) => {
    setGeneratingStops(true);
    setStopsError('');
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate exactly 10 stops for the paranormal tour "${tourData.title}" in ${tourData.city}, ${tourData.state}. Type: ${tourData.tour_type}. Description: ${tourData.description}

Each stop must have RICH, DETAILED content suitable for 3-5 minutes of spoken narration per stop (~400-600 words across the fields below):
- stop_number: 1-10 in logical route order
- name, latitude, longitude (real GPS), address
- historical_info: 4-5 detailed paragraphs covering construction dates and architecture, major historical events that occurred there, notable figures who lived/visited/died there, scandals/murders/tragedies, and the building's significance to the community over time. Go deep into specific dates, names, and documented events.
- paranormal_info: 4-5 detailed paragraphs covering specific ghost sightings (with dates and eyewitness names when known), EVP recordings and their content, apparition descriptions (clothing, behavior, location within the building), shadow figures, cold spots, poltergeist activity, residual hauntings vs intelligent hauntings, and local folklore/urban legends. Include investigator testimonies and well-known paranormal events tied to the location.
- investigation_suggestions: 3-5 items like "EVP Session", "Spirit Box Session", "EMF Sweep", "Trigger Object Experiment", "Temperature Monitoring", "Full-Spectrum Photography"
- estimated_investigation_time: "10 minutes" / "15 minutes" / "20 minutes"
- construction_date, famous_people
- narration_text: 8-12 sentences of dramatic, immersive storytelling narration written in a mysterious, captivating style. The narrator is a seasoned paranormal investigator speaking directly to fellow investigators about what awaits them. Include vivid sensory details (sounds, smells, temperature, lighting), specific ghost stories, and build anticipation for the investigation. This should feel like a professional ghost tour guide speaking.
- hours_of_operation: if the location has restricted public hours, note them (e.g. "Open to public daily 9am-5pm", "Grounds open dawn to dusk, building closed after 4pm"). Leave empty if publicly accessible 24/7.
- entry_fee: if there is an admission charge, note the cost (e.g. "$10 adults, $5 children", "Free, donations welcome"). Leave empty if completely free.

ROUTING & ACCESS RULES — FOLLOW EXACTLY:

1. DISTANCE MINIMIZATION: Minimize distance from stop to stop AND overall tour length. Every consecutive walking stop MUST be ≤0.33 miles from the previous. Arrange stops in the most efficient order possible — shortest total route wins.

2. WALKING TOURS: Stops must form a logical loop — start and end near the same point (${tourData.start_location_name}). Route must be efficient with NO crisscrossing. Stops proceed in a circle so investigators return to their starting point naturally.

3. DRIVING-ONLY TOURS: Stops must follow a logical linear progression — each stop advances in a single direction with no doubling back. Minimize total driving distance.

4. MIXED TOURS: The tour can start by driving to a parking area near a walking cluster, then walking stops form a logical loop (≤0.33 miles between stops, returning to that parking area). Remaining driving stops continue in a linear progression. Use this pattern when it makes the most logical sense — drive to where the walking cluster is, walk the loop, then drive to remaining stops. Walking stops must cluster within ≤0.33 miles of each other. Minimize both walking and driving distances.

5. PUBLIC ACCESS AFTER 7 PM: ALL locations must be publicly accessible after 7 PM. Ghost hunts occur primarily at night. Do NOT use locations that close before 7 PM, have locked gates, or prohibit nighttime access (e.g. national battlefields, state parks closing at sunset, gated cemeteries, museums closing at 5 PM). At minimum, investigators must be able to be outside the building after 7 PM. If a location has restricted hours, note them in hours_of_operation. Do NOT use any location fully inaccessible after 7 PM.

6. MOST POPULAR STOPS: Include the most popular, most talked-about paranormal hotspots near ${tourData.city}, ${tourData.state} — the locations where paranormal activity and ghosts have been observed, recorded, and discussed most. Prioritize locations with the richest documented paranormal history, famous ghost sightings, and active investigations. Do NOT include obscure or unknown locations.`,
        response_json_schema: {
          type: "object",
          properties: {
            stops: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  stop_number: { type: "number" },
                  name: { type: "string" },
                  latitude: { type: "number" },
                  longitude: { type: "number" },
                  address: { type: "string" },
                  historical_info: { type: "string" },
                  paranormal_info: { type: "string" },
                  investigation_suggestions: { type: "array", items: { type: "string" } },
                  estimated_investigation_time: { type: "string" },
                  construction_date: { type: "string" },
                  famous_people: { type: "string" },
                  narration_text: { type: "string" },
                  hours_of_operation: { type: "string" },
                  entry_fee: { type: "string" }
                }
              }
            }
          }
        },
        model: "automatic"
      });

      const processed = enforceWalkingDistance(result.stops || [], tourData.tour_type);
      const created = [];
      for (const stop of processed) {
        const saved = await base44.entities.TourStop.create({ ...stop, tour_id: tourId });
        created.push(saved);
      }
      setStops(created.sort((a, b) => a.stop_number - b.stop_number));
      setGeneratingStops(false);
    } catch (err) {
      setStopsError(err.message || 'Failed to generate stops. Please try again.');
      setGeneratingStops(false);
    }
  };

  const toggleFavorite = async () => {
    if (isFavorite) {
      const favs = await base44.entities.Favorite.filter({ tour_id: tourId });
      for (const f of favs) await base44.entities.Favorite.delete(f.id);
      setIsFavorite(false);
    } else {
      await base44.entities.Favorite.create({ tour_id: tourId, tour_title: tour.title, state: tour.state, city: tour.city });
      setIsFavorite(true);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <SectionHeader title="Loading Tour" showBack />
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
            {generatingStops ? <Ghost className="w-12 h-12 text-primary" /> : <Loader2 className="w-8 h-8 text-primary" />}
          </motion.div>
          <p className="text-sm text-muted-foreground font-heading tracking-wide">
            {generatingStops ? 'Mapping paranormal hotspots...' : 'Loading...'}
          </p>
        </div>
        <NavBar />
      </PageContainer>
    );
  }

  if (!tour) {
    return (
      <PageContainer>
        <SectionHeader title="Tour Not Found" showBack />
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-muted-foreground">This tour doesn't exist.</p>
        </div>
        <NavBar />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader
        title={tour.title}
        subtitle={`${tour.city}, ${tour.state}`}
        showBack
        rightAction={
          <button onClick={toggleFavorite} className="p-2">
            <Heart className={`w-5 h-5 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
          </button>
        }
      />

      <div className="px-4 pb-28 space-y-4 pt-3">
        <div className="p-4 rounded-xl border border-border/40 bg-card/40 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {tour.tour_type === 'walking' ? <Footprints className="w-3.5 h-3.5" /> : tour.tour_type === 'mixed' ? <><Footprints className="w-3.5 h-3.5" /><Car className="w-3 h-3" /></> : <Car className="w-3.5 h-3.5" />}
              {tour.tour_type === 'mixed' ? 'Walking + Driving' : tour.tour_type}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5" /> {tour.estimated_duration}</span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{tour.description}</p>
          {tour.best_time && <p className="text-xs text-primary flex items-center gap-1"><Zap className="w-3 h-3" /> Best time: {tour.best_time}</p>}
        </div>

        {tour.introduction && (
          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-primary">Introduction</h3>
              <button onClick={() => narrate(tour.introduction)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> Loading</> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Narrate</>}
              </button>
            </div>
            <p className="text-xs text-foreground/70 leading-relaxed">{tour.introduction}</p>
          </div>
        )}

        {tour.safety_info && (
          <div className="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
            <p className="text-[10px] font-heading uppercase tracking-wider text-yellow-500 mb-1">Safety Information</p>
            <p className="text-xs text-foreground/60 leading-relaxed">{tour.safety_info}</p>
          </div>
        )}

        <div className="p-3 rounded-lg border border-border/40 bg-card/30 flex items-center gap-3">
          <Navigation className="w-4 h-4 text-primary" />
          <div>
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Start Location</p>
            <p className="text-sm text-foreground">{tour.start_location_name}</p>
          </div>
        </div>

        {stops.length > 0 && <TourMap stops={stops} tour={tour} height="h-72" />}

        <div>
          <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground mb-3 flex items-center gap-2">
            <Map className="w-4 h-4 text-primary" /> {stops.length} Investigation Stops
          </h3>
          {stopsError ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <AlertTriangle className="w-10 h-10 text-yellow-500" />
              <p className="text-xs text-yellow-400 font-heading uppercase tracking-wider">Generation Failed</p>
              <p className="text-xs text-muted-foreground text-center">{stopsError}</p>
              <button onClick={() => tour && generateStops(tour)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground font-heading text-xs uppercase tracking-wider transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          ) : generatingStops ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                <Ghost className="w-10 h-10 text-primary" />
              </motion.div>
              <p className="text-xs text-muted-foreground">Mapping paranormal hotspots...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stops.map((stop, i) => (
                <motion.div key={stop.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <Link to={`/stop/${stop.id}`} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-card/30 hover:border-primary/30 hover:bg-card/50 transition-all group">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full font-heading text-sm font-bold shrink-0 ${stop.travel_method === 'driving' ? 'bg-amber-500/10 text-amber-400' : 'bg-primary/10 text-primary'}`}>{stop.stop_number}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{stop.name}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                        <Clock className="w-2.5 h-2.5" /> {stop.estimated_investigation_time}
                        {stop.travel_method === 'driving' && <span className="flex items-center gap-0.5 text-amber-400"><Car className="w-2.5 h-2.5" /> Drive</span>}
                        {stop.address && <><MapPin className="w-2.5 h-2.5" /> <span className="truncate">{stop.address}</span></>}
                      </p>
                    </div>
                    {(stop.hours_of_operation || stop.entry_fee) && (
                      <div className="flex items-center gap-1 shrink-0">
                        {stop.entry_fee && <DollarSign className="w-3 h-3 text-green-400" />}
                        {stop.hours_of_operation && <Info className="w-3 h-3 text-amber-400" />}
                      </div>
                    )}
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); narrate(stop.narration_text || stop.paranormal_info); }} className={`p-1.5 rounded-md shrink-0 transition-colors ${isSpeaking || isGenerating ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}>
                      {isSpeaking || isGenerating ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {tour.conclusion && (
          <div className="p-4 rounded-xl border border-dim-purple/20 bg-dim-purple/5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-dim-purple">Conclusion</h3>
              <button onClick={() => narrate(tour.conclusion)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dim-purple/10 border border-dim-purple/30 text-dim-purple text-[10px] font-heading uppercase tracking-wider hover:bg-dim-purple/20 transition-colors">
                {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> Loading</> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Narrate</>}
              </button>
            </div>
            <p className="text-xs text-foreground/70 leading-relaxed">{tour.conclusion}</p>
          </div>
        )}
      </div>

      <NavBar />
    </PageContainer>
  );
}