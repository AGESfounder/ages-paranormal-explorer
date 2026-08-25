import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion } from 'framer-motion';
import { MapPin, Clock, Footprints, Car, Heart, Ghost, Loader2, ChevronRight, Volume2, VolumeX, Navigation, Zap, AlertTriangle, RefreshCw, Map, Info, DollarSign, CheckCircle2, PartyPopper, Route, Plus } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import TourMap from '../components/TourMap';
import useGhostVoice from '../hooks/useGhostVoice';
import { base44 } from '@/api/base44Client';
import { getOfflineTour } from '@/lib/offlineTours';
import { callJson } from '@/lib/llmJson';
import BePatient from '@/components/BePatient';
import TourCategoryBadge from '@/components/TourCategoryBadge';
import TourAccessInfo from '@/components/TourAccessInfo';
import VerificationBadge from '@/components/VerificationBadge';
import { useEnergyGate, checkManifestationGate, spendManifestationEnergy } from '@/hooks/useEnergyGate';
import UpgradePrompt from '@/components/UpgradePrompt';
import EnergyCostBadge from '@/components/EnergyCostBadge';
import NarrationLengthSelector from '@/components/NarrationLengthSelector';

import { getNarrationLength, saveNarrationLength, truncateText, computeAdjustedDuration } from '@/lib/narrationLength';
import { useCondensedTexts } from '@/hooks/useCondensedTexts';
import { geocodeAddresses, geocodeStopsWithNames } from '@/lib/geocodeStops';
import { stripConclusionOpeners, CONCLUSION_PHRASE_RULE } from '@/lib/stopContent';
import { rebalanceConclusionPhrases } from '@/lib/reorderConclusion';
import { haversineDistance, enforceWalkingDistance, orderStopsByProximity } from '@/lib/routeOptimizer';
import { looksLikeRoomOrArea } from '@/lib/roomDetection';
import { isLargeProperty } from '@/lib/largeProperty';
import { stripUrlsForNarration } from '@/lib/urlText';
import { Input } from '@/components/ui/input';
import { addStopByName } from '@/lib/addTourStops';
import { addShuttleStop } from '@/lib/addShuttleStop';

// Bump this when validation rules change — all tours with an older version
// get re-validated (and regenerated if non-compliant) on next view, at no
// energy cost to the user (system maintenance bypasses energy gating).
const STOPS_VALIDATION_VERSION = 20;

// Walking threshold for stop clustering. Single-site tours (landmark/ship/
// cold_spot) are large properties where you walk between structures that can
// be 0.5+ miles apart — use 1.0-mile threshold so they form a walking cluster
// ordered as a loop. Area tours use 0.33 miles (downtown walking tours).
const getWalkingLimit = (tour) => {
  const cat = tour?.tour_category;
  if (cat === 'landmark' || cat === 'ship' || cat === 'cold_spot') {
    return isLargeProperty(tour) ? 1.0 : 0.33;
  }
  return 0.33;
};

// Validate that a tour's stops comply with current guidelines:
// - No stop should be unreasonably far from the tour's start coordinates
//   (area/cold_spot/landmark/ship: 50 miles, road_trip: 200 miles)
// - No two stops should share identical coordinates (collapsed markers)
function validateStops(stops, tour) {
  if (!stops || stops.length === 0) return { compliant: false, reason: 'no stops' };
  // Stop count check — max 10 stops (cold_spot allows 1-4)
  const maxStops = tour.tour_category === 'cold_spot' ? 4 : 10;
  if (stops.length > maxStops) {
    return { compliant: false, reason: `${stops.length} stops (max ${maxStops} for ${tour.tour_category})` };
  }
  // Duplicate name detection — fuzzy match (one normalized name contains
  // another). Catches near-duplicates like "Frederick City Hall" vs
  // "Frederick City Hall Main Floor" that slip through exact-match dedup.
  const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const stopNames = stops.map(s => normName(s.name)).filter(n => n.length > 0);
  for (let i = 0; i < stopNames.length; i++) {
    for (let j = i + 1; j < stopNames.length; j++) {
      if (stopNames[i] === stopNames[j]) {
        return { compliant: false, reason: `duplicate stop: "${stops[i].name}"` };
      }
      if (stopNames[i].length >= 8 && stopNames[j].length >= 8 &&
          (stopNames[i].includes(stopNames[j]) || stopNames[j].includes(stopNames[i]))) {
        return { compliant: false, reason: `near-duplicate stops: "${stops[i].name}" / "${stops[j].name}"` };
      }
    }
  }
  const maxDistMiles = tour.tour_category === 'road_trip' ? 200
    : (tour.tour_category === 'cold_spot' || tour.tour_category === 'ship') ? 0.5
    : tour.tour_category === 'area' ? 2.5
    : isLargeProperty(tour) ? 5 : 1;
  const startLat = tour.start_latitude;
  const startLon = tour.start_longitude;
  if (startLat != null && startLon != null) {
    for (const s of stops) {
      if (s.latitude != null && s.longitude != null) {
        const dist = haversineDistance(startLat, startLon, s.latitude, s.longitude);
        if (dist > maxDistMiles) {
          return { compliant: false, reason: `stop "${s.name}" is ${Math.round(dist)} miles from start` };
        }
      }
    }
  }
  // Collapse detection — same_structure aware. Multiple stops at the same
  // coordinates are only an error if NOT all of them are same_structure: true
  // (rooms/areas within one building legitimately share coordinates).
  const coordMap = {};
  for (const s of stops) {
    if (s.latitude != null && s.longitude != null) {
      const key = `${s.latitude.toFixed(5)},${s.longitude.toFixed(5)}`;
      if (!coordMap[key]) coordMap[key] = [];
      coordMap[key].push(s);
    }
  }
  for (const [key, group] of Object.entries(coordMap)) {
    if (group.length > 1) {
      const allSameStructure = group.every(s => s.same_structure === true);
      if (!allSameStructure) {
        return { compliant: false, reason: `${group.length} stops collapsed at same coordinates` };
      }
    }
  }
  // For area tours, only validate the WALKING CLUSTER — the stops that form
  // a connected component within 0.33 miles of each other. Driving stops in
  // a mixed tour can be miles away and should NOT cause the tour to fail
  // validation. This allows mixed area tours (walk a downtown cluster, then
  // drive to spread-out locations). If there's no walking cluster at all,
  // the tour doesn't work as an area tour and should be regenerated.
  if (tour.tour_category === 'area') {
    const withCoords = stops.filter(s => s.latitude != null && s.longitude != null);
    if (withCoords.length >= 2) {
      const WALKING_LIMIT = 0.33;
      const visited = new Array(withCoords.length).fill(false);
      const components = [];
      for (let i = 0; i < withCoords.length; i++) {
        if (visited[i]) continue;
        const comp = [];
        const queue = [i];
        let head = 0;
        visited[i] = true;
        while (head < queue.length) {
          const idx = queue[head++];
          comp.push(withCoords[idx]);
          for (let j = 0; j < withCoords.length; j++) {
            if (!visited[j]) {
              const d = haversineDistance(withCoords[idx].latitude, withCoords[idx].longitude, withCoords[j].latitude, withCoords[j].longitude);
              if (d <= WALKING_LIMIT) { visited[j] = true; queue.push(j); }
            }
          }
        }
        components.push(comp);
      }
      components.sort((a, b) => b.length - a.length);
      const walkingCluster = components[0] && components[0].length > 1 ? components[0] : [];
      if (walkingCluster.length < 2) {
        return { compliant: false, reason: 'no walkable cluster found (all stops are too far apart for an area tour)' };
      }
      const ordered = orderStopsByProximity(walkingCluster);
      let totalDist = 0;
      for (let i = 1; i < ordered.length; i++) {
        const dist = haversineDistance(ordered[i - 1].latitude, ordered[i - 1].longitude, ordered[i].latitude, ordered[i].longitude);
        totalDist += dist;
        if (dist > 1) {
          return { compliant: false, reason: `walking stops are ${dist.toFixed(1)} miles apart` };
        }
      }
      if (totalDist > 2.5) {
        return { compliant: false, reason: `walking route is ${totalDist.toFixed(1)} miles` };
      }
    }
  }
  return { compliant: true };
}

