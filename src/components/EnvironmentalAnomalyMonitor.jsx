import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Square, X, Info, Video, Activity, AlertTriangle, Compass, Gauge, Volume2, VolumeX } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { buildEvidenceContext } from '@/lib/evidenceContext';
import { useToolGpsSave } from '@/hooks/useToolGpsSave';
import EvidenceSaveButtons from './EvidenceSaveButtons';
import useGhostVoice from '@/hooks/useGhostVoice';
import useSweeperRecorder from '@/hooks/useSweeperRecorder';
import { audioAcquire, audioRelease } from '@/lib/hauntedAudio';
import { sensorSupport, startSensors, stopSensors, onSensorReading, onSensorError } from '@/lib/nativeSensors';
import {
  createEnvironmentTracker, magneticThreshold, pressureThreshold, SENSITIVITY, MOVEMENT_LIMIT,
} from '@/lib/environmentAnalysis';
import { drawEnvironmentChart, COMBINED_COLOR } from '@/lib/environmentChart';
import { CUE_MAGNETIC, CUE_PRESSURE, CUE_COMBINED } from '@/lib/toolCues';
import { monitorTonesEnabled, setMonitorTonesEnabled } from '@/lib/toolTonePrefs';
import { toast } from '@/components/ui/use-toast';

// Environmental Anomaly Monitor — a two-channel meter, not a trigger tool.
//
// It reads the phone's magnetic-field sensor and barometer, measures the room's own
// baseline first, then watches both channels for sustained departures from it. Each
// channel is judged against its own baseline (the two share no unit, and the phone's
// magnetic reading carries a device-specific offset), and a departure only counts if
// it holds. The pressure channel is held while the phone is moving, because pressure
// changes with height and a carried phone reports movement, not the room.
//
// The live display is recorded, so a saved session lines up with what was measured.
const SAMPLE_MS = 100;              // 10 frames per second
const CALIBRATION_MS = 10000;       // baseline measured before anything is reported
const HOLD_MS = 500;                // a departure must last this long to count
const RELEASE_MS = 700;             // calm needed before the detector re-arms
const RELEASE_FRACTION = 0.6;       // how far back toward baseline counts as calm
const REARM_COOLDOWN_MS = 2000;     // floor between events on the same channel
const SENSITIVITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High' };

