import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Clock, Volume2, VolumeX, Zap, Thermometer, Radio, Camera, ChevronLeft, ChevronRight, Ghost, Loader2, BookOpen, Navigation, Car, Info, DollarSign, ChevronDown, Crosshair, CheckCircle2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageContainer from '../components/PageContainer';
import SectionHeader from '../components/SectionHeader';
import TourMap from '../components/TourMap';
import useGhostVoice from '../hooks/useGhostVoice';
import StopComments from '../components/StopComments';
import HighlightPeople from '../components/HighlightPeople';
import PersonStoryDialog from '../components/PersonStoryDialog';
import { base44 } from '@/api/base44Client';
import { callJson } from '@/lib/llmJson';
import { getOfflineStop } from '@/lib/offlineTours';
import BePatient from '@/components/BePatient';
import AdGate from '@/components/AdGate';
import { useEnergyGate, checkManifestationGate, spendManifestationEnergy } from '@/hooks/useEnergyGate';
import UpgradePrompt from '@/components/UpgradePrompt';
import EnergyCostBadge from '@/components/EnergyCostBadge';
import { getNarrationLength, truncateText } from '@/lib/narrationLength';
import { useCondensedTexts } from '@/hooks/useCondensedTexts';
import { toast } from '@/components/ui/use-toast';
import { verifyStopLocation } from '@/lib/verifyStop';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

const isThinContent = (s) => !s || s.trim().length < 600;

const suggestionIcons = {
  'EVP Session': Radio,
  'Spirit Box Session': Radio,
  'EMF Sweep': Zap,
  'Trigger Object Experiment': Ghost,
  'Temperature Monitoring': Thermometer,
  'Photography': Camera,
};