export default function TourDetail() {
  const { tourId } = useParams();
  const navigate = useNavigate();
  const [tour, setTour] = useState(null);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generatingStops, setGeneratingStops] = useState(false);
  const [stopsError, setStopsError] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [conclusionRead, setConclusionRead] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completingTour, setCompletingTour] = useState(false);
  // Track if the user has manually dragged a marker — prevents background
  // validation from overwriting their placement with server-side coordinates.
  const userDraggedRef = useRef(false);
  const [addingStop, setAddingStop] = useState(false);
  const [addingShuttle, setAddingShuttle] = useState(false);
  const [stopSearchName, setStopSearchName] = useState('');
  const { isSpeaking, isGenerating, narrate: rawNarrate } = useGhostVoice();
  const { gateNarration, spendNarration, estimateNarrationCost, showUpgrade, setShowUpgrade, gateReason, user, isPaid } = useEnergyGate();

  // Gated narration wrapper — checks energy before speaking, toggles off for free.
  const narrate = (text, opts = {}) => {
    const cleanText = stripUrlsForNarration(text);
    if (isSpeaking || isGenerating) { rawNarrate(cleanText, opts); return; }
    if (!gateNarration(cleanText)) return;
    rawNarrate(cleanText, opts);
    spendNarration(estimateNarrationCost(cleanText));
  };

  // Lazily verify existing stops whose GPS coordinates haven't been verified.
  // Runs in the background — user sees the tour immediately. Uses per-stop LLM
  // web search (fix-collapsed-coords) to confirm/correct coordinates, NOT
  // Nominatim address geocoding, which collapses stops in tiny towns and
  // overrides accurate LLM coordinates with generic address points.
  const geocodeExistingStops = async (stopsList, tourData) => {
    // SAFETY: Do NOT re-verify stops that already have coordinates. The
    // background OSM/LLM search can return WRONG coordinates (e.g. Morgan's
    // Grove Park was moved 0.5 miles off), sending users to the wrong
    // location at night. Only fix collapsed/missing stops — never overwrite
    // existing coordinates with a new guess.
    const needsVerification = stopsList.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle' && s.geocoded === false);
    if (needsVerification.length === 0) return;
    try {
      await base44.functions.invoke('fix-collapsed-coords', { tourId: tourData.id, skipReorder: tourData.user_reordered, verifyAll: false });
    } catch (e) {
      console.error('Coordinate verification failed:', e);
      return;
    }
    // Reload stops with corrected coordinates
    const updatedStops = await base44.entities.TourStop.filter({ tour_id: tourData.id });
    // Don't overwrite stops the user has manually placed via marker drag
    if (userDraggedRef.current) return;
    // Re-order stops by proximity using the NOW-correct coordinates.
    // Skip for tours the user manually reordered — respect their custom order.
    if (tourData && !tourData.user_reordered) {
      const tourStopsOnly = updatedStops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
      const parkingStop = updatedStops.find(s => s.stop_type === 'parking');
      const shuttleStopData = updatedStops.find(s => s.stop_type === 'shuttle');
      const parkingCoords = parkingStop?.latitude != null ? { lat: parkingStop.latitude, lon: parkingStop.longitude } : null;
      const reordered = await enforceWalkingDistance(tourStopsOnly, tourData.tour_type, { lat: tourData.start_latitude, lon: tourData.start_longitude }, { walkingLimit: getWalkingLimit(tourData), parkingCoords });
      for (const s of reordered) {
        const existing = tourStopsOnly.find(ts => ts.id === s.id);
        if (existing && (existing.stop_number !== s.stop_number || existing.travel_method !== s.travel_method)) {
          try {
            await base44.entities.TourStop.update(s.id, { stop_number: s.stop_number, travel_method: s.travel_method });
          } catch (e) {}
        }
      }
      setStops([...(parkingStop ? [parkingStop] : []), ...(shuttleStopData ? [shuttleStopData] : []), ...reordered]);
    } else {
      setStops(updatedStops);
    }
  };

  // Background validation — runs fix-collapsed-coords (verifyAll) WITHOUT
  // blocking the page load. The tour displays immediately with existing
  // coordinates; when verification completes, stops are reloaded and
  // re-ordered with corrected coordinates. This prevents the page from
  // appearing stuck when opening a tour whose validation version is
  // outdated (fix-collapsed-coords can take 30-60+ seconds for 10 stops).
  const runBackgroundValidation = async (tourId, tourData) => {
    // SAFETY: Do NOT re-verify all stops. Background OSM/LLM search can return
    // WRONG coordinates, overwriting correct ones and sending users to the
    // wrong location at night. Only fix collapsed/missing/water stops.
    try {
      await base44.functions.invoke('fix-collapsed-coords', { tourId, skipReorder: tourData.user_reordered, verifyAll: false });
    } catch (e) {
      console.error('Coordinate verification failed:', e);
      return;
    }
    // Reload stops with corrected coordinates
    const updatedStops = await base44.entities.TourStop.filter({ tour_id: tourId });
    const parkingStop = updatedStops.find(s => s.stop_type === 'parking');
    const shuttleStopData = updatedStops.find(s => s.stop_type === 'shuttle');
    let tourStopsOnly = updatedStops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
    // Validate — log issues but never delete stops (needs_placement handles
    // unverified stops instead of destructive regeneration)
    const validation = validateStops(tourStopsOnly, tourData);
    if (!validation.compliant) {
      console.warn(`Tour ${tourId} validation: ${validation.reason}. Stops preserved.`);
    }
    await base44.entities.Tour.update(tourId, { stops_regenerated: STOPS_VALIDATION_VERSION });
    // Don't overwrite stops the user has manually placed via marker drag
    if (userDraggedRef.current) return;
    // Re-order and update display with corrected coordinates
    if (!tourData.user_reordered) {
      const parkingCoords = parkingStop?.latitude != null ? { lat: parkingStop.latitude, lon: parkingStop.longitude } : null;
      const reordered = await enforceWalkingDistance(tourStopsOnly, tourData.tour_type, { lat: tourData.start_latitude, lon: tourData.start_longitude }, { walkingLimit: getWalkingLimit(tourData), parkingCoords });
      for (const s of reordered) {
        const existing = tourStopsOnly.find(ts => ts.id === s.id);
        if (existing && (existing.stop_number !== s.stop_number || existing.travel_method !== s.travel_method)) {
          try { await base44.entities.TourStop.update(s.id, { stop_number: s.stop_number, travel_method: s.travel_method }); } catch (e) {}
        }
      }
      setStops([...(parkingStop ? [parkingStop] : []), ...(shuttleStopData ? [shuttleStopData] : []), ...reordered]);
    } else {
      const sorted = tourStopsOnly.sort((a, b) => a.stop_number - b.stop_number);
      setStops([...(parkingStop ? [parkingStop] : []), ...(shuttleStopData ? [shuttleStopData] : []), ...sorted]);
    }
  };

  const [narrationLength, setNarrationLengthState] = useState(getNarrationLength());
  const handleNarrationLengthChange = (value) => {
    setNarrationLengthState(value);
    saveNarrationLength(value);
  };
  const condensed = useCondensedTexts({
    description: tour?.description,
    introduction: tour?.introduction,
    conclusion: tour?.conclusion,
  }, narrationLength);
  const displayDescription = condensed.description || truncateText(tour?.description, narrationLength);
  const displayIntroduction = condensed.introduction || truncateText(tour?.introduction, narrationLength);
  const displayConclusion = condensed.conclusion || truncateText(tour?.conclusion, narrationLength);

  const totalDistance = useMemo(() => {
    const tourStopsOnly = stops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
    if (tourStopsOnly.length < 2) return 0;
    let total = 0;
    const parkingStop = stops.find(s => s.stop_type === 'parking');
    // Parking to first walking stop + last walking stop back to parking
    const walkingStops = tourStopsOnly.filter(s => s.travel_method === 'walking' && s.latitude != null && s.longitude != null);
    if (parkingStop?.latitude && walkingStops.length > 0) {
      const firstWalk = walkingStops[0];
      const lastWalk = walkingStops[walkingStops.length - 1];
      total += haversineDistance(parkingStop.latitude, parkingStop.longitude, firstWalk.latitude, firstWalk.longitude);
      total += haversineDistance(lastWalk.latitude, lastWalk.longitude, parkingStop.latitude, parkingStop.longitude);
    }
    for (let i = 1; i < tourStopsOnly.length; i++) {
      total += haversineDistance(tourStopsOnly[i - 1].latitude, tourStopsOnly[i - 1].longitude, tourStopsOnly[i].latitude, tourStopsOnly[i].longitude);
    }
    return total;
  }, [stops]);

  const formatDistance = (mi) => mi < 1 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(1)} mi`;

  useEffect(() => {
    loadTour();
    return () => { /* hook handles its own cleanup */ };
  }, [tourId]);

  // When a user navigates from the last stop via the "Conclusion" button,
  // the URL carries #conclusion — auto-reveal the "Mark Tour Complete"
  // button so they don't have to hunt for the "I've read the conclusion" link.
  useEffect(() => {
    if (window.location.hash === '#conclusion') {
      setConclusionRead(true);
    }
  }, [tourId]);

  const loadTour = async () => {
    setLoading(true);
    try {
    const tourData = await base44.entities.Tour.filter({ id: tourId });
    if (tourData.length > 0) {
      setTour(tourData[0]);
      const [favs, completions] = await Promise.all([
        base44.entities.Favorite.filter({ tour_id: tourId }),
        base44.entities.Investigation.filter({ tour_id: tourId, is_completed: true }),
      ]);
      setIsFavorite(favs.length > 0);
      if (completions.length > 0) { setIsCompleted(true); setConclusionRead(true); }
      let tourStops = await base44.entities.TourStop.filter({ tour_id: tourId });
      // Clean up duplicate parking stops (keep the first, delete the rest)
      const allParking = tourStops.filter(s => s.stop_type === 'parking');
      if (allParking.length > 1) {
        for (let i = 1; i < allParking.length; i++) {
          await base44.entities.TourStop.delete(allParking[i].id);
        }
        tourStops = tourStops.filter(s => !allParking.slice(1).some(p => p.id === s.id));
      }
      if (tourStops.length === 0) {
        await generateStops(tourData[0]);
      } else {
        // Lazy migration: if tour has parking on Tour entity but no parking TourStop, create one
        let parkingStop = tourStops.find(s => s.stop_type === 'parking');
        if (!parkingStop && tourData[0].parking_latitude) {
          try {
            parkingStop = await base44.entities.TourStop.create({
              tour_id: tourId, stop_type: 'parking', stop_number: 0,
              name: tourData[0].parking_name || 'Parking Area',
              address: tourData[0].parking_address,
              latitude: tourData[0].parking_latitude, longitude: tourData[0].parking_longitude,
              parking_type: tourData[0].parking_type, parking_cost: tourData[0].parking_cost,
              travel_method: 'walking', geocoded: true,
              user_verified: tourData[0].parking_verified || false,
            });
          } catch (e) { console.error('Parking migration failed:', e); }
        }
        let tourStopsOnly = tourStops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
        // Re-validate stops when validation rules change. fix-collapsed-coords
        // runs first to verify/correct coordinates, then validateStops checks
        // compliance. Stops are NEVER deleted — needs_placement handles
        // unverified stops instead of destructive regeneration.
        let regenerated = false;
        const needsValidation = (tourData[0].stops_regenerated || 0) < STOPS_VALIDATION_VERSION;
        if (!regenerated) {
          if (tourData[0].user_reordered) {
            // Respect the user's manual stop order — do not re-sort by proximity
            const sortedTourStops = tourStopsOnly.sort((a, b) => a.stop_number - b.stop_number);
            const shuttleStopData = tourStops.find(s => s.stop_type === 'shuttle');
            const allStops = [...(parkingStop ? [parkingStop] : []), ...(shuttleStopData ? [shuttleStopData] : []), ...sortedTourStops];
            setStops(allStops);
            if (needsValidation) {
              runBackgroundValidation(tourId, tourData[0]).catch(console.error);
            } else {
              geocodeExistingStops(allStops, tourData[0]).catch(console.error);
            }
          } else {
            const parkingCoords = parkingStop?.latitude != null ? { lat: parkingStop.latitude, lon: parkingStop.longitude } : null;
            const reordered = await enforceWalkingDistance(tourStopsOnly, tourData[0].tour_type, { lat: tourData[0].start_latitude, lon: tourData[0].start_longitude }, { walkingLimit: getWalkingLimit(tourData[0]), parkingCoords });
            // Update stop_numbers in the database if they changed
            for (const s of reordered) {
              const existing = tourStopsOnly.find(ts => ts.id === s.id);
              if (existing && (existing.stop_number !== s.stop_number || existing.travel_method !== s.travel_method)) {
                await base44.entities.TourStop.update(s.id, { stop_number: s.stop_number, travel_method: s.travel_method });
              }
            }
            // Auto-correct tour type if stops are now a mix of walking + driving
            const methods = new Set(reordered.map(s => s.travel_method));
            const correctedType = methods.has('driving') && methods.has('walking') ? 'mixed' 
              : methods.has('driving') ? 'driving' : 'walking';
            if (correctedType !== tourData[0].tour_type) {
              await base44.entities.Tour.update(tourData[0].id, { tour_type: correctedType });
              tourData[0].tour_type = correctedType;
            }
            const shuttleStopData = tourStops.find(s => s.stop_type === 'shuttle');
            const allStops = [...(parkingStop ? [parkingStop] : []), ...(shuttleStopData ? [shuttleStopData] : []), ...reordered];
            setStops(allStops);
            if (needsValidation) {
              runBackgroundValidation(tourId, tourData[0]).catch(console.error);
            } else {
              geocodeExistingStops(allStops, tourData[0]).catch(console.error);
            }
          }
        }
        // Lazily generate parking for tours that don't have it yet
        if (!parkingStop && tourData[0].tour_type !== 'driving') {
          generateParking(tourData[0], tourStopsOnly).catch(console.error);
        }
      }
    }
    } catch (err) {
      const cached = getOfflineTour(tourId);
      if (cached) {
        setTour(cached.tour);
        setStops(await enforceWalkingDistance(cached.stops || [], cached.tour.tour_type, { lat: cached.tour.start_latitude, lon: cached.tour.start_longitude }));
      }
    }
    setLoading(false);
  };

  // Generate a parking spot for the walking cluster. Called lazily for existing
  // tours that have stops but no parking yet, and as a fallback if stop generation
  // didn't include parking. Only generates for tours with walking stops.
  const generateParking = async (tourData, stopsList) => {
    const walkingStops = (stopsList || stops).filter(s => s.travel_method === 'walking' && s.latitude != null && s.longitude != null);
    if (walkingStops.length < 1) return;
    try {
      const stopNames = walkingStops.map(s => `${s.name} (${s.address || 'no address'})`).join(', ');
      const cLat = walkingStops.reduce((sum, s) => sum + s.latitude, 0) / walkingStops.length;
      const cLon = walkingStops.reduce((sum, s) => sum + s.longitude, 0) / walkingStops.length;
      const prompt = `Generate a parking spot for a paranormal walking tour in ${tourData.city}, ${tourData.state}.
