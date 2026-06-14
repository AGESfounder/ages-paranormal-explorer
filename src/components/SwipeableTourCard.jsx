import React, { useState, useRef, useEffect } from 'react';
import { Heart, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const BUTTON_WIDTH = 60;
const SWIPE_THRESHOLD = 50;
const TOTAL_BUTTONS = 3;
const MAX_SWIPE = BUTTON_WIDTH * TOTAL_BUTTONS;

export default function SwipeableTourCard({ tour, onRefresh, onDelete, children }) {
  const [swipeX, setSwipeX] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swiping = useRef(false);

  useEffect(() => {
    base44.entities.Favorite.filter({ tour_id: tour.id }).then(favs => setIsFavorite(favs.length > 0));
  }, [tour.id]);

  const reset = () => { setSwipeX(0); setIsOpen(false); };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swiping.current = false;
  };

  const handleTouchMove = (e) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      swiping.current = true;
      if (dx < 0) {
        setSwipeX(Math.max(-MAX_SWIPE, dx));
      } else if (isOpen) {
        setSwipeX(Math.min(0, -MAX_SWIPE + dx));
      }
    }
  };

  const handleTouchEnd = () => {
    if (!swiping.current) return;
    if (swipeX < -SWIPE_THRESHOLD) {
      setSwipeX(-MAX_SWIPE);
      setIsOpen(true);
    } else {
      reset();
    }
  };

  const handleFavorite = async (e) => {
    e.stopPropagation();
    reset();
    setActionLoading('favorite');
    try {
      if (isFavorite) {
        const favs = await base44.entities.Favorite.filter({ tour_id: tour.id });
        for (const f of favs) await base44.entities.Favorite.delete(f.id);
        setIsFavorite(false);
      } else {
        await base44.entities.Favorite.create({ tour_id: tour.id, tour_title: tour.title, state: tour.state, city: tour.city });
        setIsFavorite(true);
      }
    } catch (e) { /* ignore */ }
    setActionLoading(null);
  };

  const handleRefresh = async (e) => {
    e.stopPropagation();
    reset();
    setActionLoading('refresh');
    try {
      const stops = await base44.entities.TourStop.filter({ tour_id: tour.id });
      for (const s of stops) await base44.entities.TourStop.delete(s.id);

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Refresh and update this paranormal tour near ${tour.city}, ${tour.state}. Keep the same general location area and theme, but update all details, pricing, and hours of operation to be current and accurate. Include:
- title: a creative, spooky tour name
- city: the town/city where the tour starts
- state: "${tour.state}"
- tour_type: "walking", "driving", or "mixed" — walking stops come first, driving stops last
- description: 2-3 compelling sentences about the tour's haunted locations
- introduction: historical overview + paranormal overview (each 3-4 paragraphs, rich with dates, specific events, eyewitness accounts, local legends) + safety info. Mention "A.G.E.S. (Affordable Ghost Exploration Solutions) encourages explorers to conduct respectful paranormal investigations while preserving historic locations."
- conclusion: closing paragraph ending with "Thank you for exploring with A.G.E.S. — Affordable Ghost Exploration Solutions. Remember that every legend has a story, every location has a history, and every investigation adds to the mystery."
- difficulty: "easy", "moderate", or "challenging"
- estimated_duration: e.g. "2-3 hours"
- total_distance: e.g. "1.5 miles"
- start_location_name, start_latitude, start_longitude (real coordinates near ${tour.city}, ${tour.state})
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

Critically verify pricing, hours of operation, and public accessibility after 7 PM for all locations. Use real locations with documented paranormal history only.`,
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

      const tourData = result.tours?.[0];
      if (tourData) {
        await base44.entities.Tour.update(tour.id, { ...tourData, state: tour.state });
      }
      if (onRefresh) onRefresh(tour.id);
    } catch (e) { /* ignore */ }
    setActionLoading(null);
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    reset();
    setActionLoading('delete');
    try {
      const favs = await base44.entities.Favorite.filter({ tour_id: tour.id });
      for (const f of favs) await base44.entities.Favorite.delete(f.id);
      if (onDelete) onDelete(tour.id);
    } catch (e) { /* ignore */ }
    setActionLoading(null);
  };

  return (
    <div className="relative overflow-hidden rounded-xl" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div className="absolute inset-y-0 right-0 flex">
        <button
          onClick={handleFavorite}
          disabled={!!actionLoading}
          className="w-[60px] flex flex-col items-center justify-center gap-0.5 bg-red-500/30 text-white/60 disabled:opacity-30"
        >
          {actionLoading === 'favorite' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className={`w-5 h-5 ${isFavorite ? 'fill-white' : ''}`} />}
          <span className="text-[8px] font-heading uppercase tracking-wider">Fav</span>
        </button>
        <button
          onClick={handleRefresh}
          disabled={!!actionLoading}
          className="w-[60px] flex flex-col items-center justify-center gap-0.5 bg-amber-500/30 text-white/60 disabled:opacity-30"
        >
          {actionLoading === 'refresh' ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
          <span className="text-[8px] font-heading uppercase tracking-wider">Refresh</span>
        </button>
        <button
          onClick={handleDelete}
          disabled={!!actionLoading}
          className="w-[60px] flex flex-col items-center justify-center gap-0.5 bg-destructive/30 text-white/60 disabled:opacity-30"
        >
          {actionLoading === 'delete' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
          <span className="text-[8px] font-heading uppercase tracking-wider">Delete</span>
        </button>
      </div>

      <div
        style={{ transform: `translateX(${swipeX}px)`, transition: swiping.current ? 'none' : 'transform 0.2s ease' }}
        className={isOpen ? 'pointer-events-none select-none' : ''}
      >
        {children}
      </div>
    </div>
  );
}