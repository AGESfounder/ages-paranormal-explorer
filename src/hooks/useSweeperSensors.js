import { useState, useRef, useCallback, useEffect } from 'react';
import { sensorSupport, startSensors, stopSensors, onSensorReading, onSensorError } from '@/lib/nativeSensors';
import {
  createEnvironmentTracker, magneticThreshold, pressureThreshold,
  SENSITIVITY, MOVEMENT_LIMIT,
} from '@/lib/environmentAnalysis';

// Shared 4-sensor trigger layer for the three Sweeper tools (Alphabet, Terms,
// Yes/No/IDK). Replaces the per-tool motion/orientation handlers with one
// unified model: motion (accelerometer), orientation (gyro), magnetic
// (magnetometer), barometric (barometer).
//
// HOLD-AND-FIRE: every sensor must sustain its departure for a beat before it
// fires — a single transient (a speaker cone vibrating from a loud noise) does
// not pass the hold, so it cannot fire a false lock. Motion/orientation hold
// briefly (a real move lasts longer than a jitter frame); magnetic/pressure hold
// longer (a real environmental departure holds, a flicker does not).
//
// BASELINE: magnetic and barometric are judged against the room's own measured
// rest level (via createEnvironmentTracker), never an absolute number — the
// phone's speaker magnet and local weather make a fixed threshold meaningless.
// The tracker calibrates from the first readings and reports departures once
// ready. The barometric channel is held silent while the phone is moving
// (pressure changes with height — a lifted phone reads as movement, not a room
// anomaly).
//
// ATTRIBUTION: when a sensor fires, every sensor that has confirmed within a
// short window is attributed to the same lock, so the tool can show correlated
// triggers (e.g. motion + magnetic) without false correlations — only sensors
// that genuinely held a departure are ever in the set.

const ACCEL_THRESHOLD = 0.8;
const ORIENT_THRESHOLD = 6;
const MOTION_HOLD_MS = 150;
const ORIENT_HOLD_MS = 150;
const MOTION_REARM_MS = 1000;
const MOTION_RELEASE_MS = 300;
const ENV_HOLD_MS = 500;
const ENV_RELEASE_MS = 700;
const ENV_REARM_MS = 2000;
const FLASH_MS = 3000;
const ATTRIBUTION_WINDOW_MS = 500;

const newChannel = () => ({ armed: true, since: 0, quietSince: 0, lastEvent: 0, peak: 0 });

// Pure hold-and-fire step for one channel. `fire` is passed in so this stays
// outside the hook body (no closure churn on re-render).
function stepChannel(chan, magnitude, threshold, now, holdMs, rearmMs, releaseMs, sensorId, fire) {
  if (magnitude > threshold) {
    if (!chan.since) chan.since = now;
    chan.quietSince = 0;
    chan.peak = Math.max(chan.peak, magnitude);
    if (chan.armed && now - chan.since >= holdMs && now - chan.lastEvent >= rearmMs) {
      chan.armed = false;
      chan.lastEvent = now;
      fire(sensorId);
    }
  } else {
    chan.since = 0;
    if (!chan.quietSince) chan.quietSince = now;
    if (now - chan.quietSince >= releaseMs) { chan.armed = true; chan.quietSince = 0; chan.peak = 0; }
  }
}