The walking cluster covers these stops: ${stopNames}
The cluster center is approximately at ${cLat.toFixed(5)}, ${cLon.toFixed(5)}.

Suggest a real, logical parking location where investigators can park their car before walking the tour. Requirements:
- Must be a real parking lot, parking garage, or street parking area near the walking cluster
- Must be located between the first and last stop of the walking cluster
- Must be publicly accessible at night (after 7 PM)
- Must be within 0.3 miles of the walking cluster center
- Must NOT be in water — parking must be on land

Return JSON with:
- parking_name: Name of the parking area (e.g., "Main Street Metered Parking", "City Lot #3")
- parking_address: Complete street address of the parking area
- parking_type: "street", "parking_lot", or "parking_garage"
- parking_cost: e.g., "Free", "Metered ($1.50/hr, free after 6pm)", "Paid lot ($5 flat rate)"
- parking_latitude: GPS latitude
- parking_longitude: GPS longitude

Output ONLY valid JSON. No markdown fences.`;
      const result = await callJson(prompt, { useWeb: true });
      // Default to the tour's start coordinates (verified on land by
      // fix-collapsed-coords) so parking is NEVER in water, even if the LLM
      // or geocoder fails. Parking must always exist — at the actual location
      // if no separate parking spot can be found.
      let lat = tourData.start_latitude;
      let lon = tourData.start_longitude;
      let parkingName = 'Parking Area';
      let parkingAddress = tourData.start_location_name || '';
      let parkingType = 'street';
      let parkingCost = 'Free';
      if (result) {
        parkingName = result.parking_name || 'Parking Area';
        parkingAddress = result.parking_address || parkingAddress;
        parkingType = result.parking_type || parkingType;
        parkingCost = result.parking_cost || parkingCost;
        // Geocode the parking address — if it returns valid on-land coords,
        // use them. If it fails (water/failed/null), keep the tour start coords.
        if (result.parking_address) {
          const geoMap = await geocodeStopsWithNames([{
            id: 'parking', name: result.parking_name, address: result.parking_address,
            city: tourData.city, state: tourData.state
          }], { lat: cLat, lon: cLon, maxDistMiles: 0.5, clusterRadius: 0.3 });
          if (geoMap.parking) { lat = geoMap.parking.lat; lon = geoMap.parking.lon; }
        }
      }
      const parkingStopRecord = await base44.entities.TourStop.create({
        tour_id: tourData.id, stop_type: 'parking', stop_number: 0,
        name: parkingName, address: parkingAddress,
        latitude: lat, longitude: lon,
        parking_type: parkingType, parking_cost: parkingCost,
        travel_method: 'walking', geocoded: true,
      });
      setStops(prev => [parkingStopRecord, ...prev.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle')]);
    } catch (e) {
      console.error('Parking generation failed:', e);
    }
  };

  const generateStops = async (tourData, options = {}) => {
    const { systemRegen = false } = options;
    if (!systemRegen) {
      const gate = await checkManifestationGate();
      if (!gate.allowed) {
        setStopsError(gate.reason === 'energy'
          ? "You're out of manifestation energy. Buy an Aura Bundle or upgrade your plan."
          : 'Upgrade to a paid plan to generate tour stops.');
        return;
      }
    }
    setGeneratingStops(true);
    setStopsError('');
    try {
      const needsCoordVerification = tourData.tour_category === 'landmark' || tourData.tour_category === 'ship' || tourData.tour_category === 'cold_spot';
      const coordInstruction = needsCoordVerification
        ? '\nCOORDINATES — CRITICAL: Look up the REAL GPS coordinates of each stop using web search. There are two cases:\n- DIFFERENT BUILDINGS/STRUCTURES on the property (e.g., separate buildings at Pennhurst Asylum, separate batteries at a fort): each MUST have its OWN distinct, real GPS coordinates. Search for each one individually (e.g., "Battery 519 Fort Miles Lewes DE").\n- ROOMS/AREAS WITHIN A SINGLE BUILDING (e.g., rooms in the Farnsworth House, floors of the Anthracite Hotel, Andy Gavin\'s mansion rooms): these stops SHOULD share the SAME coordinates — the building\'s real GPS coordinates. Set same_structure: true for these stops. It is CORRECT for them to stack at the same point on the map — they are all inside one structure.\nDo NOT invent fake distinct coordinates for rooms within one building. If all stops are inside the same building, they all get that building\'s real coordinates with same_structure: true.'
        : '\nCOORDINATES — Look up the REAL GPS coordinates of each stop using web search. Do NOT guess or estimate coordinates from training data — search for each location individually to find its actual coordinates. Each stop must have its own real coordinates at its real address.';
      const prompt = `Generate 8-10 stops for the paranormal tour "${tourData.title}" in ${tourData.city}, ${tourData.state}. Type: ${tourData.tour_type}. Description: ${tourData.description}
