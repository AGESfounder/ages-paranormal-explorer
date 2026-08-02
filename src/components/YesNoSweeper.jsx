import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Square, Save, Info, X, Activity, Zap, Video, AlertTriangle, MessageCircle, Camera } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useGhostVoice from '../hooks/useGhostVoice';
import { detectFigures } from '@/lib/anomalyDetect';
import useSensitivity from '../hooks/useSensitivity';
import SensitivityControl from './SensitivityControl';

// "Asking Next Question…" shows for 10 seconds (no dictation), then the phrases
// appear once in rotation (4 sec each). If no trigger, the asking phase repeats.
// A trigger locks the current phrase, speaks it in the male voice, then a 5-second
// delay precedes the next asking phase.
const PHRASES = [
  { display: 'YES', speech: 'Yes' },
  { display: 'NO', speech: 'No' },
  { display: "I DON'T KNOW", speech: "I don't know" },
];
const PHRASE_MS = 4000;
const TRIGGER_COOLDOWN_MS = 3500;
const ACCEL_THRESHOLD = 0.8;
const ORIENT_THRESHOLD = 6;

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function YesNoSweeper() {
  const [phase, setPhase] = useState('idle'); // idle | running | stopped
  const [currentIdx, setCurrentIdx] = useState(0);
  const [lockedPhrase, setLockedPhrase] = useState(null);
  const [captured, setCaptured] = useState([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [videoBlob, setVideoBlob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sensorError, setSensorError] = useState('');
  const [anomalyDetected, setAnomalyDetected] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [askingNext, setAskingNext] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);

  const { sensitivity, setSensitivity, sensitivityRef } = useSensitivity();

  // Web Audio–based voice (unlocked on the Start tap) so the spoken answer
  // plays reliably on iOS even though it's triggered by a sensor event. Called
  // WITHOUT the creepy flag → normal-speed delivery.
  const { isSpeaking, isGenerating, speak, stop: stopVoice, unlock, attachMicToRecording } = useGhostVoice();

  // Normal browser TTS announces each phrase as it cycles (instant, local,
  // female voice). The locked phrase is then spoken in the deep male
  // "creepy" voice via useGhostVoice.
  const speakNormal = (phrase) => {
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const synth = window.speechSynthesis;
      try { synth.getVoices(); } catch {}
      const u = new SpeechSynthesisUtterance(phrase);
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
  const lockedIdxRef = useRef(null);
  const speechStartedRef = useRef(false);
  const resumeFallbackRef = useRef(null);
  const sessionDurRef = useRef(0);
  const capturedRef = useRef([]);
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const timerRef = useRef(null);
  const camVideoRef = useRef(null);
  const detectCanvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const anomalyTimerRef = useRef(null);
  const motionTimerRef = useRef(null);
  const askingNextTimerRef = useRef(null);
  const askingNextRef = useRef(false);
  const lastAnomalyTriggerRef = useRef(0);
  const femaleBusyRef = useRef(false);
  const pendingMaleRef = useRef(null);
  const sweepingRef = useRef(false);
  const resumeDelayRef = useRef(null);

  useEffect(() => { capturedRef.current = captured; }, [captured]);
  useEffect(() => () => stopEverything(), []);

  const stopEverything = () => {
    if (stepRef.current) { clearInterval(stepRef.current); stepRef.current = null; }
    if (drawRef.current) { clearInterval(drawRef.current); drawRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (resumeFallbackRef.current) { clearTimeout(resumeFallbackRef.current); resumeFallbackRef.current = null; }
    if (motionHandlerRef.current) { window.removeEventListener('devicemotion', motionHandlerRef.current); motionHandlerRef.current = null; }
    if (orientHandlerRef.current) { window.removeEventListener('deviceorientation', orientHandlerRef.current); orientHandlerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { try { mediaRecorderRef.current.stop(); } catch {} }
    if (audioStreamRef.current) { audioStreamRef.current.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (anomalyTimerRef.current) { clearTimeout(anomalyTimerRef.current); anomalyTimerRef.current = null; }
    if (motionTimerRef.current) { clearTimeout(motionTimerRef.current); motionTimerRef.current = null; }
    if (askingNextTimerRef.current) { clearTimeout(askingNextTimerRef.current); askingNextTimerRef.current = null; }
    if (resumeDelayRef.current) { clearTimeout(resumeDelayRef.current); resumeDelayRef.current = null; }
    if (cameraStreamRef.current) { cameraStreamRef.current.getTracks().forEach(t => t.stop()); cameraStreamRef.current = null; }
    setCameraActive(false);
    setAnomalyDetected(false);
    setMotionDetected(false);
    setAskingNext(false);
    askingNextRef.current = false;
    sweepingRef.current = false;
    stopNormalVoice();
    try { stopVoice(); } catch {}
  };

  // ── Asking phase: "Asking Next Question…" for 10 seconds, no dictation ──
  const startAskingPhase = () => {
    if (lockedRef.current) return;
    sweepingRef.current = false;
    stopNormalVoice();
    setAskingNext(true);
    askingNextRef.current = true;
    if (askingNextTimerRef.current) clearTimeout(askingNextTimerRef.current);
    askingNextTimerRef.current = setTimeout(() => {
      if (lockedRef.current) return;
      setAskingNext(false);
      askingNextRef.current = false;
      startSweepPhase();
    }, 10000);
  };

  // ── Sweep phase: one rotation of YES → NO → I DON'T KNOW, 4 sec each ──
  const startSweepPhase = () => {
    if (lockedRef.current) return;
    sweepingRef.current = true;
    indexRef.current = 0;
    setCurrentIdx(0);
    speakNormal(PHRASES[0].speech);
    scheduleNextSweepStep();
  };

  const scheduleNextSweepStep = () => {
    if (stepRef.current) clearTimeout(stepRef.current);
    stepRef.current = setTimeout(() => {
      if (lockedRef.current) return;
      indexRef.current += 1;
      if (indexRef.current >= PHRASES.length) {
        // Rotation complete, no trigger → back to asking phase
        startAskingPhase();
        return;
      }
      setCurrentIdx(indexRef.current);
      speakNormal(PHRASES[indexRef.current].speech);
      scheduleNextSweepStep();
    }, PHRASE_MS);
  };

  const resumeFromLock = useCallback(() => {
    if (resumeFallbackRef.current) { clearTimeout(resumeFallbackRef.current); resumeFallbackRef.current = null; }
    speechStartedRef.current = false;
    // Keep the locked word on screen during the 5-second delay, then start asking phase
    if (phase === 'running') {
      if (resumeDelayRef.current) clearTimeout(resumeDelayRef.current);
      resumeDelayRef.current = setTimeout(() => {
        setLockedPhrase(null);
        lockedIdxRef.current = null;
        lockedRef.current = false;
        indexRef.current = 0;
        setCurrentIdx(0);
        startAskingPhase();
      }, 5000);
    }
  }, [phase]);

  // Resume once the spoken phrase has actually started AND finished — wait for
  // isGenerating/isSpeaking to go true first so we don't resume before playback
  // begins.
  useEffect(() => {
    if (lockedPhrase && (isGenerating || isSpeaking)) speechStartedRef.current = true;
    if (lockedPhrase && speechStartedRef.current && !isSpeaking && !isGenerating) {
      resumeFromLock();
    }
  }, [isSpeaking, isGenerating, lockedPhrase, resumeFromLock]);

  const triggerLock = useCallback(() => {
    const now = Date.now();
    if (lockedRef.current || !sweepingRef.current || now - lastTriggerRef.current < TRIGGER_COOLDOWN_MS) return;
    lastTriggerRef.current = now;
    const idx = indexRef.current;
    const phrase = PHRASES[idx];
    lockedRef.current = true;
    lockedIdxRef.current = idx;
    setLockedPhrase(phrase.display);
    setCaptured(prev => { const updated = [...prev, phrase.display]; capturedRef.current = updated; return updated; });
    if (stepRef.current) { clearInterval(stepRef.current); stepRef.current = null; }
    speechStartedRef.current = false;
    // Let the female voice finish the current phrase, then speak male
    const speakMale = () => {
      try { speak(phrase.speech, {}); } catch {} // deep male "storm" voice
      if (resumeFallbackRef.current) clearTimeout(resumeFallbackRef.current);
      resumeFallbackRef.current = setTimeout(() => { if (lockedRef.current) resumeFromLock(); }, 8000);
    };
    if (femaleBusyRef.current) {
      pendingMaleRef.current = speakMale;
    } else {
      speakMale();
    }
  }, [speak, resumeFromLock]);

  const requestSensorPermissions = async () => {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') { setSensorError('Motion sensor permission was denied. Lock-on-trigger needs movement detection — enable Motion & Orientation Access in your browser/Safari settings and reload.'); return false; }
      } catch {}
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { await DeviceOrientationEvent.requestPermission(); } catch {}
    }
    return true;
  };

  const flashMotion = useCallback(() => {
    setMotionDetected(true);
    if (motionTimerRef.current) clearTimeout(motionTimerRef.current);
    motionTimerRef.current = setTimeout(() => setMotionDetected(false), 3000);
  }, []);

  const startSensors = async () => {
    const ok = await requestSensorPermissions();
    if (!ok) return;
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
  // Anomaly Camera. When a humanoid shape is detected, the current phrase is
  // locked — same effect as a motion/orientation disturbance.
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
      processCameraFrame();
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
    const locked = lockedIdxRef.current != null;
    const safeIdx = Math.min(indexRef.current, PHRASES.length - 1);
    const phrase = locked ? PHRASES[lockedIdxRef.current].display : PHRASES[safeIdx].display;

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0,200,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('YES / NO / IDK SWEEPER', w / 2, 28);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(w - 58, 22, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('REC ' + formatDuration(sessionDurRef.current), w - 14, 26);

    ctx.textAlign = 'center';
    const fontSize = phrase.length > 5 ? 52 : 96;
    if (locked) {
      ctx.shadowColor = 'rgba(34,211,238,0.9)';
      ctx.shadowBlur = 30;
      ctx.fillStyle = '#22d3ee';
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillText(phrase, w / 2, h / 2 + 20);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#67e8f9';
      ctx.font = '12px monospace';
      ctx.fillText('LOCKED — DICTATING', w / 2, h / 2 + 50);
    } else if (askingNextRef.current) {
      ctx.fillStyle = 'rgba(250,204,21,0.85)';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('ASKING NEXT QUESTION…', w / 2, h / 2 + 10);
      ctx.fillStyle = 'rgba(250,204,21,0.6)';
      ctx.font = '12px monospace';
      ctx.fillText('PAUSE BEFORE NEXT SWEEP', w / 2, h / 2 + 40);
    } else {
      ctx.fillStyle = 'rgba(148,163,184,0.6)';
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillText(phrase, w / 2, h / 2 + 20);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.fillText('ANSWERS: ' + capturedRef.current.length, 14, h - 14);
    ctx.textAlign = 'right';
    ctx.fillText('YES · NO · IDK · ' + formatDuration(sessionDurRef.current), w - 14, h - 14);
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
      const audioTrack = mixedTrack || audioStream.getAudioTracks()[0];
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
    } catch {
      setSensorError('Microphone access denied. Grant permission to record the session.');
      return false;
    }
  };

  const startSession = async () => {
    setCaptured([]);
    setVideoBlob(null);
    setLockedPhrase(null);
    setSensorError('');
    setError('');
    lockedRef.current = false;
    lockedIdxRef.current = null;
    baselineRef.current = 9.8;
    lastOrientRef.current = null;
    lastTriggerRef.current = 0;
    indexRef.current = 0;
    sessionDurRef.current = 0;
    setSessionDuration(0);
    setAskingNext(false);
    askingNextRef.current = false;
    sweepingRef.current = false;
    if (askingNextTimerRef.current) { clearTimeout(askingNextTimerRef.current); askingNextTimerRef.current = null; }
    if (resumeDelayRef.current) { clearTimeout(resumeDelayRef.current); resumeDelayRef.current = null; }
    setPhase('running');
    // Unlock Web Audio inside the tap gesture so the later sensor-triggered
    // spoken answer plays on iOS.
    unlock();
    startAskingPhase();
    await startSensors();
    await startCamera();
    await new Promise(r => setTimeout(r, 80));
    startDrawing();
    await startRecording();
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed++;
      sessionDurRef.current = elapsed;
      setSessionDuration(elapsed);
    }, 1000);
  };

  const stopSession = () => {
    if (stepRef.current) { clearInterval(stepRef.current); stepRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (drawRef.current) { clearInterval(drawRef.current); drawRef.current = null; }
    if (motionHandlerRef.current) { window.removeEventListener('devicemotion', motionHandlerRef.current); motionHandlerRef.current = null; }
    if (orientHandlerRef.current) { window.removeEventListener('deviceorientation', orientHandlerRef.current); orientHandlerRef.current = null; }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (anomalyTimerRef.current) { clearTimeout(anomalyTimerRef.current); anomalyTimerRef.current = null; }
    if (motionTimerRef.current) { clearTimeout(motionTimerRef.current); motionTimerRef.current = null; }
    if (askingNextTimerRef.current) { clearTimeout(askingNextTimerRef.current); askingNextTimerRef.current = null; }
    if (resumeDelayRef.current) { clearTimeout(resumeDelayRef.current); resumeDelayRef.current = null; }
    if (cameraStreamRef.current) { cameraStreamRef.current.getTracks().forEach(t => t.stop()); cameraStreamRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') { try { mediaRecorderRef.current.stop(); } catch {} }
    if (resumeFallbackRef.current) { clearTimeout(resumeFallbackRef.current); resumeFallbackRef.current = null; }
    setCameraActive(false);
    setAnomalyDetected(false);
    setMotionDetected(false);
    setAskingNext(false);
    askingNextRef.current = false;
    sweepingRef.current = false;
    lockedRef.current = false;
    stopNormalVoice();
    try { stopVoice(); } catch {}
    setPhase('stopped');
  };

  const saveSession = async () => {
    if (!videoBlob) return;
    setSaving(true);
    try {
      const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([videoBlob], `yes_no_idk_session.${ext}`, { type: videoBlob.type });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().slice(0, 5);
      await base44.entities.Evidence.create({
        title: `Yes/No/IDK Sweeper — ${date}`,
        type: 'video',
        description: `Yes/No/IDK Sweeper session — ${formatDuration(sessionDuration)} — ${captured.length} answer(s) captured via environment trigger: ${captured.join(', ') || 'none'}.`,
        file_url,
        date,
        time,
      });
      setVideoBlob(null);
      setCaptured([]);
      setPhase('idle');
    } catch {
      setError('Save failed. Please try again.');
    }
    setSaving(false);
  };

  const discard = () => {
    setVideoBlob(null);
    setCaptured([]);
    setLockedPhrase(null);
    setPhase('idle');
  };

  if (phase === 'idle') {
    return (
      <div className="space-y-4">
        {error && <p className="text-[11px] text-red-400/80 text-center">{error}</p>}
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-1.5">
          <p className="text-[10px] font-heading uppercase tracking-wider text-primary flex items-center gap-1.5"><Info className="w-3 h-3" /> How to Use</p>
          <ol className="text-[11px] text-foreground/70 leading-relaxed list-decimal pl-4 space-y-0.5">
            <li>Tap <span className="text-primary font-medium">Start</span>. "Asking Next Question…" appears for 10 seconds (no dictation), then the phrases <span className="text-foreground">YES</span>, <span className="text-foreground">NO</span>, and <span className="text-foreground">I DON'T KNOW</span> appear once, one every 4 seconds, each spoken aloud in a female voice, while the session records.</li>
            <li>For best accuracy and functionality, place your device on a stand or prop it up so it faces an area where no "living things" are visible……. OR…… hold your device still. Any sudden movement, tilt, or vibration locks the current phrase — it glows and is spoken aloud in a male voice. The IR camera also watches for anomalies: a detected figure locks the current phrase the same way.</li>
            <li>If no trigger occurs during the rotation, "Asking Next Question…" appears again for 10 seconds and the cycle repeats. After a phrase is dictated by the male voice, a 5-second delay occurs before "Asking Next Question…" starts the cycle over.</li>
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
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="px-3 py-1 rounded bg-red-500/90 border border-red-300/50">
                <p className="text-[10px] font-mono text-white font-bold tracking-wider">⚠ ANOMALY DETECTED</p>
              </motion.div>
            </div>
          )}
          {motionDetected && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
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
          <Zap className="w-3 h-3 text-amber-400" /> Move, tilt, or vibrate the device — or let the IR camera detect an anomaly — to lock an answer
        </p>
        {lockedPhrase ? (
          <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center font-display text-3xl text-cyan-glow drop-shadow-[0_0_18px_hsl(185,80%,55%,0.85)] animate-glow-pulse">
            {lockedPhrase}
          </motion.p>
        ) : askingNext ? (
          <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center font-display text-xl text-amber-400/90 drop-shadow-[0_0_14px_hsl(45,96%,55%,0.6)] animate-glow-pulse">
            Asking Next Question…
          </motion.p>
        ) : (
          <p className="text-center font-display text-2xl text-foreground/70 flex items-center justify-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" /> {PHRASES[currentIdx].display}
          </p>
        )}
        {captured.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Answers ({captured.length})</p>
            <div className="px-3 py-2 rounded-lg bg-cyan-glow/10 border border-cyan-glow/30 text-cyan-glow font-mono text-sm break-words leading-relaxed">
              {captured.join('  ·  ')}
            </div>
          </div>
        )}
        <button onClick={stopSession} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-heading text-xs uppercase tracking-wider hover:bg-red-500/20 transition-colors">
          <Square className="w-3.5 h-3.5" /> Stop Session
        </button>
      </div>
    );
  }

  if (phase === 'stopped') {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-card/30 border border-border/30 space-y-2">
          <p className="text-[10px] font-heading uppercase tracking-wider text-primary">Session Complete</p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Duration: {formatDuration(sessionDuration)}</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Answers: {captured.length}</span>
          </div>
        </div>

        {captured.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Answers ({captured.length})</p>
            <div className="px-3 py-2 rounded-lg bg-cyan-glow/10 border border-cyan-glow/30 text-cyan-glow font-mono text-sm break-words leading-relaxed">
              {captured.join('  ·  ')}
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