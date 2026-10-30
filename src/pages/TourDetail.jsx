import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion } from 'framer-motion';
import { MapPin, Clock, Footprints, Car, Heart, Ghost, Loader2, ChevronRight, Volume2, VolumeX, Navigation, Zap, AlertTriangle, RefreshCw, Map, CheckCircle2, PartyPopper, Route, Plus, Trash2 } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import TourMap from '../components/TourMap';
import useGhostVoice from '../hooks/useGhostVoice';
import { base44 } from '@/api/base44Client';
import { getOfflineTour, removeTourOffline, isTourOffline } from '@/lib/offlineTours';
import { getOfflineAudio, clearTourAudio } from '@/lib/offlineAudio';
import buildTourStops from '@/lib/buildTourStops';
import BePatient from '@/components/BePatient';
import TourCategoryBadge from '@/components/TourCategoryBadge';
import TourAccessInfo from '@/components/TourAccessInfo';
import VerificationBadge from '@/components/VerificationBadge';
import { useEnergyGate, checkManifestationGate } from '@/hooks/useEnergyGate';
import UpgradePrompt from '@/components/UpgradePrompt';
import EnergyCostBadge from '@/components/EnergyCostBadge';
import NarrationLengthSelector from '@/components/NarrationLengthSelector';
import TravelModeSelector from '@/components/TravelModeSelector';
import TourTypeSelector from '@/components/TourTypeSelector';
import TourStopRow from '@/components/TourStopRow';
import ValidateTourCard from '@/components/ValidateTourCard';
import AmenitySheet from '@/components/amenities/AmenitySheet';

import { getNarrationLength, saveNarrationLength, truncateText, computeAdjustedDuration } from '@/lib/narrationLength';
import { useCondensedTexts } from '@/hooks/useCondensedTexts';
import useBoatAccessFlags from '@/hooks/useBoatAccessFlags';

import TourBuildStatus from '@/components/TourBuildStatus';
import { rebalanceConclusionPhrases } from '@/lib/reorderConclusion';
import { enforceWalkingDistance, getWalkingLimit } from '@/lib/routeOptimizer';
import { stripUrlsForNarration } from '@/lib/urlText';
import NarrationToggle from '@/components/NarrationToggle';
import { useNarrationMode } from '@/hooks/useNarrationMode';
import { useObserverNarrationGate } from '@/hooks/useObserverNarrationGate';
import { canUseEnhanced } from '@/lib/narrationMode';
import { placeStopLocation } from '@/lib/verifyStop';
import { changeParkingLocation } from '@/lib/parkingChange';
import ParkingChangeDialog from '@/components/ParkingChangeDialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { addStopByName } from '@/lib/addTourStops';
import { parkingDisplay } from '@/lib/parkingLabel';
import tourRouteGeometry from '@/lib/tourRouteGeometry';
import readTourSnapshot from '@/lib/readTourSnapshot';
import TourBuildPrompt from '@/components/TourBuildPrompt';
import RepairTourAction from '@/components/RepairTourAction';
import TourAddressCorrection from '@/components/TourAddressCorrection';
import { applyAddressCorrections } from '@/lib/correctTourAddresses';
import reorderCorrectedStops, { orderViolatesRules } from '@/lib/reorderCorrectedStops';

// Builds stay explicit. Opening only corrects unresolved, confirmed addresses.
const activeBuilds = new Set();

