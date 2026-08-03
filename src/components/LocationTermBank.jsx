import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Library, MapPin, Play, Square, Save, RefreshCw, Loader2, Zap, Info, X, Activity, Video, AlertTriangle, Camera } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useGhostVoice from '../hooks/useGhostVoice';
import { detectFigures } from '@/lib/anomalyDetect';
import useSensitivity from '../hooks/useSensitivity';
import SensitivityControl from './SensitivityControl';

const ROTATION_MS = 3000;         // each word stays 3 seconds
const TRIGGER_COOLDOWN_MS = 3500;
const ACCEL_THRESHOLD = 0.8;
const ORIENT_THRESHOLD = 6;

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
  const [cameraActive, setCameraActive] = useState(false);
  const [anomalyDetected, setAnomalyDetected] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);

  const { sensitivity, setSensitivity, sensitivityRef } = useSensitivity();

  const { isSpeaking, isGenerating, speak, unlock, attachMicToRecording } = useGhostVoice();

  const speakNormal = (word) => {
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const synth = window.speechSynthesis;
      try { synth.getVoices(); } catch {}
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-US';
      u.rate = 0.9;
      u.pitch = 1;
      u.volume = 1;
      const voices = synth.getVoices();
      const en = voices.find(v => /^en[-_]US/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang));
      if (en) u.voice = en;
      femaleBusyRef.current = true;
      u.onend = () => {
        femaleBusyRef.current = false;
        if (pendingMaleRef.current) { const cb = pendingMaleRef.current; pendingMaleRef.current = null; cb(); }
      };
      u.onerror = () => {
        femaleBusyRef.current = false;
        if (pendingMaleRef.current) { const cb = pendingMaleRef.current; pendingMaleRef.current = null; cb(); }
      };
      synth.speak(u);
    } catch { femaleBusyRef.current = false; }
  };

  const stopNormalVoice = () => {
    pendingMaleRef.current = null;
    femaleBusyRef.current = false;
    try { if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); } catch {}
  };

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
  const cameraStreamRef = useRef(null);
  const camVideoRef = useRef(null);
  const detectCanvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const anomalyTimerRef = useRef(null);
  const motionTimerRef = useRef(null);
  const femaleBusyRef = useRef(false);
  const pendingMaleRef = useRef(null);
  const speechStartedRef = useRef(false);

  useEffect(() => { termsRef.current = terms; }, [terms]);
  useEffect(() => { capturedRef.current = captured; }, [captured]);

  // Resume scanning once narration of a locked word has actually started AND
  // finished — wait for isGenerating/isSpeaking to go true first so we don't
  // resume before the male voice begins.
  useEffect(() => {
    if (lockedWord && (isGenerating || isSpeaking)) speechStartedRef.current = true;
    if (lockedWord && speechStartedRef.current && !isSpeaking && !isGenerating) {
      speechStartedRef.current = false;
      setLockedWord(null);
      lockedWordRef.current = null;
      lockedRef.current = false;
      if (phase === 'running') startRotation();
    }
  }, [isSpeaking, isGenerating, lockedWord, phase]);

  useEffect(() => () => stopEverything(), []);

  const stopEverything = () => {
    stopNormalVoice();
    if (rotRef.current) { clearInterval(rotRef.current); rotRef.current = null; }
    if (drawRef.current) { clearInterval(drawRef.current); drawRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (motionHandlerRef.current) { window.removeEventListener('devicemotion', motionHandlerRef.current); motionHandlerRef.current = null; }
    if (orientHandlerRef.current) { window.removeEventListener('deviceorientation', orientHandlerRef.current); orientHandlerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { try { mediaRecorderRef.current.stop(); } catch {} }
    if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (anomalyTimerRef.current) { clearTimeout(anomalyTimerRef.current); anomalyTimerRef.current = null; }
    if (motionTimerRef.current) { clearTimeout(motionTimerRef.current); motionTimerRef.current = null; }
    if (cameraStreamRef.current) { cameraStreamRef.current.getTracks().forEach(t => t.stop()); cameraStreamRef.current = null; }
    setMotionDetected(false);
  };

  const generateBank = async () => {
    setPhase('loading');
    setError('');
    setTerms([]);
    setCaptured([]);
    try {
      // ── Priority: extract terms from the user's current tour stop ──
      const me = await base44.auth.me().catch(() => null);
      if (me?.last_stop_id) {
        try {
          const stop = await base44.entities.TourStop.get(me.last_stop_id);
          if (stop) {
            let tour = null;
            if (stop.tour_id) { try { tour = await base44.entities.Tour.get(stop.tour_id); } catch {} }
            const textParts = [
              stop.name,
              stop.historical_info,
              stop.paranormal_info,
              stop.famous_people,
              stop.construction_date,
              stop.address,
              stop.hours_of_operation,
              ...(stop.investigation_suggestions || []),
              ...((stop.people || []).map(p => p.name ? `${p.name}: ${p.story}` : p.story)),
            ].filter(Boolean);
            const stopText = textParts.join('\n\n');
            if (stopText.trim().length > 30) {
              const res = await base44.integrations.Core.InvokeLLM({
                prompt: `Analyze the following text from a paranormal tour stop and extract a word bank of terms for a "spirit communication" sweeper tool.

Extract terms in these 5 categories:
1. NAMES — proper nouns (people, places, buildings, ships) mentioned in the text
2. MOST REPEATED NOUNS — nouns that appear most frequently in the text
3. MOST REPEATED VERBS — action verbs that appear most frequently (EXCLUDE linking verbs and helping verbs)
4. IMPORTANT PHRASES — meaningful 2-4 word phrases that capture key concepts from the text
5. TIME-RELATED WORDS — dates, years, days of the week, months, and time references

EXCLUDE these parts of speech entirely:
- Articles (a, an, the)
- Prepositions (in, on, at, to, of, for, with, from, by, about, under, over, etc.)
- Linking verbs (is, are, was, were, be, been, being, seem, appear, become)
- Helping verbs (have, has, had, do, does, did, will, would, can, could, should, shall, may, might, must)

Return 40-60 terms total, mixing all 5 categories. Each term should be a single word or short phrase (no full sentences). Return as JSON.

STOP TEXT:
${stopText}`,
                response_json_schema: {
                  type: 'object',
                  properties: {
                    terms: { type: 'array', items: { type: 'string' } },
                  },
                },
                model: 'gemini_3_flash',
              });
              const list = (res.terms || []).filter(t => t && typeof t === 'string');
              if (list.length > 0) {
                setTerms(list);
                setLocationLabel(stop.name || tour?.title || 'current stop');
                setPhase('ready');
                return;
              }
            }
          }
        } catch {}
      }

      // ── Fallback: original geolocation + LLM approach ──
      const coords = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('no geo'));
        navigator.geolocation.getCurrentPosition(p => resolve(p.coords), () => reject(new Error('denied')), { timeout: 8000 });
      });

      // Pull nearby AGES ghost tours + their documented stops so the term
      // bank reflects localized paranormal history and the closest tours.
      let tourContext = '';
      try {
        const allTours = await base44.entities.Tour.list('-created_date', 100);
        const dist = (lat, lon) => {
          const R = 3958.8, dLat = (lat - coords.latitude) * Math.PI / 180, dLon = (lon - coords.longitude) * Math.PI / 180;
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(coords.latitude * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };
        const nearest = allTours
          .filter(t => t.start_latitude && t.start_longitude)
          .map(t => ({ t, d: dist(t.start_latitude, t.start_longitude) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 6);
        for (const { t, d } of nearest.slice(0, 5)) {
          const stops = await base44.entities.TourStop.filter({ tour_id: t.id });
          const stopNames = (stops || []).map(s => s.name).filter(Boolean).slice(0, 10).join(', ');
          tourContext += `\n- "${t.title}" — ${t.city}, ${t.state} (~${d.toFixed(1)} mi). ${(t.description || '').trim()} Documented stops: ${stopNames || 'n/a'}.`;
        }
      } catch {}

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate 60 single-word or short-phrase terms a spirit might "select" for a paranormal investigator standing at latitude ${coords.latitude}, longitude ${coords.longitude}. Identify the nearest city/town and region first.

IMPORTANT CONSTRAINTS:
- Do NOT include the words "yes" or "no".
- Do NOT include generic paranormal jargon common to any haunted place (e.g. shadow, cold spot, orbs, apparition, EMF, footsteps, cemetery, whisper, ghost, spirit, haunting, demon). Every term must be specific to THIS location.

All 60 terms must relate to THIS location's paranormal history OR general history. Across the 60, mix:
- PEOPLE (about 20): real or historically plausible names of people tied to THIS location — founders, residents, victims, reported ghosts, notable figures. Use full names or first names drawn from local history.
- HISTORY NOUNS (about 25): nouns tied to THIS location's history, era, landmarks, buildings, industry, objects, occupations, dates, and documented events — specific to the area, not generic.
- PARANORMAL-HISTORY TERMS (about 15): terms specific to THIS location's documented hauntings and local folklore — names of local spirits, the specific reported phenomena at this place, local legend names, haunted landmarks, and documented paranormal events — never generic paranormal vocabulary.

${tourContext ? `Closest documented AGES ghost tours and their stops near the user — draw names, figures, and history from these:\n${tourContext}` : "No nearby tours were found — rely on the area's own history and folklore."}

Keep each term short. Return a JSON object with "location" (nearest city, state/country) and "terms" (array of 60 strings).`,
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
    if (pool.length) {
      currentWordRef.current = pool[Math.floor(Math.random() * pool.length)];
      speakNormal(currentWordRef.current);
    }
    rotRef.current = setInterval(() => {
      if (lockedRef.current) return;
      const p = termsRef.current;
      if (!p.length) return;
      currentWordRef.current = p[Math.floor(Math.random() * p.length)];
      speakNormal(currentWordRef.current);
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
    speechStartedRef.current = false;
    // Let the female voice finish the current word, then speak male
    const speakMale = () => {
      try { speak(word, {}); } catch {}
    };
    if (femaleBusyRef.current) {
      pendingMaleRef.current = speakMale;
    } else {
      speakMale();
    }
  }, [speak]);

  const flashMotion = useCallback(() => {
    setMotionDetected(true);
    if (motionTimerRef.current) clearTimeout(motionTimerRef.current);
    motionTimerRef.current = setTimeout(() => setMotionDetected(false), 3000);
  }, []);

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

  const attachSensorHandlers = () => {
    const motionHandler = (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
      if (Math.abs(mag - baselineRef.current) > ACCEL_THRESHOLD) { flashMotion(); triggerLock(); }
      baselineRef.current = baselineRef.current * 0.97 + mag * 0.03;
    };
    motionHandlerRef.current = motionHandler;
    window.addEventListener('devicemotion', motionHandler);

    const orientHandler = (e) => {
      const cur = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 };
      if (lastOrientRef.current == null) { lastOrientRef.current = cur; return; }
      const lo = lastOrientRef.current;
      if (Math.abs(cur.a - lo.a) > ORIENT_THRESHOLD || Math.abs(cur.b - lo.b) > ORIENT_THRESHOLD || Math.abs(cur.g - lo.g) > ORIENT_THRESHOLD) { flashMotion(); triggerLock(); }
      lastOrientRef.current = cur;
    };
    orientHandlerRef.current = orientHandler;
    window.addEventListener('deviceorientation', orientHandler);
  };

  // Camera-based anomaly trigger: starts the camera stream only. Frame
  // processing (processCameraFrame) is started separately AFTER the settle
  // pause so motion from tapping the permission buttons doesn't trigger a
  // lock before the device has settled.
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (camVideoRef.current) {
        camVideoRef.current.srcObject = stream;
        await camVideoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (e) {
      setSensorError(prev => (prev ? prev + ' ' : '') + 'Camera access denied — anomaly trigger disabled, but motion/orientation triggers still work.');
    }
  };

  const processCameraFrame = () => {
    const video = camVideoRef.current;
    const canvas = detectCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processCameraFrame);
      return;
    }
    const w = video.videoWidth || 320;
    const h = video.videoHeight || 240;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    try {
      const imageData = ctx.getImageData(0, 0, w, h);
      const figures = detectFigures(imageData, w, h, sensitivityRef.current);
      if (figures.length > 0) {
        setAnomalyDetected(true);
        if (anomalyTimerRef.current) clearTimeout(anomalyTimerRef.current);
        anomalyTimerRef.current = setTimeout(() => setAnomalyDetected(false), 3000);
        triggerLock();
      }
    } catch {}
    animFrameRef.current = requestAnimationFrame(processCameraFrame);
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
    ctx.fillText('TERM SWEEPER', w / 2, 28);

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
      // Mix the mic + creepy-voice speech (Web Audio) so dictated terms are
      // captured directly in the recorded video, not just ambient sound.
      const mixedTrack = attachMicToRecording(audioStream);
      let audioTrack = mixedTrack || audioStream.getAudioTracks()[0];
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
        canvasStream.getVideoTracks().forEach(t => t.stop());
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

  const startSession = async () => {
    unlock();
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
    // Prime speechSynthesis within the user gesture so the word dictation
    // (spoken later, after the permission prompts + settle pause) plays on iOS.
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch {}
    // Request all permissions up front (just the prompts). Sensor handlers
    // and camera frame processing are attached AFTER the settle pause so
    // motion from tapping the permission buttons doesn't trigger a lock.
    await requestSensorPermissions();
    await startCamera();
    startDrawing();
    await startRecording();
    // 3-second pause after the last permission prompt (mic) — tapping the
    // screen to grant permission sets off the motion sensor, so we wait for
    // the device to settle before starting the word rotation.
    await new Promise(r => setTimeout(r, 3000));
    attachSensorHandlers();
    processCameraFrame();
    startRotation();
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed++;
      sessionDurRef.current = elapsed;
      setSessionDuration(elapsed);
    }, 1000);
  };

  const stopSession = () => {
    stopNormalVoice();
    if (rotRef.current) { clearInterval(rotRef.current); rotRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopDrawing();
    if (motionHandlerRef.current) { window.removeEventListener('devicemotion', motionHandlerRef.current); motionHandlerRef.current = null; }
    if (orientHandlerRef.current) { window.removeEventListener('deviceorientation', orientHandlerRef.current); orientHandlerRef.current = null; }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (anomalyTimerRef.current) { clearTimeout(anomalyTimerRef.current); anomalyTimerRef.current = null; }
    if (motionTimerRef.current) { clearTimeout(motionTimerRef.current); motionTimerRef.current = null; }
    if (cameraStreamRef.current) { cameraStreamRef.current.getTracks().forEach(t => t.stop()); cameraStreamRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { try { mediaRecorderRef.current.stop(); } catch {} }
    setCameraActive(false);
    setAnomalyDetected(false);
    setMotionDetected(false);
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
        title: `Term Sweeper — ${locationLabel} — ${date}`,
        type: 'video',
        description: `Term Sweeper session at ${locationLabel} — ${formatDuration(sessionDuration)} — ${captured.length} term(s) captured via environment trigger: ${captured.map(c => c.word).join(', ') || 'none'}.`,
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
            <li>Tap <span className="text-primary font-medium">Build Terms</span> — if you're on a tour stop, AGES extracts terms from that stop's history (names, nouns, verbs, phrases, time words); otherwise it gathers words tied to your area's history & hauntings.</li>
            <li>Tap <span className="text-primary font-medium">Start Session</span>. Words appear on screen for 3 seconds each, each spoken aloud in a female voice; the session records.</li>
            <li>For best accuracy and functionality, place your device on a stand or prop it up so it faces an area where no "living things" are visible……. OR…… hold your device still. Any sudden movement, tilt, or shake locks the current word on screen — it glows bright and is spoken aloud in a male voice. The IR camera also watches for anomalies: a detected figure locks the current word the same way.</li>
            <li>After each word is dictated, the scan resumes automatically with a new random word every 3 seconds.</li>
            <li>Tap <span className="text-primary font-medium">Stop</span>, review the recording, then <span className="text-primary font-medium">Save</span> it to your Evidence Journal.</li>
          </ol>
        </div>
        <SensitivityControl sensitivity={sensitivity} onChange={setSensitivity} />
        <button onClick={generateBank} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors">
          <Library className="w-4 h-4" /> Build Terms
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
          <p className="text-[11px] text-muted-foreground leading-relaxed">{terms.length} terms ready. Start the session to begin the rotating word scan with environment-triggered dictation and screen recording.</p>
        </div>
        <button onClick={startSession} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors">
          <Play className="w-4 h-4" /> Start Session
        </button>
        <button onClick={generateBank} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-primary/30 hover:text-primary transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Rebuild Terms
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
          {cameraActive && (
            <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/80">
              <Camera className="w-2.5 h-2.5 text-white" />
              <span className="text-[9px] text-white font-mono">IR</span>
            </div>
          )}
          {anomalyDetected && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-none">
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="px-3 py-1 rounded bg-red-500/90 border border-red-300/50">
                <p className="text-[10px] font-mono text-white font-bold tracking-wider">⚠ ANOMALY DETECTED</p>
              </motion.div>
            </div>
          )}
          {motionDetected && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none">
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="px-3 py-1 rounded bg-amber-500/90 border border-amber-300/50">
                <p className="text-[10px] font-mono text-white font-bold tracking-wider">⚠ MOTION DETECTED</p>
              </motion.div>
            </div>
          )}
        </div>
        {/* Hidden camera elements for IR anomaly detection */}
        <video ref={camVideoRef} className="hidden" playsInline muted />
        <canvas ref={detectCanvasRef} className="hidden" />
        <p className="text-[10px] text-muted-foreground/70 text-center flex items-center justify-center gap-1">
          <Zap className="w-3 h-3 text-amber-400" /> Move, tilt, or shake the device — or let the IR camera detect an anomaly — to lock a word
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