${coordInstruction}
Each stop is a LIGHTWEIGHT skeleton — full rich detail is generated on demand when a user opens the stop, so keep these fields brief:
- stop_number: 1-10 in logical route order
- name, latitude, longitude (real GPS), address
- address: ALWAYS provide a COMPLETE STREET ADDRESS with a street number (e.g. "123 Main St, Lewes, DE 19958"). NEVER use just a city name, an intersection ("X & Y"), or words like "near", "vicinity", "various". If the location has no street address (e.g. a park), use the park entrance address or nearest street address. This address must be GPS-searchable — a user should be able to type it into Google Maps and arrive at the exact location.
- same_structure: true if this stop is a room, area, or section WITHIN a single building or vessel (rooms in the Farnsworth House, decks on a ship, different areas of one cemetery); false if it is its own distinct building or structure on the property (separate buildings at Pennhurst Asylum, separate batteries at a fort). For AREA and ROAD TRIP tours, always false since each stop is a different property.
- historical_info: 2-3 sentences summarizing the key history (dates, notable figures, major events). Brief summary only.
- paranormal_info: 2-3 sentences summarizing the key paranormal activity and ghosts. Brief summary only.
- investigation_suggestions: 3-5 items like "EVP Session", "Spirit Box Session", "EMF Sweep", "Trigger Object Experiment", "Temperature Monitoring", "Full-Spectrum Photography"
- estimated_investigation_time: "10 minutes" / "15 minutes" / "20 minutes"
- construction_date, famous_people
- narration_text: 4-6 sentences of dramatic, immersive storytelling narration in a mysterious, captivating style. The narrator is a seasoned paranormal investigator speaking to fellow investigators about what awaits them. Include vivid sensory details and specific ghost stories.
- hours_of_operation: ALWAYS provide this — never leave blank. State the location's public access hours (e.g. "Open to public daily 9am-5pm", "Grounds open dawn to dusk, building closed after 4pm", "Exterior accessible 24/7, interior tours until 10PM Friday-Saturday"). If the exterior is freely accessible at all hours, state "Exterior accessible 24/7" explicitly.
- entry_fee: ALWAYS provide this — never leave blank. State the admission cost (e.g. "$10 adults, $5 children", "Free, donations welcome", "$25 for day tour, $45 for overnight investigation"). If completely free, state "Free" or "Free, donations welcome".

ROUTING & ACCESS RULES — FOLLOW EXACTLY:

