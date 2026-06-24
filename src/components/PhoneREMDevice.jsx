import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Save, X, Video, AlertTriangle, Zap, Activity } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const SENSITIVITY_THRESHOLDS = {
  accel: 0.4,   // m/s² delta from baseline
  gyro: 0.08,   // rad/s delta from baseline
  mag: 3.0,     // μT delta from baseline
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

export default function PhoneREMDevice() {
  const [phase, setPhase] = useState('idle'); // idle | countdown | active | stopped
  const [countdown, setCountdown] = useState(3);
  const [alertLevel, setAlertLevel] = useState(0);
  const [events, setEvents] = useState([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [videoBlob, setVideoBlob] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sensorError, setSensorError] = useState(null);

  // Sensor baselines
  const baselineRef = useRef({ ax: 0, ay: 0, az: 9.8, gx: 0, gy: 0, gz: 0, mx: 0, my: 0, mz: 0 });
  const baselineSamples = useRef([]);
  const currentSensor = useRef({ ax: 0, ay: 0, az: 9.8, gx: 0, gy: 0, gz: 0, mx: 0, my: 0, mz: 0 });

  const timerRef = useRef(null);
  const alertTimerRef = useRef(null);
  const beepCtxRef = useRef(null);
  const beepIntervalRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const videoBlobRef = useRef(null);
  const videoPreviewRef = useRef(null);
  const streamRef = useRef(null);

  // Sensor handlers
  const handleMotion = (e) => {
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
    // Use orientation as a proxy for magnetometer when DeviceOrientationEvent has absolute data
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
        setSensorError('Motion sensor permission denied. Please allow sensor access in your browser settings.');
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
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // Sine wave with a slight detuned overtone for creepy texture
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc2.type = 'triangle';
    osc2.frequency.value = frequency * 1.007; // slight detune = eerie beating effect
    gain2.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain); gain.connect(ctx.destination);
    osc2.connect(gain2); gain2.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    osc2.start(ctx.currentTime);
    osc2.stop(ctx.currentTime + duration);
  };

  const updateBeeping = (level) => {
    // Clear existing interval
    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }

    if (level < 20) return; // silent in green zone

    if (level >= 80) {
      // Red zone: steady high-pitched tone
      const freq = 900 + (level - 80) * 5; // 900–1000 Hz
      beepIntervalRef.current = setInterval(() => playBeep(freq, 0.08), 80);
    } else {
      // level 20→80: slow low beeps → fast high beeps
      // interval: 1800ms → 180ms, freq: 220Hz → 860Hz
      const t = (level - 20) / 60; // 0 at level 20, 1 at level 80
      const intervalMs = Math.round(1800 - t * 1620);
      const freq = 220 + t * 640;
      beepIntervalRef.current = setInterval(() => playBeep(freq, 0.14), intervalMs);
    }
  };

  const startAudioEngine = async () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    beepCtxRef.current = ctx;
  };

  const stopAudioEngine = () => {
    if (beepIntervalRef.current) { clearInterval(beepIntervalRef.current); beepIntervalRef.current = null; }
    if (beepCtxRef.current) { beepCtxRef.current.close(); beepCtxRef.current = null; }
  };

  const startVideoCapture = async () => {
    try {
      // Use selfie (user-facing) camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;

      // Show live preview
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }

      // Pick a supported mimeType
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = mr;
      videoChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(videoChunksRef.current, { type: mimeType || 'video/webm' });
        videoBlobRef.current = blob;
        setVideoBlob(blob);
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };
      mr.start(1000);
      return true;
    } catch (e) {
      setSensorError('Camera/mic access denied. Grant permission to record the session.');
      return false;
    }
  };

  const calibrateBaseline = () => {
    // Collect ~20 samples over 1s during countdown to establish a quiet baseline
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

    // Normalize each to 0–1 range then combine
    const accelScore = Math.min(dAccel / (SENSITIVITY_THRESHOLDS.accel * 5), 1);
    const gyroScore = Math.min(dGyro / (SENSITIVITY_THRESHOLDS.gyro * 5), 1);
    const magScore = Math.min(dMag / (SENSITIVITY_THRESHOLDS.mag * 5), 1);

    // Weighted combination: accel most sensitive, mag adds presence-style detection
    const combined = (accelScore * 0.5 + gyroScore * 0.3 + magScore * 0.2) * 100;
    return Math.round(Math.min(combined, 100));
  };

  const activate = async () => {
    setSensorError(null);
    setVideoBlob(null);
    videoBlobRef.current = null;
    setEvents([]);
    setSessionDuration(0);
    setAlertLevel(0);
    baselineSamples.current = [];

    const ok = await requestSensorPermissions();
    if (!ok) return;

    window.addEventListener('devicemotion', handleMotion);
    window.addEventListener('deviceorientationabsolute', handleOrientation);
    window.addEventListener('deviceorientation', handleOrientation);

    setPhase('countdown');
    setCountdown(3);

    let count = 3;
    const cdInterval = setInterval(() => {
      calibrateBaseline();
      count--;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(cdInterval);
        beginSession();
      }
    }, 1000);
  };

  const beginSession = async () => {
    setPhase('active');
    await startVideoCapture();
    await startAudioEngine();

    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed++;
      setSessionDuration(elapsed);
      calibrateBaseline();

      const level = computeAlertLevel();
      setAlertLevel(level);
      updateBeeping(level);

      if (level >= 20) {
        const label = level >= 80 ? '🔴 STRONG DISTURBANCE' : level >= 50 ? '🟠 MODERATE ACTIVITY' : '🟡 MINOR FLUCTUATION';
        const ts = new Date().toLocaleTimeString();
        setEvents(prev => [{ time: ts, label, level }, ...prev].slice(0, 20));
      }
    }, 300);
  };

  const deactivate = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopAudioEngine();
    window.removeEventListener('devicemotion', handleMotion);
    window.removeEventListener('deviceorientationabsolute', handleOrientation);
    window.removeEventListener('deviceorientation', handleOrientation);

    // Stop media recorder — onstop fires async and sets videoBlob
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    setPhase('stopped');
  };

  const saveSession = async () => {
    const blob = videoBlobRef.current || videoBlob;
    if (!blob) return;
    setSaving(true);
    try {
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `rem_session.${ext}`, { type: blob.type });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().slice(0, 5);
      await base44.entities.Evidence.create({
        title: `Phone REM Session ${date}`,
        type: 'video',
        description: `Phone REM device session — ${formatDuration(sessionDuration)} — ${events.length} disturbance event(s) detected.`,
        file_url,
        date,
        time,
      });
      setVideoBlob(null);
      videoBlobRef.current = null;
      setPhase('idle');
      setEvents([]);
    } catch (e) {
      console.error('Save failed', e);
    }
    setSaving(false);
  };

  const discard = () => {
    setVideoBlob(null);
    videoBlobRef.current = null;
    setPhase('idle');
    setEvents([]);
    setAlertLevel(0);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopAudioEngine();
      window.removeEventListener('devicemotion', handleMotion);
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
      window.removeEventListener('deviceorientation', handleOrientation);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
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
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{sensorError}</p>
          </div>
        )}

        <div className="p-4 rounded-lg bg-black/40 border border-primary/20 space-y-3 text-center">
          <Zap className="w-10 h-10 text-primary mx-auto opacity-60" />
          <p className="text-xs font-heading uppercase tracking-wider text-primary">Phone REM Device</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Uses your phone's motion, gyroscope & orientation sensors to detect energy disturbances — just like a physical REM device. Camera + audio is recorded for evidence.
          </p>
        </div>

        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-1.5">
          <p className="text-[10px] font-heading uppercase tracking-wider text-amber-400">Instructions</p>
          <ol className="space-y-1">
            {[
              'Press Activate and grant sensor, camera & mic permissions.',
              'Wait for the 3-second calibration countdown.',
              'Set your phone face-down (camera side up) on a flat surface.',
              'Step away and observe — any energy disturbance will be detected.',
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
          <Play className="w-4 h-4" /> Activate REM Device
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
          <p className="text-xs text-muted-foreground">Hold still. Establishing baseline readings.</p>
        </div>
        <p className="text-[10px] text-muted-foreground/60">After activation, place phone face-down on a flat surface and step away.</p>
      </div>
    );
  }

  // ── ACTIVE ──────────────────────────────────────────────────────────────────
  if (phase === 'active') {
    return (
      <div className="space-y-3">
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

        {/* Live camera preview (small, so user can confirm camera is recording) */}
        <div className="rounded-lg overflow-hidden border border-border/30 bg-black relative">
          <video ref={videoPreviewRef} autoPlay muted playsInline className="w-full h-32 object-cover opacity-70" />
          <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/80">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[9px] text-white font-mono">REC</span>
          </div>
        </div>

        {/* Event log */}
        {events.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Event Log</p>
            {events.map((ev, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-card/30 border border-border/20">
                <span className="text-[10px] text-muted-foreground font-mono">{ev.time}</span>
                <span className={`text-[10px] font-medium ${alertColor(ev.level)}`}>{ev.label}</span>
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
                <span className={`text-[10px] font-medium ${alertColor(ev.level)}`}>{ev.label}</span>
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
                src={URL.createObjectURL(videoBlob)}
                controls
                className="w-full rounded"
                style={{ maxHeight: 180 }}
              />
            </div>
            <button
              onClick={saveSession}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-heading text-xs uppercase tracking-wider hover:bg-green-500/20 transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving to Evidence…' : 'Save Video to Evidence Journal'}
            </button>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-card/30 border border-border/30 text-center">
            <p className="text-xs text-muted-foreground">No video captured (camera may not have been available).</p>
          </div>
        )}

        <button
          onClick={discard}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-red-500/30 hover:text-red-400 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Discard & Reset
        </button>
      </div>
    );
  }

  return null;
}