export default function StopDetail() {
  const { stopId } = useParams();
  const navigate = useNavigate();
  const [stop, setStop] = useState(null);
  const [allStops, setAllStops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAccessInfo, setShowAccessInfo] = useState(false);
  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const { isSpeaking, isGenerating, narrate: rawNarrate } = useGhostVoice();
  const { gateNarration, spendNarration, estimateNarrationCost, showUpgrade, setShowUpgrade, gateReason, user, isPaid } = useEnergyGate();
  const isAdmin = user?.role === 'admin';
  const [verifying, setVerifying] = useState(false);

  // Gated narration wrapper — checks energy before speaking, toggles off for free.
  const narrate = (text, opts = {}) => {
    if (isSpeaking || isGenerating) { rawNarrate(text, opts); return; }
    if (!gateNarration(text)) return;
    rawNarrate(text, opts);
    spendNarration(estimateNarrationCost(text));
  };

  const [narrationLength] = useState(getNarrationLength());
  const condensed = useCondensedTexts({
    narration_text: stop?.narration_text,
    paranormal_info: stop?.paranormal_info,
    historical_info: stop?.historical_info,
  }, narrationLength);
  const displayNarrationText = condensed.narration_text || truncateText(stop?.narration_text, narrationLength);
  const displayParanormalInfo = condensed.paranormal_info || truncateText(stop?.paranormal_info, narrationLength);
  const displayHistoricalInfo = condensed.historical_info || truncateText(stop?.historical_info, narrationLength);

  // Lazily enrich a stop the first time it is viewed. Tour creation stores only
  // lightweight summaries, so the full rich historical/paranormal detail and
  // notable people are generated here per-stop (small, reliable calls) and
  // persisted. Stops that already have rich content only get people filled in.
  const ensureRichContent = async (currentStop) => {
    const gate = await checkManifestationGate();
    if (!gate.allowed) return;
    const needsFull = isThinContent(currentStop.historical_info) || isThinContent(currentStop.paranormal_info);
    if (!needsFull && currentStop.people && currentStop.people.length > 0) return;
    setPeopleLoading(true);
    try {
      let updates = {};
      let generatedPeople = [];
      if (needsFull) {
        const prompt = `Generate rich, detailed content for a single paranormal investigation stop.

Stop name: ${currentStop.name}
Address: ${currentStop.address || ''}
Existing notes: ${(currentStop.historical_info || '')} ${(currentStop.paranormal_info || '')}

Produce a JSON object with:
- historical_info: 4-5 DETAILED paragraphs covering construction dates and architecture, major historical events that occurred there, notable figures who lived/worked/visited/died there, scandals/murders/tragedies, and the area's significance over time. Include specific dates, full names, and documented events. Do not merely mention people — explain who they were, what happened to them, and why it matters.
- paranormal_info: 4-5 DETAILED paragraphs covering specific ghost sightings (with dates and eyewitness names when known), EVP recordings and their content, apparition descriptions (clothing, behavior, exact location), shadow figures, cold spots, poltergeist activity, residual vs intelligent hauntings, and local folklore. Include investigator testimonies and well-known paranormal events. Tell full ghost stories, not just names.
- people: array of { name, story }. Include EVERY notable person mentioned in historical_info or paranormal_info. "name" MUST appear verbatim (same spelling/casing) in the text so it can be highlighted. "story": 4-6 detailed sentences — who they were, their role, fate (how they died if relevant), and their paranormal connection (sightings, apparitions, EVPs, phenomena).

Use real history and paranormal lore for this location. Output ONLY a valid JSON object. No markdown fences, no commentary.`;
        let data = null;
        try { data = await callJson(prompt, { useWeb: true }); } catch (e) { console.error('Enrich (web) failed:', e); }
        if (!data) { try { data = await callJson(prompt, { useWeb: false }); } catch (e) { console.error('Enrich (no-web) failed:', e); } }
        if (data) {
          if (data.historical_info) updates.historical_info = data.historical_info;
          if (data.paranormal_info) updates.paranormal_info = data.paranormal_info;
          generatedPeople = (data.people || []).filter(p => p.name && p.story);
          if (generatedPeople.length) updates.people = generatedPeople;
        }
      } else {
        const prompt = `For the paranormal tour stop "${currentStop.name}", identify EVERY notable person mentioned in the historical and paranormal information. For each person, write a detailed account (4-6 sentences) of who they were, their role, what happened to them (including how they died if relevant), and their paranormal connection — the ghost stories, sightings, apparitions, EVPs, and phenomena associated with them. Only include people actually mentioned in the text. Each person's "name" MUST match exactly how they appear in the text so it can be highlighted.

Stop name: ${currentStop.name}
Historical information: ${currentStop.historical_info || ''}
Paranormal information: ${currentStop.paranormal_info || ''}

Return JSON with a "people" array, each item { name, story }. Output ONLY valid JSON. No markdown fences.`;
        let data = null;
        try { data = await callJson(prompt, { useWeb: false }); } catch (e) { console.error('People extract failed:', e); }
        if (data) {
          generatedPeople = (data.people || []).filter(p => p.name && p.story);
          if (generatedPeople.length) updates.people = generatedPeople;
        }
      }
      if (Object.keys(updates).length) {
        try { await base44.entities.TourStop.update(currentStop.id, updates); } catch (e) {}
        setStop(prev => ({ ...prev, ...updates }));
      }
      spendManifestationEnergy();
      setPeople(generatedPeople);
    } catch (e) {}
    setPeopleLoading(false);
  };

  useEffect(() => {
    loadStop();
    return () => { /* hook handles its own cleanup */ };
  }, [stopId]);

  const loadStop = async () => {
    setLoading(true);
    try {
      const results = await base44.entities.TourStop.filter({ id: stopId });
      if (results.length > 0) {
        const currentStop = results[0];
        setStop(currentStop);
        setPeople(currentStop.people || []);
        if (currentStop.stop_type !== 'parking' && (isThinContent(currentStop.historical_info) || isThinContent(currentStop.paranormal_info) || !currentStop.people || currentStop.people.length === 0)) ensureRichContent(currentStop);
        const siblings = await base44.entities.TourStop.filter({ tour_id: currentStop.tour_id });
        setAllStops(siblings.sort((a, b) => a.stop_number - b.stop_number));
        try {
          const tours = await base44.entities.Tour.filter({ id: currentStop.tour_id });
          await base44.auth.updateMe({
            last_tour_id: currentStop.tour_id,
            last_stop_id: currentStop.id,
            last_stop_number: currentStop.stop_number,
            last_stop_name: currentStop.name,
            last_tour_title: tours[0]?.title || '',
          });
        } catch (e) {}
      }
    } catch (err) {
      const cached = getOfflineStop(stopId);
      if (cached) {
        setStop(cached.stop);
        setPeople(cached.stop.people || []);
        setAllStops((cached.allStops || []).sort((a, b) => a.stop_number - b.stop_number));
      }
    }
    setLoading(false);
  };

  const currentIndex = allStops.findIndex(s => s.id === stopId);
  const prevStop = currentIndex > 0 ? allStops[currentIndex - 1] : null;
  const nextStop = currentIndex < allStops.length - 1 ? allStops[currentIndex + 1] : null;
  const isLastStop = currentIndex === allStops.length - 1 && allStops.length > 0;

  const openInMaps = () => {
    if (!stop?.latitude || !stop?.longitude) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`, '_blank');
  };

  // Paid users mark their current GPS position as the best vantage point.
  // Admins can also drag the map marker to set the exact location.
  const handleMarkVantagePoint = async () => {
    if (!navigator.geolocation) {
      toast({ title: 'GPS Unavailable', description: 'Your device does not support GPS.', variant: 'destructive' });
      return;
    }
    setVerifying(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const result = await verifyStopLocation(stop.id, stop.tour_id, latitude, longitude, user?.id);
          setStop(prev => ({ ...prev, latitude, longitude, user_verified: true }));
          toast({
            title: 'Vantage Point Marked!',
            description: result.allVerified
              ? 'All stops validated — tour is now fully validated!'
              : 'Stop location validated. Keep going!',
          });
        } catch (e) {
          toast({ title: 'Verification Failed', description: e?.message || 'Please try again.', variant: 'destructive' });
        }
        setVerifying(false);
      },
      () => {
        toast({ title: 'Location Access Denied', description: 'Enable location permissions to mark this vantage point.', variant: 'destructive' });
        setVerifying(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleMarkerDragEnd = async (latlng) => {
    try {
      const result = await verifyStopLocation(stop.id, stop.tour_id, latlng.lat, latlng.lng, user?.id);
      setStop(prev => ({ ...prev, latitude: latlng.lat, longitude: latlng.lng, user_verified: true }));
      toast({
        title: 'Position Saved',
        description: result.allVerified
          ? 'All stops validated — tour is now fully validated!'
          : 'Stop location validated by admin.',
      });
    } catch (e) {
      toast({ title: 'Save Failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    }
  };

  if (loading || !stop) {
    return (
      <PageContainer>
        <SectionHeader title="Loading Stop" showBack />
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </PageContainer>
    );
  }

  if (stop.stop_type === 'parking') {
    const handleParkingDetailChange = async (field, value) => {
      try {
        await base44.entities.TourStop.update(stop.id, { [field]: value });
        setStop(prev => ({ ...prev, [field]: value }));
      } catch (e) {
        toast({ title: 'Update failed', variant: 'destructive' });
      }
    };

    return (
      <PageContainer>
        <SectionHeader
          title="Parking"
          subtitle={stop.name}
          showBack
          onBack={() => navigate(`/tour/${stop.tour_id}`)}
        />
        <div className="px-4 pb-28 space-y-4 pt-3">
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 shrink-0">
                <span className="font-heading text-base font-bold text-amber-400">P</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-heading uppercase tracking-wider text-amber-400">Parking Area</p>
                <p className="text-sm text-foreground truncate">{stop.name}</p>
              </div>
              {stop.user_verified && <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />}
            </div>
            {stop.address && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0" /> {stop.address}
              </p>
            )}
          </div>

          <div className="p-4 rounded-xl border border-border/40 bg-card/40 space-y-3">
            <div>
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">Parking Type</p>
              <Select
                value={stop.parking_type || ''}
                onValueChange={(val) => handleParkingDetailChange('parking_type', val)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select parking type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="street">Street Parking</SelectItem>
                  <SelectItem value="parking_lot">Parking Lot</SelectItem>
                  <SelectItem value="parking_garage">Parking Garage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">Parking Cost</p>
              <Input
                value={stop.parking_cost || ''}
                onChange={(e) => handleParkingDetailChange('parking_cost', e.target.value)}
                placeholder="e.g., Free, Metered ($1.50/hr), $5 flat rate"
                className="w-full"
              />
            </div>
          </div>

          {isPaid && !stop.user_verified && (
            <div className="p-3 rounded-xl border border-primary/30 bg-primary/5">
              <button
                onClick={handleMarkVantagePoint}
                disabled={verifying}
                className="w-full flex flex-col items-center gap-1 py-3 rounded-lg bg-primary/15 border border-primary/40 text-primary font-heading text-sm uppercase tracking-wider hover:bg-primary/25 transition-colors disabled:opacity-60"
              >
                {verifying ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> <span>Getting GPS Location...</span></>
                ) : (
                  <><Crosshair className="w-5 h-5" /> <span>Mark Best Parking Spot</span></>
                )}
              </button>
              <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                {verifying ? 'Locking onto your GPS signal...' : 'Stand at the parking spot, then tap to confirm its location'}
              </p>
            </div>
          )}
          {stop.user_verified && (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-green-500/30 bg-green-500/5">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <div>
                <p className="text-xs font-heading uppercase tracking-wider text-green-400">Parking Spot Validated</p>
                <p className="text-[10px] text-muted-foreground">A visitor confirmed this parking location</p>
              </div>
            </div>
          )}

          {stop.latitude && stop.longitude && (
            <TourMap stops={[stop]} height="h-52" draggable={isAdmin} onMarkerDragEnd={handleMarkerDragEnd} />
          )}
          {isAdmin && (
            <p className="text-[10px] text-amber-400/70 text-center">Admin: drag the map marker to adjust the exact location</p>
          )}

          <button onClick={openInMaps} className="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-heading uppercase tracking-wider hover:bg-amber-500/20 transition-colors">
            <Navigation className="w-4 h-4" /> Navigate to Parking
          </button>

          <div className="flex items-center gap-2">
            <button onClick={() => prevStop && navigate(`/stop/${prevStop.id}`)} disabled={!prevStop} className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-border/40 bg-card/30 text-sm font-heading uppercase tracking-wider disabled:opacity-30 hover:border-primary/30 transition-colors">
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <button onClick={() => nextStop && navigate(`/stop/${nextStop.id}`)} disabled={!nextStop} className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/10 text-primary text-sm font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-30">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader
        title={`Stop ${stop.stop_number}`}
        subtitle={stop.name}
        showBack
        onBack={() => navigate(`/tour/${stop.tour_id}`)}
        rightAction={
          <button onClick={() => narrate(displayNarrationText || displayParanormalInfo)} className="p-2 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors">
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        }
      />

      <div className="px-4 pb-28 space-y-4 pt-3">
        <div className="p-4 rounded-xl border border-border/40 bg-card/40">
          <h2 className="font-heading text-lg font-bold text-foreground mb-2">{stop.name}</h2>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {stop.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {stop.address}</span>}
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {stop.estimated_investigation_time}</span>
            {stop.construction_date && <span className="flex items-center gap-1">Est. {stop.construction_date}</span>}
            {stop.travel_method === 'driving' && <span className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded"><Car className="w-3 h-3" /> Driving Stop</span>}
          </div>
          {(stop.hours_of_operation || stop.entry_fee) && (
            <div className="mt-2">
              <button onClick={() => setShowAccessInfo(!showAccessInfo)} className="w-full flex items-center justify-between p-2 rounded-lg bg-amber-500/5 border border-amber-500/15 hover:border-amber-500/30 transition-colors">
                <div className="flex items-center gap-2">
                  {stop.entry_fee ? <DollarSign className="w-3.5 h-3.5 text-green-400" /> : <Info className="w-3.5 h-3.5 text-amber-400" />}
                  <span className="text-[10px] font-heading uppercase tracking-wider text-amber-400">Access Info</span>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-amber-400 transition-transform ${showAccessInfo ? 'rotate-180' : ''}`} />
              </button>
              {showAccessInfo && (
                <div className="mt-1 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 space-y-2">
                  {stop.hours_of_operation && (
                    <div>
                      <p className="text-[10px] font-heading uppercase tracking-wider text-amber-400 mb-0.5">Hours of Operation</p>
                      <p className="text-xs text-foreground/70">{stop.hours_of_operation}</p>
                    </div>
                  )}
                  {stop.entry_fee && (
                    <div>
                      <p className="text-[10px] font-heading uppercase tracking-wider text-green-400 mb-0.5">Entry Fee</p>
                      <p className="text-xs text-foreground/70">{stop.entry_fee}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {stop.famous_people && <p className="text-xs text-primary/80 mt-2">Notable: {stop.famous_people}</p>}
          <button onClick={openInMaps} className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors w-full justify-center">
            <Navigation className="w-3.5 h-3.5" /> Navigate to This Stop
          </button>
        </div>

        {isPaid && !stop.user_verified && (
          <div className="p-3 rounded-xl border border-primary/30 bg-primary/5">
            <button
              onClick={handleMarkVantagePoint}
              disabled={verifying}
              className="w-full flex flex-col items-center gap-1 py-3 rounded-lg bg-primary/15 border border-primary/40 text-primary font-heading text-sm uppercase tracking-wider hover:bg-primary/25 transition-colors disabled:opacity-60"
            >
              {verifying ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> <span>Getting GPS Location...</span></>
              ) : (
                <><Crosshair className="w-5 h-5" /> <span>Mark Best Vantage Point</span></>
              )}
            </button>
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              {verifying ? 'Locking onto your GPS signal...' : 'Stand at the best viewing spot, then tap to mark your exact location'}
            </p>
          </div>
        )}
        {stop.user_verified && (
          <div className="flex items-center gap-2 p-3 rounded-xl border border-green-500/30 bg-green-500/5">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <div>
              <p className="text-xs font-heading uppercase tracking-wider text-green-400">Location Validated</p>
              <p className="text-[10px] text-muted-foreground">A visitor confirmed this vantage point</p>
            </div>
          </div>
        )}
        {stop.latitude && stop.longitude && (
          <TourMap stops={[stop]} highlightedStopId={stop.id} height="h-52" draggable={isAdmin} onMarkerDragEnd={handleMarkerDragEnd} />
        )}
        {isAdmin && (
          <p className="text-[10px] text-amber-400/70 text-center">Admin: drag the map marker to adjust the exact location</p>
        )}

        {stop.narration_text && (
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Ghost className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-heading uppercase tracking-wider text-primary">Ghost Story</span>
              </div>
              <button onClick={() => narrate(displayNarrationText)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> <BePatient /></> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Play <EnergyCostBadge type="narration" text={displayNarrationText} /></>}
              </button>
            </div>
            <p className="text-log text-xs text-foreground/70 leading-relaxed italic">"{displayNarrationText}"</p>
          </div>
        )}

        <Tabs defaultValue="history" className="w-full">
          <TabsList className="w-full bg-card/50 border border-border/40">
            <TabsTrigger value="history" className="flex-1 text-xs font-heading uppercase tracking-wider data-[state=active]:bg-primary/10 data-[state=active]:text-primary">History</TabsTrigger>
            <TabsTrigger value="paranormal" className="flex-1 text-xs font-heading uppercase tracking-wider data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Paranormal</TabsTrigger>
            <TabsTrigger value="investigate" className="flex-1 text-xs font-heading uppercase tracking-wider data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Investigate</TabsTrigger>
          </TabsList>
          <TabsContent value="paranormal" className="mt-3">
            <AdGate stopNumber={stop.stop_number}>
              <div className="p-4 rounded-xl border border-border/40 bg-card/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-heading uppercase tracking-wider text-primary">Paranormal Findings</span>
                  <button onClick={() => narrate(displayParanormalInfo)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                    {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> <BePatient /></> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Play <EnergyCostBadge type="narration" text={displayParanormalInfo} /></>}
                  </button>
                </div>
                <p className="text-log text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                  <HighlightPeople
                    text={displayParanormalInfo}
                    people={people}
                    onPerson={(p) => { setSelectedPerson(p); narrate(p.story); }}
                  />
                </p>
                {peopleLoading && (
                  <p className="text-[10px] text-muted-foreground mt-2 italic animate-glow-pulse">Be Patient: {isThinContent(stop.paranormal_info) ? 'Loading detailed findings…' : 'Extracting notable figures…'}</p>
                )}
                {people.length > 0 && !peopleLoading && (
                  <p className="text-[10px] text-sky-400/70 mt-2">Tap a highlighted name to reveal their story.</p>
                )}
              </div>
            </AdGate>
          </TabsContent>
          <TabsContent value="history" className="mt-3">
            <div className="p-4 rounded-xl border border-border/40 bg-card/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-heading uppercase tracking-wider text-primary">Historical Background</span>
                <button onClick={() => narrate(displayHistoricalInfo)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                  {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> <BePatient /></> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Play <EnergyCostBadge type="narration" text={displayHistoricalInfo} /></>}
                </button>
              </div>
              <p className="text-log text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{displayHistoricalInfo}</p>
              {peopleLoading && isThinContent(stop.historical_info) && (
                <p className="text-[10px] text-muted-foreground mt-2 italic animate-glow-pulse">Be Patient: Loading detailed history…</p>
              )}
            </div>
          </TabsContent>
          <TabsContent value="investigate" className="mt-3">
            <div className="p-4 rounded-xl border border-border/40 bg-card/30 space-y-3">
              <button onClick={() => navigate('/toolkit')} className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-primary/40 bg-primary/15 text-primary text-sm font-heading uppercase tracking-wider hover:bg-primary/25 transition-colors">
                <Navigation className="w-4 h-4" /> Investigation Toolkit
              </button>
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-heading uppercase tracking-wider text-primary">Investigation Suggestions</h4>
                <button onClick={() => narrate(truncateText(stop.investigation_suggestions?.join('. ') + '. Estimated investigation time: ' + stop.estimated_investigation_time + '.', narrationLength))} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                  {isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> <BePatient /></> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Play <EnergyCostBadge type="narration" text={truncateText(stop.investigation_suggestions?.join('. ') + '. Estimated investigation time: ' + stop.estimated_investigation_time + '.', narrationLength)} /></>}
                </button>
              </div>
              {stop.investigation_suggestions?.map((suggestion, i) => {
                const IconComp = suggestionIcons[suggestion] || Zap;
                return (
                  <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/30 border border-border/30">
                    <div className="p-1.5 rounded-md bg-primary/10"><IconComp className="w-4 h-4 text-primary" /></div>
                    <span className="text-sm text-foreground">{suggestion}</span>
                  </div>
                );
              })}
              <div className="mt-3 p-2.5 rounded-lg bg-accent/10 border border-accent/20">
                <p className="text-[10px] font-heading uppercase tracking-wider text-accent-foreground mb-1">Estimated Time</p>
                <p className="text-sm text-foreground">{stop.estimated_investigation_time}</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <StopComments stopId={stopId} tourId={stop.tour_id} />

        <div className="flex items-center gap-2">
          <button onClick={() => prevStop && navigate(`/stop/${prevStop.id}`)} disabled={!prevStop} className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-border/40 bg-card/30 text-sm font-heading uppercase tracking-wider disabled:opacity-30 hover:border-primary/30 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <button onClick={() => {
            if (nextStop) navigate(`/stop/${nextStop.id}`);
            else if (isLastStop) navigate(`/tour/${stop.tour_id}#conclusion`);
          }} className="flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border border-primary/30 bg-primary/10 text-primary text-sm font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
            {isLastStop ? 'Conclusion' : 'Next'} <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button onClick={() => navigate(`/evidence/new?tourId=${stop.tour_id}&stopId=${stop.id}&location=${encodeURIComponent(stop.name)}`)} className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dim-purple/30 bg-dim-purple/10 text-dim-purple text-sm font-heading uppercase tracking-wider hover:bg-dim-purple/20 transition-colors">
          <BookOpen className="w-4 h-4" /> Log Evidence at This Stop
        </button>
      </div>
      <PersonStoryDialog
        person={selectedPerson}
        open={!!selectedPerson}
        onOpenChange={(o) => { if (!o) setSelectedPerson(null); }}
        isGenerating={isGenerating}
        isSpeaking={isSpeaking}
        onNarrate={() => selectedPerson && narrate(selectedPerson.story)}
      />
      <UpgradePrompt show={showUpgrade} onClose={() => setShowUpgrade(false)} reason={gateReason} />
    </PageContainer>
  );
}