1. DISTANCE MINIMIZATION: Minimize distance from stop to stop AND overall tour length. Every consecutive walking stop MUST be ≤0.33 miles from the previous. The TOTAL route distance MUST be ≤2.5 miles. Arrange stops in the most efficient order possible — shortest total route wins.

2. WALKING TOURS: Stops must form a logical loop — start and end near the same point (${tourData.start_location_name}). Route must be efficient with NO crisscrossing. Stops proceed in a circle so investigators return to their starting point naturally.

3. DRIVING-ONLY TOURS: Stops must follow a logical linear progression — each stop advances in a single direction with no doubling back. Minimize total driving distance.

4. MIXED TOURS: The tour can start by driving to a parking area near a walking cluster, then walking stops form a logical loop (≤0.33 miles between stops, returning to that parking area). Remaining driving stops continue in a linear progression. Use this pattern when it makes the most logical sense — drive to where the walking cluster is, walk the loop, then drive to remaining stops. Walking stops must cluster within ≤0.33 miles of each other. Minimize both walking and driving distances.

5. PUBLIC ACCESS AFTER 7 PM: ALL locations must be publicly accessible after 7 PM. Ghost hunts occur primarily at night. Do NOT use locations that close before 7 PM, have locked gates, or prohibit nighttime access (e.g. national battlefields, state parks closing at sunset, gated cemeteries, museums closing at 5 PM). At minimum, investigators must be able to be outside the building after 7 PM. If a location has restricted hours, note them in hours_of_operation. Do NOT use any location fully inaccessible after 7 PM.

6. MOST POPULAR STOPS: Include the most popular, most talked-about paranormal hotspots near ${tourData.city}, ${tourData.state} — the locations where paranormal activity and ghosts have been observed, recorded, and discussed most. Prioritize locations with the richest documented paranormal history, famous ghost sightings, and active investigations. Do NOT include obscure or unknown locations.

7. UNIQUE STOPS ONLY: Each stop must be a DIFFERENT haunted location. Do NOT include the same building or site twice with slightly different names (e.g., "Frederick City Hall" and "Frederick City Hall Main Floor" are the same stop — combine them into one). Do NOT repeat stops. Generate exactly 8-10 stops, no more.

ADDRESS RESEARCH RULE — FOLLOW EXACTLY: When you learn about haunted locations from existing ghost tour companies, walking tours, or tourism websites, you MUST find the ACTUAL STREET ADDRESS of each location independently. Do NOT copy a tour company's meeting point, starting location, or vague area description — tour companies often list only where their tour GROUPS MEET (e.g., "2nd & Market St") rather than the actual haunted building's address. For every stop, look up the real street address where the actual haunted building, landmark, or site is located (e.g., "43 Cape Henlopen Dr, Lewes, DE 19958" for the ferry terminal, NOT "Near the intersection of 2nd & Market"). The address must be the physical location of the haunted site itself, not a tour company's gathering point.

BRAND RULE: The app is branded AGES, which stands for "Accessible Ghost Exploration Solutions" (never "Affordable"). If you mention the AGES brand anywhere in the text, always define it as "Accessible Ghost Exploration Solutions".

PARKING: Also include a "parking" object in the JSON for the walking cluster's parking spot. The parking should be:
- A real parking lot, parking garage, or street parking area
- Located between the first and last stop of the walking cluster
- Publicly accessible at night (after 7 PM)
- Within 0.3 miles of the walking cluster center
Include these fields in the parking object:
- parking_name: Name of the parking area (e.g., "Main Street Metered Parking", "City Lot #3")
- parking_address: Complete street address of the parking area
- parking_type: "street", "parking_lot", or "parking_garage"
- parking_cost: e.g., "Free", "Metered ($1.50/hr, free after 6pm)", "Paid lot ($5 flat rate)"
- parking_latitude: GPS latitude of the parking spot
- parking_longitude: GPS longitude of the parking spot
For driving-only tours (no walking cluster), omit the parking object.

