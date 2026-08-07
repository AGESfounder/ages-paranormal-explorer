import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion } from 'framer-motion';
import { MapPin, Clock, Footprints, Car, Heart, Ghost, Loader2, ChevronRight, Volume2, VolumeX, Navigation, Zap, AlertTriangle, RefreshCw, Map, Info, DollarSign, CheckCircle2, PartyPopper, Route } from 'lucide-react';
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

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 2-opt optimization: reverses route segments that reduce total distance.
// Fixes backtracking patterns (e.g., out to a cluster, back, out again)
// that nearest-neighbor alone produces. When includeReturn is true, the
// return-to-start edge is included in the cost so walking tours form a
// loop that brings the user back near where they parked.
function optimizeRoute2Opt(route, includeReturn) {
  if (route.length <= 3) return route;
  const dist = (a, b) => haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;
    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const a = route[i - 1];
        const b = route[i];
        const c = route[j];
        const d = (j + 1 < route.length) ? route[j + 1] : (includeReturn ? route[0] : null);
        const oldD = dist(a, b) + (d ? dist(c, d) : 0);
        const newD = dist(a, c) + (d ? dist(b, d) : 0);
        if (newD < oldD - 0.0001) {
          const reversed = route.slice(i, j + 1).reverse();
          route.splice(i, j - i + 1, ...reversed);
          improved = true;
        }
      }
    }
  }
  return route;
}

function orderStopsByProximity(stops, includeReturn = false) {
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
  return optimizeRoute2Opt(ordered, includeReturn);
}

function enforceWalkingDistance(stops, tourType, startCoords) {
  if (!stops.length) return stops;
  const WALKING_LIMIT = 0.33;
  // Sort by stop_number for a consistent base order, then move the stop
  // closest to the tour's start coordinates to the front so the
  // nearest-neighbor begins from the tour's designated start. Without
  // this, the 2-opt loop may start from a leaf node and produce driving
  // segments in the middle of the route instead of at the end.
  stops = [...stops].sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0));
  if (startCoords && startCoords.lat != null && startCoords.lon != null) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < stops.length; i++) {
      if (stops[i].latitude != null && stops[i].longitude != null) {
        const d = haversineDistance(startCoords.lat, startCoords.lon, stops[i].latitude, stops[i].longitude);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
    }
    if (bestIdx > 0) {
      const startStop = stops.splice(bestIdx, 1)[0];
      stops.unshift(startStop);
    }
  }

  if (tourType === 'driving') {
    return orderStopsByProximity(stops).map((s, i) => ({ ...s, travel_method: 'driving', stop_number: i + 1 }));
  }

  if (tourType === 'walking') {
    const ordered = orderStopsByProximity(stops, true);
    return ordered.map((s, i) => {
      if (i === 0) return { ...s, travel_method: 'walking', stop_number: i + 1 };
      const prev = ordered[i - 1];
      const dist = haversineDistance(prev.latitude, prev.longitude, s.latitude, s.longitude);
      return { ...s, travel_method: dist <= WALKING_LIMIT ? 'walking' : 'driving', stop_number: i + 1 };
    });
  }

  // MIXED TOURS: Separate stops into a walking cluster (the largest group
  // of stops within WALKING_LIMIT of each other) and driving stops. Order
  // the walking cluster as a loop (2-opt with return-to-start) so the first
  // and last stops are near each other — the user parks, walks a circle,
  // and returns to their car. The loop's start/end point is chosen as the
  // stop closest to the nearest driving stop, so after the loop the user is
  // positioned near the next driving destination. Driving stops are then
  // appended in linear (nearest-neighbor) order.
  const withCoords = stops.filter(s => s.latitude != null && s.longitude != null);
  const noCoords = stops.filter(s => s.latitude == null || s.longitude == null);

  // Build connected components: stops linked when within WALKING_LIMIT.
  // Uses a head-index queue (not shift) to avoid O(n²) on larger stop sets.
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

  // Largest component (2+ stops) = walking cluster; everything else = driving
  const walkingCluster = components[0] && components[0].length > 1 ? components[0] : [];
  const drivingStops = (walkingCluster.length > 0 ? components.slice(1) : components).flat();

  // Order the walking cluster as a loop (2-opt with return-to-start)
  const orderedCluster = walkingCluster.length > 1
    ? orderStopsByProximity(walkingCluster, true)
    : walkingCluster.slice();

  // Rotate the loop so the stop closest to the nearest driving stop is
  // first/last — this positions the user near their car for the drive out.
  if (orderedCluster.length > 1 && drivingStops.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < orderedCluster.length; i++) {
      for (const ds of drivingStops) {
        const d = haversineDistance(orderedCluster[i].latitude, orderedCluster[i].longitude, ds.latitude, ds.longitude);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
    }
    if (bestIdx > 0) {
      const rotated = [...orderedCluster.slice(bestIdx), ...orderedCluster.slice(0, bestIdx)];
      orderedCluster.length = 0;
      orderedCluster.push(...rotated);
    }
  }

  // Order driving stops linearly, starting from the one closest to the
  // end of the walking cluster so the drive-out is as short as possible.
  const clusterEnd = orderedCluster[orderedCluster.length - 1];
  const orderedDriving = [];
  if (drivingStops.length > 0) {
    const ref = clusterEnd || withCoords[0];
    let startIdx = 0;
    let startDist = Infinity;
    for (let i = 0; i < drivingStops.length; i++) {
      if (ref) {
        const d = haversineDistance(ref.latitude, ref.longitude, drivingStops[i].latitude, drivingStops[i].longitude);
        if (d < startDist) { startDist = d; startIdx = i; }
      }
    }
    const sorted = [drivingStops[startIdx], ...drivingStops.filter((_, i) => i !== startIdx)];
    orderedDriving.push(...orderStopsByProximity(sorted, false));
  }

  // Final order: walking cluster loop + driving stops + no-coords stops
  const clusterSet = new Set(orderedCluster);
  const final = [...orderedCluster, ...orderedDriving, ...noCoords];
  return final.map((s, i) => ({
    ...s,
    travel_method: clusterSet.has(s) ? 'walking' : 'driving',
    stop_number: i + 1,
  }));
}

