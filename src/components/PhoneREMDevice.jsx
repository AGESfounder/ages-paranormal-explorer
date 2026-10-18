import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, X, Video, AlertTriangle, Zap, Activity } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { buildEvidenceContext } from '@/lib/evidenceContext';
import { useToolGpsSave } from '@/hooks/useToolGpsSave';
import EvidenceSaveButtons from './EvidenceSaveButtons';
import { toast } from '@/components/ui/use-toast';
import { buildMicChain } from '@/lib/micRecordChain';
import { audioAcquire, audioRelease } from '@/lib/hauntedAudio';
import RecordTrimPicker from './RecordTrimPicker';
import { TRIM_OPTIONS, buildTrimmedBlob } from '@/lib/recordTrim';

// Quiet window the sensor baseline is measured over, before the session — and
// its recording — begin.
const CALIBRATION_MS = 10000;

const SENSITIVITY_THRESHOLDS = {
  accel: 0.12,  // m/s² delta from baseline
  gyro: 0.025,  // rad/s delta from baseline
  mag: 1.0,     // μT delta from baseline
};

// Map alert level 0–100 to color class
function alertColor(level) {
  if (level < 20) return 'text-green-400';
  if (level < 50) return 'text-yellow-400';
  if (level < 80) return 'text-orange-400';
  return 'text-red-500';
}
function alertBg(level) {
  if (level < 20) return 'border-green-500/30 bg-green-500/5';
  if (level < 50) return 'border-yellow-500/30 bg-yellow-500/5';
  if (level < 80) return 'border-orange-500/30 bg-orange-500/5';
  return 'border-red-500/50 bg-red-500/10';
}

function alertHexColor(level) {
  if (level < 20) return '#4ade80';
  if (level < 50) return '#facc15';
  if (level < 80) return '#fb923c';
  return '#ef4444';
}

// A disturbance is named by the highest level it reached, not by the reading
// that happened to be on screen when it was noticed.
function levelLabel(level) {
  if (level < 50) return '🟡 MINOR FLUCTUATION';
  if (level < 80) return '🟠 MODERATE ACTIVITY';
  return '🔴 STRONG DISTURBANCE';
}

