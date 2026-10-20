import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { buildEvidenceContext } from '@/lib/evidenceContext';
import { useToolGpsSave } from '@/hooks/useToolGpsSave';
import useGhostVoice from '@/hooks/useGhostVoice';
import useWakeLock from '@/hooks/useWakeLock';
import SiegSessionPicker from '@/components/sieg/SiegSessionPicker';
import SiegReview from '@/components/sieg/SiegReview';
import SiegEventLog from '@/components/sieg/SiegEventLog';
import SiegViewport from '@/components/sieg/SiegViewport';
import useSiegCameraPlayback from '@/components/sieg/useSiegCameraPlayback';
import SiegCameraControls from '@/components/sieg/SiegCameraControls';
import { SIEG_LANES, SIEG_W, SIEG_H, drawSiegFrame, moonPhase, formatClock, formatWallClock } from '@/lib/siegDisplay';
import { SIEG_CALIBRATION_MS } from '@/lib/siegSessions';
import { measureLevels, createBaselineTracker, eventThresholdDb, dominantBand } from '@/lib/acousticAnalysis';
import useSensitivity, { isTorchActive } from '@/hooks/useSensitivity';
import useDepthDetection from '@/hooks/useDepthDetection';
import { enableTorch, disableTorch } from '@/lib/torchControl';
import { depthSupport, startDepthStream, stopDepthStream, onDepthFrame, onDepthError } from '@/lib/nativeDepth';
import { detectFigures } from '@/lib/anomalyDetect';
import { sensorSupport, startSensors, stopSensors, onSensorReading, onSensorError } from '@/lib/nativeSensors';
import {
  createEnvironmentTracker, magneticThreshold, pressureThreshold, SENSITIVITY, MOVEMENT_LIMIT,
} from '@/lib/environmentAnalysis';
import { audioAcquire, audioRelease } from '@/lib/hauntedAudio';
import { synthesizeCue, CUE_CHIME } from '@/lib/toolCues';
import { fetchWeatherByCoords } from '@/lib/openMeteo';
import { getDevicePosition } from '@/lib/deviceCapabilities';
import { toast } from '@/components/ui/use-toast';
import RecordTrimPicker from '@/components/RecordTrimPicker';
import { TRIM_OPTIONS, buildTrimmedBlob } from '@/lib/recordTrim';
import { startChunkPump, stopChunkPump } from '@/lib/recorderChunkPump';
import { createDepthDiagTracker, updateDepthDiag, finalizeDepthDiag, setDepthDiagError } from '@/lib/depthDiagnostic';

// SIEG — one integrated session, seven tools at once.
//
// Seven of the rack's tools run inside it at once, hosted here instead of each
// owning the phone: the acoustic sweeper's baseline listening, the anomaly
// camera's figure scan, the vibration communicator's disturbance detection, and
// the environmental monitor's magnetic and barometric channels draw the four live
// lanes, while the weather monitor and moon phase supply the conditions on screen
// and the audio recorder captures the session. What is new is only the hosting —
// one camera, one microphone, one clock, one shared baseline, one recorder, one
// evidence save.
//
// Two rules make simultaneous measurement honest:
//   1. Nothing this app can make is allowed to sound during a session. The
//      ambience is held quiet, no cues are played, narration is stopped before the
//      microphone opens — because the mic is right beside the speaker and would
//      otherwise record the app itself as room evidence.
//   2. Every lane is judged against the room's own baseline, and every lane's
//      events are stamped with real wall-clock time, so a magnetic spike can be
//      lined up against a sound at the same second.
const FFT_SIZE = 2048;
const SAMPLE_MS = 100;                  // 10 samples a second, drawn at the same rate
const CHART_SAMPLES = 240;              // ~24 second window on the strip chart
const ANOMALY_HOLD_MS = 400;            // a sound must last this long to count
const RELEASE_MS = 600;                 // quiet needed before the detector re-arms
const RELEASE_HYSTERESIS_DB = 2;
const REARM_COOLDOWN_MS = 2000;
const FIGURE_HOLD_MS = 1000;            // a form must stay in view this long
const FIGURE_RELEASE_MS = 2500;
const VIBRATION_ENTER = 20;             // the REM tool's "out of the green" level
const VIBRATION_EXIT = 12;
const VIBRATION_REARM_COOLDOWN_MS = 2000;
const ENV_HOLD_MS = 500;
const ENV_RELEASE_MS = 700;
const ENV_REARM_COOLDOWN_MS = 2000;
const CORRELATION_MS = 2000;            // two lanes moving within 2s is a correlation
const MAX_EVENTS = 200;
const SCALES = { acoustic: 12, vibration: 100, magnetic: 8, pressure: 0.6 };
const LANE_UNAVAILABLE = 'Not on this device';

const newEnvChannel = () => ({ armed: true, since: 0, quietSince: 0, lastEvent: 0, hold: false, peak: 0 });