// Bump this when validation rules change — all tours with an older version
// get re-validated (and regenerated if non-compliant) on next view, at no
// energy cost to the user (system maintenance bypasses energy gating).
const STOPS_VALIDATION_VERSION = 4;

// Validate that a tour's stops comply with current guidelines:
// - No stop should be unreasonably far from the tour's start coordinates
//   (area/cold_spot/landmark/ship: 50 miles, road_trip: 200 miles)
// - No two stops should share identical coordinates (collapsed markers)
function validateStops(stops, tour) {
  if (!stops || stops.length === 0) return { compliant: false, reason: 'no stops' };
  const maxDistMiles = tour.tour_category === 'road_trip' ? 200
    : (tour.tour_category === 'cold_spot' || tour.tour_category === 'ship') ? 0.5
    : tour.tour_category === 'area' ? 2.5
    : 5;
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
  const coordMap = {};
  for (const s of stops) {
    if (s.latitude != null && s.longitude != null) {
      const key = `${s.latitude.toFixed(5)},${s.longitude.toFixed(5)}`;
      coordMap[key] = (coordMap[key] || 0) + 1;
    }
  }
  for (const [key, count] of Object.entries(coordMap)) {
    if (count > 1) return { compliant: false, reason: `${count} stops collapsed at same coordinates` };
  }
  // For area tours, check that no consecutive stops (after proximity
  // ordering) are more than 1 mile apart, AND that the total route distance
  // is no more than 2.5 miles — the goal is a walkable local cluster.
  if (tour.tour_category === 'area') {
    const withCoords = stops.filter(s => s.latitude != null && s.longitude != null);
    if (withCoords.length >= 2) {
      const ordered = orderStopsByProximity(withCoords);
      let totalDist = 0;
      for (let i = 1; i < ordered.length; i++) {
        const dist = haversineDistance(ordered[i - 1].latitude, ordered[i - 1].longitude, ordered[i].latitude, ordered[i].longitude);
        totalDist += dist;
        if (dist > 1) {
          return { compliant: false, reason: `stops are ${dist.toFixed(1)} miles apart (max 1 mile for area tours)` };
        }
      }
      if (totalDist > 2.5) {
        return { compliant: false, reason: `total route is ${totalDist.toFixed(1)} miles (max 2.5 miles for area tours)` };
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
  const { isSpeaking, isGenerating, narrate: rawNarrate } = useGhostVoice();
  const { gateNarration, spendNarration, estimateNarrationCost, showUpgrade, setShowUpgrade, gateReason } = useEnergyGate();

  // Gated narration wrapper — checks energy before speaking, toggles off for free.
  const narrate = (text, opts = {}) => {
    if (isSpeaking || isGenerating) { rawNarrate(text, opts); return; }
    if (!gateNarration(text)) return;
    rawNarrate(text, opts);
    spendNarration(estimateNarrationCost(text));
  };

  // Lazily geocode existing stops whose GPS coordinates haven't been verified.
  // Runs in the background — user sees the tour immediately, coordinates get
  // corrected automatically a few seconds later.
  const geocodeExistingStops = async (stopsList, tourData) => {
    // For landmark/ship/cold_spot tours, don't geocode by address — all stops
    // share one address, so address geocoding collapses them to a single point.
    if (tourData && (tourData.tour_category === 'landmark' || tourData.tour_category === 'ship' || tourData.tour_category === 'cold_spot')) return;
    const needsGeocoding = stopsList.filter(s => !s.geocoded && s.address);
    if (needsGeocoding.length === 0) return;
    // Use enhanced geocoding with stop names — finds actual landmarks
    // instead of intersection points when addresses are vague
    const stopsForGeocoding = needsGeocoding.map(s => ({
      id: s.id, name: s.name, address: s.address, city: tourData?.city, state: tourData?.state
    }));
    const geocodeMap = await geocodeStopsWithNames(stopsForGeocoding, { lat: tourData?.start_latitude, lon: tourData?.start_longitude, maxDistMiles: tourData?.tour_category === 'road_trip' ? 200 : (tourData?.tour_category === 'cold_spot' || tourData?.tour_category === 'ship') ? 0.5 : tourData?.tour_category === 'area' ? 2.5 : 5, clusterRadius: tourData?.tour_category === 'area' ? 0.5 : (tourData?.tour_category === 'cold_spot' || tourData?.tour_category === 'ship') ? 0.3 : null });
    const updates = [];
    for (const stop of needsGeocoding) {
      const geo = geocodeMap[stop.id];
      if (geo) {
        try {
          await base44.entities.TourStop.update(stop.id, {
            latitude: geo.lat,
            longitude: geo.lon,
            geocoded: true,
          });
          updates.push({ id: stop.id, lat: geo.lat, lon: geo.lon });
        } catch (e) {}
      }
    }
    if (updates.length === 0) return;

    // Merge corrected coordinates into the full stop list
    const updatedStops = stopsList.map(s => {
      const u = updates.find(x => x.id === s.id);
      return u ? { ...s, latitude: u.lat, longitude: u.lon, geocoded: true } : s;
    });

    // Re-order stops by proximity using the NOW-correct coordinates.
    // The initial ordering ran on stale/wrong LLM coordinates, so it must be
    // re-evaluated after geocoding to form proper walking loops / linear routes.
    // Skip for tours the user manually reordered — respect their custom order.
    if (tourData && !tourData.user_reordered) {
      const tourStopsOnly = updatedStops.filter(s => s.stop_type !== 'parking');
      const parkingStop = updatedStops.find(s => s.stop_type === 'parking');
      const reordered = enforceWalkingDistance(tourStopsOnly, tourData.tour_type, { lat: tourData.start_latitude, lon: tourData.start_longitude });
      for (const s of reordered) {
        const existing = tourStopsOnly.find(ts => ts.id === s.id);
        if (existing && (existing.stop_number !== s.stop_number || existing.travel_method !== s.travel_method)) {
          try {
            await base44.entities.TourStop.update(s.id, { stop_number: s.stop_number, travel_method: s.travel_method });
          } catch (e) {}
        }
      }
      setStops([...(parkingStop ? [parkingStop] : []), ...reordered]);
    } else {
      setStops(updatedStops);
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
    const tourStopsOnly = stops.filter(s => s.stop_type !== 'parking');
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
      const tourStops = await base44.entities.TourStop.filter({ tour_id: tourId });
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
        const tourStopsOnly = tourStops.filter(s => s.stop_type !== 'parking');
        // Auto-regenerate stops that don't comply with current guidelines
        // (outlier coordinates, collapsed markers). One-time per tour.
        let regenerated = false;
        if ((tourData[0].stops_regenerated || 0) < STOPS_VALIDATION_VERSION) {
          const validation = validateStops(tourStopsOnly, tourData[0]);
          if (!validation.compliant) {
            for (const s of tourStopsOnly) {
              await base44.entities.TourStop.delete(s.id);
            }
            await base44.entities.Tour.update(tourId, { stops_regenerated: STOPS_VALIDATION_VERSION });
            await generateStops(tourData[0], { systemRegen: true });
            regenerated = true;
          } else {
            await base44.entities.Tour.update(tourId, { stops_regenerated: STOPS_VALIDATION_VERSION });
          }
        }
        if (!regenerated) {
          if (tourData[0].user_reordered) {
            // Respect the user's manual stop order — do not re-sort by proximity
            const sortedTourStops = tourStopsOnly.sort((a, b) => a.stop_number - b.stop_number);
            const allStops = [...(parkingStop ? [parkingStop] : []), ...sortedTourStops];
            setStops(allStops);
            geocodeExistingStops(allStops, tourData[0]).catch(console.error);
          } else {
            const reordered = enforceWalkingDistance(tourStopsOnly, tourData[0].tour_type, { lat: tourData[0].start_latitude, lon: tourData[0].start_longitude });
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
            const allStops = [...(parkingStop ? [parkingStop] : []), ...reordered];
            setStops(allStops);
            geocodeExistingStops(allStops, tourData[0]).catch(console.error);
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
        setStops(enforceWalkingDistance(cached.stops || [], cached.tour.tour_type, { lat: cached.tour.start_latitude, lon: cached.tour.start_longitude }));
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
      setStops(prev => [parkingStopRecord, ...prev.filter(s => s.stop_type !== 'parking')]);
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
        ? '\nCOORDINATES — CRITICAL: EACH stop must have its OWN distinct, real GPS coordinates. Look up the actual GPS coordinates of that specific area/building/room within the property or vessel using web search (e.g., search "Battery 519 Fort Miles Lewes DE" to find its real location). Do NOT use the same coordinates for all stops — each area within the property has a different real-world location. The address is the same for all stops, but the coordinates must be different for each.'
        : '';
      const prompt = `Generate 8-10 stops for the paranormal tour "${tourData.title}" in ${tourData.city}, ${tourData.state}. Type: ${tourData.tour_type}. Description: ${tourData.description}
${coordInstruction}
Each stop is a LIGHTWEIGHT skeleton — full rich detail is generated on demand when a user opens the stop, so keep these fields brief:
- stop_number: 1-10 in logical route order
- name, latitude, longitude (real GPS), address
- address: ALWAYS provide a COMPLETE STREET ADDRESS with a street number (e.g. "123 Main St, Lewes, DE 19958"). NEVER use just a city name, an intersection ("X & Y"), or words like "near", "vicinity", "various". If the location has no street address (e.g. a park), use the park entrance address or nearest street address. This address must be GPS-searchable — a user should be able to type it into Google Maps and arrive at the exact location.
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
        result = await callJson(prompt, { useWeb: needsCoordVerification });
      } catch (e) { console.error('Stop generation failed:', e); }
      if (!result || !result.stops || result.stops.length === 0) {
        try {
          result = await callJson(prompt + '\n\nIMPORTANT: Use 3 detailed paragraphs each for historical_info and paranormal_info. Output ONLY valid JSON.', { useWeb: needsCoordVerification });
        } catch (e) { console.error('Stop generation (concise) failed:', e); }
      }
      if (!result || !result.stops || result.stops.length === 0) {
        throw new Error('Could not generate stops after multiple attempts. Please try again.');
      }

      const processed = enforceWalkingDistance(result.stops || [], tourData.tour_type, { lat: tourData.start_latitude, lon: tourData.start_longitude });
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
        if (nameKey) seenNames.add(nameKey);
        if (addrKey) seenAddrs.add(addrKey);
        deduped.push(stop);
      }
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
      if (needsCoordVerification) {
        // For landmark/ship/cold_spot tours, trust the LLM's web-searched
        // coordinates — address geocoding would collapse all stops to one
        // point since they share the same street address. Coordinates are
        // verified via Overpass API after creation (fix-collapsed-coords).
        for (const stop of deduped) {
          stop._geocoded = true;
        }
      } else {
        // Geocode stops for accurate GPS coordinates using enhanced multi-strategy
        // geocoding (name + address + city/state) — finds actual landmarks
        const stopsForGeocoding = deduped.map((s, i) => ({
          id: `temp_${i}`, name: s.name, address: s.address, city: tourData.city, state: tourData.state
        }));
        const geocodeMap = stopsForGeocoding.length > 0 ? await geocodeStopsWithNames(stopsForGeocoding, { lat: tourData.start_latitude, lon: tourData.start_longitude, maxDistMiles: tourData.tour_category === 'road_trip' ? 200 : (tourData.tour_category === 'cold_spot' || tourData.tour_category === 'ship') ? 0.5 : tourData.tour_category === 'area' ? 2.5 : 5, clusterRadius: tourData.tour_category === 'area' ? 0.5 : (tourData.tour_category === 'cold_spot' || tourData.tour_category === 'ship') ? 0.3 : null }) : {};
        for (let i = 0; i < deduped.length; i++) {
          const geo = geocodeMap[`temp_${i}`];
          if (geo) {
            deduped[i].latitude = geo.lat;
            deduped[i].longitude = geo.lon;
            deduped[i]._geocoded = true;
          }
        }
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

      // For landmark/ship/cold_spot tours, verify coordinates via OpenStreetMap
      // Overpass API — LLM-generated coordinates are unreliable (often in water
      // or at wrong locations). Uses real mapped features for accuracy.
      if (needsCoordVerification) {
        try {
          await base44.functions.invoke('fix-collapsed-coords', { tourId });
          const verifiedStops = await base44.entities.TourStop.filter({ tour_id: tourId });
          setStops(verifiedStops.sort((a, b) => a.stop_number - b.stop_number));
        } catch (e) {
          console.error('Coordinate verification failed:', e);
          setStops(created.sort((a, b) => a.stop_number - b.stop_number));
        }
      } else {
        setStops(created.sort((a, b) => a.stop_number - b.stop_number));
      }
      // New stops are unverified — drop the tour's verified status
      await base44.entities.Tour.update(tourData.id, { verified: false });
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
    const currentParking = stops.find(s => s.stop_type === 'parking');
    const currentTourStops = stops.filter(s => s.stop_type !== 'parking');
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

  const parkingStop = stops.find(s => s.stop_type === 'parking');
  const tourStops = stops.filter(s => s.stop_type !== 'parking');

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

        {stops.length > 0 && <TourMap stops={stops} tour={tour} height="h-72" />}

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
              <p className="text-xs text-muted-foreground">Mapping paranormal hotspots...</p>
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