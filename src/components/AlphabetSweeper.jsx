import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Square, Save, Loader2, Zap, Info, X, Activity, Video, AlertTriangle, Type, Camera } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useGhostVoice from '../hooks/useGhostVoice';
import { detectFigures } from '@/lib/anomalyDetect';
import useSensitivity from '../hooks/useSensitivity';
import SensitivityControl from './SensitivityControl';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const LETTER_MS = 2000;          // each letter displayed 2 seconds
const TRIGGER_COOLDOWN_MS = 3500;
const ACCEL_THRESHOLD = 0.8;
const ORIENT_THRESHOLD = 6;

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function AlphabetSweeper() {
  const [phase, setPhase] = useState('idle'); // idle | running | stopped
  const [currentLetter, setCurrentLetter] = useState('A');
  const [lockedLetter, setLockedLetter] = useState(null);
  const [captured, setCaptured] = useState([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [videoBlob, setVideoBlob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sensorError, setSensorError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [anomalyDetected, setAnomalyDetected] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [paused, setPaused] = useState(false);

  const { sensitivity, setSensitivity, sensitivityRef } = useSensitivity();

  const { isSpeaking, isGenerating, speak, unlock, attachMicToRecording } = useGhostVoice();

  // Pre-generate high-quality TTS audio for each letter (cached across sessions
  // for as long as the component stays mounted). Uses the "honey" voice — a
  // warm, natural-sounding female voice — instead of robotic browser TTS.
  const preGenerateLetters = async () => {
    if (Object.keys(letterAudioRef.current).length >= 26) return;
    try {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const results = await Promise.all(
        letters.map(l => base44.integrations.Core.GenerateSpeech({ text: l.toLowerCase(), voice: 'honey' }))
      );
      letters.forEach((l, i) => { if (results[i]?.url) letterAudioRef.current[l.toLowerCase()] = results[i].url; });
    } catch {}
  };

  // Play the pre-generated female voice for a letter. Skips audio if the
  // letter hasn't been generated yet (the on-screen letter still displays).
  const speakNormal = (letter) => {
    const url = letterAudioRef.current[letter.toLowerCase()];
    if (!url) return;
    if (femaleAudioRef.current) { try { femaleAudioRef.current.pause(); } catch {} femaleAudioRef.current = null; }
    const audio = new Audio(url);
    femaleAudioRef.current = audio;
    audio.volume = 1;
    femaleBusyRef.current = true;
    audio.onended = () => {
      femaleBusyRef.current = false;
      femaleAudioRef.current = null;
      if (pendingMaleRef.current) { const cb = pendingMaleRef.current; pendingMaleRef.current = null; cb(); }
    };
    audio.onerror = () => {
      femaleBusyRef.current = false;
      femaleAudioRef.current = null;
      if (pendingMaleRef.current) { const cb = pendingMaleRef.current; pendingMaleRef.current = null; cb(); }
    };
    audio.play().catch(() => {
      femaleBusyRef.current = false;
      femaleAudioRef.current = null;
      if (pendingMaleRef.current) { const cb = pendingMaleRef.current; pendingMaleRef.current = null; cb(); }
    });
  };

  const stopFemaleAudio = () => {
    pendingMaleRef.current = null;
    femaleBusyRef.current = false;
    if (femaleAudioRef.current) { try { femaleAudioRef.current.pause(); } catch {} femaleAudioRef.current = null; }
    if (directionsAudioRef.current) { try { directionsAudioRef.current.pause(); } catch {} directionsAudioRef.current = null; }
  };

  const stepRef = useRef(null);
  const drawRef = useRef(null);
  const canvasRef = useRef(null);
  const motionHandlerRef = useRef(null);
  const orientHandlerRef = useRef(null);
  const baselineRef = useRef(9.8);
  const lastOrientRef = useRef(null);
  const lastTriggerRef = useRef(0);
  const lockedRef = useRef(false);
  const indexRef = useRef(0);
  const lockedLetterRef = useRef(null);
  const creepyStartedRef = useRef(false);
  const creepyFallbackRef = useRef(null);
  const currentLetterRef = useRef('A');
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
  const letterAudioRef = useRef({});
  const femaleAudioRef = useRef(null);
  const directionsAudioRef = useRef(null);
  const resumeDelayRef = useRef(null);
  const anomalyDetectedRef = useRef(false);
  const motionDetectedRef = useRef(false);
  const startDelayRef = useRef(null);
  const pausedRef = useRef(false);
  const sessionActiveRef = useRef(false);

  useEffect(() => { capturedRef.current = captured; }, [captured]);
  useEffect(() => { anomalyDetectedRef.current = anomalyDetected; }, [anomalyDetected]);
  useEffect(() => { motionDetectedRef.current = motionDetected; }, [motionDetected]);

  // Resume the alphabet from A once the creepy voice has actually started AND
  // finished. We must wait for isGenerating/isSpeaking to go true (speech began)
  // before treating a subsequent false as "finished" — otherwise we'd resume
  // instantly, before the creepy voice even starts.
  const resumeFromLock = useCallback(() => {
    if (creepyFallbackRef.current) { clearTimeout(creepyFallbackRef.current); creepyFallbackRef.current = null; }
    creepyStartedRef.current = false;
    setLockedLetter(null);
    lockedLetterRef.current = null;
    lockedRef.current = false;
    indexRef.current = 0;
    currentLetterRef.current = LETTERS[0];
    setCurrentLetter(LETTERS[0]);
    if (phase === 'running') {
      // Brief pause after the male voice finishes so the dictated letter is
      // fully heard before the alphabet restarts from A.
      if (resumeDelayRef.current) clearTimeout(resumeDelayRef.current);
      resumeDelayRef.current = setTimeout(() => { resumeDelayRef.current = null; startStepping(); }, 1500);
    }
  }, [phase]);

  useEffect(() => {
    if (lockedLetter && (isGenerating || isSpeaking)) creepyStartedRef.current = true;
    if (lockedLetter && creepyStartedRef.current && !isSpeaking && !isGenerating) {
      resumeFromLock();
    }
  }, [isSpeaking, isGenerating, lockedLetter, resumeFromLock]);

  useEffect(() => () => stopEverything(), []);

  const stopEverything = () => {
    stopFemaleAudio();
    sessionActiveRef.current = false;
    pausedRef.current = false;
    if (creepyFallbackRef.current) { clearTimeout(creepyFallbackRef.current); creepyFallbackRef.current = null; }
    if (startDelayRef.current) { clearTimeout(startDelayRef.current); startDelayRef.current = null; }
    if (resumeDelayRef.current) { clearTimeout(resumeDelayRef.current); resumeDelayRef.current = null; }
    if (stepRef.current) { clearInterval(stepRef.current); stepRef.current = null; }
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

  const startStepping = () => {
    if (stepRef.current) clearInterval(stepRef.current);
    indexRef.current = 0;
    currentLetterRef.current = LETTERS[0];
    setCurrentLetter(LETTERS[0]);
    speakNormal(LETTERS[0]);
    stepRef.current = setInterval(() => {
      if (lockedRef.current) return;
      indexRef.current = (indexRef.current + 1) % LETTERS.length;
      currentLetterRef.current = LETTERS[indexRef.current];
      setCurrentLetter(LETTERS[indexRef.current]);
      speakNormal(LETTERS[indexRef.current]);
    }, LETTER_MS);
  };

  const triggerLock = useCallback(() => {
    const now = Date.now();
    if (lockedRef.current || now - lastTriggerRef.current < TRIGGER_COOLDOWN_MS) return;
    lastTriggerRef.current = now;
    const letter = currentLetterRef.current || LETTERS[indexRef.current];
    lockedRef.current = true;
    lockedLetterRef.current = letter;
    setLockedLetter(letter);
    setCaptured(prev => { const updated = [...prev, letter]; capturedRef.current = updated; return updated; });
    if (stepRef.current) { clearInterval(stepRef.current); stepRef.current = null; }
    creepyStartedRef.current = false;
    // Let the female voice finish the current letter, then speak male
    const speakMale = () => {
      try { speak(letter, {}); } catch {}
      // Safety net: if speech never starts or never reports completion, resume
      // anyway so the sweep doesn't stall.
      if (creepyFallbackRef.current) clearTimeout(creepyFallbackRef.current);
      creepyFallbackRef.current = setTimeout(() => { if (lockedRef.current) resumeFromLock(); }, 7000);
    };
    if (femaleBusyRef.current) {
      pendingMaleRef.current = speakMale;
    } else {
      speakMale();
    }
  }, [speak, resumeFromLock]);

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

  // Camera-based anomaly trigger: runs the same IR figure detection as the
  // Anomaly Camera. When a humanoid shape is detected, the current letter is
  // locked — same effect as a motion/orientation disturbance.
  const startCameraStream = async () => {
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

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const letter = lockedLetterRef.current || currentLetterRef.current || 'A';

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0,200,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ALPHABET SWEEPER', w / 2, 28);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(w - 58, 22, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('REC ' + formatDuration(sessionDurRef.current), w - 14, 26);

    ctx.textAlign = 'center';
    if (pausedRef.current) {
      ctx.fillStyle = 'rgba(250,204,21,0.85)';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('GET READY…', w / 2, h / 2 + 10);
      ctx.fillStyle = 'rgba(250,204,21,0.6)';
      ctx.font = '12px monospace';
      ctx.fillText('LISTEN TO DIRECTIONS', w / 2, h / 2 + 40);
    } else if (lockedLetterRef.current) {
      ctx.shadowColor = 'rgba(34,211,238,0.9)';
      ctx.shadowBlur = 30;
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 120px sans-serif';
      ctx.fillText(letter, w / 2, h / 2 + 40);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#67e8f9';
      ctx.font = '12px monospace';
      ctx.fillText('LOCKED — DICTATING', w / 2, h / 2 + 70);
    } else {
      ctx.fillStyle = 'rgba(148,163,184,0.6)';
      ctx.font = 'bold 90px sans-serif';
      ctx.fillText(letter, w / 2, h / 2 + 30);
    }

    // Draw sensor alert badges on the canvas so they appear in the recording
    if (anomalyDetectedRef.current) {
      ctx.fillStyle = 'rgba(239,68,68,0.92)';
      ctx.fillRect(w / 2 - 85, 44, 170, 22);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ ANOMALY DETECTED', w / 2, 59);
    }
    if (motionDetectedRef.current) {
      ctx.fillStyle = 'rgba(245,158,11,0.92)';
      ctx.fillRect(w / 2 - 85, h - 52, 170, 22);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ MOTION DETECTED', w / 2, h - 37);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.fillText('CAPTURED: ' + capturedRef.current.length, 14, h - 14);
    ctx.textAlign = 'right';
    ctx.fillText('A → Z · ' + formatDuration(sessionDurRef.current), w - 14, h - 14);
  };

  const startDrawing = () => {
    if (drawRef.current) clearInterval(drawRef.current);
    draw();
    drawRef.current = setInterval(draw, 33);
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
    setLockedLetter(null);
    setSensorError('');
    setError('');
    lockedRef.current = false;
    lockedLetterRef.current = null;
    baselineRef.current = 9.8;
    lastOrientRef.current = null;
    lastTriggerRef.current = 0;
    indexRef.current = 0;
    sessionDurRef.current = 0;
    setSessionDuration(0);
    setPhase('running');
    sessionActiveRef.current = true;
    // Prime speechSynthesis within the user gesture so the directions
    // (spoken after an await) play on iOS.
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch {}
    // Request all permissions (sensors, camera, mic) BEFORE directions so
    // every prompt appears up front, then start drawing + recording.
    await requestSensorPermissions();
    await startCameraStream();
    startDrawing();
    await startRecording();
    // Speak the directions via the female voice; letters + sensor handlers +
    // camera processing begin only after the directions finish (so no triggers
    // fire during the pause).
    pausedRef.current = true;
    setPaused(true);
    const directions = 'Spell words you want to say to us. I am going to repeat the alphabet. You can choose letters by moving my device and standing in front of it when you hear or see the letter you need next.';
    const beginAfterPause = () => {
      if (startDelayRef.current) { clearTimeout(startDelayRef.current); startDelayRef.current = null; }
      if (!sessionActiveRef.current) return;
      pausedRef.current = false;
      setPaused(false);
      startStepping();
      attachSensorHandlers();
      processCameraFrame();
    };
    // Pre-generate high-quality female voice for all 26 letters while the
    // directions play (cached across sessions).
    preGenerateLetters();
    // Speak the directions via the high-quality "honey" female voice.
    try {
      const result = await base44.integrations.Core.GenerateSpeech({ text: directions, voice: 'honey' });
      if (!sessionActiveRef.current) return;
      const audio = new Audio(result.url);
      directionsAudioRef.current = audio;
      audio.volume = 1;
      audio.onended = () => { directionsAudioRef.current = null; beginAfterPause(); };
      audio.onerror = () => { directionsAudioRef.current = null; beginAfterPause(); };
      audio.play().catch(() => { directionsAudioRef.current = null; beginAfterPause(); });
      // Safety fallback: if onended never fires, start anyway after 25s
      startDelayRef.current = setTimeout(() => beginAfterPause(), 25000);
    } catch { beginAfterPause(); }
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed++;
      sessionDurRef.current = elapsed;
      setSessionDuration(elapsed);
    }, 1000);
  };

  const stopSession = () => {
    sessionActiveRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    if (startDelayRef.current) { clearTimeout(startDelayRef.current); startDelayRef.current = null; }
    if (stepRef.current) { clearInterval(stepRef.current); stepRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (drawRef.current) { clearInterval(drawRef.current); drawRef.current = null; }
    if (motionHandlerRef.current) { window.removeEventListener('devicemotion', motionHandlerRef.current); motionHandlerRef.current = null; }
    if (orientHandlerRef.current) { window.removeEventListener('deviceorientation', orientHandlerRef.current); orientHandlerRef.current = null; }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (anomalyTimerRef.current) { clearTimeout(anomalyTimerRef.current); anomalyTimerRef.current = null; }
    if (motionTimerRef.current) { clearTimeout(motionTimerRef.current); motionTimerRef.current = null; }
    if (cameraStreamRef.current) { cameraStreamRef.current.getTracks().forEach(t => t.stop()); cameraStreamRef.current = null; }
    if (resumeDelayRef.current) { clearTimeout(resumeDelayRef.current); resumeDelayRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { try { mediaRecorderRef.current.stop(); } catch {} }
    setCameraActive(false);
    setAnomalyDetected(false);
    setMotionDetected(false);
    lockedRef.current = false;
    stopFemaleAudio();
    setPhase('stopped');
  };

  const saveSession = async () => {
    if (!videoBlob) return;
    setSaving(true);
    try {
      const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([videoBlob], `alphabet_sweeper_session.${ext}`, { type: videoBlob.type });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().slice(0, 5);
      await base44.entities.Evidence.create({
        title: `Alphabet Sweeper — ${date}`,
        type: 'video',
        description: `Alphabet Sweeper session — ${formatDuration(sessionDuration)} — ${captured.length} letter(s) captured via environment trigger: ${captured.join('') || 'none'}.`,
        file_url,
        date,
        time,
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
    setLockedLetter(null);
    setPhase('idle');
  };

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="space-y-4">
        {error && <p className="text-[11px] text-red-400/80 text-center">{error}</p>}
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-1.5">
          <p className="text-[10px] font-heading uppercase tracking-wider text-primary flex items-center gap-1.5"><Info className="w-3 h-3" /> How to Use</p>
          <ol className="text-[11px] text-foreground/70 leading-relaxed list-decimal pl-4 space-y-0.5">
            <li>Tap <span className="text-primary font-medium">Start Sweep</span>. Letters cycle A → Z, one every 2 seconds, each spoken aloud in a female voice, while the session records.</li>
            <li>For best accuracy and functionality, place your device on a stand or prop it up so it faces an area where no "living things" are visible……. OR…… hold your device still. Any sudden movement, tilt, or shake locks the current letter — it glows bright and is spoken aloud in a male voice. The IR camera also watches for anomalies: a detected figure locks the current letter the same way.</li>
            <li>After each letter is dictated, the alphabet restarts from A.</li>
            <li>Tap <span className="text-primary font-medium">Stop</span>, review the recording, then <span className="text-primary font-medium">Save</span> it to your Evidence Journal.</li>
          </ol>
        </div>
        <SensitivityControl sensitivity={sensitivity} onChange={setSensitivity} />
        <button onClick={startSession} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors">
          <Play className="w-4 h-4" /> Start Sweep
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
          <Zap className="w-3 h-3 text-amber-400" /> Move, tilt, or shake the device — or let the IR camera detect an anomaly — to lock a letter
        </p>
        {paused ? (
          <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center font-display text-2xl text-amber-400/90 drop-shadow-[0_0_14px_hsl(45,96%,55%,0.6)] animate-glow-pulse">
            Get Ready…
          </motion.p>
        ) : lockedLetter ? (
          <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center font-display text-5xl text-cyan-glow drop-shadow-[0_0_18px_hsl(185,80%,55%,0.85)] animate-glow-pulse">
            {lockedLetter}
          </motion.p>
        ) : (
          <p className="text-center font-display text-4xl text-foreground/70 flex items-center justify-center gap-2">
            <Type className="w-6 h-6 text-primary" /> {currentLetter}
          </p>
        )}
        {captured.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Spelling ({captured.length} letters)</p>
            <div className="px-3 py-2 rounded-lg bg-cyan-glow/10 border border-cyan-glow/30 text-cyan-glow font-mono text-lg tracking-[0.25em] break-all leading-relaxed">
              {captured.join('')}
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
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Letters: {captured.length}</span>
          </div>
        </div>

        {captured.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Spelling ({captured.length} letters)</p>
            <div className="px-3 py-2 rounded-lg bg-cyan-glow/10 border border-cyan-glow/30 text-cyan-glow font-mono text-lg tracking-[0.25em] break-all leading-relaxed">
              {captured.join('')}
            </div>
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