export default function PhoneREMDevice({ gateSave, refundSave }) {
  const { captureGpsForSave, gpsDialog, trackingOffDialog } = useToolGpsSave();
  const [phase, setPhase] = useState('idle'); // idle | countdown | active | stopped
  const [countdown, setCountdown] = useState(3);
  const [alertLevel, setAlertLevel] = useState(0);
  const [events, setEvents] = useState([]);
  // The disturbance currently running, shown as one live row until it ends.
  const [liveEvent, setLiveEvent] = useState(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [videoBlob, setVideoBlob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sensorError, setSensorError] = useState(null);
  const [trimMode, setTrimMode] = useState('full');

  // Sensor baselines
  const baselineRef = useRef({ ax: 0, ay: 0, az: 9.8, gx: 0, gy: 0, gz: 0, mx: 0, my: 0, mz: 0 });
  const baselineSamples = useRef([]);
  const currentSensor = useRef({ ax: 0, ay: 0, az: 9.8, gx: 0, gy: 0, gz: 0, mx: 0, my: 0, mz: 0 });

  // Refs for canvas drawing (avoid stale closures inside interval)
  const alertLevelRef = useRef(0);
  const sessionDurationRef = useRef(0);
  const eventsRef = useRef([]);
  // The disturbance in progress: its start and the peak it has reached so far.
  const excursionRef = useRef(null);
  const sensorDataReceivedRef = useRef(false);

  const timerRef = useRef(null);
  // Wall-clock start of the session. The session clock is read from real time
  // rather than counted in interval ticks: a tick is not a second, so counting
  // them ran the on-screen REC clock (and the saved duration) several times fast.
  const sessionStartRef = useRef(0);
  const beepCtxRef = useRef(null);
  const beepIntervalRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const videoBlobRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasIntervalRef = useRef(null);
  const audioStreamRef = useRef(null);
  // Recording destination on the beep engine. The vibration beeps are routed
  // into the recording here instead of relying on the mic picking them up
  // acoustically — the tool is meant to lie face-down on a surface, which
  // muffles the mic and is why the beeps were only sometimes in the saved video.
  const recordDestRef = useRef(null);
  // Mic-only recording destination for the devices whose web view cannot record
  // the on-screen display (every iPhone): the microphone is that recording's
  // only input, so it needs its own destination (see startRecording).
  const micOnlyDestRef = useRef(null);
  // This session's own hold on the app's background music (ref-guarded, so the
  // ambience is never released more often than it was held).
  const ambienceHeldRef = useRef(false);

  const trimSeconds = TRIM_OPTIONS.find((o) => o.id === trimMode)?.seconds;
  const getTrimmedBlob = (ts) => {
    const chunks = videoChunksRef.current;
    if (!chunks || chunks.length === 0) return null;
    return buildTrimmedBlob(chunks, ts, 'video/webm');
  };
  const displayBlob = videoBlob && trimMode !== 'full' ? (getTrimmedBlob(trimSeconds) || videoBlob) : videoBlob;

  // Sensor handlers
  const handleMotion = (e) => {
    sensorDataReceivedRef.current = true;
    const a = e.acceleration || e.accelerationIncludingGravity || {};
    currentSensor.current.ax = a.x || 0;
    currentSensor.current.ay = a.y || 0;
    currentSensor.current.az = a.z || 0;
    const r = e.rotationRate || {};
    currentSensor.current.gx = (r.alpha || 0) * Math.PI / 180;
    currentSensor.current.gy = (r.beta || 0) * Math.PI / 180;
    currentSensor.current.gz = (r.gamma || 0) * Math.PI / 180;
  };

  const handleOrientation = (e) => {
    if (e.absolute) {
      currentSensor.current.mx = e.alpha || 0;
      currentSensor.current.my = e.beta || 0;
      currentSensor.current.mz = e.gamma || 0;
    }
  };

  const requestSensorPermissions = async () => {
    // iOS 13+ requires explicit permission for motion
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') throw new Error('Motion permission denied');
      } catch (e) {
        setSensorError('Motion sensor permission was denied. On iPhone: Settings → AGES Paranormal Explorer (or Safari) → enable Motion & Orientation. On Android: allow motion/sensors for this app, then try again.');
        return false;
      }
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        await DeviceOrientationEvent.requestPermission();
      } catch (e) { /* non-fatal */ }
    }
    return true;
  };

  // Beep sound engine
  const playBeep = (frequency, duration) => {
    if (!beepCtxRef.current) return;
    const ctx = beepCtxRef.current;
    // The phone's speech/mic session can suspend this engine; a beep fired
    // into a suspended context is silent. Nudge it back before scheduling.
    if (ctx.state !== 'running') { try { ctx.resume(); } catch {} }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc2.type = 'triangle';
    osc2.frequency.value = frequency * 1.007;
    gain2.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain); gain.connect(ctx.destination);
    osc2.connect(gain2); gain2.connect(ctx.destination);
    if (recordDestRef.current) {
      try { gain.connect(recordDestRef.current); gain2.connect(recordDestRef.current); } catch {}
    }
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    osc2.start(ctx.currentTime);
    osc2.stop(ctx.currentTime + duration);
  };

  const updateBeeping = (level) => {
    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }
    if (level < 20) return;
    const t = (level - 20) / 80;
    const freq = 220 + t * 780;
    beepIntervalRef.current = setInterval(() => playBeep(freq, 0.08), 90);
  };

  // Creates the engine and kicks it awake WITHOUT waiting on it. On iOS a
  // suspended engine's resume() can stay pending for as long as the page has no
  // fresh gesture; awaiting it here held up everything after it — the recorder
  // was never built, so the session neither recorded nor worked. The session
  // loop nudges this engine back awake on every tick instead, and the session
  // now runs whether or not the engine ever comes up.
  const startAudioEngine = () => {
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      beepCtxRef.current = null;
      return;
    }
    beepCtxRef.current = ctx;
    if (ctx.state === 'suspended') { try { ctx.resume().catch(() => {}); } catch {} }
    // Mixing point for the recording: beeps + ambient mic.
    try { recordDestRef.current = ctx.createMediaStreamDestination(); } catch { recordDestRef.current = null; }
    try { micOnlyDestRef.current = ctx.createMediaStreamDestination(); } catch { micOnlyDestRef.current = null; }
  };

  const stopAudioEngine = () => {
    if (beepIntervalRef.current) { clearInterval(beepIntervalRef.current); beepIntervalRef.current = null; }
    if (beepCtxRef.current) { beepCtxRef.current.close(); beepCtxRef.current = null; }
    recordDestRef.current = null;
    micOnlyDestRef.current = null;
  };

  // The app's own music is held quiet from the moment a session begins — the
  // calibration as well as the recording. It used to duck only once the
  // recorder started, so it played over the whole baseline window, and with the
  // recording starting after the baseline it played through the session too.
  const holdAmbience = () => {
    if (ambienceHeldRef.current) return;
    ambienceHeldRef.current = true;
    audioAcquire();
  };
  const releaseAmbience = () => {
    if (!ambienceHeldRef.current) return;
    ambienceHeldRef.current = false;
    audioRelease();
  };

  // Canvas drawing — renders the REM device visualization for recording
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const level = alertLevelRef.current;
    const dur = sessionDurationRef.current;
    const evs = eventsRef.current;
    const color = alertHexColor(level);

    // Background
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(0, 255, 100, 0.05)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Title
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('VIBRATION COMMUNICATOR', w / 2, 30);

    // Alert level number
    ctx.fillStyle = color;
    ctx.font = 'bold 80px monospace';
    ctx.fillText(String(level), w / 2, h / 2 + 15);

    // Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px monospace';
    ctx.fillText('ENERGY LEVEL', w / 2, h / 2 + 40);

    // Status text
    const statusText = level < 20 ? 'QUIET' : level < 50 ? 'MINOR ACTIVITY' : level < 80 ? 'MODERATE DISTURBANCE' : 'STRONG DISTURBANCE';
    ctx.fillStyle = color;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(statusText, w / 2, h / 2 + 62);

    // Bar
    const barY = h - 50;
    const barW = w - 80;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(40, barY, barW, 12);
    ctx.fillStyle = color;
    ctx.fillRect(40, barY, barW * (level / 100), 12);

    // REC indicator
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(w - 60, 25, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('REC ' + formatDuration(dur), w - 15, 29);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(new Date().toLocaleTimeString(), w - 15, 43);

    // Event log
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText('EVENT LOG', 15, h - 20);
    evs.slice(0, 3).forEach((ev, i) => {
      const y = h - 35 - i * 14;
      if (y < 0) return;
      ctx.fillStyle = '#64748b';
      ctx.fillText(ev.time, 15, y);
      ctx.fillStyle = alertHexColor(ev.level);
      ctx.fillText(ev.label.replace(/[🔴🟠🟡]/g, '').trim(), 80, y);
    });
  };

  const startCanvasDrawing = () => {
    if (canvasIntervalRef.current) clearInterval(canvasIntervalRef.current);
    drawCanvas();
    canvasIntervalRef.current = setInterval(drawCanvas, 33); // ~30fps
  };

  const stopCanvasDrawing = () => {
    if (canvasIntervalRef.current) { clearInterval(canvasIntervalRef.current); canvasIntervalRef.current = null; }
  };

  // Record from canvas (what's shown on screen) + audio from mic
  const startRecording = async () => {
    try {
      // Request audio only — video comes from the canvas. Echo cancellation and
      // noise suppression stay OFF: both remove exactly what this recording is
      // for (the beeps leave through the phone's own speaker, and room tone is
      // the evidence). Automatic gain stays ON so a voice across the room
      // arrives at a usable level.
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
      audioStreamRef.current = audioStream;
      // Log what the phone ACTUALLY applied — the plain feed we ask for can be
      // ignored, and if cancellation comes back on, room tone is being filtered
      // out no matter what the app does.
      try {
        const applied = audioStream.getAudioTracks?.()[0]?.getSettings?.() || {};
        console.log(`[REMRec] mic settings applied ${JSON.stringify({
          echoCancellation: applied.echoCancellation ?? 'unknown',
          noiseSuppression: applied.noiseSuppression ?? 'unknown',
          autoGainControl: applied.autoGainControl ?? 'unknown',
        })}`);
      } catch {}

      // Wait for canvas to be ready
      await new Promise(r => setTimeout(r, 200));

      // iPhone's web view cannot record a canvas, so this tool used to run a
      // session there and save nothing. Record the session audio instead: the
      // beeps leave the phone's own speaker right beside the mic, so they are
      // captured acoustically, and the session saves as audio evidence.
      const canvasCapture = !!canvasRef.current && typeof canvasRef.current.captureStream === 'function';
      if (!canvasCapture) {
        setSensorError('Recording the session audio — this device cannot record the on-screen display.');
      }

      const canvasStream = canvasCapture ? canvasRef.current.captureStream(30) : new MediaStream();
      // The microphone goes into the recording through the shared lift and
      // limiter (micRecordChain), never raw: the phone's speaker sits about a
      // centimetre from its mic, so the beeps arrive enormously louder than the
      // room. The limiter caps those peaks, which is what lets a voice and the
      // room sit at a usable level beside them. The mic is fed only into the
      // recording, never to the speaker, so there is no feedback. Devices that
      // cannot record the canvas take the mic-only destination, since their
      // recording has no other input.
      let audioTrack = null;
      if (canvasCapture) {
        try {
          const ctx = beepCtxRef.current;
          const dest = recordDestRef.current;
          // Only while the engine is actually running: a suspended engine's
          // destination track still exists but carries silence, and the plain
          // mic track below is recorded instead of a silent one.
          if (dest && ctx && ctx.state === 'running') {
            buildMicChain(ctx, audioStream).connect(dest);
            const t = dest.stream.getAudioTracks()[0];
            if (t && t.readyState === 'live') audioTrack = t;
          }
        } catch {}
      } else {
        try {
          const ctx = beepCtxRef.current;
          const dest = micOnlyDestRef.current;
          // That destination only carries sound while the engine is actually
          // running, so it is used only then — otherwise the phone's plain mic
          // track is recorded instead of a silent one.
          if (ctx && ctx.state === 'running' && dest) {
            buildMicChain(ctx, audioStream).connect(dest);
            const t = dest.stream.getAudioTracks()[0];
            if (t && t.readyState === 'live') audioTrack = t;
          }
        } catch {}
      }
      if (!audioTrack) audioTrack = audioStream.getAudioTracks()[0] || null;
      if (audioTrack) canvasStream.addTrack(audioTrack);

      const mimeType = (canvasCapture
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'])
        .find(t => MediaRecorder.isTypeSupported(t)) || '';

      const mr = new MediaRecorder(canvasStream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = mr;
      videoChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) videoChunksRef.current.push({ blob: e.data, t: Date.now() }); };
      mr.onstop = () => {
        const blob = new Blob(videoChunksRef.current.map((c) => c.blob), { type: mimeType || (canvasCapture ? 'video/webm' : 'audio/mp4') });
        videoBlobRef.current = blob;
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

  const calibrateBaseline = () => {
    const s = currentSensor.current;
    baselineSamples.current.push({ ...s });
    if (baselineSamples.current.length >= 20) {
      const avg = (key) => baselineSamples.current.reduce((sum, x) => sum + x[key], 0) / baselineSamples.current.length;
      baselineRef.current = {
        ax: avg('ax'), ay: avg('ay'), az: avg('az'),
        gx: avg('gx'), gy: avg('gy'), gz: avg('gz'),
        mx: avg('mx'), my: avg('my'), mz: avg('mz'),
      };
    }
  };

  const computeAlertLevel = () => {
    const cur = currentSensor.current;
    const base = baselineRef.current;

    const dAccel = Math.sqrt(
      Math.pow(cur.ax - base.ax, 2) +
      Math.pow(cur.ay - base.ay, 2) +
      Math.pow(cur.az - base.az, 2)
    );
    const dGyro = Math.sqrt(
      Math.pow(cur.gx - base.gx, 2) +
      Math.pow(cur.gy - base.gy, 2) +
      Math.pow(cur.gz - base.gz, 2)
    );
    const dMag = Math.sqrt(
      Math.pow(cur.mx - base.mx, 2) +
      Math.pow(cur.my - base.my, 2) +
      Math.pow(cur.mz - base.mz, 2)
    );

    const accelScore = Math.min(dAccel / (SENSITIVITY_THRESHOLDS.accel * 5), 1);
    const gyroScore = Math.min(dGyro / (SENSITIVITY_THRESHOLDS.gyro * 5), 1);
    const magScore = Math.min(dMag / (SENSITIVITY_THRESHOLDS.mag * 5), 1);

    const combined = (accelScore * 0.5 + gyroScore * 0.3 + magScore * 0.2) * 100;
    return Math.round(Math.min(combined, 100));
  };

  // One disturbance is one logged event, written as the peak it reached: the run
  // is tracked from the moment the level leaves the green until the room settles
  // back into it, so climbing through orange into red and back down again is a
  // single red event rather than one per step.
  const finalizeExcursion = (now) => {
    const ex = excursionRef.current;
    if (!ex) return;
    excursionRef.current = null;
    setLiveEvent(null);
    const entry = {
      time: ex.startedAt,
      label: levelLabel(ex.peak),
      level: ex.peak,
      duration: Math.max(1, Math.round((now - ex.startedAtMs) / 1000)),
    };
    setEvents((prev) => {
      const updated = [entry, ...prev].slice(0, 20);
      eventsRef.current = updated;
      return updated;
    });
  };

  const activate = async () => {
    setSensorError(null);
    setVideoBlob(null);
    videoBlobRef.current = null;
    setEvents([]);
    eventsRef.current = [];
    excursionRef.current = null;
    setLiveEvent(null);
    setSessionDuration(0);
    sessionDurationRef.current = 0;
    setAlertLevel(0);
    alertLevelRef.current = 0;
    sensorDataReceivedRef.current = false;
    baselineSamples.current = [];

    const ok = await requestSensorPermissions();
    if (!ok) return;

    // Engine and music hold before the countdown: the engine is created as
    // close to the tap as the permission prompts allow, and the recorder built
    // after the calibration mixes the beeps through its destination.
    startAudioEngine();
    holdAmbience();

    window.addEventListener('devicemotion', handleMotion);
    window.addEventListener('deviceorientationabsolute', handleOrientation);
    window.addEventListener('deviceorientation', handleOrientation);

    setPhase('countdown');
    setCountdown(Math.ceil(CALIBRATION_MS / 1000));

    // The baseline is measured over a real quiet window and sampled at the same
    // cadence the session uses; the session, its recording and its event log all
    // start only once it is established. A baseline seeded from the moment or
    // two before the phone was even set down is what flooded the log with
    // detections the instant a session began.
    const calibrationEnd = Date.now() + CALIBRATION_MS;
    const cdInterval = setInterval(() => {
      calibrateBaseline();
      setCountdown(Math.max(0, Math.ceil((calibrationEnd - Date.now()) / 1000)));
      if (Date.now() >= calibrationEnd) {
        clearInterval(cdInterval);
        beginSession();
      }
    }, 300);
  };

  const beginSession = async () => {
    setPhase('active');
    // Wait for canvas to render
    await new Promise(r => setTimeout(r, 100));

    startCanvasDrawing();
    // The engine (and the music hold) were started when the session was
    // activated; the recorder built below mixes the beeps through its
    // destination.
    await startRecording();

    sessionStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000);
      setSessionDuration((prev) => (prev === elapsed ? prev : elapsed));
      sessionDurationRef.current = elapsed;
      calibrateBaseline();

      if (elapsed === 5 && !sensorDataReceivedRef.current) {
        setSensorError('No motion sensor data detected. This tool requires a mobile device with accelerometer/gyroscope sensors.');
      }

      // Keep the beep engine alive: the phone can suspend it mid-session, and a
      // suspended engine takes the recording's microphone destination down with
      // it (the saved session then loses the room, and the beeps go quiet).
      const beepCtx = beepCtxRef.current;
      if (beepCtx && beepCtx.state !== 'running') { try { beepCtx.resume(); } catch {} }

      const level = computeAlertLevel();
      setAlertLevel(level);
      alertLevelRef.current = level;
      updateBeeping(level);

      // While the level is out of the green the run's peak is tracked and
      // nothing is logged; the event is written the moment the room settles back
      // into the green.
      const now = Date.now();
      const ex = excursionRef.current;
      if (level >= 20) {
        if (!ex) {
          const started = { startedAt: new Date(now).toLocaleTimeString(), startedAtMs: now, peak: level };
          excursionRef.current = started;
          setLiveEvent({ time: started.startedAt, label: levelLabel(level), level });
        } else if (level > ex.peak) {
          ex.peak = level;
          setLiveEvent({ time: ex.startedAt, label: levelLabel(level), level });
        }
      } else if (ex) {
        finalizeExcursion(now);
      }
    }, 300);
  };

  const deactivate = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    // A disturbance still running when the session ends is logged with the peak
    // it reached, so the last one is never lost.
    finalizeExcursion(Date.now());
    stopCanvasDrawing();
    stopAudioEngine();
    releaseAmbience();
    window.removeEventListener('devicemotion', handleMotion);
    window.removeEventListener('deviceorientationabsolute', handleOrientation);
    window.removeEventListener('deviceorientation', handleOrientation);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }

    setPhase('stopped');
  };

  const saveSession = async (isPrivate = true) => {
    if (!displayBlob) return;
    setSaving(true);
    let gateSucceeded = false;
    try {
      // Upload and capture GPS BEFORE gating so a failed upload or cancelled
      // GPS flow does NOT consume a daily evidence save.
      const ext = displayBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([displayBlob], `rem_session.${ext}`, { type: displayBlob.type });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().slice(0, 5);
      const gpsResult = await captureGpsForSave();
      if (!gpsResult) { setSaving(false); return; }
      if (!isPrivate && (gpsResult.location_source === 'NONE' || gpsResult.latitude == null)) {
        toast({ title: 'Evidence Cannot Be Made Public', description: 'This evidence does not have a valid location. Evidence must have GPS coordinates or a tour-stop location to be shared on the Community Map. The evidence may still be saved privately if appropriate.', variant: 'destructive' });
        setSaving(false);
        return;
      }
      if (gateSave && !(await gateSave())) { setSaving(false); return; }
      gateSucceeded = true;
      const ctx = await buildEvidenceContext(gpsResult, { skipGps: true });
      await base44.entities.Evidence.create({
        title: `Vibration Communicator Session ${date}`,
        type: displayBlob.type.startsWith('audio') ? 'evp' : 'video',
        source_tool: 'rem',
        description: `Vibration Communicator session — ${formatDuration(sessionDuration)} — ${events.length} disturbance event(s) detected${events.length ? `, strongest peak ${Math.max(...events.map((e) => e.level))}` : ''}.${trimMode !== 'full' ? ` Saved: last ${trimSeconds} seconds.` : ''}`,
        file_url,
        date,
        time,
        is_private: isPrivate,
        ...gpsResult,
        ...ctx,
      });
      setVideoBlob(null);
      videoBlobRef.current = null;
      setPhase('idle');
      setEvents([]);
      eventsRef.current = [];
      excursionRef.current = null;
      setLiveEvent(null);
    } catch (e) {
      if (gateSucceeded && refundSave) await refundSave();
      console.error('Save failed', e);
    }
    setSaving(false);
  };

  const discard = () => {
    setVideoBlob(null);
    videoBlobRef.current = null;
    setPhase('idle');
    setEvents([]);
    eventsRef.current = [];
    excursionRef.current = null;
    setLiveEvent(null);
    setAlertLevel(0);
    alertLevelRef.current = 0;
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopCanvasDrawing();
      stopAudioEngine();
      releaseAmbience();
      window.removeEventListener('devicemotion', handleMotion);
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
      window.removeEventListener('deviceorientation', handleOrientation);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ── IDLE ────────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="space-y-4">
        {sensorError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{sensorError}</p>
            </div>
            <button
              onClick={activate}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors"
            >
              <Play className="w-3.5 h-3.5" /> Allow Access
            </button>
          </div>
        )}

        <div className="p-4 rounded-lg bg-black/40 border border-primary/20 space-y-3 text-center">
          <Zap className="w-10 h-10 text-primary mx-auto opacity-60" />
          <p className="text-xs font-heading uppercase tracking-wider text-primary">Vibration Communicator</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Uses your phone's motion, gyroscope & orientation sensors to detect energy disturbances — modeled after a physical REM device. The on-screen visualization is recorded for evidence.
          </p>
        </div>

        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-1.5">
          <p className="text-[10px] font-heading uppercase tracking-wider text-amber-400">Instructions</p>
          <ol className="space-y-1">
            {[
              'Press Activate and grant sensor & mic permissions.',
              'Set the phone face-down on a flat surface and step away during the 10-second baseline calibration.',
              'Recording begins once the baseline is set — the calibration itself is not recorded.',
              'Observe — any energy disturbance will be detected.',
              'Press Deactivate when finished. You can save the video as evidence.',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-[10px] text-muted-foreground">
                <span className="text-primary font-mono shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <button
          onClick={activate}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors"
        >
          <Play className="w-4 h-4" /> Activate Vibration Device
        </button>
      </div>
    );
  }

  // ── COUNTDOWN ───────────────────────────────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <div className="space-y-4 text-center">
        <div className="p-6 rounded-lg bg-black/40 border border-primary/30 flex flex-col items-center gap-3">
          <p className="text-[10px] font-heading uppercase tracking-wider text-primary">Calibrating Sensors…</p>
          <p className="font-mono text-6xl text-primary animate-pulse">{countdown}</p>
          <p className="text-xs text-muted-foreground">Set the phone face-down on a flat surface and step away. Establishing baseline readings.</p>
        </div>
        <p className="text-[10px] text-muted-foreground/60">Recording starts once the baseline is set — the calibration itself is not recorded.</p>
      </div>
    );
  }

  // ── ACTIVE ──────────────────────────────────────────────────────────────────
  if (phase === 'active') {
    return (
      <div className="space-y-3">
        {sensorError && (
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-300">{sensorError}</p>
          </div>
        )}
        {/* Main alert display */}
        <div className={`p-4 rounded-lg border transition-all duration-500 ${alertBg(alertLevel)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Energy Level</span>
            <span className="text-[10px] font-mono text-muted-foreground">● REC {formatDuration(sessionDuration)}</span>
          </div>
          <div className="flex items-end gap-3">
            <p className={`font-mono text-4xl font-bold ${alertColor(alertLevel)}`}>{alertLevel}</p>
            <p className={`text-xs mb-1 ${alertColor(alertLevel)}`}>
              {alertLevel < 20 ? 'Quiet' : alertLevel < 50 ? 'Minor Activity' : alertLevel < 80 ? 'Moderate Disturbance' : '⚠ STRONG DISTURBANCE'}
            </p>
          </div>
          {/* Bar */}
          <div className="mt-2 h-2 rounded-full bg-black/40 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${alertLevel < 20 ? 'bg-green-400' : alertLevel < 50 ? 'bg-yellow-400' : alertLevel < 80 ? 'bg-orange-400' : 'bg-red-500'}`}
              style={{ width: `${alertLevel}%` }}
            />
          </div>
        </div>

        {/* Canvas recording — captures what's shown on screen */}
        <div className="rounded-lg overflow-hidden border border-border/30 bg-black relative">
          <canvas ref={canvasRef} width={640} height={360} className="w-full h-32 object-cover" />
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/80">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[9px] text-white font-mono">REC</span>
          </div>
        </div>

        {/* Event log */}
        {(events.length > 0 || liveEvent) && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Event Log</p>
            {liveEvent && (
              <div className="flex items-center justify-between px-2 py-1 rounded bg-card/40 border border-dashed border-border/50">
                <span className="text-[10px] text-muted-foreground font-mono">{liveEvent.time}</span>
                <span className={`text-[10px] font-medium ${alertColor(liveEvent.level)}`}>{liveEvent.label} · in progress</span>
              </div>
            )}
            {events.map((ev, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-card/30 border border-border/20">
                <span className="text-[10px] text-muted-foreground font-mono">{ev.time}</span>
                <span className={`text-[10px] font-medium ${alertColor(ev.level)}`}>{ev.label} · {ev.duration}s</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={deactivate}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-heading text-xs uppercase tracking-wider hover:bg-red-500/20 transition-colors"
        >
          <Square className="w-4 h-4" /> Deactivate & Stop Recording
        </button>
      </div>
    );
  }

  // ── STOPPED ──────────────────────────────────────────────────────────────────
  if (phase === 'stopped') {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-card/30 border border-border/30 space-y-2">
          <p className="text-[10px] font-heading uppercase tracking-wider text-primary">Session Complete</p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Duration: {formatDuration(sessionDuration)}</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Events: {events.length}</span>
          </div>
        </div>

        {/* Event summary */}
        {events.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Disturbance Events</p>
            {events.map((ev, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded bg-card/30 border border-border/20">
                <span className="text-[10px] text-muted-foreground font-mono">{ev.time}</span>
                <span className={`text-[10px] font-medium ${alertColor(ev.level)}`}>{ev.label} · {ev.duration}s</span>
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
              <video
                src={URL.createObjectURL(displayBlob)}
                controls
                className="w-full rounded"
                style={{ maxHeight: 180 }}
              />
            </div>
            <RecordTrimPicker value={trimMode} onChange={setTrimMode} />
            <EvidenceSaveButtons onSave={saveSession} saving={saving} />
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-card/30 border border-border/30 text-center">
            <p className="text-xs text-muted-foreground">No video captured (recording may not have been available).</p>
          </div>
        )}

        <button
          onClick={discard}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-red-500/30 hover:text-red-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Discard & Reset
        </button>
        {gpsDialog}
        {trackingOffDialog}
      </div>
    );
  }

  return gpsDialog;
}