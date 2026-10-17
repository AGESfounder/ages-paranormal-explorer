import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Waves, Moon, Volume2, Wrench, Search, BookOpen, Shield, Cloud, Play, Pause, Mic, RefreshCw, Save, Clock, MapPin, ArrowLeft, ScanFace, Zap, Library, Type, MessageCircle, Gauge } from 'lucide-react';
import SLSCamera from '../components/SLSCamera';
import EnvironmentalAnomalyMonitor from '../components/EnvironmentalAnomalyMonitor';
import PhoneREMDevice from '../components/PhoneREMDevice';
import LocationTermBank from '../components/LocationTermBank';
import AlphabetSweeper from '../components/AlphabetSweeper';
import YesNoSweeper from '../components/YesNoSweeper';
import AcousticAnomalySweeper from '../components/AcousticAnomalySweeper';
import ToolkitGrid from '../components/ToolkitGrid';
import SiegConsole from '@/components/SiegConsole';
import ToolDevice from '../components/toolkit/ToolDevice';
import PageContainer from '../components/PageContainer';
import NavBar from '../components/NavBar';
import SectionHeader from '../components/SectionHeader';
import { base44 } from '@/api/base44Client';
import { getEffectivePlanId } from '@/lib/access';
import { withAppleLedger } from '@/lib/appleLedger';
import useAppResumeRefresh from '@/hooks/useAppResumeRefresh';
import { buildEvidenceContext, primeGPS } from '@/lib/evidenceContext';
import { useToolGpsSave } from '@/hooks/useToolGpsSave';
import ResearchDatabase from '../components/ResearchDatabase';
import useGhostVoice from '../hooks/useGhostVoice';
import useWakeLock from '../hooks/useWakeLock';
import { useEnergyGate } from '@/hooks/useEnergyGate';
import UpgradePrompt from '@/components/UpgradePrompt';
import NarrationToggle from '@/components/NarrationToggle';
import EnergyCostBadge from '@/components/EnergyCostBadge';
import { useNarrationMode } from '@/hooks/useNarrationMode';
import { canUseEnhanced } from '@/lib/narrationMode';
import EvidenceSaveButtons from '@/components/EvidenceSaveButtons';
import EvidenceSaveAdGate from '@/components/EvidenceSaveAdGate';
import { useEvidenceSaveGate } from '@/hooks/useEvidenceSaveGate';
import { useObserverNarrationGate } from '@/hooks/useObserverNarrationGate';
import ToolAdGate from '@/components/ToolAdGate';
import { useToolAdGate } from '@/hooks/useToolAdGate';
import { canAccessTool, needsToolAdGate, getToolRemaining } from '@/lib/toolAccess';
import { fetchWeatherByCoords as omFetchByCoords, fetchWeatherByLocation as omFetchByLocation } from '@/lib/openMeteo';
import { getWeatherFlavor } from '@/lib/weatherFlavor';
import { getDevicePosition } from '@/lib/deviceCapabilities';
import { useLocationTrackingGate } from '@/hooks/useLocationTrackingGate';
import { toast } from '@/components/ui/use-toast';

// Two-column grid order (fills left→right, row by row):
//   Col 1: Equipment Guide, Audio Recorder, Anomaly Camera, Vibration Communicator, Environmental Anomaly Monitor, Weather Monitor, Paranormal Research: Terms
//   Col 2: Acoustic Anomaly Sweeper, Terms Sweeper, Alphabet Sweeper, Yes/No/IDK Sweeper, SIEG, Moon Phase, Safety Protocol
const DEFAULT_TOOLS = [
  { name: 'Equipment Guide', icon: BookOpen, desc: 'Ghost hunting equipment guide', type: 'guide' },
  { name: 'Acoustic Anomaly Sweeper', icon: Volume2, desc: 'Listen-only room acoustics monitor — mic spectral analysis + video record', type: 'audio' },
  { name: 'Audio Recorder', icon: Waves, desc: 'EVP session recorder with save', type: 'recorder' },
  { name: 'Terms Sweeper', icon: Library, desc: 'Sweep location terms — environment-triggered spirit dictation + screen record', type: 'termbank' },
  { name: 'Anomaly Camera', icon: ScanFace, desc: 'Detect human-shaped figures in the live camera view', type: 'sls' },
  { name: 'Alphabet Sweeper', icon: Type, desc: 'Sweep A→Z — environment-triggered letter dictation + screen record', type: 'alphabet' },
  { name: 'Vibration Communicator', icon: Zap, desc: 'Detect energy disturbances via phone sensors + video record', type: 'rem' },
  { name: 'Yes/No/IDK Sweeper', icon: MessageCircle, desc: 'Sweep Yes · No · I Don\'t Know — motion-triggered answer + screen record', type: 'yesno' },
  { name: 'Environmental Anomaly Monitor', icon: Gauge, desc: 'Barometric + magnetic field meter — logs departures from the room baseline', type: 'environment' },
  // SIEG — Septer Inquiry Evidence Gleaner. The bay that was kept empty now holds
  // the integrated session tool: seven of the rack's tools run at once, over one
  // clock, and the whole screen is recorded as one file. Investigator and higher.
  { name: 'SIEG', icon: Gauge, stencil: 'SIEG', desc: 'Septer Inquiry Evidence Gleaner — 7 tools at once', type: 'sieg' },
  { name: 'Weather Monitor', icon: Cloud, desc: 'Real-time local weather conditions', type: 'weather' },
  { name: 'Moon Phase', icon: Moon, desc: 'Current moon phase & illumination', type: 'moon' },
  { name: 'Paranormal Research: Terms', icon: Search, desc: 'Comprehensive research database & field manual', type: 'research' },
  { name: 'Safety Protocol', icon: Shield, desc: 'Investigation safety guidelines', type: 'safety' },
];

// Tier-based tool access is canAccessTool() from @/lib/toolAccess.
// null = all tools. Mirrors TierToolsComparison.jsx.

// Names a tool used to be saved under in a user's toolkit_order, so renaming a
// tool doesn't silently drop that user's saved tile position.
const RENAMED_TOOLS = {
  'Radio Sweeper': 'Acoustic Anomaly Sweeper',
};

