import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Clock, Footprints, Car, Heart, Ghost, Loader2, ChevronRight, Volume2, VolumeX, Navigation, Zap, AlertTriangle, RefreshCw } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';

export default function TourDetail() {
  const { tourId } = useParams();
  const [tour, setTour] = useState(null);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingStops, setGeneratingStops] = useState(false);
  const [stopsError, setStopsError] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);

  useEffect(() => {
    loadTour();
    return () => { window.speechSynthesis?.cancel(); };
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
        setStops(tourStops.sort((a, b) => a.stop_number - b.stop_number));
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

Each stop:
- stop_number: 1-10 in logical route order
- name, latitude, longitude (real GPS), address
- historical_info: 2-3 paragraphs (construction dates, events, famous people, significance)
- paranormal_info: 2-3 paragraphs (hauntings, ghost sightings, EVP reports, apparitions, shadow figures, folklore)
- investigation_suggestions: 3-5 items like "EVP Session", "Spirit Box Session", "EMF Sweep", "Trigger Object Experiment", "Temperature Monitoring"
- estimated_investigation_time: "5 minutes" / "10 minutes" / "15 minutes"
- construction_date, famous_people
- narration_text: 3-4 sentence dramatic narration in mysterious storytelling style

Order stops to minimize backtracking, create a loop, starting and ending near ${tourData.start_location_name}. Use real locations with paranormal history.`,
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
                  narration_text: { type: "string" }
                }
              }
            }
          }
        },
        model: "gemini_3_flash",
        add_context_from_internet: true
      });

      const created = [];
      for (const stop of result.stops || []) {
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

  const narrate = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.85;
    utter.pitch = 0.7;
    const voices = window.speechSynthesis.getVoices();
    const maleVoice = voices.find(v => v.name.includes('Male') || v.name.includes('Daniel') || v.name.includes('James') || v.name.includes('David'));
    if (maleVoice) utter.voice = maleVoice;
    utter.onend = () => setIsNarrating(false);
    setIsNarrating(true);
    window.speechSynthesis.speak(utter);
  };

  const stopNarration = () => {
    window.speechSynthesis?.cancel();
    setIsNarrating(false);
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
              {tour.tour_type === 'walking' ? <Footprints className="w-3.5 h-3.5" /> : <Car className="w-3.5 h-3.5" />}
              {tour.tour_type}
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
              <button onClick={() => isNarrating ? stopNarration() : narrate(tour.introduction)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                {isNarrating ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Narrate</>}
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

        <div>
          <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground mb-3 flex items-center gap-2">
            <Ghost className="w-4 h-4 text-primary" /> {stops.length} Investigation Stops
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
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-heading text-sm font-bold shrink-0">{stop.stop_number}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{stop.name}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                        <Clock className="w-2.5 h-2.5" /> {stop.estimated_investigation_time}
                        {stop.address && <><MapPin className="w-2.5 h-2.5" /> <span className="truncate">{stop.address}</span></>}
                      </p>
                    </div>
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
              <button onClick={() => isNarrating ? stopNarration() : narrate(tour.conclusion)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dim-purple/10 border border-dim-purple/30 text-dim-purple text-[10px] font-heading uppercase tracking-wider hover:bg-dim-purple/20 transition-colors">
                {isNarrating ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Narrate</>}
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