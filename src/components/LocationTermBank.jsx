import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Library, MapPin, Play, Square, Save, RefreshCw, Loader2, Zap, Info, X, Activity, Video, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useGhostVoice from '../hooks/useGhostVoice';

const ROTATION_MS = 2000;         // each word stays 2 seconds
const TRIGGER_COOLDOWN_MS = 3500;
const ACCEL_THRESHOLD = 3.2;
const ORIENT_THRESHOLD = 28;

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function LocationTermBank() {
  const [phase, setPhase] = useState('idle'); // idle | loading | ready | running | stopped
  const [terms, setTerms] = useState([]);
  const [locationLabel, setLocationLabel] = useState('');
  const [lockedWord, setLockedWord] = useState(null);
  const [captured, setCaptured] = useState([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [videoBlob, setVideoBlob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sensorError, setSensorError] = useState('');

  const { isSpeaking, isGenerating, speak } = useGhostVoice();

  const rotRef = useRef(null);
  const drawRef = useRef(null);
  const canvasRef = useRef(null);
  const motionHandlerRef = useRef(null);
  const orientHandlerRef = useRef(null);
  const baselineRef = useRef(9.8);
  const lastOrientRef = useRef(null);
  const lastTriggerRef = useRef(0);
  const lockedRef = useRef(false);
  const termsRef = useRef([]);
  const currentWordRef = useRef('');
  const lockedWordRef = useRef(null);
  const sessionDurRef = useRef(0);
  const capturedRef = useRef([]);
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => { termsRef.current = terms; }, [terms]);
  useEffect(() => { capturedRef.current = captured; }, [captured]);

  // Resume scanning once narration of a locked word finishes
  useEffect(() => {
    if (lockedWord && !isSpeaking && !isGenerating) {
      setLockedWord(null);
      lockedWordRef.current = null;
      lockedRef.current = false;
      if (phase === 'running') startRotation();
    }
  }, [isSpeaking, isGenerating, lockedWord]);

  useEffect(() => () => stopEverything(), []);

  const stopEverything = () => {
    if (rotRef.current) { clearInterval(rotRef.current); rotRef.current = null; }
    if (drawRef.current) { clearInterval(drawRef.current); drawRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (motionHandlerRef.current) { window.removeEventListener('devicemotion', motionHandlerRef.current); motionHandlerRef.current = null; }
    if (orientHandlerRef.current) { window.removeEventListener('deviceorientation', orientHandlerRef.current); orientHandlerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { try { mediaRecorderRef.current.stop(); } catch {} }
    if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; }
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
        prompt: `Build a "spirit term bank" for a paranormal investigator standing at latitude ${coords.latitude}, longitude ${coords.longitude}. Identify the nearest city/town and region, then generate 60 single-word or short-phrase terms associated with THIS location's history, folklore, hauntings, notable people, landmarks, events, industries, and reported paranormal activity. Terms should be evocative nouns or short phrases a spirit might "select" — e.g. names, places, emotions, objects, occupations, dates, weather. Avoid generic words. Return a JSON object with "location" (nearest city, state/country) and "terms" (array of 60 strings).`,
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
    const pool = termsRef.current;
    if (pool.length) currentWordRef.current = pool[Math.floor(Math.random() * pool.length)];
    rotRef.current = setInterval(() => {
      if (lockedRef.current) return;
      const p = termsRef.current;
      if (!p.length) return;
      currentWordRef.current = p[Math.floor(Math.random() * p.length)];
    }, ROTATION_MS);
  };

  const triggerLock = useCallback(() => {
    const now = Date.now();
    if (lockedRef.current || now - lastTriggerRef.current < TRIGGER_COOLDOWN_MS) return;
    if (!termsRef.current.length) return;
    lastTriggerRef.current = now;
    const word = currentWordRef.current || termsRef.current[Math.floor(Math.random() * termsRef.current.length)];
    lockedRef.current = true;
    lockedWordRef.current = word;
    setLockedWord(word);
    currentWordRef.current = word;
    setCaptured(prev => { const updated = [...prev, { word, at: new Date().toLocaleTimeString() }]; capturedRef.current = updated; return updated; });
    try { speak(word, { creepy: true }); } catch {}
  }, [speak]);

  const requestSensorPermissions = async () => {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') { setSensorError('Motion sensor permission was denied. Lock-on-trigger needs movement detection — enable Motion & Orientation Access in your browser/Safari settings and reload.'); return false; }
      } catch { /* desktop works without */ }
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { await DeviceOrientationEvent.requestPermission(); } catch {}
    }
    return true;
  };

  const startSensors = async () => {
    const ok = await requestSensorPermissions();
    if (!ok) return;

    const motionHandler = (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
      if (Math.abs(mag - baselineRef.current) > ACCEL_THRESHOLD) triggerLock();
      baselineRef.current = baselineRef.current * 0.97 + mag * 0.03;
    };
    motionHandlerRef.current = motionHandler;
    window.addEventListener('devicemotion', motionHandler);

    const orientHandler = (e) => {
      const cur = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 };
      if (lastOrientRef.current == null) { lastOrientRef.current = cur; return; }
      const lo = lastOrientRef.current;
      if (Math.abs(cur.a - lo.a) > ORIENT_THRESHOLD || Math.abs(cur.b - lo.b) > ORIENT_THRESHOLD || Math.abs(cur.g - lo.g) > ORIENT_THRESHOLD) triggerLock();
      lastOrientRef.current = cur;
    };
    orientHandlerRef.current = orientHandler;
    window.addEventListener('deviceorientation', orientHandler);
  };

  // Canvas draw — renders what gets recorded
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const word = lockedWordRef.current || currentWordRef.current || '';

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    // subtle grid
    ctx.strokeStyle = 'rgba(0,200,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // title
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LOCATION TERM BANK', w / 2, 28);

    // REC indicator
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(w - 58, 22, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('REC ' + formatDuration(sessionDurRef.current), w - 14, 26);

    // main word
    ctx.textAlign = 'center';
    if (lockedWordRef.current) {
      ctx.shadowColor = 'rgba(34,211,238,0.9)';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText(word.toUpperCase(), w / 2, h / 2 + 8);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#67e8f9';
      ctx.font = '12px monospace';
      ctx.fillText('LOCKED — DICTATING', w / 2, h / 2 + 44);
    } else if (word) {
      ctx.fillStyle = 'rgba(148,163,184,0.55)';
      ctx.font = 'bold 34px sans-serif';
      ctx.fillText(word.toUpperCase(), w / 2, h / 2 + 8);
    }

    // captured count
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.fillText('CAPTURED: ' + capturedRef.current.length, 14, h - 14);
    ctx.textAlign = 'right';
    ctx.fillText((locationLabel || '').slice(0, 30), w - 14, h - 14);
  };

  const startDrawing = () => {
    if (drawRef.current) clearInterval(drawRef.current);
    draw();
    drawRef.current = setInterval(draw, 33);
  };

  const stopDrawing = () => {
    if (drawRef.current) { clearInterval(drawRef.current); drawRef.current = null; }
  };

  const startRecording = async () => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = audioStream;
      await new Promise(r => setTimeout(r, 150));
      if (!canvasRef.current || typeof canvasRef.current.captureStream !== 'function') {
        setSensorError('Recording not supported in this browser. The session still runs — you just won\'t get a video file.');
        return false;
      }
      const canvasStream = canvasRef.current.captureStream(30);
      const audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack) canvasStream.addTrack(audioTrack);
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';
      const mr = new MediaRecorder(canvasStream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = mr;
      videoChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(videoChunksRef.current, { type: mimeType || 'video/webm' });
        setVideoBlob(blob);
        canvasStream.getTracks().forEach(t => t.stop());
        audioStream.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
      };
      mr.start(1000);
      return true;
    } catch (e) {
      setSensorError('Microphone access denied. Grant permission to record the session.');
      return false;
    }
  };

  // Unlock HTML audio playback within a user gesture so sensor-triggered
  // speech plays on iOS without requiring an extra screen touch.
  const unlockAudio = () => {
    try {
      const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      a.volume = 0;
      a.play().then(() => { a.pause(); }).catch(() => {});
    } catch {}
  };

  const startSession = async () => {
    unlockAudio();
    setCaptured([]);
    setVideoBlob(null);
    setLockedWord(null);
    setSensorError('');
    lockedRef.current = false;
    lockedWordRef.current = null;
    baselineRef.current = 9.8;
    lastOrientRef.current = null;
    lastTriggerRef.current = 0;
    sessionDurRef.current = 0;
    setSessionDuration(0);
    setPhase('running');
    await startSensors();
    await new Promise(r => setTimeout(r, 80));
    startDrawing();
    await startRecording();
    startRotation();
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed++;
      sessionDurRef.current = elapsed;
      setSessionDuration(elapsed);
    }, 1000);
  };

  const stopSession = () => {
    if (rotRef.current) { clearInterval(rotRef.current); rotRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopDrawing();
    if (motionHandlerRef.current) { window.removeEventListener('devicemotion', motionHandlerRef.current); motionHandlerRef.current = null; }
    if (orientHandlerRef.current) { window.removeEventListener('deviceorientation', orientHandlerRef.current); orientHandlerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { try { mediaRecorderRef.current.stop(); } catch {} }
    lockedRef.current = false;
    setPhase('stopped');
  };

  const saveSession = async () => {
    if (!videoBlob) return;
    setSaving(true);
    try {
      const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([videoBlob], `term_bank_session.${ext}`, { type: videoBlob.type });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().slice(0, 5);
      await base44.entities.Evidence.create({
        title: `Location Term Bank — ${locationLabel} — ${date}`,
        type: 'video',
        description: `Location Term Bank session at ${locationLabel} — ${formatDuration(sessionDuration)} — ${captured.length} term(s) captured via environment trigger: ${captured.map(c => c.word).join(', ') || 'none'}.`,
        file_url,
        date,
        time,
        location_name: locationLabel,
      });
      setVideoBlob(null);
      setCaptured([]);
      setPhase('idle');
    } catch (e) {
      setError('Save failed. Please try again.');
    }
    setSaving(false);
  };

  const discard = () => {
    setVideoBlob(null);
    setCaptured([]);
    setLockedWord(null);
    setPhase('ready');
  };

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="space-y-4">
        {error && <p className="text-[11px] text-red-400/80 text-center">{error}</p>}
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-1.5">
          <p className="text-[10px] font-heading uppercase tracking-wider text-primary flex items-center gap-1.5"><Info className="w-3 h-3" /> How to Use</p>
          <ol className="text-[11px] text-foreground/70 leading-relaxed list-decimal pl-4 space-y-0.5">
            <li>Tap <span className="text-primary font-medium">Build Term Bank</span> — allow location access so AGES gathers 60 words tied to your area's history & hauntings.</li>
            <li>Tap <span className="text-primary font-medium">Start Session</span>. Words appear on screen for 2 seconds each; the session records.</li>
            <li>Hold your device still. Any sudden movement, tilt, or shake locks the current word on screen — it glows bright and is spoken aloud.</li>
            <li>After each word is dictated, the scan resumes automatically.</li>
            <li>Tap <span className="text-primary font-medium">Stop</span>, review the recording, then <span className="text-primary font-medium">Save</span> it to your Evidence Journal.</li>
          </ol>
        </div>
        <button onClick={generateBank} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors">
          <Library className="w-4 h-4" /> Build Term Bank
        </button>
      </div>
    );
  }

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center py-8 gap-2">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground">Gathering location terms…</p>
      </div>
    );
  }

  // ── READY ─────────────────────────────────────────────────────────────────
  if (phase === 'ready') {
    return (
      <div className="space-y-3">
        <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
          <MapPin className="w-3 h-3" /> {locationLabel} · {terms.length} terms
        </p>
        <div className="p-4 rounded-lg bg-black/40 border border-primary/20 text-center space-y-2">
          <Library className="w-8 h-8 text-primary mx-auto opacity-60" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">60 location terms ready. Start the session to begin the rotating word scan with environment-triggered dictation and screen recording.</p>
        </div>
        <button onClick={startSession} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors">
          <Play className="w-4 h-4" /> Start Session
        </button>
        <button onClick={generateBank} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-primary/30 hover:text-primary transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Rebuild Term Bank
        </button>
      </div>
    );
  }

  // ── RUNNING ───────────────────────────────────────────────────────────────
  if (phase === 'running') {
    return (
      <div className="space-y-3">
        {sensorError && (
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-300">{sensorError}</p>
          </div>
        )}
        <div className="rounded-lg overflow-hidden border border-border/30 bg-black relative">
          <canvas ref={canvasRef} width={640} height={360} className="w-full h-44 object-cover" />
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/80">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[9px] text-white font-mono">REC {formatDuration(sessionDuration)}</span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/70 text-center flex items-center justify-center gap-1">
          <Zap className="w-3 h-3 text-amber-400" /> Move, tilt, or shake the device to lock a word
        </p>
        {lockedWord && (
          <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center font-display text-2xl text-cyan-glow drop-shadow-[0_0_18px_hsl(185,80%,55%,0.85)] animate-glow-pulse">
            {lockedWord}
          </motion.p>
        )}
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
        <button onClick={stopSession} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-heading text-xs uppercase tracking-wider hover:bg-red-500/20 transition-colors">
          <Square className="w-3.5 h-3.5" /> Stop Session
        </button>
      </div>
    );
  }

  // ── STOPPED ───────────────────────────────────────────────────────────────
  if (phase === 'stopped') {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-card/30 border border-border/30 space-y-2">
          <p className="text-[10px] font-heading uppercase tracking-wider text-primary">Session Complete</p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Duration: {formatDuration(sessionDuration)}</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Terms: {captured.length}</span>
          </div>
        </div>

        {captured.length > 0 && (
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Captured Terms</p>
            {captured.map((c, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded bg-card/30 border border-border/20">
                <span className="text-[10px] text-muted-foreground font-mono">{c.at}</span>
                <span className="text-[10px] font-medium text-cyan-glow">{c.word}</span>
              </div>
            ))}
          </div>
        )}

        {videoBlob ? (
          <div className="space-y-3">
            <div className="p-2 rounded-lg bg-card/30 border border-border/30">
              <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Video className="w-3 h-3" /> Session Recording Ready
              </p>
              <video src={URL.createObjectURL(videoBlob)} controls className="w-full rounded" style={{ maxHeight: 180 }} />
            </div>
            <button onClick={saveSession} disabled={saving} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-heading text-xs uppercase tracking-wider hover:bg-green-500/20 transition-colors disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving to Evidence…' : 'Save Video to Evidence Journal'}
            </button>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-card/30 border border-border/30 text-center">
            <p className="text-xs text-muted-foreground">No video captured (recording may not have been available).</p>
          </div>
        )}

        <button onClick={discard} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-red-500/30 hover:text-red-400 transition-colors">
          <X className="w-3.5 h-3.5" /> Discard & Reset
        </button>
      </div>
    );
  }

  return null;
}