const createChannelState = () => ({
  magnetic: { armed: true, since: 0, quietSince: 0, lastEvent: 0, id: null, peak: 0, started: 0 },
  pressure: { armed: true, since: 0, quietSince: 0, lastEvent: 0, id: null, peak: 0, started: 0 },
});

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function EnvironmentalAnomalyMonitor({ gateSave, refundSave }) {
  const { captureGpsForSave, gpsDialog, trackingOffDialog } = useToolGpsSave();
  const { unlock, attachMicToRecording, boostMicStream, resumeContext, playCue } = useGhostVoice();

  const [phase, setPhase] = useState('idle'); // idle | running | stopped
  const [available, setAvailable] = useState(null);
  const [sensitivity, setSensitivity] = useState('normal');
  const [calibrating, setCalibrating] = useState(false);
  const [events, setEvents] = useState([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [readouts, setReadouts] = useState({ magnetic: null, pressure: null, magDev: null, presDev: null });
  const [anomaly, setAnomaly] = useState(null);
  const [moving, setMoving] = useState(false);
  const [sensorError, setSensorError] = useState('');
  const [recordingError, setRecordingError] = useState('');
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tonesOn, setTonesOn] = useState(() => monitorTonesEnabled());

  const canvasRef = useRef(null);
  const latestRef = useRef(null);
  const trackerRef = useRef(null);
  const channelsRef = useRef(createChannelState());
  const traceRef = useRef({ magnetic: [], pressure: [] });
  const markersRef = useRef([]);
  const readoutRef = useRef({ magnetic: null, pressure: null, magDev: null, presDev: null });
  const availableRef = useRef(null);
  const anomalyRef = useRef(null);
  const recordingRef = useRef(false);
  const calibratingRef = useRef(true);
  const calibrationEndRef = useRef(0);
  const sessionActiveRef = useRef(false);
  const statusRef = useRef('CALIBRATING');
  const movingRef = useRef(false);
  const sensitivityRef = useRef('normal');
  const durationRef = useRef(0);
  const sessionStartRef = useRef(0);
  const eventCountRef = useRef(0);
  const sampleTimerRef = useRef(null);
  const drawTimerRef = useRef(null);
  const sessionTimerRef = useRef(null);
  const anomalyTimerRef = useRef(null);
  const watchTimerRef = useRef(null);
  const unsubRef = useRef(null);
  const sensorErrorUnsubRef = useRef(null);
  const ambienceHeldRef = useRef(false);
  const tonesRef = useRef(tonesOn);
  // When the combined alert was last logged. Both channels departing together is
  // one moment: the channel that crosses first marks it, and a simultaneous
  // partner inside this window is absorbed into that alert instead of logging a
  // second "both sensors" entry and sounding the combined tone again.
  const combinedAlertRef = useRef(0);

  const { videoBlob, setVideoBlob, startRecording, stopRecording, cleanup } = useSweeperRecorder({
    canvasRef,
    attachMicToRecording,
    boostMicStream,
    resumeAudioContext: resumeContext,
    setSensorError,
    componentName: 'EnvironmentMonitor',
  });

  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);

  // A departure sounds as it is logged. The cue goes through the same audio bus the
  // session recording listens to, so a saved session can be read by ear: the tone
  // marks where the data says the spike was, and how big it was. Always a struck
  // synthetic tone and never anything voice-like — a beep must not pass for an EVP
  // when that recording is reviewed later.
  const soundAlert = (kind, strength) => {
    if (!tonesRef.current) return;
    playCue(kind, { strength }).catch(() => {});
  };

  const toggleTones = () => {
    const next = !tonesRef.current;
    tonesRef.current = next;
    setTonesOn(next);
    setMonitorTonesEnabled(next);
  };

  // Ask the native module once which of the two sensors this device has.
  useEffect(() => {
    let cancelled = false;
    sensorSupport().then((result) => {
      if (cancelled) return;
      setAvailable(result);
      availableRef.current = result;
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => stopEverything(), []);

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

  const stopEverything = () => {
    sessionActiveRef.current = false;
    [sampleTimerRef, drawTimerRef, sessionTimerRef, anomalyTimerRef, watchTimerRef].forEach((r) => {
      if (r.current) { clearInterval(r.current); clearTimeout(r.current); r.current = null; }
    });
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    if (sensorErrorUnsubRef.current) { sensorErrorUnsubRef.current(); sensorErrorUnsubRef.current = null; }
    stopSensors();
    if (recordingRef.current) stopRecording();
    recordingRef.current = false;
    setRecording(false);
    setAnomaly(null);
    anomalyRef.current = null;
    releaseAmbience();
  };

  const pushTrace = (magneticDev, pressureDev) => {
    traceRef.current.magnetic.push(Number.isFinite(magneticDev) ? magneticDev : null);
    traceRef.current.pressure.push(Number.isFinite(pressureDev) ? pressureDev : null);
    if (traceRef.current.magnetic.length > 300) {
      traceRef.current.magnetic.shift();
      traceRef.current.pressure.shift();
    }
  };

  const logEvent = (entry) => {
    markersRef.current.push({
      sample: traceRef.current.pressure.length,
      channel: entry.channel,
      combined: entry.combined,
    });
    if (markersRef.current.length > 60) markersRef.current.shift();
    eventCountRef.current += 1;
    setEvents((prev) => [entry, ...prev].slice(0, 40));
  };

  // A channel that latched keeps the event open until it actually returns to its
  // baseline, so one long excursion is one entry rather than a burst of them.
  const finalize = (channel, extra = {}) => {
    const st = channelsRef.current[channel];
    if (st.armed) return;
    const duration = Date.now() - st.started;
    setEvents((prev) => prev.map((e) => (e.id === st.id ? { ...e, peak: st.peak, duration, ...extra } : e)));
    st.armed = true;
    st.id = null;
    st.peak = 0;
    st.since = 0;
    st.quietSince = 0;
  };

  const runChannel = (channel, value, threshold, other, ctx) => {
    const st = channelsRef.current[channel];
    const now = Date.now();

    if (!st.armed) {
      if (Math.abs(value) > Math.abs(st.peak)) st.peak = value;
      if (Math.abs(value) < threshold * RELEASE_FRACTION) {
        if (!st.quietSince) st.quietSince = now;
        else if (now - st.quietSince >= RELEASE_MS) finalize(channel);
      } else {
        st.quietSince = 0;
      }
      return;
    }

    if (Math.abs(value) >= threshold) {
      if (!st.since) st.since = now;
      if (now - st.since >= HOLD_MS && now - st.lastEvent >= REARM_COOLDOWN_MS) {
        st.lastEvent = now;
        st.armed = false;
        st.since = 0;
        st.started = now;
        st.peak = value;
        st.id = `${channel}-${now}`;
        // Both channels departing at once is the one case worth marking: it is the
        // only thing here that is about the room rather than a single reading.
        const combined = ctx[other.value] != null && Math.abs(ctx[other.value]) >= ctx[other.threshold];

        // One moment, one combined alert. Crossing together, each channel would
        // otherwise log its own "both sensors" entry and each sound the combined
        // tone — two log lines, two markers, two tones for a single moment. The
        // channel that crossed first already marked it, so this partner joins that
        // alert: it stays latched (its excursion is still on the trace and inside
        // the open entry) and logs nothing of its own.
        if (combined && now - combinedAlertRef.current <= REARM_COOLDOWN_MS) {
          st.id = null;
          return;
        }
        if (combined) combinedAlertRef.current = now;

        statusRef.current = 'EVENT';
        logEvent({
          id: st.id,
          channel,
          peak: value,
          combined,
          moved: ctx.moving,
          duration: 0,
          time: new Date().toLocaleTimeString(),
        });
        // The bigger the departure, the bigger the tone. Both channels departing at
        // once gets the one cue that carries both notes.
        soundAlert(
          combined ? CUE_COMBINED : channel === 'magnetic' ? CUE_MAGNETIC : CUE_PRESSURE,
          Math.min(1, Math.abs(value) / (threshold * 2)),
        );
        const flash = { channel, combined };
        setAnomaly(flash);
        anomalyRef.current = flash;
        if (anomalyTimerRef.current) clearTimeout(anomalyTimerRef.current);
        anomalyTimerRef.current = setTimeout(() => { setAnomaly(null); anomalyRef.current = null; }, 3000);
      }
    } else {
      st.since = 0;
    }
  };

  // ── One measurement frame ──
  const sampleFrame = () => {
    const reading = latestRef.current;
    const tracker = trackerRef.current;
    if (!reading || !tracker) return;

    const sample = {
      magnetic: reading.magnetic?.total ?? null,
      pressure: reading.pressure ?? null,
    };
    const nowMoving = (reading.movement ?? 0) > MOVEMENT_LIMIT;

    if (calibratingRef.current) {
      tracker.calibrate(sample);
      if (Date.now() >= calibrationEndRef.current && tracker.calibrated) {
        calibratingRef.current = false;
        setCalibrating(false);
        statusRef.current = 'MONITORING';
        // Recording begins with the baseline, never before it.
        beginRecording();
      }
      pushTrace(null, null);
      return;
    }

    if (nowMoving && !movingRef.current) {
      // The phone was picked up mid-excursion: end the pressure event here, marked,
      // rather than letting it run on as if it were the room.
      finalize('pressure', { moved: true });
    }
    if (nowMoving !== movingRef.current) {
      movingRef.current = nowMoving;
      setMoving(nowMoving);
    }

    const dev = tracker.deviation(sample, {
      magnetic: !channelsRef.current.magnetic.armed,
      pressure: !channelsRef.current.pressure.armed || nowMoving,
    });
    pushTrace(dev.magnetic, dev.pressure);

    const next = {
      magnetic: sample.magnetic,
      pressure: sample.pressure,
      magDev: dev.magnetic,
      presDev: dev.pressure,
    };
    readoutRef.current = next;
    setReadouts(next);

    const mult = SENSITIVITY[sensitivityRef.current];
    const thresholds = {
      magnetic: magneticThreshold(dev.magSd, mult),
      pressure: pressureThreshold(dev.presSd, mult),
    };

    if (dev.magnetic != null) {
      runChannel('magnetic', dev.magnetic, thresholds.magnetic,
        { value: 'pressure', threshold: thresholds.pressure }, { pressure: dev.pressure, moving: nowMoving });
    }
    // Pressure is only read while the phone is still.
    if (dev.pressure != null && !nowMoving) {
      runChannel('pressure', dev.pressure, thresholds.pressure,
        { value: 'magnetic', threshold: thresholds.magnetic }, { magnetic: dev.magnetic, moving: false });
    }
  };

  const beginRecording = async () => {
    if (!sessionActiveRef.current || recordingRef.current) return;
    sessionStartRef.current = Date.now();
    durationRef.current = 0;
    setSessionDuration(0);
    sessionTimerRef.current = setInterval(() => {
      const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000);
      durationRef.current = elapsed;
      setSessionDuration(elapsed);
    }, 1000);
    // The audio engine was opened on the Start tap, then sat idle through the
    // 10s calibration. iOS suspends an idle Web Audio context, so the shared
    // recording destination (created during unlock) can come back degraded —
    // the room noise in the recording ends up near-silent. Resume the context
    // (recreating the destination if it was closed) right before the recorder
    // attaches, so the mic chain is live from the first sample.
    resumeContext();
    const ok = await startRecording();
    if (ok) {
      recordingRef.current = true;
      setRecording(true);
    } else {
      setRecordingError('Recording could not start on this device — the meter still works, but this session cannot be saved.');
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawEnvironmentChart(canvas.getContext('2d'), canvas, {
      trace: traceRef.current,
      markers: markersRef.current,
      readouts: readoutRef.current,
      hasMagnetic: !!availableRef.current?.magnetometer,
      hasPressure: !!availableRef.current?.barometer,
      calibrating: calibratingRef.current,
      calibrationLeft: Math.max(0, Math.ceil((calibrationEndRef.current - Date.now()) / 1000)),
      status: statusRef.current,
      moving: movingRef.current,
      anomaly: anomalyRef.current,
      eventCount: eventCountRef.current,
      sensitivity: sensitivityRef.current,
      recording: recordingRef.current,
      duration: durationRef.current,
    });
  }, []);

  const startSession = async () => {
    const sensors = availableRef.current || (await sensorSupport());
    if (!sensors.magnetometer && !sensors.barometer) {
      // Three different reasons to have nothing to read: a browser (no path to
      // the sensors at all), a build whose native module is not linked (a build
      // problem, reported as such, never as a device verdict), or a device that
      // genuinely has neither sensor.
      setSensorError(
        sensors.status === 'web'
          ? 'This tool reads the phone\'s own magnetic-field sensor and barometer, which a web browser cannot reach — open it in the mobile app.'
          : sensors.status === 'unregistered'
            ? 'The app\'s native sensor module did not respond in this build, so the readings are not about the device — reinstall or update the app.'
            : 'This device reports neither a magnetic-field sensor nor a barometer, so there is nothing for this tool to measure.'
      );
      return;
    }
    setSensorError('');
    setRecordingError('');
    setError('');
    setEvents([]);
    setVideoBlob(null);
    setAnomaly(null);
    anomalyRef.current = null;
    setRecording(false);
    recordingRef.current = false;
    traceRef.current = { magnetic: [], pressure: [] };
    markersRef.current = [];
    combinedAlertRef.current = 0;
    channelsRef.current = createChannelState();
    trackerRef.current = createEnvironmentTracker();
    calibratingRef.current = true;
    setCalibrating(true);
    statusRef.current = 'CALIBRATING';
    eventCountRef.current = 0;
    durationRef.current = 0;
    sessionStartRef.current = 0;
    movingRef.current = false;
    setMoving(false);
    latestRef.current = null;

    // The audio engine is opened from this tap (iOS requires a user gesture) so the
    // session recording has one.
    unlock();

    // Both subscriptions go up BEFORE the stream starts: the first reading — or
    // a native start fault — must never arrive before anyone is listening.
    unsubRef.current = onSensorReading((reading) => {
      latestRef.current = reading;
      // The stream is delivering: the no-reading watchdog is satisfied.
      if (watchTimerRef.current) {
        clearTimeout(watchTimerRef.current);
        watchTimerRef.current = null;
      }
    });
    sensorErrorUnsubRef.current = onSensorError((failure) => {
      setSensorError(failure?.category === 'permission'
        ? 'Motion sensor access was denied. Allow motion and fitness access for the app in Settings, then try again.'
        : `The sensor stream reported a fault${failure?.message ? `: ${failure.message}` : ''}. The tool may keep running on the healthy channel — stop and restart if the trace goes flat.`);
    });

    try {
      await startSensors(10);
    } catch {
      // Start failed after the bridges were checked: a real stream failure, not a
      // missing module. Take the subscriptions back down with it.
      if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
      if (sensorErrorUnsubRef.current) { sensorErrorUnsubRef.current(); sensorErrorUnsubRef.current = null; }
      setSensorError('The sensors could not be started on this device. Close other apps using them and try again.');
      return;
    }

    setPhase('running');
    sessionActiveRef.current = true;
    calibrationEndRef.current = Date.now() + CALIBRATION_MS;
    await new Promise((r) => setTimeout(r, 150));
    holdAmbience();
    draw();
    drawTimerRef.current = setInterval(draw, 33);
    sampleTimerRef.current = setInterval(sampleFrame, SAMPLE_MS);
    watchTimerRef.current = setTimeout(() => {
      if (!latestRef.current) {
        setSensorError('The native sensor module is connected, but no readings are arriving from it — the sensors may be held by another app. Close other sensor apps, stop, and try again.');
      }
    }, 5000);
  };

  const stopSession = () => {
    stopEverything();
    setPhase('stopped');
    setCalibrating(false);
    setError('');
  };

  const saveSession = async (isPrivate = true) => {
    if (!videoBlob) return;
    setSaving(true);
    let gateSucceeded = false;
    try {
      // Upload and capture GPS BEFORE gating so a failed upload or cancelled GPS
      // flow does NOT consume a daily evidence save.
      const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([videoBlob], `environment_monitor_session.${ext}`, { type: videoBlob.type });
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
      const magnetic = events.filter((e) => e.channel === 'magnetic').length;
      const pressure = events.filter((e) => e.channel === 'pressure').length;
      const together = events.filter((e) => e.combined).length;
      const ctxData = await buildEvidenceContext(gpsResult, { skipGps: true });
      await base44.entities.Evidence.create({
        title: `Environmental Anomaly Monitor — ${date}`,
        type: videoBlob.type.startsWith('audio') ? 'evp' : 'video',
        source_tool: 'environment',
        description: `Environmental Anomaly Monitor session — ${formatDuration(sessionDuration)} — ${magnetic} magnetic departure(s), ${pressure} pressure departure(s), ${together} with both sensors departing together. Both channels measured against the in-device baseline; readings are relative, not calibrated measurements.`,
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
      console.error('Save failed', e);
      setError('Save failed. Please try again.');
    }
    setSaving(false);
  };

  const discard = () => {
    setVideoBlob(null);
    setEvents([]);
    setPhase('idle');
  };

  const eventLabel = (ev) => {
    if (ev.channel === 'magnetic') {
      return `MAGNETIC ${ev.peak >= 0 ? '+' : ''}${ev.peak.toFixed(1)} µT${ev.moved ? ' · phone moving' : ''}`;
    }
    return `PRESSURE ${ev.peak >= 0 ? '+' : ''}${ev.peak.toFixed(2)} hPa${ev.moved ? ' · phone moving' : ''}`;
  };

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (phase === 'idle') {
    const nothingToRead = available && !available.magnetometer && !available.barometer;
    return (
      <div className="space-y-4">
        {error && <p className="text-[11px] text-red-400/80 text-center">{error}</p>}
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-1.5">
          <p className="text-[10px] font-heading uppercase tracking-wider text-primary flex items-center gap-1.5"><Info className="w-3 h-3" /> How to Use</p>
          <ol className="text-[11px] text-foreground/70 leading-relaxed list-decimal pl-4 space-y-0.5">
            <li>Set the phone down on a stable surface and leave it there. This tool reads the room, and the pressure channel can only do that while the phone is still.</li>
            <li>Tap <span className="text-primary font-medium">Start Session</span>. The first 10 seconds measure the room's own baseline on both channels — stay still and quiet while it does.</li>
            <li>From then on two traces show how far each sensor has departed from that baseline: cyan is barometric pressure, violet is the magnetic field. They rest on the centre line when the room is at its baseline.</li>
            <li>Where the two traces cross, the ink sums to white — both sensors departing together. That is the one moment worth noting, and it is logged and marked in white.</li>
            <li>Recording begins the moment the baseline is set. Tap <span className="text-primary font-medium">Stop</span>, review the recording, then <span className="text-primary font-medium">Save</span> it to your Evidence Journal.</li>
          </ol>
          <p className="text-[10px] text-orange-400 mt-2">Note: Sensor sensitivity and accuracy are dependent upon the user's device/service. Levels are relative departures from the measured baseline, not calibrated measurements.</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1.5">Reads the phone's own magnetic-field sensor and barometer — this tool does not use the camera, the microphone, or any radio. For the traditional handheld EMF meter described in the Equipment Guide, this is the phone's equivalent of that instrument.</p>
          <p className="text-[10px] text-muted-foreground/70 mt-1.5">Each departure sounds a short struck tone as it is logged — the magnetic channel low and wooden, the pressure channel higher and glassier, both together when the two sensors depart at once — and the tone is captured in the session recording, so a saved session can be read by ear as well as by the log. The switch sits above Stop Session.</p>
        </div>

        <div className="p-2.5 rounded-lg bg-card/30 border border-border/30 space-y-1">
          <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Sensors on this device</p>
          {available ? (
            available.status === 'connected' ? (
              <>
                <p className={`text-[11px] flex items-center gap-1.5 ${available.magnetometer ? 'text-foreground/80' : 'text-muted-foreground/60'}`}>
                  <Compass className="w-3 h-3" /> Magnetic field: {available.magnetometer ? 'available' : 'not available'}
                </p>
                <p className={`text-[11px] flex items-center gap-1.5 ${available.barometer ? 'text-foreground/80' : 'text-muted-foreground/60'}`}>
                  <Gauge className="w-3 h-3" /> Barometric pressure: {available.barometer ? 'available' : available.detail === 'denied' || available.detail === 'restricted' ? 'available, but motion access is denied in Settings' : 'not available'}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground/60">
                {available.status === 'web'
                  ? 'Only reachable in the mobile app — a browser build has no magnetometer or barometer.'
                  : 'The app\'s native sensor module did not respond in this build — the readings here say nothing about the device. Reinstall or update the app.'}
              </p>
            )
          ) : (
            <p className="text-[11px] text-muted-foreground/60">Checking this device's sensors…</p>
          )}
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

        <button onClick={startSession} disabled={nothingToRead} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-primary/10 border border-primary/30 text-primary font-heading text-xs uppercase tracking-wider hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
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
          <canvas ref={canvasRef} width={640} height={360} className="w-full h-44 object-contain" />
          {recording && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/80">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-[9px] text-white font-mono">REC {formatDuration(sessionDuration)}</span>
            </div>
          )}
          {anomaly && !calibrating && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-none">
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="px-3 py-1 rounded border"
                style={anomaly.combined
                  ? { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(255,255,255,0.6)' }
                  : { backgroundColor: 'rgba(239,68,68,0.9)', borderColor: 'rgba(252,165,165,0.5)' }}>
                <p className={`text-[10px] font-mono font-bold tracking-wider ${anomaly.combined ? 'text-slate-900' : 'text-white'}`}>
                  {anomaly.combined ? '⚠ BOTH SENSORS TOGETHER' : anomaly.channel === 'magnetic' ? '⚠ MAGNETIC DEPARTURE' : '⚠ PRESSURE DEPARTURE'}
                </p>
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
          <div className="flex items-center justify-center gap-5">
            <div className="text-center">
              <p className="font-mono text-lg" style={{ color: '#a78bfa' }}>
                {readouts.magDev == null ? '—' : `${readouts.magDev >= 0 ? '+' : ''}${readouts.magDev.toFixed(1)}`}
              </p>
              <p className="text-[10px] text-muted-foreground/70">µT magnetic</p>
            </div>
            <div className="text-center">
              <p className="font-mono text-lg" style={{ color: '#22d3ee' }}>
                {readouts.presDev == null ? '—' : `${readouts.presDev >= 0 ? '+' : ''}${readouts.presDev.toFixed(2)}`}
              </p>
              <p className="text-[10px] text-muted-foreground/70">hPa pressure</p>
            </div>
          </div>
        )}

        {moving && !calibrating && (
          <p className="text-[10px] text-amber-400/90 text-center">Phone moving — pressure on hold until it is still again. Magnetic readings continue.</p>
        )}

        {events.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Activity className="w-3 h-3" /> Event Log ({events.length})</p>
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between px-2 py-1 rounded bg-card/30 border border-border/20 gap-2">
                <span className="text-[10px] text-muted-foreground font-mono shrink-0">{ev.time}</span>
                <span className="text-[10px] font-medium text-right" style={{ color: ev.combined ? COMBINED_COLOR : ev.channel === 'magnetic' ? '#a78bfa' : '#22d3ee' }}>
                  {eventLabel(ev)}{ev.duration ? ` (${(ev.duration / 1000).toFixed(1)}s)` : ''}{ev.combined ? ' · both' : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={toggleTones}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg border font-heading text-[10px] uppercase tracking-wider transition-colors ${tonesOn ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20' : 'bg-card/30 border-border/40 text-muted-foreground hover:border-primary/30'}`}
        >
          {tonesOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />} Alert tones {tonesOn ? 'on' : 'off'}
        </button>

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
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Duration: {formatDuration(sessionDuration)}</span>
            <span className="flex items-center gap-1"><Compass className="w-3 h-3 text-violet-400" /> Magnetic: {events.filter((e) => e.channel === 'magnetic').length}</span>
            <span className="flex items-center gap-1"><Gauge className="w-3 h-3 text-cyan-400" /> Pressure: {events.filter((e) => e.channel === 'pressure').length}</span>
            <span className="flex items-center gap-1 text-foreground">Together: {events.filter((e) => e.combined).length}</span>
          </div>
        </div>

        {events.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            <p className="text-[10px] font-heading uppercase tracking-wider text-muted-foreground">Logged Departures</p>
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between px-2 py-1.5 rounded bg-card/30 border border-border/20 gap-2">
                <span className="text-[10px] text-muted-foreground font-mono shrink-0">{ev.time}</span>
                <span className="text-[10px] font-medium text-right" style={{ color: ev.combined ? COMBINED_COLOR : ev.channel === 'magnetic' ? '#a78bfa' : '#22d3ee' }}>
                  {eventLabel(ev)}{ev.duration ? ` for ${(ev.duration / 1000).toFixed(1)}s` : ''}{ev.combined ? ' · both sensors' : ''}
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
              {videoBlob.type.startsWith('audio') ? (
                <audio src={URL.createObjectURL(videoBlob)} controls className="w-full" />
              ) : (
                <video src={URL.createObjectURL(videoBlob)} controls className="w-full rounded" style={{ maxHeight: 180 }} />
              )}
            </div>
            <EvidenceSaveButtons onSave={saveSession} saving={saving} deviceBlob={videoBlob} devicePrefix="environment_monitor" />
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