import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Clock, Footprints, Car, Loader2, Ghost, AlertTriangle, RefreshCw } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { US_STATES } from '../lib/statesData';
import { base44 } from '@/api/base44Client';

export default function StateTours() {
  const { stateAbbr } = useParams();
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const stateName = US_STATES.find(s => s.abbr === stateAbbr)?.name || stateAbbr;

  useEffect(() => {
    loadTours();
  }, [stateAbbr]);

  const loadTours = async () => {
    setLoading(true);
    setError('');
    const results = await base44.entities.Tour.filter({ state: stateName });
    if (results.length === 0) {
      await generateTours();
    } else {
      setTours(results);
      setLoading(false);
    }
  };

  const generateTours = async () => {
    setGenerating(true);
    setLoading(true);
    setError('');
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate exactly 5 paranormal tours for ${stateName}, USA. Each at a real haunted location. Mix walking and driving tours. Include:
- title, city, tour_type ("walking" or "driving"), description (2-3 sentences)
- introduction: historical overview + paranormal overview + safety info. Mention "A.G.E.S. (Affordable Ghost Exploration Solutions) encourages explorers to conduct respectful paranormal investigations while preserving historic locations."
- conclusion: closing paragraph ending with "Thank you for exploring with A.G.E.S., Affordable Ghost Exploration Solutions. Remember that every legend has a story, every location has a history, and every investigation adds to the mystery."
- difficulty ("easy"/"moderate"/"challenging"), estimated_duration (e.g. "2-3 hours"), total_distance (e.g. "1.5 miles"), start_location_name, start_latitude, start_longitude (real coordinates)
- tags: array (["Civil War", "Haunted Hotel", etc.]), safety_info, best_time ("Dusk to midnight")
Use real locations with documented paranormal history. Publicly accessible only.`,
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

      const created = [];
      for (const tour of result.tours || []) {
        const saved = await base44.entities.Tour.create({ ...tour, state: stateName });
        created.push(saved);
      }
      setTours(created);
      setGenerating(false);
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to generate tours. Please try again.');
      setGenerating(false);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <SectionHeader title={stateName} subtitle="Paranormal Tours" showBack />
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 px-4">
          {error ? (
            <>
              <AlertTriangle className="w-12 h-12 text-yellow-500" />
              <p className="text-sm text-yellow-400 font-heading tracking-wide text-center">Generation Failed</p>
              <p className="text-xs text-muted-foreground text-center max-w-xs">{error}</p>
              <button onClick={() => generateTours()} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground font-heading text-sm uppercase tracking-wider transition-colors">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </>
          ) : (
            <>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                {generating ? <Ghost className="w-12 h-12 text-primary" /> : <Loader2 className="w-8 h-8 text-primary" />}
              </motion.div>
              <p className="text-sm text-muted-foreground font-heading tracking-wide">
                {generating ? 'Channeling spirits of ' + stateName + '...' : 'Loading tours...'}
              </p>
              {generating && (
                <p className="text-xs text-muted-foreground/60 text-center px-8">
                  Researching haunted locations and generating tours. This may take a moment.
                </p>
              )}
            </>
          )}
        </div>
        <NavBar />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader title={stateName} subtitle={`${tours.length} Paranormal Tours`} showBack />
      <div className="px-4 pb-28 space-y-3 pt-3">
        {tours.map((tour, i) => (
          <motion.div
            key={tour.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Link
              to={`/tour/${tour.id}`}
              className="block p-4 rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm hover:border-primary/40 hover:bg-card/60 transition-all duration-300 group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-heading text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                    {tour.title}
                  </h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" /> {tour.city}
                  </p>
                </div>
                <div className={`px-2 py-0.5 rounded text-[10px] font-heading uppercase tracking-wider ${
                  tour.tour_type === 'walking' 
                    ? 'bg-primary/10 text-primary border border-primary/20' 
                    : 'bg-accent/10 text-accent-foreground border border-accent/20'
                }`}>
                  {tour.tour_type === 'walking' ? <Footprints className="w-3 h-3 inline mr-1" /> : <Car className="w-3 h-3 inline mr-1" />}
                  {tour.tour_type}
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">{tour.description}</p>
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {tour.estimated_duration}</span>
                <span className="flex items-center gap-1"><Footprints className="w-3 h-3" /> {tour.total_distance}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-heading tracking-wider ${
                  tour.difficulty === 'easy' ? 'bg-green-500/10 text-green-400' :
                  tour.difficulty === 'moderate' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'
                }`}>{tour.difficulty}</span>
              </div>
              {tour.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {tour.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 text-[9px] rounded bg-secondary/50 text-muted-foreground font-heading tracking-wider">{tag}</span>
                  ))}
                </div>
              )}
            </Link>
          </motion.div>
        ))}
      </div>
      <NavBar />
    </PageContainer>
  );
}