export default function Toolkit() {
  // useLocationTrackingGate must be instantiated before useToolGpsSave so
  // its requestLocation can be shared — otherwise useToolGpsSave creates its
  // own instance whose trackingOffDialog is never rendered, hanging saves
  // when Location Tracking is OFF.
  const { requestLocation: requestGps, trackingOffDialog } = useLocationTrackingGate();
  const { captureGpsForSave, gpsDialog } = useToolGpsSave(requestGps);
  const [activeTool, setActiveTool] = useState(null);
  const [adGateTool, setAdGateTool] = useState(null);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userPlan, setUserPlan] = useState(null);
  const [tools, setTools] = useState(DEFAULT_TOOLS);

  // Reorder DEFAULT_TOOLS to match a saved list of tool names, appending any
  // new tools that aren't in the saved order.
  const applyOrder = (defaults, order) => {
    const byName = Object.fromEntries(defaults.map(t => [t.name, t]));
    const ordered = (order || []).map(n => byName[RENAMED_TOOLS[n] || n]).filter(Boolean);
    const seen = new Set(ordered.map(t => t.name));
    defaults.forEach(t => { if (!seen.has(t.name)) ordered.push(t); });
    return ordered;
  };

  useEffect(() => primeGPS(), []);

  // Loads (or reloads) the signed-in user. The reload is what the tool ad gate
  // offers when the record could not be read: nothing can be credited to an
  // account the app cannot load, so an ad watched there is spent for nothing.
  const loadUser = async () => {
    try {
      // Attach Apple ledger rows so tool tier gating resolves the same
      // effective plan as the backend (fail-soft: bare user on error).
      const withLedger = await withAppleLedger(await base44.auth.me());
      setUser(withLedger);
      setIsAdmin(withLedger?.role === 'admin');
      setUserPlan(getEffectivePlanId(withLedger));
      setTools(applyOrder(DEFAULT_TOOLS, withLedger?.toolkit_order));
    } catch { /* the gate stays in its unavailable state */ }
  };

  useEffect(() => { loadUser(); }, []);

  // Re-read when the app returns to the foreground: tool access is decided on the
  // subscription state the server has now, not the one read when the page opened.
  useAppResumeRefresh(loadUser);

  // Gate tool access by tier — all 14 tools are visible, but tapping a tool
  // the user's plan doesn't include shows the upgrade prompt instead of opening it.
  const handleSelectTool = async (tool) => {
    // The reserved slot is a placeholder for a future tool — it opens nothing.
    if (tool.placeholder) return;
    if (isAdmin) { setActiveTool(tool); return; }
    // canAccessTool fails closed: a plan the app cannot resolve shows the upgrade
    // prompt rather than unlocking a tool the plan may not include.
    if (!canAccessTool(userPlan, tool.name)) {
      setGateReason('plan');
      setShowUpgrade(true);
      return;
    }
    // Ad-gate check: Observer users must watch a rewarded ad for ad-gated tools.
    // Ask the server for the authoritative remaining (deducts any crash gap).
    if (needsToolAdGate(user, tool.name)) {
      const localRemaining = getToolRemaining(user, tool.name);
      if (localRemaining > 0) {
        setActiveTool(tool);
        const serverRemaining = await toolAdGate.startConsumption(tool.name);
        if (serverRemaining > 0) {
          toolAdGate.startHeartbeat(() => {
            setActiveTool(null);
            setAdGateTool(tool);
          }, tool.name);
        } else {
          // Server says no time (crash gap consumed it) — show ad-gate
          await toolAdGate.stopConsumption(tool.name);
          setActiveTool(null);
          setAdGateTool(tool);
        }
      } else {
        setAdGateTool(tool);
      }
      return;
    }
    setActiveTool(tool);
  };

  // Called when a rewarded ad is watched and the server grants 30s.
  // Starts server-authoritative consumption (sets last_heartbeat, starts heartbeat).
  const handleAdGranted = async (tool) => {
    setAdGateTool(null);
    setActiveTool(tool);
    await toolAdGate.startConsumption(tool.name);
    toolAdGate.startHeartbeat(() => {
      setActiveTool(null);
      setAdGateTool(tool);
    }, tool.name);
  };

  const handleReorder = (next) => {
    setTools(next);
    try { base44.auth.updateMe({ toolkit_order: next.map(t => t.name) }); } catch {}
  };
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const [savingRec, setSavingRec] = useState(false);
  const [recorderNotes, setRecorderNotes] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(null);
  const [weatherLocation, setWeatherLocation] = useState('');
  const [guideDetail, setGuideDetail] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const scrollRef = useRef(null);
  const recordingStartedAtRef = useRef(null);
  const { isSpeaking: narrating, isGenerating, narrate: rawNarrate, stop: stopNarration } = useGhostVoice();
  const { gateNarration, gateManifestation, showUpgrade, setShowUpgrade, gateReason, setGateReason, user: gateUser } = useEnergyGate();
  const { mode: narrationMode, setMode: setNarrationMode } = useNarrationMode(gateUser);
  const canEnhance = canUseEnhanced(gateUser);
  // Observer Device Narration ad gate (Seeker+ bypasses — ad-free).
  const { requestAccess: requestNarrationAccess, adGateElement: narrationAdGateEl } = useObserverNarrationGate(gateUser);
  // Authoritative evidence-save gate — Audio Recorder saves count against the
  // same daily cap / Aura rules as the Evidence page (no separate counter).
  const {
    gateSave: gateEvidenceSave,
    refundSave: refundEvidenceSave,
    adGatePromise: evidenceAdGateOpen,
    onAdGateSuccess: onEvidenceAdSuccess,
    onAdGateClose: onEvidenceAdClose,
    showUpgrade: showEvidenceUpgrade,
    setShowUpgrade: setShowEvidenceUpgrade,
    dailyRemaining: evidenceDailyRemaining,
    gateReason: evidenceGateReason,
  } = useEvidenceSaveGate();

  // Gated narration wrapper — Device mode is free client-side TTS (Observer
  // watches a rewarded ad first); Enhanced mode checks energy before speaking.
  const narrate = async (text, opts = {}) => {
    if (narrationMode === 'device') {
      if (!(await requestNarrationAccess())) return;
      rawNarrate(text, { ...opts, useDeviceVoice: true });
      return;
    }
    if (narrating || isGenerating) { rawNarrate(text, opts); return; }
    if (!gateNarration(text)) return;
    rawNarrate(text, opts);
  };
  // SIEG owns its wake lock. The standalone camera must not compete with a
  // second hidden video; keep its native screen wake lock without that fallback.
  useWakeLock(!!activeTool && activeTool.type !== 'sieg', { mediaFallback: activeTool?.type !== 'sls' });

  // Ad-gate hook — manages the rewarded-ad lifecycle for the ad-gated tool
  // currently waiting for an ad (adGateTool). Returns watching/granting/adError
  // state plus the watchAd function that calls grant-tool-time server-side.
  const toolAdGate = useToolAdGate(user, adGateTool?.name || null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // When a tool is opened (or a guide detail expands), scroll the panel into
  // view at the top of the list.
  useEffect(() => {
    if (activeTool && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeTool, guideDetail]);

  // Weather is now fetched only when the user explicitly presses the
  // "Get My Location" button — no auto-fire on tool open (saves credits).


  const handleGuideNarration = () => {
    narrate(guideDetail);
  };

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };

  const startRecording = async () => {
    try {
      setMediaError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      recordingStartedAtRef.current = new Date();
      setRecording(true);
      setRecordDuration(0);
      setRecordedBlob(null);
      timerRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied', err);
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setMediaError('Microphone access denied. Allow microphone permission in your device settings, then try again.');
      } else if (name === 'NotFoundError') {
        setMediaError('No microphone was found on this device.');
      } else if (name === 'NotReadableError') {
        setMediaError('Microphone is in use by another app. Close other audio apps and try again.');
      } else {
        setMediaError('Could not start the microphone. Please try again.');
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const saveRecording = async (isPrivate = true) => {
    if (!recordedBlob) return;
    setSavingRec(true);
    try {
      // Upload and capture GPS BEFORE gating so a failed upload or cancelled
      // GPS flow does NOT consume a daily evidence save. The gate (ad watch +
      // spend-evidence-save) is only called once the evidence is ready to create.
      const file = new File([recordedBlob], 'evp_session.webm', { type: 'audio/webm' });
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const now = new Date();
      const date = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      let description = 'Recorded EVP session — ' + formatDuration(recordDuration);
      const startedAt = recordingStartedAtRef.current;
      if (startedAt) {
        description += '\nStarted: ' + startedAt.toLocaleString();
      }
      if (recorderNotes.trim()) description += '\n\nNotes: ' + recorderNotes.trim();
      const gpsResult = await captureGpsForSave();
      if (!gpsResult) { setSavingRec(false); return; }
      if (!isPrivate && (gpsResult.location_source === 'NONE' || gpsResult.latitude == null)) {
        toast({ title: 'Evidence Cannot Be Made Public', description: 'This evidence does not have a valid location. Evidence must have GPS coordinates or a tour-stop location to be shared on the Community Map. The evidence may still be saved privately if appropriate.', variant: 'destructive' });
        setSavingRec(false);
        return;
      }
      // Gate the save AFTER upload + GPS — the daily counter is only consumed
      // when the evidence is actually about to be created.
      const allowed = await gateEvidenceSave();
      if (!allowed) { setSavingRec(false); return; }
      const ctx = await buildEvidenceContext(gpsResult, { skipGps: true });
      await base44.entities.Evidence.create({
        title: 'EVP Session ' + date,
        type: 'evp',
        description,
        file_url: uploadRes.file_url,
        date,
        time,
        is_private: isPrivate,
        ...gpsResult,
        ...ctx,
      });
      setRecordedBlob(null);
      setRecordDuration(0);
      setRecorderNotes('');
    } catch (err) {
      // Evidence.create failed — refund the daily save charge so the user
      // is not permanently consume an allowance for a record that was never created.
      await refundEvidenceSave();
      console.error('Save failed', err);
    }
    setSavingRec(false);
  };

  const fetchWeatherByCoords = async (lat, lon) => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const res = await omFetchByCoords(lat, lon);
      setWeatherData(res);
    } catch (err) {
      console.error('Weather fetch failed', err);
      setWeatherData(null);
      setWeatherError('Weather data unavailable. Try searching by city name.');
    }
    setWeatherLoading(false);
  };

  const fetchWeatherByLocation = async () => {
    const loc = weatherLocation.trim();
    if (!loc) return;
    setWeatherLoading(true);
    try {
      const res = await omFetchByLocation(loc);
      setWeatherData(res);
    } catch (err) {
      console.error('Weather fetch failed', err);
      setWeatherData(null);
    }
    setWeatherLoading(false);
  };

  const autoFetchWeather = () => {
    if (weatherData) return;
    setWeatherError(null);
    requestGps({ enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 })
      .then((result) => {
        if (result.ok) {
          fetchWeatherByCoords(result.coords.lat, result.coords.lng);
        } else if (result.error === 'disabled') {
          // User declined to turn tracking back on — don't show a generic error
        } else if (result.error === 'denied') {
          setWeatherError('Location access denied. Enable location in your device settings or search by city name below.');
        } else {
          setWeatherError('Could not determine your location. Try searching by city name below.');
        }
      })
      .catch(() => { setWeatherError('Could not determine your location. Try searching by city name below.'); });
  };

  const renderToolContent = () => {
    if (!activeTool) return null;

    switch (activeTool.type) {
      case 'recorder':
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-black/40 border border-primary/20 min-h-[80px] flex flex-col items-center justify-center gap-2">
              <Mic className={`w-8 h-8 ${recording ? 'text-red-500 animate-pulse' : recordedBlob ? 'text-green-400' : 'text-muted-foreground'}`} />
              <p className="text-xs font-mono text-muted-foreground">
                {recording ? '● Recording... ' + formatDuration(recordDuration) : recordedBlob ? 'Recording complete — ' + formatDuration(recordDuration) : 'Ready to record'}
              </p>
            </div>
            {mediaError && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10">
                <p className="text-xs text-red-300">{mediaError}</p>
              </div>
            )}
            {recording ? (
              <button onClick={stopRecording} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-heading text-xs uppercase tracking-wider hover:bg-red-500/20 transition-colors">
                <Pause className="w-3.5 h-3.5" /> Stop Recording
              </button>
            ) : !recordedBlob ? (
              <button onClick={startRecording} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors">
                <Play className="w-3.5 h-3.5" /> Start Recording
              </button>
            ) : (
              <div className="space-y-3">
                <audio src={URL.createObjectURL(recordedBlob)} controls className="w-full" />
                <div className="space-y-1.5">
                  <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">What did you hear?</p>
                  <textarea
                    placeholder="Play back the recording and type any words or sounds you hear..."
                    value={recorderNotes}
                    onChange={e => setRecorderNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-card/50 border border-border/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
                  />
                </div>
                <EvidenceSaveButtons onSave={saveRecording} saving={savingRec} />
                <p className="text-[10px] text-muted-foreground/60 text-center">Saves automatically with date & time</p>
                <button onClick={() => { setRecordedBlob(null); setRecordDuration(0); setRecorderNotes(''); }} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-red-500/30 hover:text-red-400 transition-colors">
                  <X className="w-3.5 h-3.5" /> Discard
                </button>
              </div>
            )}
          </div>
        );

      case 'moon': {
        const now = new Date();
        const lp = 2551443;
        const newMoon = Date.UTC(2000, 0, 6, 18, 14) / 1000;
        const phase = ((now.getTime() / 1000 - newMoon) % lp) / lp;
        const phaseNames = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
        const phaseIdx = Math.round(phase * 8) % 8;
        const illumination = Math.round((1 - Math.cos(phase * 2 * Math.PI)) * 50);
        const moonEmojis = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
        return (
          <div className="space-y-4 text-center">
            <div className="text-6xl">{moonEmojis[phaseIdx]}</div>
            <div>
              <p className="font-display text-2xl text-moonlight">{phaseNames[phaseIdx]}</p>
              <p className="text-xs text-muted-foreground mt-1">Best ghost hunting: Full Moon & New Moon nights</p>
              <p className="text-[10px] text-muted-foreground/60 mt-2">Lunar illumination: {illumination}%</p>
            </div>
          </div>
        );
      }

      case 'audio':
        return <AcousticAnomalySweeper gateSave={gateEvidenceSave} refundSave={refundEvidenceSave} />;

      case 'weather':
        return (
          <div className="space-y-3">
            {weatherLoading && !weatherData ? (
              <div className="p-4 rounded-lg bg-card/30 border border-border/30 text-center">
                <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Fetching your local weather...</p>
              </div>
            ) : weatherData ? (
              <>
                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                  <MapPin className="w-3 h-3" /> {weatherData.location}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Temperature</p>
                    <p className="text-sm font-medium text-foreground">{weatherData.temperature}°F</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Humidity</p>
                    <p className="text-sm font-medium text-foreground">{weatherData.humidity}%</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Wind</p>
                    <p className="text-sm font-medium text-foreground">{weatherData.wind}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Conditions</p>
                    <p className="text-sm font-medium text-foreground">{weatherData.conditions}</p>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xs font-heading uppercase tracking-wider text-primary mb-1">Investigative Guidance</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {getWeatherFlavor(weatherData.weatherCode, weatherData.temperature, weatherData.humidity, weatherData.wind)}
                  </p>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-lg bg-card/30 border border-border/30 text-center space-y-3">
                <Cloud className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-xs text-muted-foreground">Press the button below to fetch your local weather</p>
                {weatherError && (
                  <p className="text-xs text-amber-400 leading-relaxed">{weatherError}</p>
                )}
                <button onClick={autoFetchWeather} disabled={weatherLoading} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-50">
                  {weatherLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                  {weatherLoading ? 'Fetching...' : 'Get My Location Weather'}
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Or search by city..."
                value={weatherLocation}
                onChange={e => setWeatherLocation(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchWeatherByLocation()}
                className="flex-1 px-3 py-2 rounded-lg bg-card/50 border border-border/50 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <button onClick={fetchWeatherByLocation} disabled={weatherLoading} className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-heading uppercase tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                {weatherLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {weatherLoading ? '...' : 'Fetch'}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/60 text-center">Free weather by Open-Meteo · no API key, no energy cost</p>
          </div>
        );

      case 'research':
        return <ResearchDatabase />;

      case 'guide':
        if (guideDetail) {
          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button onClick={() => { stopNarration(); setGuideDetail(null); }} className="flex items-center gap-1.5 text-xs text-primary font-heading uppercase tracking-wider hover:text-primary/80 transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Equipment List
                </button>
                <button onClick={handleGuideNarration} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-heading uppercase tracking-wider transition-colors ${narrating ? 'bg-primary/20 border border-primary/40 text-primary' : isGenerating ? 'bg-card/50 border border-border/50 text-muted-foreground' : 'bg-card/50 border border-border/50 text-muted-foreground hover:text-primary hover:border-primary/30'}`}>
                  <Volume2 className={`w-3 h-3 ${narrating || isGenerating ? 'animate-pulse' : ''}`} />
                  {isGenerating ? 'Loading...' : narrating ? 'Stop' : <>Narrate <EnergyCostBadge type="narration" mode={narrationMode} text={guideDetail} /></>}
                </button>
              </div>
              <NarrationToggle mode={narrationMode} setMode={setNarrationMode} canEnhance={canEnhance} className="!justify-center" label="Narration" />
              <div className="p-4 rounded-lg bg-card/30 border border-border/30 text-xs text-foreground/80 leading-relaxed space-y-3 whitespace-pre-line">
                {guideDetail}
              </div>
            </div>
          );
        }
        return (
          <div className="space-y-2">
            {[
              {
                name: 'AGES Explorer App',
                short: 'All-in-One Paranormal Investigation App',
                detail: `The AGES Explorer App in Ghost Hunting

What Is the AGES Explorer App?

The AGES (Accessible Ghost Exploration Solutions) Explorer App is a self-guided paranormal investigation platform that turns a smartphone into a full ghost-hunting kit. It bundles guided haunted-location tours, an interactive evidence journal, and a rack of sensor- and audio-based investigation tools into one app, so an investigator can run a session, record it, and save the evidence without carrying a bag of separate devices.

What It Contains

• Self-Guided Tours: ranked, location-aware walking and driving tours of haunted sites, each with stop-by-stop history, paranormal lore, and investigation suggestions.
• Investigation Toolkit: a rack of phone-based tools — anomaly camera, acoustic and term sweepers, vibration communicator, environmental anomaly monitor, and more — each with screen recording and evidence saving.
• Evidence Journal: a timestamped log of captured audio, video, and notes, with optional GPS location and a community map of shared findings.
• Energy & Plans: a tiered subscription model (Observer, Seeker, Investigator, Technician) that gates AI narration, custom tour generation, and tool access.

Scientific Theory

The app reads the sensors already built into a modern phone — camera, microphone, accelerometer, gyroscope, magnetometer, barometer — and presents their readings in real time. Each tool measures a physical quantity and reports departures from a measured baseline, so the investigator sees what the device sees, not what expectation suggests.

Paranormal Theory

Investigators use the app to:
• Run repeatable, recorded sessions at reportedly haunted locations.
• Correlate multiple sensor readings (EMF, motion, audio, pressure) at the same moment.
• Build a body of evidence over many visits to the same site.

Best Practices
• Treat the app as one instrument among several — corroborate with physical equipment.
• Establish baselines before each session.
• Save and label evidence immediately so context is preserved.
• Respect private property and local law at every tour stop.
• A single reading is never proof — patterns across sessions are stronger.`
              },
              {
                name: 'REM Device',
                short: 'Radiating Electromagneticity Meters',
                detail: `REM Devices: Radiating Electromagneticity Meters in Ghost Hunting

What Is a REM Device?

A REM (Radiating Electromagneticity Meter) device is a specialized piece of paranormal investigation equipment that measures and detects fluctuations in electromagnetic fields (EMF). Unlike standard EMF meters that simply read ambient electromagnetic levels, REM devices are designed to detect and respond to rapid, radiating bursts of electromagnetic energy — the kind some researchers believe may accompany spirit manifestations.

REM devices often feature multi-axis antenna arrays, audible alarms, and visual displays that react to sudden electromagnetic spikes. Many are purpose-built for paranormal research and tuned to be more sensitive than standard industrial EMF meters.

Scientific Theory

REM devices operate on the principle of electromagnetic induction:
1. An antenna or coil detects changes in the surrounding magnetic field.
2. The device measures both the strength and rate of change of the field.
3. Rapid changes (radiating pulses) trigger visual and audible alerts.
4. The directional antenna can help locate the source of the disturbance.

Unlike passive meters, REM devices actively monitor for spike patterns rather than just ambient levels, making them more responsive to transient electromagnetic events.

Paranormal Theory

Some paranormal researchers theorize that:
• Spirit manifestations may generate brief, localized electromagnetic disturbances.
• The "radiating" nature of REM detection aligns with theories of spirits as energy-based phenomena.
• Correlating REM spikes with other equipment readings (EVP, temperature drops) strengthens evidence.

Best Practices
• Establish baseline readings before investigating.
• Note all nearby electrical sources (wiring, appliances, cell towers).
• Document spikes with timestamps and correlate with other observations.
• Move slowly through spaces to allow the device time to respond.
• A spike on its own is not proof — look for patterns and correlations.`
              },
              {
                name: 'PIR Device',
                short: 'Infrared Motion Sensors',
                detail: `Infrared (IR) Motion Sensors in Ghost Hunting

What Is an Infrared Motion Sensor?

An infrared (IR) motion sensor is a device that detects movement by sensing changes in infrared energy (heat) within its field of view. In ghost hunting, IR motion sensors are often used to alert investigators when something moves through a monitored area, especially in dark environments where visual observation is difficult.

Many paranormal investigators use modified security sensors, driveway alarms, or purpose-built paranormal devices that trigger lights, sounds, or recordings when motion is detected.

Scientific Theory

Most ghost-hunting motion detectors use a Passive Infrared (PIR) Sensor.

A PIR sensor works by:
1. Detecting infrared radiation naturally emitted by warm objects.
2. Monitoring the environment for changes in heat patterns.
3. Triggering an alarm when a heat source moves across different sensing zones.

For example:
• A person walking through a hallway emits body heat.
• The sensor detects the changing heat signature.
• The device activates a light, buzzer, or other alert.

The sensor is "passive" because it does not emit energy; it only receives infrared radiation from its surroundings.

Paranormal Theory

Within paranormal investigation, some researchers theorize that spirits may:
• Manifest as energy fields capable of triggering motion sensors.
• Create localized temperature fluctuations.
• Disturb the infrared field monitored by the sensor.
• Move through a protected detection zone and activate the device.

Some investigators place motion sensors in reportedly active locations such as:
• Hallways
• Staircases
• Doorways
• Historic bedrooms
• Near trigger objects

If the sensor activates without an obvious cause, investigators may attempt communication or correlate the event with other equipment readings.

Limitations and False Triggers

Infrared motion sensors can be triggered by many normal causes, including:
• Investigators moving nearby
• Pets or wildlife
• Insects close to the sensor
• HVAC systems
• Warm air drafts
• Sunlight through windows
• Reflections from heat sources
• Rapid temperature changes

Because of these factors, a motion sensor activation alone is generally not considered strong evidence of paranormal activity.

Best Practices for Ghost Hunting
• Document all people present and their locations.
• Eliminate sources of heat and airflow when possible.
• Use multiple devices to corroborate events.
• Record video of the sensor during investigations.
• Note environmental conditions when activations occur.
• Avoid placing sensors near vents, heaters, or windows.`
              },
              {
                name: 'Thermal Device',
                short: 'Thermal Imaging Camera — Heat Detection',
                detail: `Thermal Imaging Cameras in Ghost Hunting

What Is a Thermal Imaging Camera?

A thermal imaging camera (also called an infrared camera or thermographic camera) detects infrared radiation (heat) and creates an image based on temperature differences. In ghost hunting, thermal cameras are used to detect cold spots, heat signatures, and temperature anomalies that may indicate paranormal activity.

Scientific Theory

Thermal cameras work by detecting infrared radiation in the long-wave infrared spectrum (8–14 μm):
1. All objects above absolute zero emit infrared radiation.
2. The camera's microbolometer sensor absorbs IR radiation and converts it to an electrical signal.
3. Each pixel represents a temperature measurement, rendered as a color on the display.
4. Cooler objects appear blue/purple; warmer objects appear red/yellow/white.

Paranormal Theory

Some investigators theorize that spirit manifestations may:
• Draw thermal energy from the environment, creating cold spots.
• Generate heat as a byproduct of manifestation.
• Appear as human-shaped thermal signatures.
• Create localized temperature anomalies.

Best Practices
• Establish baseline room temperatures before investigating.
• Scan slowly — thermal cameras need time to adjust.
• Note HVAC vents, windows, and other heat sources.
• Document any anomalies with timestamps.
• Correlate cold spots with EMF readings and other equipment.
• A cold spot alone is not proof — look for patterns.`
              },
              {
                name: 'SLS Camera',
                short: 'Structured Light Sensor — Stick Figure Mapping',
                detail: `SLS Cameras (Structured Light Sensor) in Ghost Hunting

What Is an SLS Camera?

An SLS (Structured Light Sensor) camera is a modified device that projects an infrared grid pattern onto a scene and uses a depth sensor (similar to a Microsoft Kinect) to detect and map humanoid shapes. In ghost hunting, SLS cameras are used to detect stick-figure representations of potential apparitions that are invisible to the naked eye.

Scientific Theory

SLS technology works through structured light projection:
1. An infrared projector emits a grid of dots onto the environment.
2. An IR camera reads the distortion of the dot pattern.
3. A processor calculates depth information from the distortion.
4. The software identifies humanoid shapes and renders them as stick figures.

The system is designed to detect humans for gaming and motion tracking — it maps joints, limbs, and body positioning in real time.

Paranormal Theory

Paranormal investigators theorize that spirits may:
• Have a physical form or energy field that the IR grid can detect.
• Distort the structured light pattern in humanoid shapes.
• Appear as stick figures on the SLS display when no living person is present.
• Map to the sensor at unexpected heights, positions, or through solid objects.

Common Observations
• Stick figures appearing in empty rooms.
• Figures mapped at unusual heights (floating or partial).
• Figures appearing through walls or in impossible positions.
• Stick figures that twist or contort unnaturally.

Limitations and False Positives
• The sensor can misinterpret furniture, curtains, or reflections as humanoid shapes.
• Shadows and light patterns can confuse the depth sensor.
• Multiple investigators in range can create overlapping readings.
• The Kinect sensor has a limited range (typically 1.5–4.5 meters).

Best Practices
• Ensure the area is clear of people before scanning.
• Note all furniture, reflective surfaces, and light sources.
• Use in conjunction with other equipment for corroboration.
• Document stick figure readings with screenshots or video.
• A stick figure alone is not proof — cross-reference with EMF, temperature, and audio.`
              },
              {
                name: 'XLS Camera',
                short: 'Extended Light Spectrum — Multi-Spectral Imaging',
                detail: `XLS Cameras (Extended Light Spectrum) in Ghost Hunting

What Is an XLS Camera?

An XLS (Extended Light Spectrum) camera is an advanced imaging device that captures a broader range of the electromagnetic spectrum than standard cameras, combining ultraviolet (UV), visible, and infrared (IR) light capture simultaneously. XLS cameras go beyond full-spectrum modifications by using multiple sensors or filter arrays to capture different spectral bands at once.

Scientific Theory

XLS cameras extend the range of detectable light:
1. Multiple sensors or rotating filter wheels capture UV, visible, and IR bands.
2. Software overlays or composites the different spectral images.
3. The result reveals details invisible to any single spectrum.
4. Some XLS systems capture from 300nm (UV) through 1000nm (near-IR).

Unlike simple full-spectrum conversions, XLS cameras can separate and recombine spectral bands, allowing investigators to isolate phenomena in specific wavelengths.

Paranormal Theory

Investigators believe XLS cameras may capture:
• Spirit energy that manifests in specific spectral bands.
• Apparitions visible only in UV or deep IR.
• Energy fields around haunted locations.
• Multi-spectral anomalies that confirm each other across bands.

Best Practices
• Calibrate the camera in known conditions before investigation.
• Capture the same scene in multiple spectral bands.
• Note all light sources — UV can reveal fluorescent materials, IR reveals heat.
• Use a tripod for multi-spectral captures that require multiple exposures.
• Compare spectral bands side-by-side for anomalies.
• Environmental factors (humidity, dust, smoke) affect all spectral bands differently.`
              },
              {
                name: 'EMF Device',
                short: 'Electromagnetic Field Meter — Energy Detection',
                detail: `EMF Devices (Electromagnetic Field Meters) in Ghost Hunting

What Is an EMF Meter?

An EMF (Electromagnetic Field) meter is a handheld device that measures electromagnetic radiation in the environment. In ghost hunting, EMF meters are one of the most commonly used tools — investigators use them to detect unusual electromagnetic fluctuations that may indicate paranormal activity.

Scientific Theory

EMF meters measure electromagnetic fields produced by:
1. Electrical wiring and appliances (AC fields at 50/60 Hz).
2. Radio waves and wireless communications.
3. Natural sources like the Earth's magnetic field.
4. Static electricity and atmospheric conditions.

Most ghost-hunting EMF meters measure in milligauss (mG) and can detect both AC and DC fields. Standard meters have a single axis; professional meters use tri-axis sensors for directional readings.

Paranormal Theory

The EMF-paranormal connection is one of the most researched areas in ghost hunting:
• Some researchers theorize that spirit manifestations generate measurable electromagnetic fields.
• EMF spikes of 2–7 mG with no identifiable source are considered potentially paranormal.
• High EMF fields may also cause hallucinations, feelings of being watched, and dizziness — potentially explaining some paranormal experiences as environmental effects.
• Correlating EMF spikes with other readings (temperature drops, EVPs) strengthens evidence.

Best Practices
• Establish baseline EMF readings throughout the location before investigating.
• Identify and document ALL electrical sources — wiring, appliances, circuit breakers, cell towers.
• Move slowly — EMF meters need time to register changes.
• Use a tri-axis meter for directional information about the field source.
• Document spikes with exact readings, timestamps, and location.
• High EMF can be caused by faulty wiring — note this for safety as well as evidence.
• A single EMF spike alone is not paranormal evidence — look for patterns and correlations.`
              },
              {
                name: 'Full-Spectrum Camera',
                short: 'UV & IR Light Photography',
                detail: `Full-Spectrum Cameras in Ghost Hunting

What Is a Full-Spectrum Camera?

A full-spectrum camera is a modified digital camera with its internal IR-blocking filter removed, allowing it to capture ultraviolet (UV), visible, and infrared (IR) light simultaneously. In ghost hunting, these cameras are used to document phenomena invisible to the naked eye.

Scientific Theory

Standard digital camera sensors are naturally sensitive to UV, visible, and IR light. Manufacturers install an IR-cut filter to produce normal-looking photos. Removing this filter allows the sensor to capture the full electromagnetic spectrum, revealing:
• Infrared heat signatures from warm objects.
• UV reflections from surfaces and materials.
• Light anomalies that may not be visible to human eyes.

Paranormal Theory

Some investigators believe full-spectrum cameras can capture:
• Orbs and light anomalies associated with spirit energy.
• Apparitions that reflect or emit UV/IR light.
• Energy fields around haunted locations.

Best Practices
• Take baseline photos in normal conditions for comparison.
• Use a tripod for long exposures in dark locations.
• Note all light sources, dust, and reflective surfaces.
• Avoid photographing toward light sources to reduce lens flare.
• Review photos on a large screen for detailed analysis.`
              },
              {
                name: 'Digital Voice Recorder',
                short: 'Audio Capture for EVP Analysis',
                detail: `Digital Voice Recorders in Ghost Hunting

What Is a Digital Voice Recorder?

A portable device that captures high-quality audio recordings for later analysis. Unlike smartphones, dedicated recorders offer better microphone sensitivity, longer battery life, and higher-quality uncompressed audio formats essential for EVP work.

Scientific Theory

Digital recorders sample sound waves at high rates (44.1 kHz or higher) and store them as digital files. Higher bit depths and sample rates capture more detail, making subtle sounds easier to detect during playback analysis.

Paranormal Theory

Investigators use voice recorders to:
• Conduct EVP sessions — asking questions and leaving silence for responses.
• Document environmental sounds during investigations.
• Create a timestamped audio log of events and readings.

Best Practices
• Use an external microphone for better sensitivity.
• Record in WAV or other lossless format when possible.
• Verbally note any normal sounds (cars, footsteps, wind).
• Play back at increased volume with noise-reduction software.
• Never use voice activation — it can cut off beginnings of EVPs.`
              },
              {
                name: 'Acoustic Anomaly Sweeper',
                short: 'Listen-Only Room Acoustics Monitor',
                detail: `Acoustic Anomaly Sweepers in Ghost Hunting

What Is an Acoustic Anomaly Sweeper?

An acoustic anomaly sweeper listens to a room through a microphone and reports when the sound in that room departs from its own measured baseline. This app's tool is listen-only: it never broadcasts, tunes, or plays anything. It measures, then shows what it measured.

Scientific Theory

The tool opens the device microphone, runs a real-time frequency analysis across the audible range (about 20 Hz to 16 kHz, within the limits of the phone's own microphone), and spends the first ten seconds measuring the room's quiet baseline. From then on it plots how far the room sits above or below that baseline.

What the numbers mean:
• Levels are relative — dBFS measured at the device's analyser, not calibrated sound-pressure level. A phone microphone has no calibration, so an absolute figure would be false precision.
• A rise has to hold for at least half a second to be logged as an event, so a single knocked door does not flood the log.
• The baseline adapts slowly to the room, so a fridge cycling, a building settling or air handling does not accumulate into false events.
• The event log names the band that moved. Low frequencies rumble and travel through structures; the voice band (250–2000 Hz) is where speech and vocal sounds sit.

Paranormal Theory

Investigators use a baseline-and-departure method because it removes expectation: the room's own quiet level is the reference, rather than the investigator's memory of it. Some researchers theorize that:
• A sudden sound with no visible or mechanical source is worth correlating with other readings.
• A drop below the baseline can be as notable as a rise.
• Departures that repeat at the same place and time across sessions are stronger than single events.

Limitations and False Sources

Every ordinary source matters here, and there are many:
• HVAC, refrigeration, plumbing and electrical hum.
• Footsteps, settling structures, traffic, weather and wind on windows.
• The investigator's own breathing, clothing, speech and handling of the phone.
• Device processing: some phones apply noise suppression or automatic gain, which changes what is measured.

Best Practices
• Calibrate in silence, and leave the room if you can.
• Place the device on a stable surface away from vents and appliances.
• Note every known sound source for the session.
• Mark the moments you hear yourself so they line up with the recording.
• Treat an event as a marker of something to investigate, never as proof of what caused it.`
              },
              {
                name: 'Traditional Radio Sweeper',
                short: 'Spirit Box — AM/FM Frequency Sweep (Field Equipment)',
                detail: `Radio Sweepers (Spirit Boxes) in Ghost Hunting

What Is a Radio Sweeper?

A radio sweeper — commonly called a spirit box or ghost box — is a real piece of field equipment. It continuously sweeps AM or FM broadcast bands, producing a rapid stream of static, fragments of stations and white noise. Investigators believe spirits can influence the sweep to assemble words from those fragments.

Important: this app does not contain a radio sweeper. This app's Acoustic Anomaly Sweeper is a listen-only microphone tool and does not tune or receive broadcasts. The radio sweeper is described here as field equipment you may bring or use alongside the app.

Scientific Theory

A radio sweeper steps a receiver across a band — typically AM 530–1700 kHz or FM 88.1–107.9 MHz — far faster than a person could dial by hand. The audio is a blend of carrier static and brief slices of broadcast audio. Early models in this style (the SB-7 and SB-11) manually swept a modified portable radio; later "Frank's Box" style units and phone apps sweep automatically.

The standing skeptical explanation is straightforward: a swept band continuously presents a dense stream of speech fragments, and a listener primed with a question will find meaningful-sounding words in that stream. Broadcast fragments, pareidolia and expectation account for most reported responses.

Paranormal Theory

Spirit communicators are theorized to:
• Select and assemble fragments from the sweeping audio to form words or short phrases.
• Influence the tuning to land on meaningful syllables at the right moment.
• Produce real-time, audible responses that are not part of a normal broadcast.

Best Practices
• Sweep for several minutes before expecting anything.
• Ask clear, simple questions, and pause between them.
• Record the whole session, including the question being asked and its timing.
• Note the station or frequency when a fragment sounds like a response.
• Test the method in a location with no local stations in range — the results should change.
• Never use a sweeper while driving, and never let it replace a real evaluation of a sound.`
              },
              {
                name: 'Terms Sweeper',
                short: 'Environment-Triggered Spirit Dictation',
                detail: `Terms Sweepers in Ghost Hunting

What Is a Terms Sweeper?

A term sweeper is a phone-based tool that cycles through a list of location-relevant words (place names, object names, historical terms) and is believed to be triggered by environmental energy to "dictate" a term from the surrounding spirit. It typically pairs with screen recording to capture which term appears and when.

Scientific Theory

The device rapidly presents candidate terms while monitoring environmental sensors (motion, magnetic disturbance, device tilt). When a significant environmental change is detected, the currently displayed term is "captured," suggesting a spirit selected it.

Paranormal Theory

Investigators theorize that:
• Spirits can influence the device's sensors to pause or select a term.
• Location-specific word banks increase the chance of meaningful, relevant responses.
• Repeated selection of the same term across sessions strengthens the evidence.

Best Practices
• Curate the term list to the location's history and reported phenomena.
• Run sessions quietly and ask prompting questions.
• Record the screen so captures are timestamped and verifiable.
• Look for repeated or thematically clustered terms rather than single hits.
• Treat a single captured term as suggestive, not conclusive.`
              },
              {
                name: 'Yes/No/IDK Sweeper',
                short: 'Motion-Triggered Answer Dictation',
                detail: `Yes/No/IDK Sweepers in Ghost Hunting

What Is a Yes/No/IDK Sweeper?

A phone-based tool that cycles through three answers — Yes, No, and I Don't Know — and is triggered by motion or environmental disturbance to "dictate" a response to a spoken question. It is commonly used with screen recording for later review.

Scientific Theory

The device continuously rotates the answer options while watching device motion and sensor activity. A significant disturbance freezes the cycle on the answer being displayed at that instant, producing a recorded response.

Paranormal Theory

Investigators theorize that:
• Spirits can trigger motion or energy events to select an answer.
• The simple Yes/No/I Don't Know format mirrors classic spirit communication.
• Responses that directly address the question are more likely meaningful.

Best Practices
• Ask clear yes/no questions and pause for a response.
• Keep the device still between questions to avoid false triggers.
• Record the session for timestamped verification.
• Look for consistent answers across multiple questions about the same topic.
• Single responses are suggestive — patterns across a session are stronger.`
              },
              {
                name: 'Vibration Communicator',
                short: 'Phone Sensor Energy Disturbance Detection',
                detail: `Vibration Communicators in Ghost Hunting

What Is a Vibration Communicator?

A vibration communicator uses a smartphone's built-in sensors (accelerometer, gyroscope, magnetometer) to detect sudden energy and motion disturbances, and pairs detection with video recording so the moment of disturbance is captured visually.

Scientific Theory

Modern phones contain sensitive microelectromechanical (MEMS) sensors that measure acceleration, rotation, and magnetic field. The tool reads these sensors in real time and flags spikes that exceed a baseline — sudden tilts, vibrations, or magnetic shifts — then marks and records the event.

Paranormal Theory

Some researchers theorize that:
• Spirit manifestations may produce localized energy or physical disturbances detectable by these sensors.
• Sudden, unexplained sensor spikes near a reported haunt can correlate with paranormal events.
• Pairing sensor spikes with video provides corroborating visual evidence.

Best Practices
• Place the phone on a stable surface to establish a clean baseline.
• Note known sources of vibration (HVAC, traffic, footsteps).
• Use video recording so any visual anomaly at the moment of a spike is captured.
• Correlate spikes with other equipment readings (EMF, audio).
• A single spike is not proof — look for repeatable, contextual patterns.`
              },
              {
                name: 'Anomaly Camera',
                short: 'Figure Detection from the Live Camera Image',
                detail: `Anomaly Cameras in Ghost Hunting

What Is an Anomaly Camera?

A camera tool that scans the live image in real time for bright, skin-toned regions, groups neighbouring pixels into shapes, and outlines any group large enough to be a head, torso or limb. It works on what the camera can see: no infrared or depth sensor is involved.

Depth layer (devices that support it)

Where the device supports depth, the camera can read depth instead of the image: LiDAR on the iPhones and iPads that carry it, and Google's AR depth estimation on supported Android phones. That maps the solid surfaces in front of it and outlines any figure-sized form standing out from the background. This is a physical reading: anything it outlines is really there in the space — a person, or an object shaped like one — and sessions show the reading in metres. LiDAR supplies its own illumination, so it works in the dark with no torch; Android's depth estimation works from the camera image, so give it reasonable light and the first few seconds to build its map by sweeping the phone slowly across the room. Devices without depth support simply use the camera-image method described above.

Scientific Theory

Each frame is examined pixel by pixel for warm, flesh-toned colour. Matching pixels that touch are grouped into one region, and a region above a size threshold is boxed and counted as a detected figure. Because the detector reads colour and light, it needs light in the frame to work with — the sensitivity presets describe how bright the scene is expected to be, and the torch switches on at the darkest setting.

Paranormal Theory

Investigators theorize that:
• A figure-shaped reading appearing where no living person is present may indicate an apparition.
• Figures detected at unusual heights or positions can be especially notable.
• A detected shape is only as meaningful as the readings that corroborate it.

Limitations and False Positives
• Skin-toned surfaces are the most common false positive — wood, leather, beige walls, warm lamplight, skin-coloured fabric.
• The detector needs light: in near-total darkness there is nothing to read, which is why the torch setting exists.
• A detection is a colour match, not a depth or thermal reading, and nothing the camera cannot see can be detected.
• Other people in frame will register as figures.

Best Practices
• Clear the area of people before scanning.
• Note the skin-toned surfaces in the frame so you can rule them out afterwards.
• Use the torch setting in dark rooms.
• Record the session, so any detected figure is timestamped with the moment it appeared.
• Cross-reference with EMF, temperature, and audio for corroboration.
• A single detected shape alone is not proof.`
              },
              {
                name: 'Alphabet Sweeper',
                short: 'A→Z Environment-Triggered Letter Dictation',
                detail: `Alphabet Sweepers in Ghost Hunting

What Is an Alphabet Sweeper?

A phone-based tool that cycles through the alphabet A→Z and is believed to be triggered by environmental energy to "dictate" a letter, allowing spirits to spell out words letter by letter. It is commonly paired with screen recording.

Scientific Theory

The device continuously rotates through letters while monitoring motion and sensor activity. A significant environmental disturbance freezes the cycle on the letter being displayed, producing a captured letter that can be assembled with others into words.

Paranormal Theory

Investigators theorize that:
• Spirits can influence the device to select letters in sequence.
• Over a session, captured letters may spell names, places, or messages.
• Relevant, coherent spellings across multiple sessions strengthen the evidence.

Best Practices
• Ask prompting questions and pause for letter responses.
• Keep the device still between captures to avoid false triggers.
• Record the screen so each captured letter is timestamped.
• Look for coherent words across a session rather than isolated letters.
• Treat single letters as suggestive — meaningful spellings are stronger.`
},
{
name: 'Audio Recorder',
short: 'In-App EVP Session Recorder',
detail: `Audio Recorder (App Tool) in Ghost Hunting

What Is the Audio Recorder?

The in-app Audio Recorder is a phone-based EVP (Electronic Voice Phenomenon) session recorder. It captures audio from the device microphone, timestamps the session, and saves the recording directly to the Evidence Journal with optional GPS location. Unlike a standalone digital voice recorder, it keeps the recording, its location, and its notes in one record.

Scientific Theory

The recorder opens the device microphone and writes a compressed audio file while the session runs. The recording can be played back at increased volume or with noise reduction afterwards to listen for faint voices that were not heard during the session.

Paranormal Theory

Investigators use EVP sessions to:
• Ask questions and leave silence for responses that may only appear on playback.
• Capture audio anomalies — whispers, knocks, or voices — with no visible source.
• Build a timestamped audio log that can be correlated with other readings.

Best Practices
• Record in the quietest conditions possible; note every known sound source.
• Speak questions clearly and announce any noise you make (coughs, footsteps).
• Play back at higher volume and with noise reduction to review.
• Save the recording to the Evidence Journal immediately with location and notes.
• A single unclear sound is not evidence — repetition across sessions is stronger.`
},
{
name: 'Environmental Anomaly Monitor',
short: 'Barometric + Magnetic Field Meter (App Tool)',
detail: `Environmental Anomaly Monitors in Ghost Hunting

What Is an Environmental Anomaly Monitor?

The in-app Environmental Anomaly Monitor reads two phone sensors at once — the magnetometer and the barometer — and logs departures from a calibrated room baseline. It spends the first ten seconds measuring the room, then plots how far each channel sits above or below that baseline for the rest of the session, and records the screen.

Scientific Theory

• Magnetometer: measures the ambient magnetic field in microtesla. The phone's sensor is sensitive to nearby metal, electronics, and the Earth's field.
• Barometer: measures atmospheric pressure in hectopascals. Pressure changes slowly with weather and rapidly with doors, HVAC, or altitude changes.
• The tool calibrates a baseline for each channel, then flags sustained departures — a single blip is not logged; a hold of several samples is.

Paranormal Theory

Some researchers theorize that:
• Spirit manifestations may produce localized magnetic or pressure disturbances.
• A simultaneous departure on both channels is stronger than one channel alone.
• Repeated departures at the same place and time across sessions are notable.

Limitations and False Sources
• The magnetometer reacts to the phone's own speakers, motors, and any nearby metal or electronics.
• The barometer reacts to doors opening, HVAC cycling, and weather.
• A phone held in the hand moves; place it on a stable surface for a clean baseline.

Best Practices
• Calibrate in silence and leave the room if you can.
• Place the phone on a stable surface away from vents, appliances, and metal.
• Note every known environmental source for the session.
• Correlate departures with other equipment (EMF, audio, temperature).
• Treat a departure as a marker to investigate, never as proof of what caused it.`
},
{
name: 'SIEG',
short: 'Septer Inquiry Evidence Gleaner — 7 Tools at Once',
detail: `SIEG (Septer Inquiry Evidence Gleaner) in Ghost Hunting

What Is SIEG?

SIEG — the Septer Inquiry Evidence Gleaner — is an integrated session tool that runs seven of the rack's tools at once, over one clock, and records the entire screen as a single file. Instead of opening one tool at a time, an investigator starts a SIEG session and lets the acoustic sweeper, term sweeper, alphabet sweeper, yes/no sweeper, vibration communicator, environmental monitor, and anomaly camera all run together for a set duration.

Scientific Theory

SIEG does not add a new sensor; it orchestrates the existing ones. Each lane draws its own trace on a shared console, and a single media recorder captures the whole screen plus the mixed audio, so every channel's reading at any moment is in one timestamped file.

Paranormal Theory

Investigators use SIEG to:
• Capture simultaneous, correlated readings across many channels at the moment of an event.
• Avoid the blind spot of running one tool at a time and missing what the others would have shown.
• Build one recording that can be reviewed lane by lane afterwards.

Best Practices
• Choose a session length that matches the scenario (a short sweep vs. a long vigil).
• Place the phone on a stable surface with a clear camera view.
• Let the baseline settle before expecting meaningful departures.
• Review the recording lane by lane and correlate departures across channels.
• A single lane's reading is suggestive; multiple lanes agreeing at the same moment is stronger.`
},
{
name: 'Weather Monitor',
short: 'Real-Time Local Weather (App Tool)',
detail: `Weather Monitors in Ghost Hunting

What Is the Weather Monitor?

The in-app Weather Monitor fetches real-time local weather — temperature, wind, humidity, and conditions — for the investigator's current location or a searched city. It is a reference tool: it does not record or detect paranormal activity itself, but it logs the environmental context in which a session takes place.

Scientific Theory

Weather is fetched from a public weather service (Open-Meteo) based on coordinates or a place name. The reading is a snapshot of conditions at the nearest weather station, not a measurement taken on the device.

Paranormal Theory

Some researchers track weather because:
• Barometric pressure, humidity, and temperature may correlate with reported activity.
• Thunderstorms and solar activity are sometimes associated with increased reports.
• Logging weather alongside evidence lets patterns emerge over many sessions.

Best Practices
• Note the weather at the start of every session.
• Compare activity across different conditions to look for correlations.
• Treat weather as context, not cause — a correlation is not proof.
• Save weather notes with the evidence so the context is preserved.`
},
{
name: 'Moon Phase',
short: 'Current Moon Phase & Illumination (App Tool)',
detail: `Moon Phase in Ghost Hunting

What Is the Moon Phase Tool?

The in-app Moon Phase tool shows the current phase of the moon and its illumination percentage. It is a reference tool: it computes the phase from the current date so the investigator knows what the moon is doing during a session.

Scientific Theory

The moon's phase is calculated from the known lunar cycle (about 29.5 days). The tool shows the phase name (new, crescent, quarter, gibbous, full, etc.) and the percentage of the moon's face that is illuminated.

Paranormal Theory

Many investigators track the moon because:
• A full moon is a long-standing folk association with increased paranormal reports.
• Lunar phase may correlate with reported activity at some sites.
• Logging the phase alongside evidence lets patterns emerge over many sessions.

Best Practices
• Note the moon phase at the start of every session.
• Compare activity across phases to look for correlations.
• Treat the phase as context, not cause — a correlation is not proof.
• Save the phase with the evidence so the context is preserved.`
},
{
name: 'Paranormal Research: Terms',
short: 'Research Database & Field Manual (App Tool)',
detail: `Paranormal Research: Terms in Ghost Hunting

What Is the Paranormal Research Database?

The in-app Paranormal Research database is a searchable field manual of paranormal terms, concepts, and investigation methods. It is a reference tool: the investigator looks up a term or method to understand it before or during a session.

What It Contains

• Definitions of common paranormal terms (EVP, EMF, apparition, residual haunting, etc.).
• Explanations of investigation methods and equipment.
• A searchable index so a term can be found quickly in the field.

How Investigators Use It

• Look up an unfamiliar term or method during a session.
• Read up on a technique before trying it.
• Settle a question about what a reading means without leaving the app.

Best Practices
• Read the entry for a method before relying on it.
• Use it to corroborate what a reading does and does not mean.
• Treat definitions as a starting point, not the final word — field experience matters.`
},
{
name: 'Safety Protocol',
short: 'Investigation Safety Guidelines (App Tool)',
detail: `Safety Protocol in Ghost Hunting

What Is the Safety Protocol?

The in-app Safety Protocol is a checklist of investigation safety guidelines. It is a reference tool: it lists the rules an investigator should follow to stay safe during a session.

The Guidelines
• Always investigate in pairs — never alone.
• Carry a flashlight with fresh batteries.
• Inform someone of your location and expected return time.
• Respect private property and obtain permission.
• Watch your footing in dark or unfamiliar areas.
• Stay hydrated and dress for the weather.
• Trust your instincts — if something feels wrong, leave.

Why It Matters

Ghost hunting often happens at night, in abandoned or unfamiliar buildings, and in uneven terrain. The real hazards are physical — falls, unstable structures, weather, and isolation — not paranormal. The checklist keeps the investigator safe so the session can continue.

Best Practices
• Review the checklist before every session.
• Treat each rule as non-negotiable.
• Keep the phone charged and a flashlight on hand.
• If a location feels unsafe, leave and return another time.`
},
].map((item, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-card/30 border border-border/30">
                <p className="text-xs font-medium text-foreground">{item.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{item.short}</p>
                <button
                  onClick={() => setGuideDetail(item.detail)}
                  className="mt-2 text-[10px] text-primary font-heading uppercase tracking-wider hover:text-primary/80 transition-colors"
                >
                  View Details →
                </button>
              </div>
            ))}
          </div>
        );

      case 'safety':
        return (
          <div className="space-y-2">
            {[
              'Always investigate in pairs — never alone.',
              'Carry a flashlight with fresh batteries.',
              'Inform someone of your location and expected return time.',
              'Respect private property and obtain permission.',
              'Watch your footing in dark or unfamiliar areas.',
              'Stay hydrated and dress for the weather.',
              'Trust your instincts — if something feels wrong, leave.',
            ].map((rule, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-card/30 border border-border/30">
                <Shield className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-foreground/80 leading-relaxed">{rule}</p>
              </div>
            ))}
          </div>
        );

      case 'analyzer':
        return (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">Rate your evidence to build your investigator profile</p>
            <div className="grid grid-cols-2 gap-2">
              <input type="file" accept="audio/*,image/*,video/*" className="col-span-2 text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-primary/10 file:text-primary file:text-xs" />
              {['EVP Quality', 'EMF Correlation', 'Visual Clarity', 'Personal Impact'].map(label => (
                <div key={label} className="p-2.5 rounded-lg bg-card/30 border border-border/30">
                  <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
                  <input type="range" min="0" max="10" defaultValue="5" className="w-full h-1.5 rounded-full bg-secondary appearance-none cursor-pointer accent-primary" />
                </div>
              ))}
            </div>
          </div>
        );

      case 'sls':
        return <SLSCamera gateSave={gateEvidenceSave} refundSave={refundEvidenceSave} />;

      case 'rem':
        return <PhoneREMDevice gateSave={gateEvidenceSave} refundSave={refundEvidenceSave} />;

      case 'termbank':
        return <LocationTermBank gateSave={gateEvidenceSave} refundSave={refundEvidenceSave} />;

      case 'alphabet':
        return <AlphabetSweeper gateSave={gateEvidenceSave} refundSave={refundEvidenceSave} />;
      case 'yesno':
        return <YesNoSweeper gateSave={gateEvidenceSave} refundSave={refundEvidenceSave} />;
      case 'environment':
        return <EnvironmentalAnomalyMonitor gateSave={gateEvidenceSave} refundSave={refundEvidenceSave} />;
      case 'sieg':
        return <SiegConsole gateSave={gateEvidenceSave} refundSave={refundEvidenceSave} />;

      default:
        return null;
    }
  };

  return (
    <PageContainer className="h-app flex flex-col overflow-hidden">
      <SectionHeader title="Investigation Toolkit" subtitle="Ghost Hunting Tools" showBack />
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-footer pt-3 toolkit-scroll">
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 mb-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your paranormal investigation toolkit. Tap any tool to open its interactive interface. Always bring physical equipment as backup.
          </p>
        </div>

        {adGateTool ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`tkd-frame tkd-${adGateTool.type} p-4 bg-card/40 mb-4`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <ToolDevice type={adGateTool.type} icon={adGateTool.icon} stencil={adGateTool.stencil} size="sm" />
                <div>
                  <h3 className="font-heading text-sm font-semibold text-foreground">{adGateTool.name}</h3>
                  <p className="text-[10px] text-muted-foreground">{adGateTool.desc}</p>
                </div>
              </div>
              <button onClick={() => setAdGateTool(null)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ToolAdGate
              toolName={adGateTool.name}
              accountUnavailable={toolAdGate.accountUnavailable}
              onReload={loadUser}
              remaining={toolAdGate.remaining}
              earned={toolAdGate.earned}
              watching={toolAdGate.watching}
              granting={toolAdGate.granting}
              adError={toolAdGate.adError}
              onWatchAd={() => toolAdGate.watchAd(adGateTool.name)}
              onUseNow={() => handleAdGranted(adGateTool)}
            />
          </motion.div>
        ) : activeTool ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`tkd-frame tkd-${activeTool.type} p-4 bg-card/40 mb-4`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <ToolDevice type={activeTool.type} icon={activeTool.icon} stencil={activeTool.stencil} size="sm" />
                <div>
                  <h3 className="font-heading text-sm font-semibold text-foreground">{activeTool.name}</h3>
                  <p className="text-[10px] text-muted-foreground">{activeTool.desc}</p>
                </div>
              </div>
              <button onClick={() => {
                setActiveTool(null);
                if (recording) stopRecording();
                setRecordedBlob(null);
                setRecorderNotes('');
                setGuideDetail(null);
                stopNarration();
                toolAdGate.stopConsumption(activeTool?.name);
              }} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            {needsToolAdGate(user, activeTool?.name) && toolAdGate.remaining > 0 && (
              <div className="flex items-center justify-center gap-1.5 mb-3 text-[10px] text-primary font-mono">
                <Clock className="w-3 h-3" />
                <span className="animate-glow-pulse">{toolAdGate.remaining}s remaining</span>
              </div>
            )}
            {renderToolContent()}
          </motion.div>
        ) : (
          <p className="text-xs text-muted-foreground/60 text-center mb-4">Tap a tool below to open it</p>
        )}

        <ToolkitGrid
          tools={tools}
          activeTool={activeTool}
          onSelect={handleSelectTool}
          isAdmin={isAdmin}
          onReorder={handleReorder}
        />
      </div>
      <UpgradePrompt show={showUpgrade} onClose={() => setShowUpgrade(false)} reason={gateReason} />
      <EvidenceSaveAdGate
        show={evidenceAdGateOpen}
        remaining={evidenceDailyRemaining}
        onSuccess={onEvidenceAdSuccess}
        onClose={onEvidenceAdClose}
      />
      <UpgradePrompt show={showEvidenceUpgrade} onClose={() => setShowEvidenceUpgrade(false)} reason={evidenceGateReason} />
      {narrationAdGateEl}
      {gpsDialog}
      {trackingOffDialog}
      <NavBar />
    </PageContainer>
  );
}