export default function TourDetail() {
  const { tourId } = useParams();
  const navigate = useNavigate();
  const [tour, setTour] = useState(null);
  const [stops, setStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadVersionRef = useRef(0);
  const orderRepairRef = useRef(false);
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
  const [stopSearchName, setStopSearchName] = useState('');
  // A parking spot just moved but not yet confirmed: the pin follows the drag
  // and the lot's details are collected before anything is written.
  const [parkingMove, setParkingMove] = useState(null);
  const [parkingSaving, setParkingSaving] = useState(false);
  const [travelMode, setTravelMode] = useState('mixed');
  const [isOfflineCached, setIsOfflineCached] = useState(false);

  const [amenities, setAmenities] = useState([]);
  const [amenitySheetOpen, setAmenitySheetOpen] = useState(false);

  const handleRemoveOffline = async () => {
    await clearTourAudio(tourId);
    removeTourOffline(tourId);
    setIsOfflineCached(false);
    // Also delete the server-synced SavedTour record so this tour is removed
    // from the user's Saved tab on ALL their devices, not just this one.
    try {
      const savedRecords = await base44.entities.SavedTour.filter({ tour_id: tourId });
      for (const r of savedRecords) {
        await base44.entities.SavedTour.delete(r.id);
      }
    } catch (e) {
      console.error('Failed to delete SavedTour record:', e);
    }
    toast({ title: 'Offline tour removed', description: 'Saved data cleared from this device.' });
  };
  const { isSpeaking, isGenerating, narrate: rawNarrate } = useGhostVoice();
  const { gateNarration, showUpgrade, setShowUpgrade, gateReason, user, isPaid } = useEnergyGate();
  const { mode: narrationMode, setMode: setNarrationMode } = useNarrationMode(user);
  const canEnhance = canUseEnhanced(user);
  const { requestAccess: requestNarrationAccess, adGateElement: narrationAdGateEl } = useObserverNarrationGate(user);

  // Gated narration wrapper — checks for pre-generated offline audio first,
  // then falls back to live TTS generation (which costs narration credits).
  const narrate = async (text, opts = {}) => {
    const cleanText = stripUrlsForNarration(text);
    // Device mode: free, client-side TTS — no server call, no energy cost,
    // no offline-audio intercept.
    if (narrationMode === 'device') {
      if (!(await requestNarrationAccess())) return;
      rawNarrate(cleanText, { ...opts, useDeviceVoice: true });
      return;
    }
    // Check for pre-generated offline audio FIRST — before the isSpeaking
    // check, so offline audio plays even if a previous live TTS attempt
    // left isSpeaking/isGenerating stuck.
    if (tour?.id) {
      const audioKey = opts?.audioKey || (text === tour.introduction ? 'intro' : text === tour.conclusion ? 'conclusion' : text === tour.description ? 'description' : null);
      if (audioKey) {
        const offlineUrl = await getOfflineAudio(tour.id, audioKey);
        if (offlineUrl) {
          rawNarrate(offlineUrl, { ...opts, preGenerated: true });
          return;
        }
      }
    }
    if (isSpeaking || isGenerating) { rawNarrate(cleanText, opts); return; }
    // No cached audio — can't generate new TTS without network. Show a
    // clear message instead of the misleading "upgrade" prompt.
    if (!navigator.onLine) {
      toast({ title: 'Offline — no narration cached', description: 'Narration for this section wasn\'t downloaded. Reconnect to generate it, or download the tour with narration for offline use.', variant: 'destructive' });
      return;
    }
    if (!gateNarration(cleanText)) return;
    rawNarrate(cleanText, opts);
  };

  const [narrationLength, setNarrationLengthState] = useState(getNarrationLength());
  const handleNarrationLengthChange = (value) => {
    setNarrationLengthState(value);
    saveNarrationLength(value);
  };
  const handleAccessTypeChange = async (value) => {
    try {
      await base44.entities.Tour.update(tourId, { access_type: value });
      setTour(prev => prev ? { ...prev, access_type: value } : prev);
    } catch (e) {
      console.error('Failed to update tour access type:', e);
    }
  };
  useBoatAccessFlags(tour, stops, setStops);
  const condensed = useCondensedTexts({
    description: tour?.description,
    introduction: tour?.introduction,
    conclusion: tour?.conclusion,
  }, narrationLength);
  const displayDescription = condensed.description || truncateText(tour?.description, narrationLength);
  const displayIntroduction = condensed.introduction || truncateText(tour?.introduction, narrationLength);
  const displayConclusion = condensed.conclusion || truncateText(tour?.conclusion, narrationLength);

  const totalDistance = useMemo(() => {
    const allTourStops = stops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
    const accessFiltered = tour?.access_type === 'interior_only'
      ? allTourStops.filter(s => s.access_area === 'interior')
      : tour?.access_type === 'exterior_only'
      ? allTourStops.filter(s => s.access_area === 'exterior')
      : allTourStops;
    const tourStopsOnly = travelMode === 'walking'
      ? accessFiltered.filter(s => s.travel_method !== 'driving')
      : accessFiltered;
    const accessStops = stops.filter(s => s.stop_type === 'parking' || s.stop_type === 'shuttle');
    return tourRouteGeometry([...accessStops, ...tourStopsOnly], tour).distance;
  }, [stops, travelMode, tour]);

  // Scale the estimated duration proportionally based on how many stops are
  // visible after access-type and travel-mode filtering. Minimum 30% so a
  // short filtered tour doesn't show an unrealistically tiny duration.
  const durationScale = useMemo(() => {
    const allTourStops = stops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
    if (allTourStops.length === 0) return 1;
    let filtered = tour?.access_type === 'interior_only'
      ? allTourStops.filter(s => s.access_area === 'interior')
      : tour?.access_type === 'exterior_only'
      ? allTourStops.filter(s => s.access_area === 'exterior')
      : allTourStops;
    if (travelMode === 'walking') {
      filtered = filtered.filter(s => s.travel_method !== 'driving');
    }
    if (filtered.length === 0) return 0.3;
    return Math.max(0.3, filtered.length / allTourStops.length);
  }, [stops, travelMode, tour?.access_type]);

  const formatDistance = (mi) => mi < 1 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(1)} mi`;

  useEffect(() => {
    userDraggedRef.current = false;
    orderRepairRef.current = false;
    setStopsError('');
    loadTour();
    return () => { loadVersionRef.current += 1; };
  }, [tourId]);

  // Visit order is rebuilt by the route rules the moment the tour is opened: a
  // stop placed after the build (order_rebuild_pending) or an order that
  // outright breaks the rules is fixed here, before anyone walks the tour, so
  // no visitor is ever sent to stops in the wrong place.
  useEffect(() => {
    if (loading || !tour || orderRepairRef.current) return;
    if (tour.verified || tour.manual_reorder || userDraggedRef.current) return;
    if (!tour.order_rebuild_pending && !orderViolatesRules(tour, stops)) return;
    orderRepairRef.current = true;
    reorderCorrectedStops(tour, stops)
      .then(async result => {
        if (result) {
          setStops(result.stops);
          if (Object.keys(result.tourUpdates).length) {
            setTour(prev => (prev ? { ...prev, ...result.tourUpdates } : prev));
          }
        }
        if (tour.order_rebuild_pending) {
          await base44.entities.Tour.update(tour.id, { order_rebuild_pending: false });
          setTour(prev => (prev ? { ...prev, order_rebuild_pending: false } : prev));
        }
      })
      .catch(e => console.error('Route order repair failed:', e));
  }, [loading, tour, stops]);

  useEffect(() => {
    if (loading || loadError || tour) return;
    const meta = document.createElement('meta');
    meta.name = 'prerender-status-code';
    meta.content = '404';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [loading, loadError, tour]);

  // When a user navigates from the last stop via the "Conclusion" button,
  // the URL carries #conclusion — auto-reveal the "Mark Tour Complete"
  // button so they don't have to hunt for the "I've read the conclusion" link.
  useEffect(() => {
    if (window.location.hash === '#conclusion') {
      setConclusionRead(true);
    }
  }, [tourId]);

  // Community amenity add-ons (restrooms, food, sites to see, etc.) — loaded
  // once per tour and refreshed after a create/delete via onAmenitiesChanged.
  const loadAmenities = async () => {
    if (!tourId) return;
    try {
      const res = await base44.entities.TourAmenity.filter({ tour_id: tourId }, { sort: '-created_date', limit: 200 });
      const arr = res.items || res;
      setAmenities(Array.isArray(arr) ? arr : []);
    } catch (e) {
      setAmenities([]);
    }
  };
  useEffect(() => { loadAmenities(); }, [tourId]);

  const loadTour = async () => {
    const version = ++loadVersionRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const snapshot = await readTourSnapshot(tourId);
      if (version !== loadVersionRef.current) return;
      setTour(snapshot.tour);
      setStops(snapshot.stops);
      setIsFavorite(snapshot.favorite);
      setIsCompleted(snapshot.completed);
      setConclusionRead(snapshot.completed || window.location.hash === '#conclusion');
    } catch (error) {
      if (version !== loadVersionRef.current) return;
      const cached = getOfflineTour(tourId);
      if (cached) {
        setTour(cached.tour);
        const order = s => s.stop_type === 'parking' ? -2 : s.stop_type === 'shuttle' ? -1 : (s.stop_number || 0);
        setStops((cached.stops || []).slice().sort((a, b) => order(a) - order(b)));
      } else {
        setTour(null);
        setStops([]);
        setLoadError(error?.message || 'This tour could not be loaded. Please try again.');
      }
    }
    if (version !== loadVersionRef.current) return;
    setIsOfflineCached(isTourOffline(tourId));
    const offline = getOfflineTour(tourId);
    if (offline?.tour?._offline_level && offline.tour._offline_level !== 'free') {
      setNarrationLengthState(offline.tour._offline_level);
    }
    setLoading(false);
  };

  const generateStops = async (tourData) => {
    if (activeBuilds.has(tourData.id)) return;
    activeBuilds.add(tourData.id);
    setGeneratingStops(true);
    setStopsError('');
    try {
      const gate = await checkManifestationGate();
      if (!gate.allowed) throw new Error(gate.reason === 'energy'
        ? "You're out of manifestation energy. Buy an Aura Bundle or upgrade your plan."
        : 'Upgrade to a paid plan to generate tour stops.');
      const result = await buildTourStops(tourData);
      if (tourData.id !== tourId) return;
      setTour(result.tour);
      setStops(result.stops);
    } catch (error) {
      setStopsError(error?.response?.data?.error || error.message || 'The build could not be completed.');
    } finally {
      activeBuilds.delete(tourData.id);
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
    // When walking-only is active, drag indices refer to the walking-only
    // sublist. Reorder just the walking stops, then append driving stops at
    // the end in their original relative order (driving stops are always last).
    let reordered;
    if (travelMode === 'walking') {
      const walkingStops = currentTourStops.filter(s => s.travel_method !== 'driving');
      const drivingStops = currentTourStops.filter(s => s.travel_method === 'driving');
      reordered = Array.from(walkingStops);
      const [removed] = reordered.splice(result.source.index, 1);
      reordered.splice(result.destination.index, 0, removed);
      reordered = [...reordered, ...drivingStops];
    } else {
      reordered = Array.from(currentTourStops);
      const [removed] = reordered.splice(result.source.index, 1);
      reordered.splice(result.destination.index, 0, removed);
    }
    const withNumbers = reordered.map((s, i) => ({ ...s, stop_number: i + 1 }));
    setStops([...(currentParking ? [currentParking] : []), ...withNumbers]);
    for (const s of withNumbers) {
      await base44.entities.TourStop.update(s.id, { stop_number: s.stop_number });
    }
    // Remember that the user customized the stop order so we don't re-sort by
    // proximity on next load. manual_reorder is permanent — it takes
    // precedence over pin-validation auto-reordering so the custom order is
    // always respected, even after all stops are validated.
    // Also sync start_location_name to the new first stop.
    try {
      const newFirstName = withNumbers[0]?.name;
      const updateData = { user_reordered: true, manual_reorder: true };
      if (newFirstName && newFirstName !== tour.start_location_name) updateData.start_location_name = newFirstName;
      await base44.entities.Tour.update(tourId, updateData);
      setTour(prev => prev ? { ...prev, ...updateData } : prev);
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
    const draggedStop = stops.find(s => s.id === stopId);
    // A validated tour's lot is locked: its route was validated around that
    // spot, so the parking pin cannot be moved at all.
    if (draggedStop?.stop_type === 'parking' && tour.verified === true) {
      toast({
        title: 'Parking Spot Locked',
        description: 'This tour is fully validated, so its parking spot can no longer be moved.',
      });
      return;
    }
    userDraggedRef.current = true;
    // A parking move is a tour-level change, not a stop edit: the lot is where
    // the route starts, so its details are confirmed with it and the stops are
    // re-ordered from the new spot. Every other pin keeps its stop in place and
    // leaves the order alone. Nothing is written until the details are
    // confirmed — the pin follows the finger meanwhile, and Cancel puts it back.
    if (draggedStop?.stop_type === 'parking') {
      setStops(prev => prev.map(s => (s.id === stopId ? { ...s, latitude: latLng.lat, longitude: latLng.lng } : s)));
      setParkingMove({
        stopId,
        lat: latLng.lat,
        lng: latLng.lng,
        previousLat: draggedStop.latitude,
        previousLng: draggedStop.longitude,
      });
      return;
    }
    // Compute updated stops with the new coordinates
    const updatedStops = stops.map(s =>
      s.id === stopId
        ? { ...s, latitude: latLng.lat, longitude: latLng.lng, needs_placement: false, geocoded: true }
        : s
    );
    // A drag only places the pin. Verification belongs to the validate button,
    // so nothing here marks the stop — or the tour — as verified.
    try {
      await placeStopLocation(stopId, tourId, latLng.lat, latLng.lng);
    } catch (e) {
      console.error('Failed to update stop coordinates:', e);
    }
    // SACRED PINS: The user placed this pin deliberately — never move it.
    // While the user is actively on the tour validating pins, do NOT reorder
    // stops — it would be confusing mid-tour (they need to finish hitting all
    // stops in the current order). Just update travel_method (walking/driving)
    // based on the new coordinates, preserving the current stop order and
    // stop numbers. Coordinates are never changed.
    //
    // Placement never completes validation, so the order stays frozen for the
    // rest of this session. A validated tour is never auto-reordered anyway.
    const pStop = updatedStops.find(s => s.stop_type === 'parking');
    const sStop = updatedStops.find(s => s.stop_type === 'shuttle');
    const tourStopsOnly = updatedStops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
    const parkingCoords = pStop?.latitude != null && !pStop.needs_placement ? { lat: pStop.latitude, lon: pStop.longitude } : null;
    const updated = await enforceWalkingDistance(tourStopsOnly, tour.tour_type, { lat: tour.start_latitude, lon: tour.start_longitude }, { walkingLimit: getWalkingLimit(tour), tourCategory: tour.tour_category, parkingCoords, preserveOrder: true });
    for (const s of updated) {
      const existing = tourStopsOnly.find(ts => ts.id === s.id);
      if (existing && existing.travel_method !== s.travel_method) {
        try { await base44.entities.TourStop.update(s.id, { travel_method: s.travel_method }); } catch (e) {}
      }
    }
    // Auto-correct tour type if stops are now a mix of walking + driving
    const methods = new Set(updated.map(s => s.travel_method));
    const correctedType = methods.has('driving') && methods.has('walking') ? 'mixed'
      : methods.has('driving') ? 'driving' : 'walking';
    if (correctedType !== tour.tour_type) {
      try {
        await base44.entities.Tour.update(tourId, { tour_type: correctedType });
        setTour(prev => prev ? { ...prev, tour_type: correctedType } : prev);
      } catch (e) {}
    }
    // Keep stops in their current order — do NOT reorder during validation
    const sortedByNumber = updated.sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0));
    setStops([...(pStop ? [pStop] : []), ...(sStop ? [sStop] : []), ...sortedByNumber]);
    // After all stops are validated, clear user_reordered so the next tour
    // load reorders by proximity (optimal loop for future investigators).
    // Until then, preserve the current order for the active tour session.
    // EXCEPTION: If the user/admin manually reordered via the drag-and-drop
    // list (manual_reorder: true), NEVER clear user_reordered — their custom
    // order is permanent and takes precedence over proximity auto-reordering.
    try {
      const updateData = { user_reordered: true };
      await base44.entities.Tour.update(tourId, updateData);
      setTour(prev => prev ? { ...prev, user_reordered: updateData.user_reordered } : prev);
    } catch (e) {}
  };

  // Confirm a parking move: the new location, the lot's confirmed details and
  // the re-ordered route are written together (see lib/parkingChange).
  const confirmParkingMove = async (details) => {
    if (!parkingMove || !tour) return;
    setParkingSaving(true);
    try {
      const result = await changeParkingLocation({
        tour,
        stops,
        parkingStopId: parkingMove.stopId,
        latitude: parkingMove.lat,
        longitude: parkingMove.lng,
        details,
        userId: user?.id,
        walkingLimit: getWalkingLimit(tour),
      });
      const movedParking = stops.find(s => s.id === parkingMove.stopId);
      const shuttleData = stops.find(s => s.stop_type === 'shuttle');
      setStops([
        ...(movedParking ? [{ ...movedParking, ...result.parking }] : []),
        ...(shuttleData ? [shuttleData] : []),
        ...result.reordered,
      ]);
      setTour(prev => (prev ? { ...prev, ...result.tourUpdates } : prev));
      setParkingMove(null);
      toast({
        title: 'Parking Updated',
        description: result.orderIsFinal
          ? 'The lot now matches this spot, with the validated tour order unchanged.'
          : 'The stops have been re-ordered from your new parking spot.',
      });
    } catch (e) {
      toast({ title: 'Parking Update Failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    }
    setParkingSaving(false);
  };

  // Cancel puts the pin back where it was — nothing has been written yet.
  const cancelParkingMove = () => {
    if (!parkingMove) return;
    setStops(prev => prev.map(s => (
      s.id === parkingMove.stopId
        ? { ...s, latitude: parkingMove.previousLat, longitude: parkingMove.previousLng }
        : s
    )));
    setParkingMove(null);
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
      setStopSearchName('');
      // Reload and re-order all stops with the new stop included
      const allStops = await base44.entities.TourStop.filter({ tour_id: tourId });
      const pStop = allStops.find(s => s.stop_type === 'parking');
      const sStop = allStops.find(s => s.stop_type === 'shuttle');
      const tStops = allStops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
      const pCoords = pStop?.latitude != null && !pStop.needs_placement ? { lat: pStop.latitude, lon: pStop.longitude } : null;
      const reordered = await enforceWalkingDistance(tStops, tour.tour_type, { lat: tour.start_latitude, lon: tour.start_longitude }, { walkingLimit: getWalkingLimit(tour), tourCategory: tour.tour_category, parkingCoords: pCoords });
      for (const s of reordered) {
        const existing = tStops.find(ts => ts.id === s.id);
        if (existing && (existing.stop_number !== s.stop_number || existing.travel_method !== s.travel_method)) {
          try { await base44.entities.TourStop.update(s.id, { stop_number: s.stop_number, travel_method: s.travel_method }); } catch (e) {}
        }
      }
      // Sync start_location_name if the first stop changed after adding
      const newFirstName = reordered[0]?.name;
      if (newFirstName && newFirstName !== tour.start_location_name) {
        try {
          await base44.entities.Tour.update(tourId, { start_location_name: newFirstName });
          setTour(prev => prev ? { ...prev, start_location_name: newFirstName } : prev);
        } catch (e) {}
      }
      setStops([...(pStop ? [pStop] : []), ...(sStop ? [sStop] : []), ...reordered]);
    } catch (e) {
      setStopsError(e.message || 'Failed to add stop. Please try again.');
    }
    setAddingStop(false);
  };

  const parkingStop = stops.find(s => s.stop_type === 'parking');
  const parkingLot = parkingDisplay(parkingStop);
  const shuttleStop = stops.find(s => s.stop_type === 'shuttle');
  const tourStops = stops.filter(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle');
  const accessFilteredStops = tour?.access_type === 'interior_only'
    ? tourStops.filter(s => s.access_area === 'interior')
    : tour?.access_type === 'exterior_only'
    ? tourStops.filter(s => s.access_area === 'exterior')
    : tourStops;
  const hasDrivingStops = accessFilteredStops.some(s => s.travel_method === 'driving');
  const visibleTourStops = travelMode === 'walking' && hasDrivingStops
    ? accessFilteredStops.filter(s => s.travel_method !== 'driving')
    : accessFilteredStops;
  const isFiltered = (tour?.access_type === 'interior_only' || tour?.access_type === 'exterior_only') || (travelMode === 'walking' && hasDrivingStops);
  const displayStops = [...(parkingStop ? [parkingStop] : []), ...(shuttleStop ? [shuttleStop] : []), ...accessFilteredStops];
  const mapStops = travelMode === 'walking' && hasDrivingStops
    ? displayStops.filter(s => s.stop_type === 'parking' || s.stop_type === 'shuttle' || s.travel_method !== 'driving')
    : displayStops;

  // Start Location reflects the CURRENT first stop after any reordering
  // (proximity auto-sort or manual drag), not the static field set at tour
  // creation time — which goes stale when stops are reordered.
  const firstOrderedStop = [...tourStops].sort((a, b) => (a.stop_number || 0) - (b.stop_number || 0))[0];
  const effectiveStartLocation = firstOrderedStop?.name || tour?.start_location_name;

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

  if (loadError) {
    return (
      <PageContainer>
        <SectionHeader title="Could Not Load Tour" showBack />
        <div className="p-6 space-y-4 text-center">
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <button onClick={loadTour} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground text-sm">Try Again</button>
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
        belowSubtitle={
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between gap-2">
              <TourCategoryBadge category={tour.tour_category} />
              <button
                onClick={() => setAmenitySheetOpen(true)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                title="Field Stops — community-shared restrooms, food, gas & more"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span className="text-[11px] font-heading uppercase tracking-wider">Field Stops</span>
                {amenities.length > 0 && (
                  <span className="text-[9px] font-mono bg-primary/20 px-1.5 rounded-full">{amenities.length}</span>
                )}
              </button>
            </div>
            {(tour.tour_category === 'landmark' || tour.tour_category === 'cold_spot') && (
              <TourTypeSelector value={tour.access_type} onChange={handleAccessTypeChange} />
            )}
          </div>
        }
      />

      <div className="px-4 pb-28 space-y-4 pt-3">
        <div className="p-4 rounded-xl border border-border/40 bg-card/40 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <VerificationBadge verified={tour.verified} />
            {user?.role === 'admin' && (
              <span className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground/60 border border-border/40 rounded px-1.5 py-0.5">
                Content v{tour.content_version || 0}
              </span>
            )}
            <NarrationToggle className="ml-auto" mode={narrationMode} setMode={setNarrationMode} canEnhance={canEnhance} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {tour.tour_type === 'walking' ? <Footprints className="w-3.5 h-3.5" /> : tour.tour_type === 'mixed' ? <><Footprints className="w-3.5 h-3.5" /><Car className="w-3 h-3" /></> : <Car className="w-3.5 h-3.5" />}
              {tour.tour_type === 'mixed' ? 'Walking + Driving' : tour.tour_type}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3.5 h-3.5" /> {computeAdjustedDuration(tour.estimated_duration, narrationLength, parkingStop ? 5 : 0, durationScale)}</span>
            {totalDistance > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Route className="w-3.5 h-3.5" /> {formatDistance(totalDistance)}</span>
            )}
          </div>
          <div className="flex items-start justify-between gap-3">
            <p className="text-log text-sm text-foreground/80 leading-relaxed">{displayDescription}</p>
            <button onClick={() => narrate(displayDescription, { audioKey: 'description' })} className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
              {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> <BePatient /></> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Narrate <EnergyCostBadge type="narration" mode={narrationMode} text={displayDescription} /></>}
            </button>
          </div>
          {tour.best_time && <p className="text-xs text-primary flex items-center gap-1"><Zap className="w-3 h-3" /> Best time: {tour.best_time}</p>}
          <NarrationLengthSelector value={narrationLength} onChange={handleNarrationLengthChange} estimatedDuration={tour.estimated_duration} />
          {hasDrivingStops && <TravelModeSelector value={travelMode} onChange={setTravelMode} />}
        </div>

        <TourBuildStatus status={tour.build_status} />
        <TourAddressCorrection
          tour={tour}
          stops={stops}
          onCorrected={async updates => {
            // A corrected stop takes its real place in the tour: the route
            // rules re-derive visit order and walking/driving from the new
            // coordinates, exactly as a build would.
            const corrected = applyAddressCorrections(stops, updates);
            setStops(corrected);
            try {
              const result = await reorderCorrectedStops(tour, corrected);
              if (result) {
                setStops(result.stops);
                if (Object.keys(result.tourUpdates).length) {
                  setTour(prev => (prev ? { ...prev, ...result.tourUpdates } : prev));
                }
              }
            } catch (e) {
              console.error('Re-ordering corrected stops failed:', e);
            }
          }}
        />

        <TourAccessInfo tour={tour} stops={stops} />

        {isOfflineCached && (
          <button
            onClick={handleRemoveOffline}
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-xs font-heading uppercase tracking-wider hover:bg-destructive/15 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove Offline Download
          </button>
        )}

        {tour.introduction && (
          <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-primary">Introduction</h3>
              <button onClick={() => narrate(displayIntroduction, { audioKey: 'intro' })} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> <BePatient /></> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Narrate <EnergyCostBadge type="narration" mode={narrationMode} text={displayIntroduction} /></>}
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
            <p className="text-sm text-foreground">{effectiveStartLocation}</p>
          </div>
        </div>

        {stops.length > 0 && <TourMap stops={mapStops} tour={tour} amenities={amenities} height="h-72" draggable={user?.role === 'admin' || isPaid} parkingLocked={tour.verified === true} onMarkerDragEnd={handleMarkerDragEnd} />}

        <div>
          <h3 className="font-heading text-xs font-semibold tracking-wider uppercase text-foreground mb-3 flex items-center gap-2">
            <Map className="w-4 h-4 text-primary" /> {visibleTourStops.length} Investigation Stops
          </h3>
          {tourStops.length > 0 && !tour.verified && !generatingStops && user?.role === 'admin' && (
            <RepairTourAction
              tour={tour}
              onRepaired={(result) => {
                if (result?.tour) setTour(prev => (prev ? { ...prev, ...result.tour } : prev));
                if (result?.stops) setStops(result.stops);
              }}
            />
          )}
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
            {tourStops.length === 0 && <TourBuildPrompt canBuild={user?.role === 'admin' || isPaid} onBuild={() => generateStops(tour)} />}
            {parkingStop && (
              <div
                onClick={() => navigate(`/stop/${parkingStop.id}`)}
                className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50 hover:bg-amber-500/10 transition-all group cursor-pointer mb-2"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 font-heading text-sm font-bold shrink-0 text-amber-400">P</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-amber-400 transition-colors">{parkingLot.name}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                    <MapPin className="w-2.5 h-2.5" /> <span className="truncate">{parkingLot.unplaced ? 'Location not confirmed yet' : (parkingLot.address || 'Parking')}</span>
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
                    {visibleTourStops.map((stop, i) => (
                      <Draggable key={stop.id} draggableId={stop.id} index={i}>
                        {(provided, snapshot) => (
                          <TourStopRow
                            key={stop.id}
                            stop={stop}
                            provided={provided}
                            isDragging={snapshot.isDragging}
                            onNavigate={() => navigate(`/stop/${stop.id}`)}
                            onNarrate={narrate}
                            isSpeaking={isSpeaking}
                            isGenerating={isGenerating}
                            narrationLength={narrationLength}
                            displayNumber={isFiltered ? i + 1 : stop.stop_number}
                          />
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            {visibleTourStops.length === 0 && tourStops.length > 0 && (
              <div className="flex flex-col items-center py-8 gap-3">
                <AlertTriangle className="w-10 h-10 text-yellow-500" />
                <p className="text-xs text-yellow-400 font-heading uppercase tracking-wider">
                  {tour.access_type === 'interior_only' ? 'No Interior Stops' : 'No Exterior Stops'}
                </p>
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  This tour has {tourStops.length} {tourStops.length === 1 ? 'stop' : 'stops'}, but{' '}
                  {tour.access_type === 'interior_only' ? 'none are interior' : 'none are exterior'}.
                  {' '}Your access filter is hiding {tourStops.length === 1 ? 'it' : 'them'}.
                </p>
                <button
                  onClick={() => handleAccessTypeChange('exterior_interior')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground font-heading text-xs uppercase tracking-wider transition-colors"
                >
                  Show All {tourStops.length} Stops
                </button>
              </div>
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
              <button onClick={() => { narrate(displayConclusion, { audioKey: 'conclusion' }); setConclusionRead(true); }} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dim-purple/10 border border-dim-purple/30 text-dim-purple text-[10px] font-heading uppercase tracking-wider hover:bg-dim-purple/20 transition-colors">
                {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> <BePatient /></> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Narrate <EnergyCostBadge type="narration" mode={narrationMode} text={displayConclusion} /></>}
              </button>
            </div>
            <p className="text-log text-xs text-foreground/70 leading-relaxed" onScroll={() => setConclusionRead(true)}>{displayConclusion}</p>
            <button onClick={() => setConclusionRead(true)} className="text-[10px] text-dim-purple/60 underline underline-offset-2 hover:text-dim-purple transition-colors">
              I've read the conclusion
            </button>
          </div>
        )}

        {(user?.role === 'admin' || isPaid) && (
          <ValidateTourCard
            tour={tour}
            stops={stops}
            userId={user?.id}
            onValidated={() => {
              setTour(prev => prev ? { ...prev, verified: true } : prev);
              setStops(prev => prev.map(s => s.stop_type !== 'parking' && s.stop_type !== 'shuttle' ? { ...s, user_verified: true } : s));
            }}
          />
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

      <AmenitySheet
        open={amenitySheetOpen}
        onOpenChange={setAmenitySheetOpen}
        tourId={tourId}
        amenities={amenities}
        onAmenitiesChanged={loadAmenities}
      />
      <UpgradePrompt show={showUpgrade} onClose={() => setShowUpgrade(false)} reason={gateReason} />
      {narrationAdGateEl}
      <ParkingChangeDialog
        open={!!parkingMove}
        parking={stops.find(s => s.id === parkingMove?.stopId)}
        onConfirm={confirmParkingMove}
        onCancel={cancelParkingMove}
        saving={parkingSaving}
      />
      <NavBar />
    </PageContainer>
  );
}