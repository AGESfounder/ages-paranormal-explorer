import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Clock, Footprints, Car, Loader2, Ghost, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import SwipeableTourCard from '../components/SwipeableTourCard';
import BePatient from '@/components/BePatient';
import { US_STATES } from '../lib/statesData';
import { base44 } from '@/api/base44Client';
import { generateLocationTour, findExistingTour } from '@/lib/generateTour';
import ExistingTourDialog from '@/components/ExistingTourDialog';
import TourCategoryDialog from '@/components/TourCategoryDialog';
import TourCategoryBadge from '@/components/TourCategoryBadge';
import TourListItem from '@/components/TourListItem';
import PullToRefresh from '@/components/PullToRefresh';

export default function StateTours() {
  const { stateAbbr } = useParams();
  const navigate = useNavigate();
  const [tours, setTours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [error, setError] = useState('');
  const [existingTour, setExistingTour] = useState(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);

  const stateName = US_STATES.find(s => s.abbr === stateAbbr)?.name || stateAbbr;

  // Sort tours: ranked tours first (1, 2, 3), then unranked by city name.
  const sortByRank = (a, b) => {
    const ra = a.rank ?? 999, rb = b.rank ?? 999;
    if (ra !== rb) return ra - rb;
    return (a.city || '').localeCompare(b.city || '');
  };

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
      setTours(results.sort(sortByRank));
      setLoading(false);
    }
  };

  const generateTours = async () => {
    setGenerating(true);
    setLoading(true);
    setError('');
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate exactly 3 paranormal tours for ${stateName}, USA — the TOP 3 most active haunted locations in the state. Rank them by documented paranormal activity level: #1 is the MOST active/well-known, #2 is the second most active, #3 is the third. Each at a real haunted location. Mix walking, driving, and "mixed" (walking + driving) tours. For mixed tours, walking stops come first in the route, driving stops last. Include:
- rank: 1, 2, or 3 (1 = most active)
- title, city, tour_type ("walking", "driving", or "mixed"), description (2-3 sentences)
- introduction: historical overview + paranormal overview (each 3-4 paragraphs, rich with dates, specific events, eyewitness accounts, local legends) + safety info. Mention "AGES (Accessible Ghost Exploration Solutions) encourages explorers to conduct respectful paranormal investigations while preserving historic locations."
- conclusion: closing paragraph ending with "Thank you for exploring with AGES — Accessible Ghost Exploration Solutions. Remember that every legend has a story, every location has a history, and every investigation adds to the mystery."
- difficulty ("easy"/"moderate"/"challenging"), estimated_duration (e.g. "2-3 hours"), total_distance (e.g. "1.5 miles"), start_location_name, start_latitude, start_longitude (real coordinates)
- tags: array (["Civil War", "Haunted Hotel", etc.]), safety_info, best_time ("Dusk to midnight")
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
                  rank: { type: "number" },
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
      created.sort(sortByRank);
      setTours(created);
      setGenerating(false);
      setLoading(false);
    } catch (err) {
      setError(err.message || 'Failed to generate tours. Please try again.');
      setGenerating(false);
      setLoading(false);
    }
  };

  const handleRefreshTour = async (tourId) => {
    const results = await base44.entities.Tour.filter({ id: tourId });
    if (results.length > 0) setTours(prev => prev.map(t => t.id === tourId ? results[0] : t));
  };

  const refreshTours = async () => {
    const results = await base44.entities.Tour.filter({ state: stateName });
    setTours(results.sort(sortByRank));
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

  // Picks a real haunted area in this state that has NO existing tour yet, then
  // generates a brand-new tour there. Keeps the state's catalogue growing into
  // untouched paranormal territory instead of re-covering the same cities.
  const handleCreateNewTour = async (category) => {
    setCreatingNew(true);
    setError('');
    try {
      const existingCities = tours.map(t => t.city).filter(Boolean);
      const existingTitles = tours.map(t => t.title).filter(Boolean);
      const existingList = [...existingCities, ...existingTitles].filter((v, i, a) => v && a.indexOf(v) === i);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Suggest ONE real haunted area, city, town, or property in ${stateName}, USA that has well-documented paranormal history and is NOT already covered by this list of existing tours and locations: ${existingList.length ? existingList.join(', ') : 'none yet'}. Pick a genuinely different area from any listed — do NOT suggest a location that overlaps with or is near any listed location. Use current web search to verify it is real and has documented paranormal activity.`,
        response_json_schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            reason: { type: "string" }
          }
        },
        add_context_from_internet: true,
        model: "gemini_3_flash"
      });
      const dest = result?.name?.trim();
      if (!dest) throw new Error('Could not find a new haunted area. Please try again.');
      const existing = await findExistingTour(dest, stateName, category);
      if (existing) {
        setExistingTour(existing);
        setCreatingNew(false);
        return;
      }
      const newTour = await generateLocationTour(dest, stateName, undefined, category);
      navigate(`/tour/${newTour.id}`);
    } catch (e) {
      setError(e?.message || 'Failed to create a new tour. Please try again.');
      setCreatingNew(false);
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
      <PullToRefresh onRefresh={refreshTours}>
      <div className="px-4 pb-28 space-y-3 pt-3">
        <button
          onClick={() => setShowCategoryDialog(true)}
          disabled={creatingNew}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-primary/30 bg-primary/10 text-primary font-heading text-sm uppercase tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-60"
        >
          {creatingNew ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {creatingNew ? <BePatient /> : 'Create New Tour'}
        </button>
        {error && !creatingNew && (
          <p className="text-xs text-yellow-400 text-center">{error}</p>
        )}
        {tours.map((tour, i) => (
          <motion.div
            key={tour.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <SwipeableTourCard tour={tour} onRefresh={handleRefreshTour} onDelete={handleDeleteTour}>
              <TourListItem tour={tour} />
            </SwipeableTourCard>
          </motion.div>
        ))}
      </div>
      </PullToRefresh>
      <ExistingTourDialog tour={existingTour} onClose={() => setExistingTour(null)} />
      <TourCategoryDialog
        isOpen={showCategoryDialog}
        onClose={() => setShowCategoryDialog(false)}
        onSelect={(category) => { setShowCategoryDialog(false); handleCreateNewTour(category); }}
        destination={stateName}
      />
      <NavBar />
    </PageContainer>
  );
}