Output ONLY a valid JSON object with a "stops" array and optional "parking" object. No markdown fences, no commentary.${CONCLUSION_PHRASE_RULE}`;

      let result = null;
      try {
        result = await callJson(prompt, { useWeb: true });
      } catch (e) { console.error('Stop generation failed:', e); }
      if (!result || !result.stops || result.stops.length === 0) {
        try {
          result = await callJson(prompt + '\n\nIMPORTANT: Use 3 detailed paragraphs each for historical_info and paranormal_info. Output ONLY valid JSON.', { useWeb: true });
        } catch (e) { console.error('Stop generation (concise) failed:', e); }
      }
      if (!result || !result.stops || result.stops.length === 0) {
        throw new Error('Could not generate stops after multiple attempts. Please try again.');
      }

      // === SINGLE-SITE COORDINATE ENFORCEMENT ===
      // For landmark/ship/cold_spot tours, all stops are on ONE property. The
      // LLM routinely IGNORES the same_structure instruction and invents fake
      // distinct coordinates for rooms within one building, scattering markers
      // across the city. Fix this programmatically — don't trust the LLM:
      // If a stop NAME looks like a room/area (bar, lobby, basement, etc.) →
      //   same_structure: true, use the building's start coordinates.
      // We do NOT use "all stops share the same address" as a signal because
      // large properties (e.g. Pennhurst Asylum) can have distinct buildings
      // that share the same mailing address — those need their own coordinates.
      const isSingleSite = tourData.tour_category === 'landmark' || tourData.tour_category === 'ship' || tourData.tour_category === 'cold_spot';
      const isLargeProp = isLargeProperty(tourData);
      if (isSingleSite && result.stops) {
        // For a single house/building (not a large property), all stops that
        // share the property's street address are at the same location. The
        // LLM routinely invents fake distinct coordinates for areas of a
        // single house ("The Garden", "The Fountain"), scattering markers
        // across town. Collapse them to the building center. Large properties
        // (forts, parks) are excluded — distinct buildings there can share one
        // mailing address but need their own coordinates.
        const normAddr = (a) => String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        const propertyAddr = isLargeProp ? null : normAddr(result.stops[0]?.address);
        for (const stop of result.stops) {
          if (looksLikeRoomOrArea(stop.name) || (propertyAddr && normAddr(stop.address) === propertyAddr)) {
            stop.same_structure = true;
            stop.latitude = tourData.start_latitude;
            stop.longitude = tourData.start_longitude;
          }
        }
      }

      const processed = await enforceWalkingDistance(result.stops || [], tourData.tour_type, { lat: tourData.start_latitude, lon: tourData.start_longitude }, { walkingLimit: getWalkingLimit(tourData) });
      // Auto-correct tour type if stops are a mix of walking + driving
      const methods = new Set(processed.map(s => s.travel_method));
      const correctedType = methods.has('driving') && methods.has('walking') ? 'mixed' 
        : methods.has('driving') ? 'driving' : 'walking';
      if (correctedType !== tourData.tour_type) {
        await base44.entities.Tour.update(tourData.id, { tour_type: correctedType });
        tourData.tour_type = correctedType;
        setTour({ ...tourData, tour_type: correctedType });
      }
      // DEDUP: Remove duplicate stops by normalized name and address. The LLM
      // sometimes returns the same physical location twice (same address,
      // slightly different name) — both would get created without this check.
      const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const seenNames = new Set();
      const seenAddrs = new Set();
      const deduped = [];
      for (const stop of processed) {
        const nameKey = normKey(stop.name);
        const addrKey = normKey(stop.address);
        if (nameKey && seenNames.has(nameKey)) continue;
        if (addrKey && seenAddrs.has(addrKey)) continue;
        // Fuzzy name dedup — catch near-duplicates like "Frederick City Hall"
        // vs "Frederick City Hall Main Floor" (one normalized name contains
        // the other). Prevents the LLM from padding with variations of the
        // same location.
        let isFuzzyDup = false;
        if (nameKey && nameKey.length >= 8) {
          for (const seen of seenNames) {
            if (seen.length >= 8 && (seen.includes(nameKey) || nameKey.includes(seen))) {
              isFuzzyDup = true;
              break;
            }
          }
        }
        if (isFuzzyDup) continue;
        if (nameKey) seenNames.add(nameKey);
        if (addrKey) seenAddrs.add(addrKey);
        deduped.push(stop);
      }
      // Cap at 10 stops — the prompt asks for 8-10, but the LLM sometimes
      // returns 15+ with near-duplicate variations. Hard limit prevents
      // oversized tours.
      const MAX_STOPS = 10;
      if (deduped.length > MAX_STOPS) deduped.length = MAX_STOPS;
      // Renumber sequentially to close any gaps left by dedup removing
      // duplicates after enforceWalkingDistance assigned stop_numbers.
      for (let i = 0; i < deduped.length; i++) {
        deduped[i].stop_number = i + 1;
      }
      // Strip conclusion-like opening phrases from all non-final stops.
      const lastIdx = deduped.length - 1;
      for (let i = 0; i < deduped.length; i++) {
        deduped[i].narration_text = stripConclusionOpeners(deduped[i].narration_text, i === lastIdx);
        deduped[i].paranormal_info = stripConclusionOpeners(deduped[i].paranormal_info, i === lastIdx);
      }
      // LLM-generated coordinates are ESTIMATES, not verified. Mark as
      // geocoded: false (amber "EST" badge) so users know to verify at the
      // actual location. fix-collapsed-coords upgrades to geocoded: true
      // (blue) ONLY when OSM name search or address geocode confirms the
      // coordinates. LLM web search results stay amber — LLM can be wrong.
      for (const stop of deduped) {
        stop._geocoded = false;
      }

      const created = [];
      for (const stop of deduped) {
        const { _geocoded, ...rest } = stop;
        const saved = await base44.entities.TourStop.create({ ...rest, tour_id: tourId, geocoded: !!_geocoded });
        created.push(saved);
      }
      if (!systemRegen) spendManifestationEnergy();

      // Create parking stop — always create one for walking tours. If the LLM
      // provided parking, geocode its address for accurate on-land coords. If
      // geocoding fails (water/failed), fall back to the tour's start coords
      // (verified on land by fix-collapsed-coords). If the LLM didn't provide
      // parking at all, create one at the tour's start location.
      if (tourData.tour_type !== 'driving') {
        const p = result.parking || {};
        let pLat = tourData.start_latitude;
        let pLon = tourData.start_longitude;
        let pName = p.parking_name || 'Parking Area';
        let pAddr = p.parking_address || tourData.start_location_name || '';
        let pType = p.parking_type || 'street';
        let pCost = p.parking_cost || 'Free';
        if (p.parking_address) {
          const geoMap = await geocodeStopsWithNames([{
            id: 'parking', name: p.parking_name, address: p.parking_address,
            city: tourData.city, state: tourData.state
          }], { lat: tourData.start_latitude, lon: tourData.start_longitude, maxDistMiles: 0.5, clusterRadius: 0.3 });
          if (geoMap.parking) { pLat = geoMap.parking.lat; pLon = geoMap.parking.lon; }
        }
        try {
          const parkingStopRecord = await base44.entities.TourStop.create({
            tour_id: tourId, stop_type: 'parking', stop_number: 0,
            name: pName, address: pAddr,
            latitude: pLat, longitude: pLon,
            parking_type: pType, parking_cost: pCost,
            travel_method: 'walking', geocoded: true,
          });
          created.push(parkingStopRecord);
        } catch (e) { console.error('Parking stop creation failed:', e); }
      }

      // Verify ALL stops via per-stop LLM web search (verifyAll: true) —
      // confirms or corrects each stop's coordinates against real-world data.
      // For landmark/ship/cold_spot, also fixes water/land issues. For area/
      // road_trip, runs the full verification pipeline (address geocode → OSM
      // name search → LLM web search) on every stop to catch inaccurate LLM
      // coordinates from generation.
      try {
        await base44.functions.invoke('fix-collapsed-coords', { tourId, verifyAll: true });
        const verifiedStops = await base44.entities.TourStop.filter({ tour_id: tourId });
        // Re-run enforceWalkingDistance on the corrected coordinates —
        // fix-collapsed-coords may have moved stops to their real-world
        // positions, so the original order (from LLM coords) may no longer
        // be optimal. This ensures walking cluster stays first, driving last.
        const vParking = verifiedStops.find(s => s.stop_type === 'parking');
        const vShuttle = verifiedStops.find(s => s.stop_type === 'shuttle');
        const vTourStops = verifiedStops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
        const parkingCoords = vParking?.latitude != null ? { lat: vParking.latitude, lon: vParking.longitude } : null;
        const reordered = await enforceWalkingDistance(vTourStops, tourData.tour_type, { lat: tourData.start_latitude, lon: tourData.start_longitude }, { walkingLimit: getWalkingLimit(tourData), parkingCoords });
        for (const s of reordered) {
          const existing = vTourStops.find(ts => ts.id === s.id);
          if (existing && (existing.stop_number !== s.stop_number || existing.travel_method !== s.travel_method)) {
            await base44.entities.TourStop.update(s.id, { stop_number: s.stop_number, travel_method: s.travel_method });
          }
        }
        setStops([...(vParking ? [vParking] : []), ...(vShuttle ? [vShuttle] : []), ...reordered]);
      } catch (e) {
        console.error('Coordinate verification failed:', e);
        setStops(created.sort((a, b) => a.stop_number - b.stop_number));
      }
      // New stops are unverified — drop the tour's verified status.
      // Mark stops_regenerated to the current version so the next view
      // doesn't re-run the full verification (which would double load time).
      await base44.entities.Tour.update(tourData.id, { verified: false, stops_regenerated: STOPS_VALIDATION_VERSION });
      setGeneratingStops(false);
    } catch (err) {
      setStopsError(err.message || 'Failed to generate stops. Please try again.');
      setGeneratingStops(false);
    }
  };

  const toggleFavorite = async () => {
    const prev = isFavorite;
    setIsFavorite(!prev);
    try {
      if (prev) {
        const favs = await base44.entities.Favorite.filter({ tour_id: tourId });
        for (const f of favs) await base44.entities.Favorite.delete(f.id);
      } else {
        await base44.entities.Favorite.create({ tour_id: tourId, tour_title: tour.title, state: tour.state, city: tour.city });
      }
    } catch (err) {
      setIsFavorite(prev);
    }
  };

  const onDragStart = () => {
    document.body.style.overflow = 'hidden';
  };

  const onDragEnd = async (result) => {
    document.body.style.overflow = '';
    if (!result.destination || result.source.index === result.destination.index) return;
    // Prevent background validation/geocoding from overwriting this reorder
    userDraggedRef.current = true;
    const currentParking = stops.find(s => s.stop_type === 'parking');
    const currentTourStops = stops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
    const reordered = Array.from(currentTourStops);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    const withNumbers = reordered.map((s, i) => ({ ...s, stop_number: i + 1 }));
    setStops([...(currentParking ? [currentParking] : []), ...withNumbers]);
    for (const s of withNumbers) {
      await base44.entities.TourStop.update(s.id, { stop_number: s.stop_number });
    }
    // Remember that the user customized the stop order so we don't re-sort by proximity on next load
    try {
      await base44.entities.Tour.update(tourId, { user_reordered: true });
      setTour(prev => prev ? { ...prev, user_reordered: true } : prev);
    } catch (e) {}
    // Rebalance conclusion phrases: strip from the old final stop (now
    // non-final) and regenerate the new final stop's narration with a
    // conclusion ending so the tour still wraps up properly.
    try {
      const rebalanceResult = await rebalanceConclusionPhrases(currentTourStops, withNumbers);
      if (rebalanceResult) {
        setStops(prev => prev.map(s => {
          if (rebalanceResult.oldFinal && s.id === rebalanceResult.oldFinal.id) {
            return { ...s, ...rebalanceResult.oldFinal };
          }
          if (rebalanceResult.newFinal && s.id === rebalanceResult.newFinal.id) {
            return { ...s, ...rebalanceResult.newFinal };
          }
          return s;
        }));
      }
    } catch (e) {
      console.error('Conclusion rebalance failed:', e);
    }
  };

  const markComplete = async () => {
    setCompletingTour(true);
    try {
      await base44.entities.Investigation.create({
        tour_id: tourId,
        location_name: tour.title,
        date: new Date().toISOString().slice(0, 10),
        state: tour.state,
        city: tour.city,
        is_completed: true,
        notes: `Completed tour: ${tour.title}`,
      });
      setIsCompleted(true);
      try {
        await base44.auth.updateMe({
          last_tour_id: '',
          last_stop_id: '',
          last_stop_number: 0,
          last_stop_name: '',
          last_tour_title: '',
        });
      } catch (e) {}
    } catch (e) {}
    setCompletingTour(false);
  };

  // Handle pink "Needs Placement" marker drag — update coordinates, clear
  // needs_placement, and mark as user-verified so the marker turns blue.
  const handleMarkerDragEnd = async (stopId, latLng) => {
    userDraggedRef.current = true;
    setStops(prev => prev.map(s =>
      s.id === stopId
        ? { ...s, latitude: latLng.lat, longitude: latLng.lng, needs_placement: false, geocoded: true, user_verified: true }
        : s
    ));
    try {
      await base44.entities.TourStop.update(stopId, {
        latitude: latLng.lat,
        longitude: latLng.lng,
        needs_placement: false,
        geocoded: true,
        user_verified: true,
      });
    } catch (e) {
      console.error('Failed to update stop coordinates:', e);
    }
  };

  const handleAddStopByName = async () => {
    if (!stopSearchName.trim() || addingStop) return;
    const gate = await checkManifestationGate();
    if (!gate.allowed) {
      setStopsError(gate.reason === 'energy'
        ? "You're out of manifestation energy. Buy an Aura Bundle or upgrade your plan."
        : 'Upgrade to a paid plan to add stops.');
      return;
    }
    setAddingStop(true);
    setStopsError('');
    try {
      const result = await addStopByName(tour, stopSearchName.trim());
      if (!result.added) {
        setStopsError(result.reason === 'max'
          ? 'This tour is at the maximum number of stops.'
          : `Could not find "${stopSearchName}". Try a more specific name or check the spelling.`);
        setAddingStop(false);
        return;
      }
      spendManifestationEnergy();
      setStopSearchName('');
      // Reload and re-order all stops with the new stop included
      const allStops = await base44.entities.TourStop.filter({ tour_id: tourId });
      const pStop = allStops.find(s => s.stop_type === 'parking');
      const sStop = allStops.find(s => s.stop_type === 'shuttle');
      const tStops = allStops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
      const pCoords = pStop?.latitude != null ? { lat: pStop.latitude, lon: pStop.longitude } : null;
      const reordered = await enforceWalkingDistance(tStops, tour.tour_type, { lat: tour.start_latitude, lon: tour.start_longitude }, { walkingLimit: getWalkingLimit(tour), parkingCoords: pCoords });
      for (const s of reordered) {
        const existing = tStops.find(ts => ts.id === s.id);
        if (existing && (existing.stop_number !== s.stop_number || existing.travel_method !== s.travel_method)) {
          try { await base44.entities.TourStop.update(s.id, { stop_number: s.stop_number, travel_method: s.travel_method }); } catch (e) {}
        }
      }
      setStops([...(pStop ? [pStop] : []), ...(sStop ? [sStop] : []), ...reordered]);
    } catch (e) {
      setStopsError(e.message || 'Failed to add stop. Please try again.');
    }
    setAddingStop(false);
  };

  const handleAddShuttle = async () => {
    if (addingShuttle) return;
    setAddingShuttle(true);
    setStopsError('');
    try {
      const result = await addShuttleStop(tour);
      if (!result.added) {
        setStopsError(result.reason === 'exists'
          ? 'A shuttle drop-off stop already exists for this tour.'
          : 'Could not find a shuttle drop-off location. Try adding it manually.');
        setAddingShuttle(false);
        return;
      }
      // Reload stops to include the new shuttle stop
      const allStops = await base44.entities.TourStop.filter({ tour_id: tourId });
      setStops(allStops.sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0)));
    } catch (e) {
      setStopsError(e.message || 'Failed to add shuttle stop. Please try again.');
    }
    setAddingShuttle(false);
  };

  const parkingStop = stops.find(s => s.stop_type === 'parking');
  const shuttleStop = stops.find(s => s.stop_type === 'shuttle');
  const tourStops = stops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');

  if (loading) {
    return (
      <PageContainer>
        <SectionHeader title="Loading Tour" showBack />
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
            <Ghost className="w-12 h-12 text-primary" />
          </motion.div>
          <p className="text-sm text-muted-foreground font-heading tracking-wide">
            Be Patient: Complex Tour Build in Progress…
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
        badge={<TourCategoryBadge category={tour.tour_category} />}
        rightAction={
          <button onClick={toggleFavorite} className="p-2">
            <Heart className={`w-5 h-5 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
          </button>
        }
      />

      <div className="px-4 pb-28 space-y-4 pt-3">
        <div className="p-4 rounded-xl border border-border/40 bg-card/40 space-y-3">
          <VerificationBadge verified={tour.verified} />
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {tour.tour_type === 'walking' ? <Footprints className="w-3.5 h-3.5" /> : tour.tour_type === 'mixed' ? <><Footprints className="w-3.5 h-3.5" /><Car className="w-3 h-3" /></> : <Car className="w-3.5 h-3.5" />}
              {tour.tour_type === 'mixed' ? 'Walking + Driving' : tour.tour_type}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5" /> {computeAdjustedDuration(tour.estimated_duration, narrationLength, parkingStop ? 5 : 0)}</span>
            {totalDistance > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Route className="w-3.5 h-3.5" /> {formatDistance(totalDistance)}</span>
            )}
          </div>
          <div className="flex items-start justify-between gap-3">
            <p className="text-log text-sm text-foreground/80 leading-relaxed">{displayDescription}</p>
            <button onClick={() => narrate(displayDescription)} className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
              {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> <BePatient /></> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Narrate <EnergyCostBadge type="narration" text={displayDescription} /></>}
            </button>
          </div>
          {tour.best_time && <p className="text-xs text-primary flex items-center gap-1"><Zap className="w-3 h-3" /> Best time: {tour.best_time}</p>}
          <NarrationLengthSelector value={narrationLength} onChange={handleNarrationLengthChange} estimatedDuration={tour.estimated_duration} />
        </div>

        <TourAccessInfo tour={tour} stops={stops} />

        {tour.introduction && (
          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-primary">Introduction</h3>
              <button onClick={() => narrate(displayIntroduction)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> <BePatient /></> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Narrate <EnergyCostBadge type="narration" text={displayIntroduction} /></>}
              </button>
            </div>
            <p className="text-log text-xs text-foreground/70 leading-relaxed">{displayIntroduction}</p>
          </div>
        )}

        {tour.safety_info && (
          <div className="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
            <p className="text-[10px] font-heading uppercase tracking-wider text-yellow-500 mb-1">Safety Information</p>
            <p className="text-log text-xs text-foreground/60 leading-relaxed">{tour.safety_info}</p>
          </div>
        )}

        <div className="p-3 rounded-lg border border-border/40 bg-card/30 flex items-center gap-3">
          <Navigation className="w-4 h-4 text-primary" />
          <div>
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Start Location</p>
            <p className="text-sm text-foreground">{tour.start_location_name}</p>
          </div>
        </div>

        {stops.length > 0 && <TourMap stops={stops} tour={tour} height="h-72" onMarkerDragEnd={handleMarkerDragEnd} />}

        <div>
          <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground mb-3 flex items-center gap-2">
            <Map className="w-4 h-4 text-primary" /> {tourStops.length} Investigation Stops
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
              <p className="text-xs text-muted-foreground">Be Patient: Complex Tour Build in Progress…</p>
              <BePatient />
            </div>
          ) : (
            <>
            {parkingStop && (
              <div
                onClick={() => navigate(`/stop/${parkingStop.id}`)}
                className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 hover:bg-amber-500/10 transition-all group cursor-pointer mb-2"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 font-heading text-sm font-bold shrink-0 text-amber-400">P</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-amber-400 transition-colors">{parkingStop.name || 'Parking Area'}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <MapPin className="w-2.5 h-2.5" /> <span className="truncate">{parkingStop.address || 'Parking'}</span>
                  </p>
                </div>
                {parkingStop.user_verified && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-amber-400 transition-colors shrink-0" />
              </div>
            )}
            {shuttleStop && (
              <div
                onClick={() => navigate(`/stop/${shuttleStop.id}`)}
                className="flex items-center gap-3 p-3 rounded-lg border border-green-500/30 bg-green-500/5 hover:border-green-500/50 hover:bg-green-500/10 transition-all group cursor-pointer mb-2"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/20 border border-green-500/40 font-heading text-sm font-bold shrink-0 text-green-400">S</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-green-400 transition-colors">{shuttleStop.name || 'Shuttle Drop-Off'}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <MapPin className="w-2.5 h-2.5" /> <span className="truncate">{shuttleStop.address || 'Shuttle drop-off point'}</span>
                  </p>
                </div>
                {shuttleStop.user_verified && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-green-400 transition-colors shrink-0" />
              </div>
            )}
            <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
              <Droppable droppableId="stops">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {tourStops.map((stop, i) => (
                      <Draggable key={stop.id} draggableId={stop.id} index={i}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={snapshot.isDragging ? 'opacity-80' : ''}
                          >
                            <div
                              onClick={() => navigate(`/stop/${stop.id}`)}
                              className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-card/30 hover:border-primary/30 hover:bg-card/50 transition-all group cursor-pointer"
                            >
                              <div
                                {...provided.dragHandleProps}
                                className={`flex items-center justify-center w-8 h-8 rounded-full font-heading text-sm font-bold shrink-0 cursor-grab active:cursor-grabbing select-none ${snapshot.isDragging ? 'ring-2 ring-primary shadow-[0_0_16px_hsl(199,89%,48%,0.5)]' : ''} ${stop.travel_method === 'driving' ? 'bg-amber-500/10 text-amber-400' : 'bg-primary/10 text-primary'}`}
                              >
                                {stop.stop_number}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{stop.name}</p>
                                  {stop.needs_placement && (
                                    <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-pink-500/15 border border-pink-500/40 text-pink-400 text-[9px] font-heading uppercase tracking-wider">Needs Placement</span>
                                  )}
                                  {!stop.needs_placement && stop.geocoded === false && (
                                    <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[9px] font-heading uppercase tracking-wider">Est.</span>
                                  )}
                                </div>
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
                              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); narrate(truncateText(stop.narration_text || stop.paranormal_info, narrationLength)); }} className={`p-1.5 rounded-md shrink-0 transition-colors ${isSpeaking || isGenerating ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'}`}>
                                {isSpeaking || isGenerating ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                              </button>
                              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            {(user?.role === 'admin' || isPaid) && !shuttleStop && (
              <button
                onClick={handleAddShuttle}
                disabled={addingShuttle}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-green-500/30 bg-green-500/5 text-green-400 text-xs font-heading uppercase tracking-wider hover:bg-green-500/10 transition-colors disabled:opacity-50 mb-3"
              >
                {addingShuttle ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching for shuttle drop-off…</> : <><Plus className="w-3.5 h-3.5" /> Add Shuttle Drop-Off</>}
              </button>
            )}
            {(user?.role === 'admin' || isPaid) && (
              <div className="mt-3 p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
                <p className="text-[10px] font-heading uppercase tracking-wider text-primary">Add Specific Stop by Name</p>
                <div className="flex gap-2">
                  <Input
                    value={stopSearchName}
                    onChange={(e) => setStopSearchName(e.target.value)}
                    placeholder="e.g., Mumma Farm"
                    className="flex-1"
                    onKeyDown={(e) => { if (e.key === 'Enter' && stopSearchName.trim()) handleAddStopByName(); }}
                  />
                  <button
                    onClick={handleAddStopByName}
                    disabled={addingStop || !stopSearchName.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-heading text-xs uppercase tracking-wider hover:bg-primary/80 transition-colors disabled:opacity-50"
                  >
                    {addingStop ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {addingStop ? 'Adding…' : 'Add Stop'}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">Searches the web for the location and generates a full stop with coordinates, history, and paranormal info.</p>
              </div>
            )}
            </>
          )}
        </div>

        {tour.conclusion && (
          <div id="conclusion" className="p-4 rounded-xl border border-dim-purple/20 bg-dim-purple/5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-dim-purple">Conclusion</h3>
              <button onClick={() => { narrate(displayConclusion); setConclusionRead(true); }} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dim-purple/10 border border-dim-purple/30 text-dim-purple text-[10px] font-heading uppercase tracking-wider hover:bg-dim-purple/20 transition-colors">
                {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> <BePatient /></> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Narrate <EnergyCostBadge type="narration" text={displayConclusion} /></>}
              </button>
            </div>
            <p className="text-log text-xs text-foreground/70 leading-relaxed" onScroll={() => setConclusionRead(true)}>{displayConclusion}</p>
            <button onClick={() => setConclusionRead(true)} className="text-[10px] text-dim-purple/60 underline underline-offset-2 hover:text-dim-purple transition-colors">
              I've read the conclusion
            </button>
          </div>
        )}

        {conclusionRead && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-xl border text-center space-y-3 ${isCompleted ? 'border-green-500/30 bg-green-500/5' : 'border-primary/30 bg-primary/5'}`}
          >
            {isCompleted ? (
              <>
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-green-400" />
                  <p className="font-heading text-sm font-bold text-green-400 uppercase tracking-wider">Tour Completed!</p>
                </div>
                <p className="text-xs text-muted-foreground">This tour has been logged to your profile and the leaderboard.</p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2">
                  <PartyPopper className="w-5 h-5 text-primary" />
                  <p className="font-heading text-sm font-bold text-foreground uppercase tracking-wider">You've Reached the End!</p>
                </div>
                <p className="text-xs text-muted-foreground">Mark this tour as complete to log it to your profile and the leaderboard.</p>
                <button
                  onClick={markComplete}
                  disabled={completingTour}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground font-heading text-sm uppercase tracking-wider transition-colors disabled:opacity-60"
                >
                  {completingTour ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {completingTour ? <BePatient /> : 'Mark Tour Complete'}
                </button>
              </>
            )}
          </motion.div>
        )}
      </div>

      <UpgradePrompt show={showUpgrade} onClose={() => setShowUpgrade(false)} reason={gateReason} />
      <NavBar />
    </PageContainer>
  );
}