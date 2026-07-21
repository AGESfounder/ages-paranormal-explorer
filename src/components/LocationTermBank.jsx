import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Library, MapPin, Play, Square, Save, RefreshCw, Loader2, Volume2, Video, VideoOff, X, Zap, Info } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useGhostVoice from '../hooks/useGhostVoice';

const ROTATION_MS = 110;          // how fast words cycle
const TRIGGER_COOLDOWN_MS = 3500; // min time between triggers
const ACCEL_THRESHOLD = 3.2;      // m/s² deviation from gravity baseline
const ORIENT_THRESHOLD = 28;     // degrees of sudden tilt

export default function LocationTermBank() {
  const [phase, setPhase] = useState('idle'); // idle | loading | ready | running
  const [terms, setTerms] = useState([]);
  const [locationLabel, setLocationLabel] = useState('');
  const [currentWord, setCurrentWord] = useState('');
  const [lockedWord, setLockedWord] = useState(null);
  const [captured, setCaptured] = useState([]);
  const [error, setError] = useState('');

  // screen recording
  const [recState, setRecState] = useState('idle'); // idle | recording | stopped
  const [recBlob, setRecBlob] = useState(null);
  const [recDuration, setRecDuration] = useState(0);
  const [recError, setRecError] = useState('');
  const [saving, setSaving] = useState(false);

  const { isSpeaking, isGenerating, narrate } = useGhostVoice();

  const rotRef = useRef(null);
  const motionHandlerRef = useRef(null);
  const orientHandlerRef = useRef(null);
  const baselineRef = useRef(9.8);
  const lastTriggerRef = useRef(0);
  const lockedRef = useRef(false);
  const termsRef = useRef([]);
  const recRef = useRef(null);
  const recChunksRef = useRef([]);
  const recStreamRef = useRef(null);
  const recTimerRef = useRef(null);

  useEffect(() => { termsRef.current = terms; }, [terms]);

  // Resume scanning once narration of a locked word finishes
  useEffect(() => {
    if (lockedWord && !isSpeaking && !isGenerating) {
      setLockedWord(null);
      lockedRef.current = false;
      if (phase === 'running') startRotation();
    }
  }, [isSpeaking, isGenerating, lockedWord]);

  useEffect(() => () => stopEverything(), []);

  const stopEverything = () => {
    if (rotRef.current) { clearInterval(rotRef.current); rotRef.current = null; }
    if (motionHandlerRef.current) { window.removeEventListener('devicemotion', motionHandlerRef.current); motionHandlerRef.current = null; }
    if (orientHandlerRef.current) { window.removeEventListener('deviceorientation', orientHandlerRef.current); orientHandlerRef.current = null; }
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    if (recRef.current && recRef.current.state === 'recording') { try { recRef.current.stop(); } catch {} }
    if (recStreamRef.current) { recStreamRef.current.getTracks().forEach(t => t.stop()); recStreamRef.current = null; }
  };

  const generateBank = async () => {
    setPhase('loading');
    setError('');
    setTerms([]);
    setCaptured([]);
    try {
      const coords = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('no geo'));
        navigator.geolocation.getCurrentPosition(p => resolve(p.coords), () => reject(new Error('denied')), { timeout: 8000 });
      });

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Build a "spirit term bank" for a paranormal investigator standing at latitude ${coords.latitude}, longitude ${coords.longitude}. Identify the nearest city/town and region, then generate 50 single-word or short-phrase terms associated with THIS location's history, folklore, hauntings, notable people, landmarks, events, industries, and reported paranormal activity. Terms should be evocative nouns or short phrases a spirit might "select" — e.g. names, places, emotions, objects, occupations, dates, weather. Avoid generic words. Return a JSON object with "location" (nearest city, state/country) and "terms" (array of 50 strings).`,
        response_json_schema: {
          type: 'object',
          properties: {
            location: { type: 'string' },
            terms: { type: 'array', items: { type: 'string' } },
          },
        },
        model: 'gemini_3_flash',
        add_context_from_internet: true,
      });
      const list = (res.terms || []).filter(t => t && typeof t === 'string');
      if (list.length === 0) throw new Error('No terms returned');
      setTerms(list);
      setLocationLabel(res.location || 'your location');
      setPhase('ready');
    } catch (e) {
      setError('Could not build a term bank for your location. Allow location access and try again.');
      setPhase('idle');
    }
  };

  const startRotation = () => {
    if (rotRef.current) clearInterval(rotRef.current);
    rotRef.current = setInterval(() => {
      const pool = termsRef.current;
      if (!pool.length) return;
      setCurrentWord(pool[Math.floor(Math.random() * pool.length)]);
    }, ROTATION_MS);
  };

  const triggerLock = useCallback(() => {
    const now = Date.now();
    if (lockedRef.current || now - lastTriggerRef.current < TRIGGER_COOLDOWN_MS) return;
    if (!termsRef.current.length) return;
    lastTriggerRef.current = now;
    const word = currentWord || termsRef.current[Math.floor(Math.random() * termsRef.current.length)];
    if (rotRef.current) { clearInterval(rotRef.current); rotRef.current = null; }
    lockedRef.current = true;
    setLockedWord(word);
    setCurrentWord(word);
    setCaptured(prev => [...prev, { word, at: new Date().toLocaleTimeString() }]);
    try { narrate(word); } catch {}
  }, [currentWord, narrate]);

  const startSensors = async () => {
    // iOS 13+ requires explicit permission
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceMotionEvent.requestPermission();
        if (perm !== 'granted') { /* still attach; desktop works without it */ }
      } catch {}
    }

    const motionHandler = (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
      if (Math.abs(mag - baselineRef.current) > ACCEL_THRESHOLD) triggerLock();
      // gently track baseline so slow drifts don't fire
      baselineRef.current = baselineRef.current * 0.97 + mag * 0.03;
    };
    motionHandlerRef.current = motionHandler;
    window.addEventListener('devicemotion', motionHandler);

    let lastOrient = null;
    const orientHandler = (e) => {
      if (lastOrient == null) { lastOrient = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 }; return; }
      const da = Math.abs((e.alpha || 0) - lastOrient.a);
      const db = Math.abs((e.beta || 0) - lastOrient.b);
      const dg = Math.abs((e.gamma || 0) - lastOrient.g);
      if (da > ORIENT_THRESHOLD || db > ORIENT_THRESHOLD || dg > ORIENT_THRESHOLD) triggerLock();
      lastOrient = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 };
    };
    orientHandlerRef.current = orientHandler;
    window.addEventListener('deviceorientation', orientHandler);
  };

  const startScreenRecord = async () => {
    setRecError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        setRecError('Screen recording not supported on this device. Session will run without recording.');
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      recStreamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: 'video/webm' });
      recChunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size) recChunksRef.current.push(ev.data); };
      mr.onstop = () => {
        const blob = new Blob(recChunksRef.current, { type: 'video/webm' });
        setRecBlob(blob);
        setRecState('stopped');
      };
      stream.getVideoTracks()[0].addEventListener('ended', () => stopSession());
      mr.start();
      recRef.current = mr;
      setRecState('recording');
      setRecDuration(0);
      recTimerRef.current = setInterval(() => setRecDuration(d => d + 1), 1000);
    } catch (e) {
      setRecError('Screen recording was denied or unavailable. Session will run without recording.');
    }
  };

  const startSession = async () => {
    setCaptured([]);
    setLockedWord(null);
    lockedRef.current = false;
    baselineRef.current = 9.8;
    lastTriggerRef.current = 0;
    setPhase('running');
    startRotation();
    await startSensors();
    await startScreenRecord();
  };

  const stopSession = () => {
    if (rotRef.current) { clearInterval(rotRef.current); rotRef.current = null; }
    if (motionHandlerRef.current) { window.removeEventListener('devicemotion', motionHandlerRef.current); motionHandlerRef.current = null; }
    if (orientHandlerRef.current) { window.removeEventListener('deviceorientation', orientHandlerRef.current); orientHandlerRef.current = null; }
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
    if (recRef.current && recRef.current.state === 'recording') { try { recRef.current.stop(); } catch {} }
    if (recStreamRef.current) { recStreamRef.current.getTracks().forEach(t => t.stop()); recStreamRef.current = null; }
    if (recState !== 'recording') setRecState(recBlob ? 'stopped' : 'idle');
    setPhase('ready');
  };

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const saveSession = async () => {
    if (!recBlob) return;
    setSaving(true);
    try {
      const file = new File([recBlob], 'term_bank_session.webm', { type: 'video/webm' });
      const up = await base44.integrations.Core.UploadFile({ file });
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      await base44.entities.Evidence.create({
        title: `Location Term Bank — ${locationLabel} — ${date}`,
        type: 'video',
        description: `Location Term Bank session at ${locationLabel}. ${captured.length} term(s) captured via environment trigger: ${captured.map(c => c.word).join(', ') || 'none'}. Duration: ${fmt(recDuration)}.`,
        file_url: up.file_url,
        date,
        time,
        location_name: locationLabel,
      });
      setRecBlob(null);
      setRecDuration(0);
      setRecState('idle');
    } catch (e) {
      setError('Save failed. Please try again.');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Directions */}
      <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-1.5">
        <p className="text-[10px] font-heading uppercase tracking-wider text-primary flex items-center gap-1.5"><Info className="w-3 h-3" /> How to Use</p>
        <ol className="text-[11px] text-foreground/70 leading-relaxed list-decimal pl-4 space-y-0.5">
          <li>Tap <span className="text-primary font-medium">Build Term Bank</span> — allow location access so AGES gathers 50 words tied to your area's history & hauntings.</li>
          <li>Tap <span className="text-primary font-medium">Start Session</span>. Words flash rapidly on screen; screen recording begins.</li>
          <li>Hold your device still. Any sudden movement, tilt, or shake "locks" the word on screen — it glows bright and is spoken aloud.</li>
          <li>After each word is dictated, the rapid scan resumes automatically.</li>
          <li>Tap <span className="text-primary font-medium">Stop</span> to end, then <span className="text-primary font-medium">Save</span> the screen recording to your Evidence Journal.</li>
        </ol>
      </div>

      {phase === 'idle' && (
        <button onClick={generateBank} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors">
          <Library className="w-4 h-4" /> Build Term Bank
        </button>
      )}

      {phase === 'loading' && (
        <div className="flex flex-col items-center py-8 gap-2">
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground">Gathering location terms…</p>
        </div>
      )}

      {(phase === 'ready' || phase === 'running') && (
        <>
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
            <MapPin className="w-3 h-3" /> {locationLabel} · {terms.length} terms
          </p>

          {/* Word display */}
          <div className="relative rounded-xl border border-border/50 bg-black/60 overflow-hidden flex items-center justify-center min-h-[180px]">
            {phase === 'running' && recState === 'recording' && (
              <span className="absolute top-2 right-2 flex items-center gap-1 text-[9px] font-mono text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> REC {fmt(recDuration)}
              </span>
            )}
            <AnimatePresence mode="popLayout">
              {lockedWord ? (
                <motion.p
                  key={lockedWord + '-lock'}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="px-4 text-center font-display text-3xl text-cyan-glow drop-shadow-[0_0_18px_hsl(185,80%,55%,0.85)] animate-glow-pulse"
                >
                  {lockedWord}
                </motion.p>
              ) : currentWord ? (
                <motion.p
                  key={currentWord + Math.random()}
                  initial={{ opacity: 0.2 }}
                  animate={{ opacity: 0.5 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="px-4 text-center font-display text-2xl text-muted-foreground/70"
                >
                  {currentWord}
                </motion.p>
              ) : (
                <p className="text-xs text-muted-foreground/50">—</p>
              )}
            </AnimatePresence>
          </div>

          {/* Status / controls */}
          {phase === 'ready' && (
            <button onClick={startSession} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors">
              <Play className="w-4 h-4" /> Start Session
            </button>
          )}

          {phase === 'running' && (
            <button onClick={stopSession} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-heading text-xs uppercase tracking-wider hover:bg-red-500/20 transition-colors">
              <Square className="w-3.5 h-3.5" /> Stop Session
            </button>
          )}

          {/* Sensor hint */}
          {phase === 'running' && (
            <p className="text-[10px] text-muted-foreground/70 text-center flex items-center justify-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" /> Move, tilt, or shake the device to lock a word
            </p>
          )}

          {recError && <p className="text-[10px] text-amber-400/80 text-center">{recError}</p>}

          {/* Captured terms */}
          {captured.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Captured Terms ({captured.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {captured.map((c, i) => (
                  <span key={i} className="px-2 py-1 rounded text-[10px] bg-cyan-glow/10 border border-cyan-glow/30 text-cyan-glow font-mono">
                    {c.word} <span className="text-muted-foreground/60">· {c.at}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Save recording */}
          {recState === 'stopped' && recBlob && (
            <div className="space-y-2">
              <video src={URL.createObjectURL(recBlob)} controls className="w-full rounded-lg border border-border/40" />
              <button onClick={saveSession} disabled={saving} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-heading text-xs uppercase tracking-wider hover:bg-green-500/20 transition-colors disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {saving ? 'Saving…' : 'Save Recording to Journal'}
              </button>
              <button onClick={() => { setRecBlob(null); setRecState('idle'); }} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-red-500/30 hover:text-red-400 transition-colors">
                <X className="w-3.5 h-3.5" /> Discard Recording
              </button>
            </div>
          )}

          {phase === 'ready' && (
            <button onClick={generateBank} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-primary/30 hover:text-primary transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Rebuild Term Bank
            </button>
          )}
        </>
      )}

      {error && <p className="text-[11px] text-red-400/80 text-center">{error}</p>}
    </div>
  );
}