export default function SiegConsole({ gateSave, refundSave }) {
  const { captureGpsForSave, gpsDialog, trackingOffDialog } = useToolGpsSave();
  const { stop: stopSpeech } = useGhostVoice();

  const [phase, setPhase] = useState('idle'); // idle | calibrating | live | review
  const [session, setSession] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [clockText, setClockText] = useState('');
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState({});
  const [correlatedCount, setCorrelatedCount] = useState(0);
  const [readouts, setReadouts] = useState({});
  const [availability, setAvailability] = useState({ mic: false, camera: false, vibration: false, magnetometer: false, barometer: false });
  const [motionSeen, setMotionSeen] = useState(false);
  const [weather, setWeather] = useState(null);
  const [fetchingConditions, setFetchingConditions] = useState(false);
  const [conditionsNote, setConditionsNote] = useState('');
  const [error, setError] = useState('');
  const [blob, setBlob] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trimMode, setTrimMode] = useState('full');
  // Which camera the figure scan runs on: the camera-image reader everywhere, the
  // depth sensor where the device carries one. Chosen before a session starts.
  const [cameraMode, setCameraMode] = useState('contrast');
  const [depthAvailable, setDepthAvailable] = useState(false);


  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const depthFrameRef = useRef(null);
  const depthDiagRef = useRef(null);
  const depthUnsubRef = useRef(null);
  const depthErrorUnsubRef = useRef(null);
  const analysisCanvasRef = useRef(null);
  const micStreamRef = useRef(null);
  const camStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const freqRef = useRef(null);
  const trackerRef = useRef(null);
  const envTrackerRef = useRef(null);
  const envChannelsRef = useRef({ magnetic: newEnvChannel(), pressure: newEnvChannel() });
  const samplesRef = useRef([]);
  const markersRef = useRef([]);
  const correlationsRef = useRef([]);
  const eventsRef = useRef([]);
  const countsRef = useRef({});
  const correlatedRef = useRef(0);
  const readoutsRef = useRef({});
  const latestSensorRef = useRef({ magnetic: null, pressure: null, movement: 0 });
  const motionRef = useRef({ ax: 0, ay: 0, az: 9.8, gx: 0, gy: 0, gz: 0 });
  const vibSamplesRef = useRef([]);
  const vibBaselineRef = useRef(null);
  const motionSeenRef = useRef(false);
  const motionAnnouncedRef = useRef(false);
  // Vibration lane tracker — fire-on-settle, the same model the standalone
  // Vibration Communicator uses: the excursion opens the moment the level
  // leaves the green, its peak is tracked while it lasts, and the event (with
  // that peak) is logged the moment the level settles back below the exit line.
  // A transient spike — a knock or tap — registers, because nothing is required
  // to hold.
  const excursionRef = useRef({ armed: true, since: 0, quietSince: 0, lastEvent: 0, peak: 0 });
  const figureRef = useRef({ armed: true, since: 0, quietSince: 0, lastEvent: 0, peak: 0 });
  const figureBoxesRef = useRef(null);
  const acousticRef = useRef({ armed: true, since: 0, quietSince: 0, lastEvent: 0, hold: false });
  const tickRef = useRef(0);
  const phaseRef = useRef('idle');
  const sessionRef = useRef(null);
  const startedAtRef = useRef(0);
  const endsAtRef = useRef(0);
  const durationRef = useRef(0);
  const calibrationEndRef = useRef(0);
  const frameRef = useRef(null);
  const lastSampleRef = useRef(0);
  const figureTimerRef = useRef(null);
  const clockTimerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const envUnsubRef = useRef(null);
  const envErrorUnsubRef = useRef(null);
  const recorderRef = useRef(null);
  const ownTrackRef = useRef(null);
  const frameTrackRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeRef = useRef('');
  const chunkPumpRef = useRef(null);
  const userStoppedRef = useRef(true);
  const ambienceHeldRef = useRef(false);
  const autoSaveRef = useRef(false);

  // The depth method is only offered on a device that reports a depth sensor, so
  // the setup screen never presents a camera this phone cannot run.
  useEffect(() => {
    let cancelled = false;
    depthSupport().then((result) => {
      if (cancelled) return;
      setDepthAvailable(result.supported);
      if (!result.supported) setCameraMode('contrast');
    });
    return () => { cancelled = true; };
  }, []);

  const trimSeconds = TRIM_OPTIONS.find((o) => o.id === trimMode)?.seconds;
  const getTrimmedBlob = (ts) => {
    const chunks = chunksRef.current;
    if (!chunks || chunks.length === 0) return null;
    return buildTrimmedBlob(chunks, ts, mimeRef.current || 'video/webm');
  };
  const displayBlob = blob && trimMode !== 'full' ? (getTrimmedBlob(trimSeconds) || blob) : blob;

  const moonNow = moonPhase();
  const conditionsLine = `${moonNow.name} · ${moonNow.illumination}%${weather ? ` · ${weather}` : ''}`;

  // The session's date and start time are written onto the saved evidence record
  // itself, so no date is drawn on screen — but the real time stays in the display
  // header, because that IS recorded and is what an event gets noted against.

  // The figure scan's tuning, shared with the standalone Anomaly Camera: the
  // brightness scale for the camera method, the detector's own distance gates for
  // the depth method.
  const { sensitivity, setSensitivity, sensitivityRef } = useSensitivity();
  const depthDetection = useDepthDetection();

  const measuring = phase === 'calibrating' || phase === 'live';
  // A second, unmuted keep-awake video can interrupt the camera on mobile.
  useWakeLock(measuring, { mediaFallback: false });
  useSiegCameraPlayback(videoRef, measuring, setError, setAvailability);

  // ── Silence ────────────────────────────────────────────────────────────────
  // The app's own music leaves through the phone's speaker, right beside the
  // microphone, and the baseline is measuring exactly how quiet the room is.
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

  // ── Event log ──────────────────────────────────────────────────────────────
  // One entry per detector event, always stamped with the real clock. Two lanes
  // reporting within the correlation window mark each other, and the pair is drawn
  // on the chart as a white band: a marker worth investigating, not proof.
  const logEvent = useCallback((lane, label, tMs = Date.now()) => {
    let correlated = false;
    eventsRef.current.forEach((e) => {
      if (e.lane === lane || e.correlated) return;
      if (Math.abs(e.tMs - tMs) > CORRELATION_MS) return;
      e.correlated = true;
      correlatedRef.current += 1;
      correlated = true;
    });
    if (correlated) {
      correlationsRef.current.push(tMs);
      if (correlationsRef.current.length > 40) correlationsRef.current.shift();
      setCorrelatedCount(correlatedRef.current);
    }
    const entry = {
      id: `${tMs}-${lane}-${Math.random().toString(36).slice(2, 6)}`,
      tMs,
      time: new Date(tMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      lane,
      label,
      correlated,
    };
    eventsRef.current = [entry, ...eventsRef.current].slice(0, MAX_EVENTS);
    markersRef.current.push({ t: tMs, lane });
    if (markersRef.current.length > 120) markersRef.current.shift();
    countsRef.current[lane] = (countsRef.current[lane] || 0) + 1;
    setEvents(eventsRef.current);
    setCounts({ ...countsRef.current });
  }, []);

  // ── Vibration lane ─────────────────────────────────────────────────────────
  const handleMotion = useCallback((e) => {
    motionSeenRef.current = true;
    const a = e.accelerationIncludingGravity || e.acceleration || {};
    const m = motionRef.current;
    m.ax = a.x || 0;
    m.ay = a.y || 0;
    m.az = a.z || 0;
    const r = e.rotationRate || {};
    m.gx = ((r.alpha || 0) * Math.PI) / 180;
    m.gy = ((r.beta || 0) * Math.PI) / 180;
    m.gz = ((r.gamma || 0) * Math.PI) / 180;
  }, []);

  const updateVibrationBaseline = () => {
    const arr = vibSamplesRef.current;
    if (arr.length < 20) return;
    const sum = arr.reduce((acc, s) => ({
      ax: acc.ax + s.ax, ay: acc.ay + s.ay, az: acc.az + s.az,
      gx: acc.gx + s.gx, gy: acc.gy + s.gy, gz: acc.gz + s.gz,
    }), { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 });
    vibBaselineRef.current = {
      ax: sum.ax / arr.length, ay: sum.ay / arr.length, az: sum.az / arr.length,
      gx: sum.gx / arr.length, gy: sum.gy / arr.length, gz: sum.gz / arr.length,
    };
  };

  // How far the phone is from its own resting state, as the vibration
  // communicator scores it: acceleration carries most of the weight, rotation
  // adds the turn a knock or a twist produces.
  const vibrationLevel = () => {
    const m = motionRef.current;
    if (phaseRef.current === 'calibrating') {
      vibSamplesRef.current.push({ ...m });
      updateVibrationBaseline();
      return 0;
    }
    const b = vibBaselineRef.current;
    if (!b) return 0;
    const dA = Math.sqrt((m.ax - b.ax) ** 2 + (m.ay - b.ay) ** 2 + (m.az - b.az) ** 2);
    const dG = Math.sqrt((m.gx - b.gx) ** 2 + (m.gy - b.gy) ** 2 + (m.gz - b.gz) ** 2);
    const accelScore = Math.min(dA / (0.12 * 5), 1);
    const gyroScore = Math.min(dG / (0.025 * 5), 1);
    return Math.round(Math.min((accelScore * 0.7 + gyroScore * 0.3) * 100, 100));
  };

  // ── Environmental lane ─────────────────────────────────────────────────────
  // A channel's departure has to hold, then the room has to settle before it can
  // report again — the same hold/release shape the environmental monitor uses, so
  // the two tools agree about what one event is.
  const stepEnvChannel = (st, magnitude, threshold, now, fire) => {
    if (magnitude > threshold) {
      if (!st.since) st.since = now;
      st.quietSince = 0;
      st.hold = true;
      st.peak = Math.max(st.peak, magnitude);
      if (st.armed && now - st.since >= ENV_HOLD_MS && now - st.lastEvent >= ENV_REARM_COOLDOWN_MS) {
        st.armed = false;
        st.lastEvent = now;
        fire(st.peak);
      }
    } else {
      st.since = 0;
      st.hold = false;
      if (magnitude < threshold * 0.6) {
        if (!st.quietSince) st.quietSince = now;
        if (now - st.quietSince >= ENV_RELEASE_MS) { st.armed = true; st.quietSince = 0; st.peak = 0; }
      } else {
        st.quietSince = 0;
      }
    }
  };

  const evaluateEnvironment = (now) => {
    const tr = envTrackerRef.current;
    const out = { magnetic: null, pressure: null };
    if (!tr) return out;
    const s = latestSensorRef.current;
    if (phaseRef.current === 'calibrating') {
      tr.calibrate({ magnetic: s.magnetic, pressure: s.pressure });
      return out;
    }
    // Pressure changes with height, so a phone that is being carried reports
    // movement, not the room: the pressure channel is held while it moves.
    const moving = (s.movement || 0) > MOVEMENT_LIMIT;
    const chans = envChannelsRef.current;
    const dev = tr.deviation(
      { magnetic: s.magnetic, pressure: s.pressure },
      { magnetic: chans.magnetic.hold, pressure: chans.pressure.hold || moving },
    );
    out.magnetic = dev.magnetic;
    out.pressure = moving ? null : dev.pressure;
    if (Number.isFinite(dev.magnetic)) {
      stepEnvChannel(chans.magnetic, Math.abs(dev.magnetic), magneticThreshold(dev.magSd, SENSITIVITY.normal), now, (peak) => {
        logEvent('environment', `Magnetic departure — ${peak.toFixed(1)} µT from baseline`);
      });
    }
    if (Number.isFinite(dev.pressure) && !moving) {
      stepEnvChannel(chans.pressure, Math.abs(dev.pressure), pressureThreshold(dev.presSd, SENSITIVITY.normal), now, (peak) => {
        logEvent('environment', `Barometric departure — ${peak.toFixed(2)} hPa from baseline`);
      });
    }
    return out;
  };

  // ── Acoustic lane ──────────────────────────────────────────────────────────
  const evaluateAcoustic = (now) => {
    const analyser = analyserRef.current;
    const tracker = trackerRef.current;
    if (!analyser || !tracker || !freqRef.current) return null;
    analyser.getByteFrequencyData(freqRef.current);
    const levels = measureLevels(freqRef.current, analyser.context.sampleRate, FFT_SIZE);
    if (phaseRef.current === 'calibrating' || !tracker.calibrated) {
      tracker.calibrate(levels);
      return null;
    }
    const st = acousticRef.current;
    const dev = tracker.deviation(levels, { hold: st.hold });
    const threshold = eventThresholdDb(tracker.sd, 1);
    if (dev.broadband > threshold) {
      if (!st.since) st.since = now;
      st.quietSince = 0;
      st.hold = true;
      if (st.armed && now - st.since >= ANOMALY_HOLD_MS && now - st.lastEvent >= REARM_COOLDOWN_MS) {
        const band = dominantBand(dev.bands);
        logEvent('acoustic', `${band ? band.label : 'Broadband'} rise — ${dev.broadband.toFixed(1)} dB above baseline`, now);
        st.armed = false;
        st.lastEvent = now;
      }
    } else {
      st.since = 0;
      st.hold = false;
      if (dev.broadband < threshold - RELEASE_HYSTERESIS_DB) {
        if (!st.quietSince) st.quietSince = now;
        if (now - st.quietSince >= RELEASE_MS) { st.armed = true; st.quietSince = 0; }
      } else {
        st.quietSince = 0;
      }
    }
    return dev.broadband;
  };

  // ── Figure lane ────────────────────────────────────────────────────────────
  // A form has to hold in view before it counts, then the view has to stay clear
  // before the lane can report again. Both camera methods feed this same logic, so
  // a session judges the room the same way whichever one it ran on.
  const stepFigureLane = (count) => {
    if (phaseRef.current !== 'live') return;
    const st = figureRef.current;
    const now = Date.now();
    if (count > 0) {
      st.quietSince = 0;
      if (!st.since) st.since = now;
      st.peak = Math.max(st.peak, count);
      if (st.armed && now - st.since >= FIGURE_HOLD_MS && now - st.lastEvent >= FIGURE_RELEASE_MS) {
        st.armed = false;
        st.lastEvent = now;
        logEvent('figure', `${st.peak} figure${st.peak === 1 ? '' : 's'} in view`, now);
      }
    } else {
      st.since = 0;
      if (!st.quietSince) st.quietSince = now;
      if (now - st.quietSince >= FIGURE_RELEASE_MS) { st.armed = true; st.quietSince = 0; st.peak = 0; }
    }
  };

  // The camera method runs off the live camera frame on a slower cadence than the
  // other lanes: the scan is a per-pixel pass over the frame, and the room does not
  // change shape four times a second.
  const figureTick = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    let canvas = analysisCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      analysisCanvasRef.current = canvas;
    }
    // Match the standalone detector's actual camera dimensions rather than
    // stretching every source frame to 320×240 and changing its pixel gates.
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let figures = [];
    try {
      ctx.drawImage(video, 0, 0, w, h);
      figures = detectFigures(ctx.getImageData(0, 0, w, h), w, h, sensitivityRef.current);
    } catch {
      figures = [];
    }
    figureBoxesRef.current = {
      boxes: figures.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h, pixels: f.pixels })),
      width: w,
      height: h,
    };
    stepFigureLane(figures.length);
  };

  // ── One sampling tick drives every lane, then redraws the composite ────────
  const sampleTick = () => {
    const now = Date.now();
    const acousticDev = evaluateAcoustic(now);
    const envDev = evaluateEnvironment(now);
    const level = vibrationLevel();

    if (phaseRef.current === 'live') {
      // Fire-on-settle, the same model the standalone Vibration Communicator
      // uses: the excursion opens the moment the level leaves the green and
      // its peak is tracked while it lasts. The event — labelled by that peak
      // — is logged the moment the level settles back below the exit line, so
      // a transient spike (a knock or tap) registers without having to
      // sustain. A rearm cooldown keeps one disturbance as one event.
      const vt = excursionRef.current;
      if (level >= VIBRATION_ENTER) {
        if (!vt.since && now - vt.lastEvent >= VIBRATION_REARM_COOLDOWN_MS) {
          vt.since = now;
          vt.peak = level;
        } else if (vt.since) {
          vt.peak = Math.max(vt.peak, level);
        }
      } else if (level <= VIBRATION_EXIT && vt.since) {
        const word = vt.peak >= 80 ? 'Strong' : vt.peak >= 50 ? 'Moderate' : 'Minor';
        logEvent('vibration', `${word} disturbance — peak ${vt.peak}`, now);
        vt.lastEvent = now;
        vt.since = 0;
        vt.peak = 0;
      }
    }

    const figureActive = figureRef.current.since > 0;
    samplesRef.current.push({
      t: now,
      acoustic: Number.isFinite(acousticDev) ? acousticDev : null,
      figure: figureActive ? 1 : 0,
      vibration: level,
      magnetic: Number.isFinite(envDev.magnetic) ? envDev.magnetic : null,
      pressure: Number.isFinite(envDev.pressure) ? envDev.pressure : null,
    });
    if (samplesRef.current.length > CHART_SAMPLES) samplesRef.current.shift();

    const mag = envDev.magnetic;
    const pres = envDev.pressure;
    readoutsRef.current = {
      acoustic: Number.isFinite(acousticDev) ? `${acousticDev >= 0 ? '+' : ''}${acousticDev.toFixed(1)} dB` : 'quiet',
      figure: cameraMode === 'device' ? 'standard' : (figureActive ? 'IN VIEW' : 'clear'),
      vibration: `${level}`,
      environment: Number.isFinite(mag)
        ? `${mag >= 0 ? '+' : ''}${mag.toFixed(1)} µT`
        : Number.isFinite(pres) ? `${pres >= 0 ? '+' : ''}${pres.toFixed(2)} hPa` : '—',
    };

    // The chip row is a readout, not a meter: it updates a few times a second so
    // React is not re-rendering ten times a second for a number nobody can read
    // that fast. The drawn canvas keeps its full rate.
    tickRef.current += 1;
    if (tickRef.current % 3 === 0) {
      setReadouts({ ...readoutsRef.current });
      if (motionSeenRef.current && !motionAnnouncedRef.current) {
        motionAnnouncedRef.current = true;
        setMotionSeen(true);
      }
    }
  };

  const drawComposite = (now) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== SIEG_W || canvas.height !== SIEG_H) {
      canvas.width = SIEG_W;
      canvas.height = SIEG_H;
    }
    const ctx = canvas.getContext('2d');
    const snapshot = {
      now,
      video: videoRef.current,
      sessionName: sessionRef.current?.name || '',
      conditions: conditionsLine,
      calibrating: phaseRef.current === 'calibrating',
      calibratingMsLeft: Math.max(0, calibrationEndRef.current - now),
      remaining: phaseRef.current === 'live' ? Math.max(0, (endsAtRef.current - now) / 1000) : (sessionRef.current?.minutes || 0) * 60,
      samples: samplesRef.current,
      markers: markersRef.current,
      correlations: correlationsRef.current,
      figureBoxes: figureBoxesRef.current,
      depthFrame: depthFrameRef.current,
      readouts: readoutsRef.current,
      eventCount: eventsRef.current.length,
      correlatedCount: correlatedRef.current,
      statusText: phaseRef.current === 'calibrating' ? 'BASELINE' : phaseRef.current === 'live' ? 'MEASURING' : '',
      recording: phaseRef.current === 'live',
      scales: SCALES,
    };
    drawSiegFrame(ctx, canvas, snapshot);
    // Push the complete camera-and-chart composite to the existing recorder.
    try { frameTrackRef.current?.requestFrame?.(); } catch { /* not offered here */ }
  };

  // ── Recording ──────────────────────────────────────────────────────────────
  // The composite canvas (or, on a web view that cannot record a canvas, the raw
  // camera feed) plus the session's one microphone track. The microphone is opened
  // once and reused across restarts, and only the canvas track is ever stopped —
  // stopping the shared mic track would take the acoustic lane down with it.
  const startRecorder = async () => {
    const canvas = canvasRef.current;
    const useCanvas = !!canvas && typeof canvas.captureStream === 'function';
    // 30 fps, the rate every other recorder in this app asks for. A canvas stream
    // asked for a lower rate can end up waiting on the phone's compositor and hand
    // the recorder nothing beyond its first frame, which saves as one still shot.
    const stream = useCanvas ? canvas.captureStream(30) : new MediaStream();
    if (!useCanvas) camStreamRef.current?.getVideoTracks().forEach((t) => stream.addTrack(t));
    const micTrack = micStreamRef.current?.getAudioTracks?.()[0];
    if (micTrack) stream.addTrack(micTrack);
    // The track every paint is pushed into (see drawComposite), and the only track
    // this recorder owns — the camera and the microphone outlive it.
    const picture = stream.getVideoTracks()[0] || null;
    frameTrackRef.current = picture;
    ownTrackRef.current = useCanvas ? picture : null;

    // With no camera and no canvas to record there is no picture at all, so the
    // session is recorded as audio: a video file with no moving frames plays back as
    // one frozen frame, which is worth less than an honest audio recording.
    const candidates = picture
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    const mime = candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    mimeRef.current = mime;
    console.log(`[SIEG] recording ${useCanvas ? 'composite canvas' : picture ? 'camera' : 'audio only'} · ${mime || 'browser default'}`);
    let mr;
    try {
      mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    } catch {
      return false;
    }
    recorderRef.current = mr;
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push({ blob: e.data, t: Date.now() }); };
    mr.onstop = () => {
      stopChunkPump(chunkPumpRef.current); chunkPumpRef.current = null;
      if (userStoppedRef.current) {
        const actual = (mr.mimeType || mime || 'video/webm').split(';')[0];
        releaseOwnTrack();
        const finished = new Blob(chunksRef.current.map((c) => c.blob), { type: actual });
        console.log(`[SIEG] recording stopped after ${Math.round((Date.now() - startedAtRef.current) / 1000)}s · ${chunksRef.current.length} chunks · ${Math.round(finished.size / 1024)} kB`);
        setBlob(finished);
        return;
      }
      // The recorder stopped on its own while the session is still running (the
      // phone's web view is fragile about long recordings). Restart on a fresh
      // canvas stream and keep the chunks already collected, so the rest of the
      // session is still captured instead of lost.
      console.warn(`[SIEG] recorder stopped on its own at ${Math.round((Date.now() - startedAtRef.current) / 1000)}s · ${chunksRef.current.length} chunks — restarting`);
      releaseOwnTrack();
      if (phaseRef.current === 'live') startRecorder().catch(() => {});
    };
    try {
      mr.start(1000);
    } catch {
      return false;
    }
    chunkPumpRef.current = startChunkPump(mr);
    return true;
  };

  const releaseOwnTrack = () => {
    const t = ownTrackRef.current;
    ownTrackRef.current = null;
    if (t && t.readyState === 'live') {
      try { t.stop(); } catch { /* already ended */ }
    }
  };

  const teardownDevices = () => {
    stopChunkPump(chunkPumpRef.current); chunkPumpRef.current = null;
    frameTrackRef.current = null;
    if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    [figureTimerRef, clockTimerRef, heartbeatRef].forEach((r) => {
      if (r.current) { clearInterval(r.current); r.current = null; }
    });
    if (envUnsubRef.current) { envUnsubRef.current(); envUnsubRef.current = null; }
    if (envErrorUnsubRef.current) { envErrorUnsubRef.current(); envErrorUnsubRef.current = null; }
    if (depthUnsubRef.current) { depthUnsubRef.current(); depthUnsubRef.current = null; }
    if (depthErrorUnsubRef.current) { depthErrorUnsubRef.current(); depthErrorUnsubRef.current = null; }
    depthFrameRef.current = null;
    stopDepthStream();
    stopSensors();
    window.removeEventListener('devicemotion', handleMotion);
    if (camStreamRef.current) {
      // Turn the torch off before the track goes; the session's own light must not
      // outlive the session.
      disableTorch(camStreamRef.current);
      camStreamRef.current.getTracks().forEach((t) => t.stop());
      camStreamRef.current = null;
    }
    if (videoRef.current) { try { videoRef.current.srcObject = null; } catch { /* already detached */ } }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { /* already closed */ } }
    audioCtxRef.current = null;
    analyserRef.current = null;
    freqRef.current = null;
  };

  const finishSession = (reason) => {
    if (phaseRef.current === 'idle' || phaseRef.current === 'review') return;
    // A session stopped before its baseline finished never measured anything, so it
    // goes back to the picker rather than opening a review screen with no recording.
    if (phaseRef.current === 'calibrating' && reason === 'manual') {
      phaseRef.current = 'idle';
      if (depthDiagRef.current) {
        const record = finalizeDepthDiag(depthDiagRef.current);
        depthDiagRef.current = null;
        if (record) base44.entities.DepthCameraDiagnostic.create(record).catch(() => {});
      }
      teardownDevices();
      sessionRef.current = null;
      setSession(null);
      setPhase('idle');
      toast({ title: 'Session cancelled', description: 'Nothing was measured — the baseline was still being taken.' });
      return;
    }
    phaseRef.current = 'review';
    userStoppedRef.current = true;
    // The vibration lane fires on settle, so a disturbance still in progress
    // when the session ends would be lost — flush it here with the peak it
    // reached, the same way the standalone Vibration Communicator does.
    const vt = excursionRef.current;
    if (vt.since) {
      const word = vt.peak >= 80 ? 'Strong' : vt.peak >= 50 ? 'Moderate' : 'Minor';
      logEvent('vibration', `${word} disturbance — peak ${vt.peak}`);
      vt.since = 0;
      vt.peak = 0;
    }
    if (depthDiagRef.current) {
      const record = finalizeDepthDiag(depthDiagRef.current);
      depthDiagRef.current = null;
      if (record) base44.entities.DepthCameraDiagnostic.create(record).catch(() => {});
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { releaseOwnTrack(); }
    }
    teardownDevices();
    setPhase('review');
    setRemaining(0);

    if (reason === 'timer') {
      autoSaveRef.current = true;
      // A session that ends on its own has to call the investigator back. The cue
      // plays after the microphone is closed, so it can never be recorded.
      setTimeout(() => {
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          const ctx = new Ctx();
          synthesizeCue(ctx, ctx.destination, CUE_CHIME);
          setTimeout(() => { try { ctx.close(); } catch { /* already closed */ } }, 2500);
        } catch { /* no audio available */ }
        try { if (navigator.vibrate) navigator.vibrate([250, 120, 250]); } catch { /* unsupported */ }
      }, 600);
    }
  };

  // ── Session lifecycle ──────────────────────────────────────────────────────
  const requestMotionPermission = async () => {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const res = await DeviceMotionEvent.requestPermission();
        return res === 'granted';
      }
      return typeof window !== 'undefined' && 'DeviceMotionEvent' in window;
    } catch {
      return false;
    }
  };

  // Depth method: the native module owns the camera and hands over the colourised
  // depth image with the forms it found, so no web camera stream is opened here. The
  // composite draws those frames as they arrive, and the figure lane reads the
  // sensor's own forms rather than scanning the image.
  const startDepthCamera = async () => {
    depthFrameRef.current = null;
    depthDiagRef.current = createDepthDiagTracker('sieg', `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, {
      protrusion: depthDetection.protrusion,
      minHeight: depthDetection.minSize,
    });
    // A native depth failure mid-session is reported as a lane failure: the error
    // banner says what happened, the depth feeds are released, and every other
    // lane — and the session recording — keeps running.
    depthErrorUnsubRef.current = onDepthError((failure) => {
      setAvailability((a) => (a.camera ? { ...a, camera: false } : a));
      setError(failure?.category === 'permission'
        ? 'The depth scan stopped — camera access is denied for this app. The other lanes are still running.'
        : failure?.category === 'unsupported'
          ? 'The depth scan stopped — this device cannot run a depth scan. The other lanes are still running.'
          : `The depth scan stopped: ${failure?.message || 'the native depth session ended.'} The other lanes are still running.`);
      setDepthDiagError(depthDiagRef.current, failure?.message || failure?.category || 'native depth error');
      if (depthUnsubRef.current) { depthUnsubRef.current(); depthUnsubRef.current = null; }
      stopDepthStream();
    });
    try {
      await startDepthStream(8);
    } catch (e) {
      if (depthErrorUnsubRef.current) { depthErrorUnsubRef.current(); depthErrorUnsubRef.current = null; }
      throw e;
    }
    depthUnsubRef.current = onDepthFrame((data) => {
      const figures = data.figures || [];
      console.log('[SIEG] DEPTH DIAG', {
        poseCount: data.poseCount ?? 0,
        formCount: data.formCount ?? 0,
        figureCount: data.figureCount ?? 0,
        bodyHeight: data.bodyHeight ?? 0,
        protrusion: data.protrusion,
        minHeight: data.minHeight,
      });
      updateDepthDiag(depthDiagRef.current, {
        poseCount: data.poseCount ?? 0,
        formCount: data.formCount ?? 0,
        figureCount: data.figureCount ?? 0,
        bodyHeight: data.bodyHeight ?? 0,
      });
      const image = new Image();
      image.onload = () => {
        depthFrameRef.current = { imageEl: image, figures };
        setAvailability((a) => (a.camera ? a : { ...a, camera: true }));
      };
      image.src = data.image;
      // The sensor reports its boxes as fractions of the frame, which is how the
      // composite's overlay reads them.
      figureBoxesRef.current = {
        boxes: figures.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h, joints: f.joints })),
        width: 1,
        height: 1,
      };
      stepFigureLane(figures.length);
    });
    setTimeout(() => {
      if (!depthFrameRef.current && depthUnsubRef.current) {
        setError('No depth readings are arriving — the depth scan could not start. The other lanes are still running.');
      }
    }, 6000);
  };

  const startSession = async (preset) => {
    if (phaseRef.current !== 'idle') return;
    setError('');
    setEvents([]); eventsRef.current = [];
    setCounts({}); countsRef.current = {};
    setCorrelatedCount(0); correlatedRef.current = 0;
    setBlob(null);
    setSaved(false);
    durationRef.current = 0;
    chunksRef.current = [];
    samplesRef.current = [];
    markersRef.current = [];
    correlationsRef.current = [];
    figureBoxesRef.current = null;
    eventsRef.current = [];
    excursionRef.current = { armed: true, since: 0, quietSince: 0, lastEvent: 0, peak: 0 };
    acousticRef.current = { armed: true, since: 0, quietSince: 0, lastEvent: 0, hold: false };
    figureRef.current = { armed: true, since: 0, quietSince: 0, lastEvent: 0, peak: 0 };
    envChannelsRef.current = { magnetic: newEnvChannel(), pressure: newEnvChannel() };
    vibSamplesRef.current = [];
    vibBaselineRef.current = null;
    motionSeenRef.current = false;
    motionAnnouncedRef.current = false;
    setMotionSeen(false);
    setReadouts({});
    readoutsRef.current = {};
    latestSensorRef.current = { magnetic: null, pressure: null, movement: 0 };
    if (depthUnsubRef.current) { depthUnsubRef.current(); depthUnsubRef.current = null; }
    depthFrameRef.current = null;
    depthDiagRef.current = null;
    sessionRef.current = preset;
    setSession(preset);

    // Nothing this app can make is allowed to sound once the microphone is open.
    // The ambience is already held for as long as SIEG is on screen; narration left
    // playing from another tool is stopped here.
    try { stopSpeech(); } catch { /* nothing to stop */ }

    // iOS only offers motion sensors behind a user gesture, and the tap on the
    // session button is the one we get.
    const motionOk = await requestMotionPermission();

    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
      micStreamRef.current = mic;
    } catch (e) {
      const name = e?.name || '';
      setError(name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? 'Microphone access denied. SIEG needs the microphone for both the acoustic lane and the session recording.'
        : 'The microphone could not be opened. Close other audio apps and try again.');
      return;
    }
    setAvailability((a) => ({ ...a, mic: true, vibration: motionOk }));

    // The composite canvas and the camera element have to exist before anything
    // is attached to them.
    phaseRef.current = 'calibrating';
    setPhase('calibrating');
    await new Promise((r) => requestAnimationFrame(() => r()));

    let camOk = true;
    if (cameraMode === 'depth' && depthAvailable) {
      try {
        await startDepthCamera();
      } catch (e) {
        camOk = false;
        setAvailability((a) => ({ ...a, camera: false }));
        setError(e?.category === 'permission'
          ? 'Camera access is denied — allow it in Settings to use the depth scan. The other lanes can still run.'
          : e?.category === 'unsupported'
            ? 'This device cannot run the depth scan — try the contrast method. The other lanes can still run.'
            : e?.category === 'unavailable'
              ? 'The depth module did not respond in this build of the app — the other lanes can still run.'
              : 'The depth sensor could not start. Close other camera apps and try again.');
      }
    } else {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        });
        camStreamRef.current = cam;
        const video = videoRef.current;
        if (!video) throw new Error('Camera view is not ready');
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.srcObject = cam;
        await video.play();
        // The darkest end of the shared scale lights the scene with the torch, the
        // same as the standalone camera does.
        if (isTorchActive(sensitivityRef.current)) {
          const ok = await enableTorch(cam);
          if (!ok) setError('Torch not supported on this device — using Dark mode detection instead.');
        }
      } catch (e) {
        camOk = false;
        setError(e?.name === 'NotAllowedError'
          ? 'Camera access or playback was blocked. Allow camera access, then tap the camera view to resume playback.'
          : 'The live camera could not start. The other lanes can still run, but the camera image is unavailable.');
      }
      setAvailability((a) => ({ ...a, camera: camOk }));
    }

    // Acoustic lane: one analyser on the session's microphone.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      if (ctx.state === 'suspended') await ctx.resume();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(micStreamRef.current).connect(analyser);
      analyserRef.current = analyser;
      freqRef.current = new Uint8Array(analyser.frequencyBinCount);
      trackerRef.current = createBaselineTracker();
    } catch {
      analyserRef.current = null;
      trackerRef.current = null;
      setError('The acoustic analyser could not start — the other lanes are still running.');
    }

    // Environmental lane: the magnetic and barometric sensors are only reachable
    // through the native module. Without it the lane says so rather than drawing a
    // meter that is not measuring anything.
    envTrackerRef.current = createEnvironmentTracker();
    try {
      const support = await sensorSupport();
      setAvailability((a) => ({ ...a, magnetometer: support.magnetometer, barometer: support.barometer }));
      if (support.magnetometer || support.barometer) {
        // Both subscriptions go up before the stream starts, so no reading or
        // native fault can arrive unobserved. A native fault mid-session stops
        // only this lane; everything else keeps measuring and recording.
        envUnsubRef.current = onSensorReading((r) => {
          const s = latestSensorRef.current;
          if (r?.magnetic && Number.isFinite(r.magnetic.total)) s.magnetic = r.magnetic.total;
          if (Number.isFinite(r?.pressure)) s.pressure = r.pressure;
          s.movement = Number.isFinite(r?.movement) ? r.movement : 0;
        });
        envErrorUnsubRef.current = onSensorError((failure) => {
          setAvailability((a) => (a.magnetometer || a.barometer ? { ...a, magnetometer: false, barometer: false } : a));
          setError(failure?.category === 'permission'
            ? 'Motion sensor access was denied, so the environmental lane stopped — the other lanes are still running.'
            : `The environmental sensors reported a fault${failure?.message ? `: ${failure.message}` : ''} — that lane stopped; the other lanes are still running.`);
          if (envUnsubRef.current) { envUnsubRef.current(); envUnsubRef.current = null; }
          stopSensors();
        });
        await startSensors(10);
      }
    } catch {
      // The lane reads as unavailable; take any half-installed subscriptions down.
      if (envUnsubRef.current) { envUnsubRef.current(); envUnsubRef.current = null; }
      if (envErrorUnsubRef.current) { envErrorUnsubRef.current(); envErrorUnsubRef.current = null; }
    }

    if (motionOk) window.addEventListener('devicemotion', handleMotion);

    calibrationEndRef.current = Date.now() + SIEG_CALIBRATION_MS;
    // The composite is painted on the phone's own animation frames, not on a timer.
    // A phone throttles page timers hard, and a canvas that only changes a few times
    // a minute is exactly what records as a still image — the frames follow the
    // screen instead. Sampling keeps its 10 Hz cadence inside the same loop, so the
    // chart's time axis is unchanged.
    lastSampleRef.current = 0;
    const paintLoop = () => {
      const now = Date.now();
      if (now - lastSampleRef.current >= SAMPLE_MS) {
        lastSampleRef.current = now;
        sampleTick();
      }
      drawComposite(now);
      frameRef.current = requestAnimationFrame(paintLoop);
    };
    frameRef.current = requestAnimationFrame(paintLoop);
    if (cameraMode !== 'device') {
      figureTimerRef.current = setInterval(figureTick, 250);
    }
    clockTimerRef.current = setInterval(clockTick, 250);
  };

  const clockTick = () => {
    const now = Date.now();
    // The real time runs for the whole session, baseline included — it is the clock
    // an investigator reads off the screen when writing an event down.
    setClockText(formatWallClock(now));
    if (phaseRef.current === 'calibrating') {
      if (now >= calibrationEndRef.current) beginLive();
      return;
    }
    if (phaseRef.current !== 'live') return;
    const left = endsAtRef.current - now;
    durationRef.current = Math.min(sessionRef.current.minutes * 60, Math.round((now - startedAtRef.current) / 1000));
    setRemaining(Math.max(0, left / 1000));
    if (left <= 0) finishSession('timer');
  };

  const beginLive = async () => {
    phaseRef.current = 'live';
    setPhase('live');
    startedAtRef.current = Date.now();
    endsAtRef.current = startedAtRef.current + sessionRef.current.minutes * 60000;
    userStoppedRef.current = false;
    setRemaining(sessionRef.current.minutes * 60);
    const ok = await startRecorder();
    if (!ok) setError('This session could not start recording. The lanes are still measuring, but nothing is being saved.');
    // The phone can suspend the audio context mid-session, which ends the
    // analyser's frames and would end a recording's audio track with them.
    heartbeatRef.current = setInterval(() => {
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    }, 1500);
  };

  // SIEG is a quiet-room instrument, so the app's own ambience is held quiet for as
  // long as the tool is on screen — not only while a session runs. The setup screen
  // is part of the measurement: it is where the room is first listened to, and the
  // phone's speaker sits right beside the microphone that is listening to it.
  useEffect(() => {
    holdAmbience();
    return () => releaseAmbience();
  }, []);

  // Local conditions come up on their own: the moon phase is computed locally, and
  // the weather is fetched once through the app's usual device-location path. If
  // location is switched off or refused, the app's own explanation is shown in the
  // conditions block instead of a silent blank — and the session runs either way.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFetchingConditions(true);
      const pos = await getDevicePosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
      if (cancelled) return;
      if (!pos.ok) {
        setConditionsNote(pos.message);
        setFetchingConditions(false);
        return;
      }
      try {
        const w = await fetchWeatherByCoords(pos.coords.lat, pos.coords.lng);
        if (!cancelled) setWeather(`${Math.round(w.temperature)}°F ${w.conditions}`);
      } catch {
        if (!cancelled) setConditionsNote('Local weather is unavailable right now.');
      }
      if (!cancelled) setFetchingConditions(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    userStoppedRef.current = true;
    if (depthDiagRef.current) {
      const record = finalizeDepthDiag(depthDiagRef.current);
      depthDiagRef.current = null;
      if (record) base44.entities.DepthCameraDiagnostic.create(record).catch(() => {});
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* already stopped */ }
    }
    teardownDevices();
  }, []);

  // A session that ended on its own saves itself, privately, without anyone
  // standing at the phone. The gate is still honoured: if the save has to be
  // confirmed, the review screen is there waiting with the buttons.
  useEffect(() => {
    if (phase !== 'review' || !blob || !autoSaveRef.current) return;
    autoSaveRef.current = false;
    saveRecording(true);
  }, [phase, blob]);

  const discard = () => {
    autoSaveRef.current = false;
    setBlob(null);
    setSaved(false);
    eventsRef.current = [];
    countsRef.current = {};
    correlatedRef.current = 0;
    setEvents([]);
    setCounts({});
    setCorrelatedCount(0);
    setError('');
    setWeather(null);
    phaseRef.current = 'idle';
    setPhase('idle');
    setSession(null);
  };

  const saveRecording = async (isPrivate = true) => {
    if (!displayBlob || saving) return;
    setSaving(true);
    let gateSucceeded = false;
    try {
      // The extension follows what was actually recorded rather than a default:
      // audio in a video container is one more still frame for whoever reviews it.
      const recordedType = (displayBlob.type || '').split(';')[0];
      const ext = recordedType === 'video/mp4' ? 'mp4'
        : recordedType === 'audio/mp4' ? 'm4a'
          : recordedType === 'audio/webm' ? 'weba'
            : 'webm';
      const file = new File([displayBlob], `sieg_session.${ext}`, { type: displayBlob.type });
      const upload = await base44.integrations.Core.UploadFile({ file });
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const laneCounts = SIEG_LANES.map((l) => `${l.label} ${countsRef.current[l.id] || 0}`).join(' · ');
      const logLines = eventsRef.current.slice().reverse()
        .map((e) => `${e.time}  ${SIEG_LANES.find((l) => l.id === e.lane)?.label || e.lane}  ${e.label}${e.correlated ? '  [correlated]' : ''}`)
        .join('\n');
      let description = `SIEG — ${sessionRef.current.name} (${sessionRef.current.minutes} min · ${formatClock(durationRef.current)} measured).`;
      description += '\nLanes: Acoustic, Figure, Vibration, Environment.';
      description += `\nEvents: ${eventsRef.current.length} (${laneCounts}) · Correlated pairs: ${correlatedRef.current}`;
      description += `\nConditions: ${conditionsLine}`;
      if (logLines) description += `\n\nSession log:\n${logLines}`;
      if (trimMode !== 'full') description += `\nSaved: last ${trimSeconds} seconds.`;

      const gpsResult = await captureGpsForSave();
      if (!gpsResult) { setSaving(false); return; }
      if (!isPrivate && (gpsResult.location_source === 'NONE' || gpsResult.latitude == null)) {
        toast({
          title: 'Evidence Cannot Be Made Public',
          description: 'This evidence does not have a valid location. Evidence must have GPS coordinates or a tour-stop location to be shared on the Community Map. The evidence may still be saved privately if appropriate.',
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }
      if (gateSave) {
        const allowed = await gateSave();
        if (!allowed) { setSaving(false); return; }
      }
      gateSucceeded = true;
      const ctx = await buildEvidenceContext(gpsResult, { skipGps: true });
      await base44.entities.Evidence.create({
        title: `SIEG Session ${date}`,
        type: blob.type.startsWith('audio') ? 'evp' : 'video',
        source_tool: 'sieg',
        description,
        file_url: upload.file_url,
        date,
        time,
        is_private: isPrivate,
        ...gpsResult,
        ...ctx,
      });
      toast({ title: 'Session saved', description: `${sessionRef.current.name} — one evidence record.` });
      setSaved(true);
    } catch (e) {
      if (gateSucceeded && refundSave) await refundSave();
      console.error('SIEG save failed', e);
      toast({
        title: 'Save failed',
        description: 'The session could not be saved. Try again from this screen.',
        variant: 'destructive',
      });
    }
    setSaving(false);
  };

  const laneUnavailable = (id) => {
    if (id === 'acoustic') return !availability.mic;
    if (id === 'figure') return !availability.camera;
    if (id === 'vibration') return !availability.vibration || !motionSeen;
    return !availability.magnetometer && !availability.barometer;
  };

  if (phase === 'idle') {
    return (
      <div className="space-y-3">
        <SiegSessionPicker
          onStart={startSession}
          conditions={{ moon: moonNow.name, illumination: moonNow.illumination, weather }}
          conditionsNote={conditionsNote}
          fetching={fetchingConditions}
          error={error}
          cameraControls={(
            <SiegCameraControls
              mode={cameraMode}
              onModeChange={setCameraMode}
              depthAvailable={depthAvailable}
              sensitivity={sensitivity}
              onSensitivityChange={setSensitivity}
              depthDetection={depthDetection}
            />
          )}
        />
        {gpsDialog}
        {trackingOffDialog}
      </div>
    );
  }

  if (phase === 'review') {
    return (
      <div className="space-y-3">
        <SiegReview
          blob={displayBlob}
          session={session}
          events={events}
          counts={counts}
          correlatedCount={correlatedCount}
          duration={durationRef.current}
          saving={saving}
          saved={saved}
          onSave={saveRecording}
          onDiscard={discard}
          trimMode={trimMode}
          onTrimChange={setTrimMode}
        />
        {gpsDialog}
        {trackingOffDialog}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SiegViewport
        videoRef={videoRef}
        canvasRef={canvasRef}
        sessionName={session?.name || ''}
        conditions={conditionsLine}
        minutes={session?.minutes || 0}
      />

      {error && (
        <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10">
          <p className="text-[10px] text-amber-300 leading-relaxed">{error}</p>
        </div>
      )}

      {phase === 'calibrating' ? (
        <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-[11px] font-heading uppercase tracking-wider text-primary">Measuring the room's baseline</p>
          <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
            All four lanes are learning this room's own quiet level, so every later reading is judged against the room
            itself. Step away now — the session's clock starts when the baseline is done.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {SIEG_LANES.map((lane) => (
            <div key={lane.id} className="p-2 rounded-lg bg-card/30 border border-border/30">
              <p className="text-[9px] font-heading uppercase tracking-wider" style={{ color: lane.color }}>{lane.label}</p>
              <p className="text-[11px] font-mono text-foreground mt-0.5">
                {laneUnavailable(lane.id) ? LANE_UNAVAILABLE : (readouts[lane.id] || '—')}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono text-muted-foreground">
          {clockText && <span className="text-foreground/80 mr-2">{clockText}</span>}
          {phase === 'live' ? `${formatClock(remaining)} remaining` : 'Calibrating…'}
        </p>
        <button
          onClick={() => finishSession('manual')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-heading text-[10px] uppercase tracking-wider hover:bg-red-500/20 transition-colors"
        >
          <X className="w-3 h-3" /> Stop session
        </button>
      </div>

      <div>
        <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground mb-1.5">Session log</p>
        <div className="max-h-40 overflow-y-auto toolkit-scroll pr-1">
          <SiegEventLog events={events} />
        </div>
      </div>

      <div className="p-2.5 rounded-lg bg-card/30 border border-border/30">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Every lane is judged against this room's own baseline, and every event is stamped with the time it happened.
          Two lanes reporting within a couple of seconds of each other are marked as correlated — a moment worth going
          back to, not a conclusion.
        </p>
      </div>

      {gpsDialog}
      {trackingOffDialog}
    </div>
  );
}