export default function useSweeperSensors({ onTrigger, setSensorError }) {
  const [availability, setAvailability] = useState({ motion: false, orientation: false, magnetic: false, barometric: false });
  const [sensorStates, setSensorStates] = useState({ motion: false, orientation: false, magnetic: false, barometric: false });

  const motionHandlerRef = useRef(null);
  const orientHandlerRef = useRef(null);
  const envUnsubRef = useRef(null);
  const envErrorUnsubRef = useRef(null);
  const baselineRef = useRef(9.8);
  const lastOrientRef = useRef(null);
  const motionChanRef = useRef(newChannel());
  const orientChanRef = useRef(newChannel());
  const envChannelsRef = useRef({ magnetic: newChannel(), pressure: newChannel() });
  const envTrackerRef = useRef(null);
  // Which environmental sensors the device actually has, from the support
  // probe. Defaults to "both" so calibration waits (rather than skipping) until
  // the probe resolves.
  const supportedEnvRef = useRef({ magnetic: true, pressure: true });
  const latestSensorRef = useRef({ magnetic: null, pressure: null, movement: 0 });
  const flashTimersRef = useRef({});
  const attributionRef = useRef(new Set());
  const attributionWindowRef = useRef(null);
  const onTriggerRef = useRef(onTrigger);
  const sensorStatesRef = useRef(sensorStates);
  const startedRef = useRef(false);
  const armedRef = useRef(false);

  useEffect(() => { onTriggerRef.current = onTrigger; }, [onTrigger]);
  useEffect(() => { sensorStatesRef.current = sensorStates; }, [sensorStates]);

  useEffect(() => () => {
    stopSensors();
    Object.values(flashTimersRef.current).forEach((t) => clearTimeout(t));
    if (attributionWindowRef.current) clearTimeout(attributionWindowRef.current);
  }, []);

  const flash = useCallback((sensorId) => {
    setSensorStates((prev) => ({ ...prev, [sensorId]: true }));
    sensorStatesRef.current = { ...sensorStatesRef.current, [sensorId]: true };
    if (flashTimersRef.current[sensorId]) clearTimeout(flashTimersRef.current[sensorId]);
    flashTimersRef.current[sensorId] = setTimeout(() => {
      setSensorStates((prev) => ({ ...prev, [sensorId]: false }));
      sensorStatesRef.current = { ...sensorStatesRef.current, [sensorId]: false };
    }, FLASH_MS);
  }, []);

  const fire = useCallback((sensorId) => {
    if (!armedRef.current) return;
    flash(sensorId);
    attributionRef.current.add(sensorId);
    if (attributionWindowRef.current) clearTimeout(attributionWindowRef.current);
    attributionWindowRef.current = setTimeout(() => {
      attributionRef.current.clear();
      attributionWindowRef.current = null;
    }, ATTRIBUTION_WINDOW_MS);
    onTriggerRef.current?.(sensorId);
  }, [flash]);

  const getActiveSensors = useCallback(() => Array.from(attributionRef.current), []);

  // ── Motion (accelerometer) — EMA baseline + hold-and-fire ──
  const handleMotion = useCallback((e) => {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
    const dev = Math.abs(mag - baselineRef.current);
    const now = Date.now();
    stepChannel(motionChanRef.current, dev, ACCEL_THRESHOLD, now, MOTION_HOLD_MS, MOTION_REARM_MS, MOTION_RELEASE_MS, 'motion', fire);
    baselineRef.current = baselineRef.current * 0.97 + mag * 0.03;
  }, [fire]);

  // ── Orientation (gyro) — last-value + hold-and-fire ──
  const handleOrient = useCallback((e) => {
    const cur = { a: e.alpha || 0, b: e.beta || 0, g: e.gamma || 0 };
    if (lastOrientRef.current == null) { lastOrientRef.current = cur; return; }
    const lo = lastOrientRef.current;
    const dev = Math.abs(cur.a - lo.a) > ORIENT_THRESHOLD || Math.abs(cur.b - lo.b) > ORIENT_THRESHOLD || Math.abs(cur.g - lo.g) > ORIENT_THRESHOLD ? 1 : 0;
    const now = Date.now();
    stepChannel(orientChanRef.current, dev, 0.5, now, ORIENT_HOLD_MS, MOTION_REARM_MS, MOTION_RELEASE_MS, 'orientation', fire);
    lastOrientRef.current = cur;
  }, [fire]);

  // ── Environmental (magnetic + barometric) — baseline + hold-and-fire + movement gate ──
  const handleSensorReading = useCallback((r) => {
    const s = latestSensorRef.current;
    if (r?.magnetic && Number.isFinite(r.magnetic.total)) s.magnetic = r.magnetic.total;
    if (Number.isFinite(r?.pressure)) s.pressure = r.pressure;
    s.movement = Number.isFinite(r?.movement) ? r.movement : 0;

    const tr = envTrackerRef.current;
    if (!tr) return;
    const now = Date.now();
    // Calibrate until EVERY supported channel has a trusted baseline. The
    // tracker's `calibrated` flag is an OR (either channel ready), which would
    // stop calibration as soon as the fast channel (pressure, 6 samples ~0.6s)
    // is ready — starving the slow channel (magnetic, 25 samples ~2.5s) so its
    // baseline never becomes trusted and it never triggers. Wait for both.
    const sup = supportedEnvRef.current;
    const magReady = !sup.magnetic || tr.has('magnetic');
    const presReady = !sup.pressure || tr.has('pressure');
    if (!magReady || !presReady) {
      tr.calibrate({ magnetic: s.magnetic, pressure: s.pressure });
      return;
    }
    const moving = (s.movement || 0) > MOVEMENT_LIMIT;
    const chans = envChannelsRef.current;
    const dev = tr.deviation(
      { magnetic: s.magnetic, pressure: s.pressure },
      { magnetic: chans.magnetic.since > 0, pressure: chans.pressure.since > 0 || moving },
    );
    if (Number.isFinite(dev.magnetic)) {
      stepChannel(chans.magnetic, Math.abs(dev.magnetic), magneticThreshold(dev.magSd, SENSITIVITY.normal), now, ENV_HOLD_MS, ENV_REARM_MS, ENV_RELEASE_MS, 'magnetic', fire);
    }
    // Pressure channel is held silent while the phone moves — a phone being
    // lifted reads as movement, not a room pressure anomaly.
    if (Number.isFinite(dev.pressure) && !moving) {
      stepChannel(chans.pressure, Math.abs(dev.pressure), pressureThreshold(dev.presSd, SENSITIVITY.normal), now, ENV_HOLD_MS, ENV_REARM_MS, ENV_RELEASE_MS, 'barometric', fire);
    }
  }, [fire]);

  const requestPermissions = async () => {
    const err = (msg) => setSensorError?.((prev) => (prev ? `${prev} ` : '') + msg);
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') {
          err('Motion sensor permission was denied. Lock-on-trigger needs movement detection — enable Motion & Orientation Access in your browser/Safari settings and reload.');
          return false;
        }
      } catch { /* desktop works without */ }
    }
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try { await DeviceOrientationEvent.requestPermission(); } catch {}
    }
    return true;
  };

  // Start: request permissions and begin native sensor calibration. Motion/
  // orientation listeners are NOT attached yet — call arm() after the device
  // has settled so tapping the permission prompt doesn't fire a false lock.
  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    armedRef.current = false;

    motionChanRef.current = newChannel();
    orientChanRef.current = newChannel();
    envChannelsRef.current = { magnetic: newChannel(), pressure: newChannel() };
    baselineRef.current = 9.8;
    lastOrientRef.current = null;
    envTrackerRef.current = createEnvironmentTracker();
    latestSensorRef.current = { magnetic: null, pressure: null, movement: 0 };
    attributionRef.current.clear();
    if (attributionWindowRef.current) { clearTimeout(attributionWindowRef.current); attributionWindowRef.current = null; }

    const permOk = await requestPermissions();
    setAvailability((prev) => ({ ...prev, motion: permOk, orientation: permOk }));

    // Start native environmental sensors so calibration begins during the settle.
    try {
      const support = await sensorSupport();
      supportedEnvRef.current = { magnetic: !!support.magnetometer, pressure: !!support.barometer };
      setAvailability((prev) => ({ ...prev, magnetic: support.magnetometer, barometric: support.barometer }));
      if (support.magnetometer || support.barometer) {
        envUnsubRef.current = onSensorReading(handleSensorReading);
        envErrorUnsubRef.current = onSensorError((failure) => {
          setAvailability((prev) => ({ ...prev, magnetic: false, barometric: false }));
          setSensorError?.((prev) => (prev ? `${prev} ` : '') + (failure?.category === 'permission'
            ? 'Motion sensor access was denied, so the magnetic and barometric triggers stopped — the other triggers still work.'
            : `The environmental sensors reported a fault${failure?.message ? `: ${failure.message}` : ''} — that trigger stopped; the others still work.`));
          if (envUnsubRef.current) { envUnsubRef.current(); envUnsubRef.current = null; }
          stopSensors();
        });
        await startSensors(10);
      }
    } catch {
      if (envUnsubRef.current) { envUnsubRef.current(); envUnsubRef.current = null; }
      if (envErrorUnsubRef.current) { envErrorUnsubRef.current(); envErrorUnsubRef.current = null; }
    }
  }, [handleSensorReading, setSensorError]);

  // Arm: attach motion/orientation and allow environmental channels to fire.
  const arm = useCallback(() => {
    armedRef.current = true;
    if (motionHandlerRef.current) window.removeEventListener('devicemotion', motionHandlerRef.current);
    if (orientHandlerRef.current) window.removeEventListener('deviceorientation', orientHandlerRef.current);
    window.addEventListener('devicemotion', handleMotion);
    window.addEventListener('deviceorientation', handleOrient);
    motionHandlerRef.current = handleMotion;
    orientHandlerRef.current = handleOrient;
  }, [handleMotion, handleOrient]);

  const stop = useCallback(() => {
    startedRef.current = false;
    armedRef.current = false;
    if (motionHandlerRef.current) { window.removeEventListener('devicemotion', motionHandlerRef.current); motionHandlerRef.current = null; }
    if (orientHandlerRef.current) { window.removeEventListener('deviceorientation', orientHandlerRef.current); orientHandlerRef.current = null; }
    if (envUnsubRef.current) { envUnsubRef.current(); envUnsubRef.current = null; }
    if (envErrorUnsubRef.current) { envErrorUnsubRef.current(); envErrorUnsubRef.current = null; }
    stopSensors();
    Object.values(flashTimersRef.current).forEach((t) => clearTimeout(t));
    flashTimersRef.current = {};
    if (attributionWindowRef.current) { clearTimeout(attributionWindowRef.current); attributionWindowRef.current = null; }
    attributionRef.current.clear();
    setSensorStates({ motion: false, orientation: false, magnetic: false, barometric: false });
    sensorStatesRef.current = { motion: false, orientation: false, magnetic: false, barometric: false };
  }, []);

  return { start, arm, stop, sensorStates, sensorStatesRef, availability, getActiveSensors };
}