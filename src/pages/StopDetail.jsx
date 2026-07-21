import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Clock, Volume2, VolumeX, Zap, Thermometer, Radio, Camera, ChevronLeft, ChevronRight, Ghost, Loader2, BookOpen, Navigation, Car, Info, DollarSign, ChevronDown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import TourMap from '../components/TourMap';
import useGhostVoice from '../hooks/useGhostVoice';
import StopComments from '../components/StopComments';
import HighlightPeople from '../components/HighlightPeople';
import PersonStoryDialog from '../components/PersonStoryDialog';
import { base44 } from '@/api/base44Client';
import { getOfflineStop } from '@/lib/offlineTours';

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
  const { isSpeaking, isGenerating, narrate } = useGhostVoice();

  // For existing tours created before the "people" feature, extract notable
  // figures on first view and persist them to the stop so it only runs once.
  const ensurePeople = async (currentStop) => {
    if (!currentStop.paranormal_info && !currentStop.historical_info) return;
    setPeopleLoading(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `For the paranormal tour stop "${currentStop.name}", identify EVERY notable person mentioned in the historical and paranormal information. For each person, write a detailed account (4-6 sentences) of who they were, their role, what happened to them (including how they died if relevant), and their paranormal connection — the ghost stories, sightings, apparitions, EVPs, and phenomena associated with them. Only include people actually mentioned in the text. Each person's "name" MUST match exactly how they appear in the text so it can be highlighted.

Stop name: ${currentStop.name}
Historical information: ${currentStop.historical_info || ''}
Paranormal information: ${currentStop.paranormal_info || ''}

Return JSON with a "people" array, each item { name, story }.`,
        response_json_schema: {
          type: "object",
          properties: {
            people: {
              type: "array",
              items: {
                type: "object",
                properties: { name: { type: "string" }, story: { type: "string" } },
              },
            },
          },
        },
      });
      const generated = (result.people || []).filter(p => p.name && p.story);
      setPeople(generated);
      try { await base44.entities.TourStop.update(currentStop.id, { people: generated }); } catch (e) {}
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
        if (!currentStop.people || currentStop.people.length === 0) ensurePeople(currentStop);
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

  if (loading || !stop) {
    return (
      <PageContainer>
        <SectionHeader title="Loading Stop" showBack />
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
        <NavBar />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <SectionHeader
        title={`Stop ${stop.stop_number}`}
        subtitle={stop.name}
        showBack
        onBack={() => prevStop ? navigate(`/stop/${prevStop.id}`) : navigate(`/tour/${stop.tour_id}`)}
        rightAction={
          <button onClick={() => narrate(stop.narration_text || stop.paranormal_info)} className="p-2 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors">
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

        {stop.latitude && stop.longitude && (
          <TourMap stops={[stop]} highlightedStopId={stop.id} height="h-52" />
        )}

        {stop.narration_text && (
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Ghost className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-heading uppercase tracking-wider text-primary">Ghost Story</span>
              </div>
              <button onClick={() => narrate(stop.narration_text)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Play</>}
              </button>
            </div>
            <p className="text-xs text-foreground/70 leading-relaxed italic">"{stop.narration_text}"</p>
          </div>
        )}

        <Tabs defaultValue="history" className="w-full">
          <TabsList className="w-full bg-card/50 border border-border/40">
            <TabsTrigger value="history" className="flex-1 text-xs font-heading uppercase tracking-wider data-[state=active]:bg-primary/10 data-[state=active]:text-primary">History</TabsTrigger>
            <TabsTrigger value="paranormal" className="flex-1 text-xs font-heading uppercase tracking-wider data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Paranormal</TabsTrigger>
            <TabsTrigger value="investigate" className="flex-1 text-xs font-heading uppercase tracking-wider data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Investigate</TabsTrigger>
          </TabsList>
          <TabsContent value="paranormal" className="mt-3">
            <div className="p-4 rounded-xl border border-border/40 bg-card/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-heading uppercase tracking-wider text-primary">Paranormal Findings</span>
                <button onClick={() => narrate(stop.paranormal_info)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                  {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Play</>}
                </button>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                <HighlightPeople
                  text={stop.paranormal_info}
                  people={people}
                  onPerson={(p) => { setSelectedPerson(p); narrate(p.story); }}
                />
              </p>
              {peopleLoading && (
                <p className="text-[10px] text-muted-foreground mt-2 italic">Extracting notable figures…</p>
              )}
              {people.length > 0 && !peopleLoading && (
                <p className="text-[10px] text-sky-400/70 mt-2">Tap a highlighted name to reveal their story.</p>
              )}
            </div>
          </TabsContent>
          <TabsContent value="history" className="mt-3">
            <div className="p-4 rounded-xl border border-border/40 bg-card/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-heading uppercase tracking-wider text-primary">Historical Background</span>
                <button onClick={() => narrate(stop.historical_info)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                  {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Play</>}
                </button>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{stop.historical_info}</p>
            </div>
          </TabsContent>
          <TabsContent value="investigate" className="mt-3">
            <div className="p-4 rounded-xl border border-border/40 bg-card/30 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-heading uppercase tracking-wider text-primary">Investigation Suggestions</h4>
                <button onClick={() => narrate(stop.investigation_suggestions?.join('. ') + '. Estimated investigation time: ' + stop.estimated_investigation_time + '.')} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors">
                  {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : isSpeaking ? <><VolumeX className="w-3 h-3" /> Stop</> : <><Volume2 className="w-3 h-3" /> Play</>}
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
      <NavBar />
    </PageContainer>
  );
}