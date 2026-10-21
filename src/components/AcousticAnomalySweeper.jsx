import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Square, X, Info, Video, Activity, AlertTriangle, Bookmark, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { buildEvidenceContext } from '@/lib/evidenceContext';
import { useToolGpsSave } from '@/hooks/useToolGpsSave';
import EvidenceSaveButtons from './EvidenceSaveButtons';
import { buildMicChain } from '@/lib/micRecordChain';
import { toast } from '@/components/ui/use-toast';
import { ACOUSTIC_BANDS, createBaselineTracker, measureLevels, eventThresholdDb, dominantBand } from '@/lib/acousticAnalysis';
import { audioAcquire, audioRelease } from '@/lib/hauntedAudio';
import RecordTrimPicker from './RecordTrimPicker';
import { TRIM_OPTIONS } from '@/lib/recordTrim';
import usePreparedRecording from '@/hooks/usePreparedRecording';
import RecordingPreparation from '@/components/RecordingPreparation';
import RecordingPreview from '@/components/RecordingPreview';
import { startChunkPump, stopChunkPump } from '@/lib/recorderChunkPump';

// Listen-only acoustic monitor. It never emits sound: it listens through the
// device microphone, measures the room's own baseline first, then watches for
// sustained departures from it. A rise above the baseline is logged as an event
// with its time and the band that moved, and the whole strip chart is recorded
// as video so the trace lines up with what was heard.
const FFT_SIZE = 2048;
const SAMPLE_MS = 100;              // 10 measurement frames per second
const WINDOW_SAMPLES = 300;         // 30-second strip chart
const CALIBRATION_MS = 10000;       // quiet calibration before anything is reported
const ANOMALY_HOLD_MS = 400;        // a rise must last this long to count
const RELEASE_MS = 600;             // quiet needed before the detector re-arms
const RELEASE_HYSTERESIS_DB = 2;    // how far back down counts as "quiet" again
const REARM_COOLDOWN_MS = 2000;     // floor between events
const SCALE_DB = 30;                // ±30 dB spans half the chart height
const SENSITIVITY = { low: 0.7, normal: 1, high: 1.6 };
const SENSITIVITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High' };

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function AcousticAnomalySweeper({ gateSave, refundSave }) {
  const { captureGpsForSave, gpsDialog, trackingOffDialog } = useToolGpsSave();
  const [phase, setPhase] = useState('idle'); // idle | running | stopped
  const [calibrating, setCalibrating] = useState(false);
  const [sensitivity, setSensitivity] = useState('normal');
  const [events, setEvents] = useState([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [level, setLevel] = useState(0);
  const [bandLevels, setBandLevels] = useState({});
  const [anomalyActive, setAnomalyActive] = useState(false);
  const [sensorError, setSensorError] = useState('');
  const [recordingError, setRecordingError] = useState('');
  const [videoBlob, setVideoBlob] = useState(null);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [trimMode, setTrimMode] = useState('full');

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const freqDataRef = useRef(null);
  const baselineRef = useRef(null);
  const traceRef = useRef([]);
  const markersRef = useRef([]);
  const bandRef = useRef({});
  const levelRef = useRef(0);
  const statusRef = useRef('CALIBRATING');
  const durationRef = useRef(0);
  const eventCountRef = useRef(0);
  const sampleCountRef = useRef(0);
  const sensitivityRef = useRef('normal');
  const sessionActiveRef = useRef(false);
  const calibratingRef = useRef(true);
  const calibrationEndRef = useRef(0);
  const aboveSinceRef = useRef(0);
  const quietSinceRef = useRef(0);
  const armedRef = useRef(true);
  const lastEventRef = useRef(0);
  const sampleTimerRef = useRef(null);
  const drawTimerRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const sessionStartRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const chunkPumpRef = useRef(null);
  const canvasStreamRef = useRef(null);
  const mimeRef = useRef('');
  const audioOnlyRef = useRef(false);
  const anomalyTimerRef = useRef(null);
  const recordingRef = useRef(false);
  const ambienceHeldRef = useRef(false);

  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);

  useEffect(() => () => stopEverything(), []);

  const trimSeconds = TRIM_OPTIONS.find((o) => o.id === trimMode)?.seconds;
  const preparedRecording = usePreparedRecording(videoBlob, trimSeconds);
  const displayBlob = preparedRecording.blob;

  const closeAudio = () => {
    if (canvasStreamRef.current) {
      try { canvasStreamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      canvasStreamRef.current = null;
    }
    if (micStreamRef.current) {
      try { micStreamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      micStreamRef.current = null;
    }
    const ctx = ctxRef.current;
    if (ctx) { try { ctx.close(); } catch {} }
    ctxRef.current = null;
    analyserRef.current = null;
  };

  // The app's own music is held quiet for the whole session, not just the
  // recorded part: it leaves through the phone's speaker right beside the
  // microphone, and the calibration is measuring exactly how quiet the room is.
  const holdAmbience = () => {
    if (ambienceHeldRef.current) return;
    ambienceHeldRef.current = audioAcquire('Acoustic Anomaly Sweeper');
  };
  const releaseAmbience = () => {
    if (!ambienceHeldRef.current) return;
    audioRelease(ambienceHeldRef.current);
    ambienceHeldRef.current = null;
  };

  const stopEverything = () => {
    sessionActiveRef.current = false;
    [sampleTimerRef, drawTimerRef, sessionTimerRef, heartbeatRef, anomalyTimerRef].forEach((r) => {
      if (r.current) { clearInterval(r.current); r.current = null; }
    });
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      // The recorder releases the microphone and the audio context in its own
      // onstop, once the final chunk has been flushed.
      try { recorder.stop(); } catch {}
    } else {
      closeAudio();
    }
    recordingRef.current = false;
    setRecording(false);
    setAnomalyActive(false);
    releaseAmbience();
  };

  // ── Microphone → analyser. Nothing is ever routed to the speakers: this tool
  // is listen-only, so there is no playback and no path to feedback. ──
  const startListening = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    });
    micStreamRef.current = stream;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    ctxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.5;
    analyser.minDecibels = -100;
    analyser.maxDecibels = -10;
    ctx.createMediaStreamSource(stream).connect(analyser);
    analyserRef.current = analyser;
    freqDataRef.current = new Float32Array(analyser.frequencyBinCount);
  };

  // ── Recording. The canvas carries the strip chart; the microphone carries the
  // room. There is no app audio to mix in, so the mic goes through the shared
  // lift-and-limiter chain (micRecordChain) as the recording's only input. ──
  const startRecording = async () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const micStream = micStreamRef.current;
    if (!canvas || !ctx || !micStream) {
      setRecordingError('The session recording could not start on this device.');
      return;
    }
    const canvasCapture = typeof canvas.captureStream === 'function';
    audioOnlyRef.current = !canvasCapture;
    if (!canvasCapture) {
      setRecordingError('Recording the session audio — this device cannot record the on-screen trace.');
    }
    const stream = canvasCapture ? canvas.captureStream(30) : new MediaStream();
    canvasStreamRef.current = stream;
    // The microphone goes into the recording through the shared lift and
    // limiter (micRecordChain), never raw, so a voice and the room sit at a
    // usable level. If that mixed destination is unavailable, the plain
    // microphone track is recorded rather than nothing.
    let audioTrack = null;
    try {
      const dest = ctx.createMediaStreamDestination();
      buildMicChain(ctx, micStream).connect(dest);
      const t = dest.stream.getAudioTracks()[0];
      if (t && t.readyState === 'live') audioTrack = t;
    } catch {}
    if (!audioTrack) audioTrack = micStream.getAudioTracks()[0] || null;
    if (audioTrack) stream.addTrack(audioTrack);
    const candidates = canvasCapture
      ? ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    const mime = candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    mimeRef.current = mime;
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    mediaRecorderRef.current = mr;
    chunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push({ blob: e.data, t: Date.now() }); };
    mr.onstop = () => {
      stopChunkPump(chunkPumpRef.current); chunkPumpRef.current = null;
      const blob = new Blob(chunksRef.current.map((c) => c.blob), { type: mimeRef.current || (audioOnlyRef.current ? 'audio/mp4' : 'video/webm') });
      setVideoBlob(blob);
      // Release the microphone and the audio context only once the recorder has
      // flushed its final chunk — stopping the tracks first can drop it.
      closeAudio();
    };
    mr.start(1000);
    chunkPumpRef.current = startChunkPump(mr);
    recordingRef.current = true;
    setRecording(true);
  };

  // The baseline is measured first and the recording starts with it: the video
  // and the session clock both begin the moment it is set, so neither carries
  // the calibration. The trace display is on screen by then, which is also what
  // the recorder needs to attach to.
  const beginRecording = () => {
    if (!sessionActiveRef.current || recordingRef.current) return;
    sessionStartRef.current = Date.now();
    durationRef.current = 0;
    setSessionDuration(0);
    sessionTimerRef.current = setInterval(() => {
      const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000);
      durationRef.current = elapsed;
      setSessionDuration(elapsed);
    }, 1000);
    startRecording();
  };

  // ── One measurement frame ──
  const sampleFrame = () => {
    const analyser = analyserRef.current;
    const freqData = freqDataRef.current;
    const ctx = ctxRef.current;
    if (!analyser || !freqData || !ctx) return;
    analyser.getFloatFrequencyData(freqData);
    const levels = measureLevels(freqData, ctx.sampleRate, analyser.fftSize);
    const tracker = baselineRef.current;

    if (calibratingRef.current) {
      tracker.calibrate(levels);
      if (Date.now() >= calibrationEndRef.current && tracker.calibrated) {
        calibratingRef.current = false;
        setCalibrating(false);
        statusRef.current = 'LISTENING';
        // Recording begins with the baseline, never before it.
        beginRecording();
      }
      traceRef.current.push(0);
    } else {
      const hold = !armedRef.current;
      const { broadband, bands } = tracker.deviation(levels, { hold });
      traceRef.current.push(broadband);
      bandRef.current = bands;
      levelRef.current = broadband;
      setLevel(broadband);
      setBandLevels({ ...bands });
      detectEvent(broadband, bands);
    }

    if (traceRef.current.length > WINDOW_SAMPLES) traceRef.current.shift();
    sampleCountRef.current += 1;
  };

  // A rise only counts as an event if it is sustained, and the detector then
  // latches until the room actually drops back to its baseline. Without that
  // latch a single loud stretch fires again every cooldown and buries the log.
  const detectEvent = (broadband, bands) => {
    const threshold = eventThresholdDb(baselineRef.current.sd, SENSITIVITY[sensitivityRef.current]);
    const now = Date.now();

    if (!armedRef.current) {
      statusRef.current = 'EVENT';
      if (broadband < threshold - RELEASE_HYSTERESIS_DB) {
        if (!quietSinceRef.current) quietSinceRef.current = now;
        else if (now - quietSinceRef.current >= RELEASE_MS) {
          armedRef.current = true;
          quietSinceRef.current = 0;
          statusRef.current = 'LISTENING';
        }
      } else {
        quietSinceRef.current = 0;
      }
      return;
    }

    if (broadband >= threshold) {
      if (!aboveSinceRef.current) aboveSinceRef.current = now;
      if (now - aboveSinceRef.current >= ANOMALY_HOLD_MS && now - lastEventRef.current >= REARM_COOLDOWN_MS) {
        const band = dominantBand(bands);
        lastEventRef.current = now;
        aboveSinceRef.current = 0;
        armedRef.current = false;
        statusRef.current = 'EVENT';
        logEvent({ time: new Date().toLocaleTimeString(), band: band?.label || '—', deviation: broadband });
        setAnomalyActive(true);
        if (anomalyTimerRef.current) clearTimeout(anomalyTimerRef.current);
        anomalyTimerRef.current = setTimeout(() => setAnomalyActive(false), 3000);
      }
    } else {
      aboveSinceRef.current = 0;
    }
  };

  const logEvent = useCallback((entry) => {
    markersRef.current.push({ sample: sampleCountRef.current, manual: !!entry.manual });
    if (markersRef.current.length > 60) markersRef.current.shift();
    if (!entry.manual) eventCountRef.current += 1;
    setEvents((prev) => [entry, ...prev].slice(0, 40));
  }, []);

  // A moment the investigator flagged themselves — the timestamp is what makes
  // it useful later, matched against the recording.
  const markMoment = () => {
    logEvent({ time: new Date().toLocaleTimeString(), band: 'MARKED', deviation: levelRef.current, manual: true });
  };

  // ── Strip chart ──
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const chartTop = 54;
    const chartBottom = 240;
    const centerY = (chartTop + chartBottom) / 2;
    const half = (chartBottom - chartTop) / 2;
    const pxPerDb = half / SCALE_DB;
    const pxPerSample = w / WINDOW_SAMPLES;
    const trace = traceRef.current;
    const bands = bandRef.current;

    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#a3e635';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('ACOUSTIC ANOMALY SWEEPER', 14, 24);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.fillText('RELATIVE dB · LISTEN-ONLY · 20 Hz – 16 kHz', 14, 39);

    if (recordingRef.current) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(w - 60, 20, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('REC ' + formatDuration(durationRef.current), w - 14, 24);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px monospace';
      ctx.fillText(new Date().toLocaleTimeString(), w - 14, 38);
    }

    // Chart frame, grid and the baseline the trace is measured against.
    ctx.strokeStyle = 'rgba(148,163,184,0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(1, chartTop, w - 2, chartBottom - chartTop);
    for (let i = 1; i < 10; i++) {
      const x = i * (w / 10);
      ctx.beginPath(); ctx.moveTo(x, chartTop); ctx.lineTo(x, chartBottom); ctx.stroke();
    }
    [SCALE_DB, SCALE_DB / 2, -SCALE_DB / 2, -SCALE_DB].forEach((db) => {
      const y = centerY - db * pxPerDb;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(226,235,243,0.42)';
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(w, centerY); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(148,163,184,0.6)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('+30', 6, chartTop + 11);
    ctx.fillText('ROOM BASELINE', 6, centerY - 5);
    ctx.fillText('-30', 6, chartBottom - 4);

    // Event markers, so a logged event can be found on the trace.
    const nowSample = sampleCountRef.current;
    markersRef.current.forEach((m) => {
      const x = w - (nowSample - m.sample) * pxPerSample;
      if (x < 0 || x > w) return;
      ctx.strokeStyle = m.manual ? 'rgba(250,204,21,0.7)' : 'rgba(74,222,128,0.7)';
      ctx.beginPath(); ctx.moveTo(x, chartTop); ctx.lineTo(x, chartBottom); ctx.stroke();
    });

    // The trace: a green line riding above and below the room's own baseline.
    if (trace.length > 1) {
      ctx.strokeStyle = calibratingRef.current ? 'rgba(148,163,184,0.5)' : '#4ade80';
      ctx.lineWidth = 2;
      ctx.shadowColor = calibratingRef.current ? 'transparent' : 'rgba(74,222,128,0.7)';
      ctx.shadowBlur = calibratingRef.current ? 0 : 8;
      ctx.beginPath();
      trace.forEach((db, i) => {
        const x = w - (trace.length - 1 - i) * pxPerSample;
        const y = centerY - Math.max(-SCALE_DB, Math.min(SCALE_DB, db)) * pxPerDb;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Band row — which part of the spectrum moved.
    const bandTop = chartBottom + 12;
    const cellW = (w - 24) / ACOUSTIC_BANDS.length;
    ACOUSTIC_BANDS.forEach((band, i) => {
      const x = 12 + i * cellW;
      const db = bands[band.id];
      ctx.fillStyle = 'rgba(148,163,184,0.55)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(band.label, x, bandTop + 9);
      const barW = cellW - 14;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, bandTop + 14, barW, 4);
      if (Number.isFinite(db) && db > 0) {
        ctx.fillStyle = db > 12 ? '#f87171' : '#a3e635';
        ctx.fillRect(x, bandTop + 14, Math.min(barW, (db / 24) * barW), 4);
      }
    });

    // Status + event count, drawn into the recording.
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    const status = calibratingRef.current
      ? `CALIBRATING — STAY QUIET (${Math.max(0, Math.ceil((calibrationEndRef.current - Date.now()) / 1000))}s)`
      : statusRef.current === 'EVENT' ? 'EVENT ABOVE BASELINE' : 'LISTENING — MONITORING ROOM';
    ctx.fillStyle = calibratingRef.current ? '#facc15' : statusRef.current === 'EVENT' ? '#f87171' : '#4ade80';
    ctx.fillText(status, 14, h - 26);
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText('EVENTS: ' + eventCountRef.current + ' · ' + sensitivityRef.current.toUpperCase(), w - 14, h - 26);

    if (!calibratingRef.current && anomalyActive) {
      ctx.fillStyle = 'rgba(239,68,68,0.92)';
      ctx.fillRect(w / 2 - 92, chartTop + 8, 184, 22);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ ACOUSTIC ANOMALY', w / 2, chartTop + 23);
    } else if (calibratingRef.current) {
      ctx.fillStyle = 'rgba(250,204,21,0.85)';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MEASURING ROOM BASELINE', w / 2, centerY - 12);
    }
  };

  const startSession = async () => {
    setEvents([]);
    setVideoBlob(null);
    setSensorError('');
    setRecordingError('');
    setError('');
    setAnomalyActive(false);
    traceRef.current = [];
    markersRef.current = [];
    bandRef.current = {};
    levelRef.current = 0;
    eventCountRef.current = 0;
    sampleCountRef.current = 0;
    durationRef.current = 0;
    setSessionDuration(0);
    setLevel(0);
    setBandLevels({});
    setRecording(false);
    recordingRef.current = false;
    baselineRef.current = createBaselineTracker();
    calibratingRef.current = true;
    setCalibrating(true);
    statusRef.current = 'CALIBRATING';
    armedRef.current = true;
    aboveSinceRef.current = 0;
    quietSinceRef.current = 0;
    lastEventRef.current = 0;

    try {
      await startListening();
    } catch (e) {
      setSensorError('Microphone access is required — this tool listens to the room. Allow microphone permission in your device settings, then start again.');
      return;
    }

    setPhase('running');
    sessionActiveRef.current = true;
    calibrationEndRef.current = Date.now() + CALIBRATION_MS;
    // The trace display is switched in above; give React the frame it needs to
    // mount the canvas before anything is drawn onto it.
    await new Promise((r) => setTimeout(r, 150));
    holdAmbience();
    draw();
    drawTimerRef.current = setInterval(draw, 33);
    sampleTimerRef.current = setInterval(sampleFrame, SAMPLE_MS);
    // The phone can suspend the audio engine under its own timer throttling: a
    // suspended engine flatlines the analyser and ends the recording's audio
    // track, so it is nudged back for the whole session, calibration included.
    heartbeatRef.current = setInterval(() => {
      try { if (ctxRef.current?.state !== 'running') ctxRef.current?.resume(); } catch {}
    }, 1500);
  };

  const stopSession = () => {
    stopEverything();
    setPhase('stopped');
    setCalibrating(false);
    setError('');
  };

  const saveSession = async (isPrivate = true) => {
    if (!displayBlob) return;
    setSaving(true);
    let gateSucceeded = false;
    try {
      // Upload and capture GPS BEFORE gating so a failed upload or cancelled
      // GPS flow does NOT consume a daily evidence save.
      const ext = displayBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([displayBlob], `acoustic_anomaly_session.${ext}`, { type: displayBlob.type });
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
      const marked = events.filter((e) => e.manual).length;
      const ctxData = await buildEvidenceContext(gpsResult, { skipGps: true });
      await base44.entities.Evidence.create({
        title: `Acoustic Anomaly Sweeper — ${date}`,
        type: videoBlob.type.startsWith('audio') ? 'evp' : 'video',
        source_tool: 'audio',
        description: `Acoustic Anomaly Sweeper session — ${formatDuration(sessionDuration)} — ${eventCountRef.current} acoustic event(s) above the room baseline, ${marked} marked moment(s). Room baseline measured in-device; levels are relative, not calibrated sound pressure.${trimMode !== 'full' ? ` Saved: last ${trimSeconds} seconds.` : ''}`,
        file_url,
        date,
        time,
        is_private: isPrivate,
        ...gpsResult,
        ...ctxData,
      });
      setVideoBlob(null);
      setEvents([]);
      setPhase('idle');
    } catch (e) {
      if (gateSucceeded && refundSave) await refundSave();
      setError('Save failed. Please try again.');
    }
    setSaving(false);
  };

  const discard = () => {
    setVideoBlob(null);
    setEvents([]);
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
            <li>Tap <span className="text-primary font-medium">Start Session</span>. The tool listens through your device's microphone and spends the first 10 seconds measuring the room's own baseline — stay quiet and still while it does.</li>
            <li>Once the baseline is set, the green trace shows how far the room is from it: rising with sound, dipping below when the room goes quieter than normal. Resting on the dashed center line means the room is at its baseline.</li>
            <li>Recording begins the moment the baseline is set — the calibration itself is not recorded, so the video and its timer start with the session. Set the device down and leave it alone. A rise that holds for at least half a second is logged as an event, with its time and the band that moved (SUB · LOW · VOICE · HIGH · AIR). The event is marked on the trace and listed below, and the whole display is recorded as video.</li>
            <li>Tap <span className="text-primary font-medium">Mark Moment</span> whenever you hear something yourself — the timestamp is logged so you can match it to the recording.</li>
            <li>Tap <span className="text-primary font-medium">Stop</span>, review the recording, then <span className="text-primary font-medium">Save</span> it to your Evidence Journal.</li>
          </ol>
          <p className="text-[10px] text-orange-400 mt-2">Note: Microphone sensitivity and accuracy are dependent upon the user's device/service. Levels are relative, not calibrated sound-pressure measurements.</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1.5">Listening only — this tool does not broadcast or play anything. For the traditional radio-based spirit box method, see the Equipment Guide.</p>
        </div>

        <div>
          <label className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1 block">Detection Threshold</label>
          <div className="flex gap-1.5">
            {Object.keys(SENSITIVITY).map((key) => (
              <button key={key} onClick={() => setSensitivity(key)} className={`flex-1 py-2 rounded-lg text-[10px] font-heading uppercase tracking-wider transition-colors ${sensitivity === key ? 'bg-primary/20 border border-primary/40 text-primary' : 'bg-card/30 border border-border/40 text-muted-foreground'}`}>
                {SENSITIVITY_LABEL[key]}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-1.5">Higher sensitivity reports smaller departures from the baseline — and more of them.</p>
        </div>

        <button onClick={startSession} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors">
          <Play className="w-4 h-4" /> Start Session
        </button>
      </div>
    );
  }

  // ── RUNNING ───────────────────────────────────────────────────────────────
  if (phase === 'running') {
    return (
      <div className="space-y-3">
        {sensorError && (
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-red-300">{sensorError}</p>
          </div>
        )}
        {recordingError && (
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-300">{recordingError}</p>
          </div>
        )}
        <div className="rounded-lg overflow-hidden border border-border/30 bg-black relative">
          <canvas ref={canvasRef} width={640} height={360} className="w-full h-44 object-cover" />
          {recording && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/80">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-[9px] text-white font-mono">REC {formatDuration(sessionDuration)}</span>
            </div>
          )}
          {anomalyActive && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-none">
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="px-3 py-1 rounded bg-red-500/90 border border-red-300/50">
                <p className="text-[10px] font-mono text-white font-bold tracking-wider">⚠ ACOUSTIC ANOMALY</p>
              </motion.div>
            </div>
          )}
        </div>

        {calibrating ? (
          <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-center font-display text-xl text-amber-400/90 drop-shadow-[0_0_14px_hsl(45,96%,55%,0.6)] animate-glow-pulse">
            Measuring Room Baseline…
          </motion.p>
        ) : (
          <div className="text-center space-y-1">
            <p className={`font-mono text-2xl ${anomalyActive ? 'text-red-400' : 'text-primary'}`}>
              {level >= 0 ? '+' : ''}{level.toFixed(1)} dB
            </p>
            <p className="text-[10px] text-muted-foreground/70">relative to the room baseline</p>
          </div>
        )}

        <button onClick={markMoment} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-heading text-xs uppercase tracking-wider hover:bg-amber-500/20 transition-colors">
          <Bookmark className="w-3.5 h-3.5" /> Mark Moment
        </button>

        {events.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Activity className="w-3 h-3" /> Event Log ({events.length})</p>
            {events.map((ev, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-card/30 border border-border/20">
                <span className="text-[10px] text-muted-foreground font-mono">{ev.time}</span>
                <span className={`text-[10px] font-medium ${ev.manual ? 'text-amber-300' : 'text-primary'}`}>
                  {ev.manual ? 'Marked moment' : `${ev.band} +${ev.deviation.toFixed(1)} dB`}
                </span>
              </div>
            ))}
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
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Events: {events.filter((e) => !e.manual).length}</span>
          </div>
        </div>

        {events.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Logged Events</p>
            {events.map((ev, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded bg-card/30 border border-border/20">
                <span className="text-[10px] text-muted-foreground font-mono">{ev.time}</span>
                <span className={`text-[10px] font-medium ${ev.manual ? 'text-amber-300' : 'text-primary'}`}>
                  {ev.manual ? 'Marked moment' : `${ev.band} +${ev.deviation.toFixed(1)} dB above baseline`}
                </span>
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
              <RecordingPreview blob={displayBlob} />
            </div>
            <RecordTrimPicker value={trimMode} onChange={setTrimMode} />
            <RecordingPreparation {...preparedRecording} />
            <EvidenceSaveButtons onSave={saveSession} saving={saving} deviceBlob={displayBlob} originalBlob={preparedRecording.originalBlob} devicePrefix="acoustic_anomaly" preparing={preparedRecording.preparing} preparationError={preparedRecording.error} />
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-card/30 border border-border/30 text-center">
            <p className="text-xs text-muted-foreground">No recording was captured for this session.</p>
          </div>
        )}

        <button onClick={discard} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-red-500/30 hover:text-red-400 transition-colors">
          <X className="w-3.5 h-3.5" /> Discard & Reset
        </button>
        {gpsDialog}
        {trackingOffDialog}
      </div>
    );
  }

  return gpsDialog;
}