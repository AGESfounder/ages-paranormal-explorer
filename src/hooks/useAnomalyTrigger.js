import { useCallback, useEffect, useRef, useState } from 'react';
import { detectFigures } from '@/lib/anomalyDetect';
import { isTorchActive } from '@/hooks/useSensitivity';
import { enableTorch, disableTorch } from '@/lib/torchControl';
import { depthSupport, startDepthStream, stopDepthStream, onDepthFrame, onDepthError } from '@/lib/nativeDepth';
import { stampDepthFrame, liveDepthFigures } from '@/lib/depthFreshness';
import { movingFigureCount } from '@/lib/figureMotion';

// The anomaly trigger the three sweeper tools share: one figure detection, run on
// whichever camera method serves the phone best, feeding the tools' existing lock.
//
// WHICH METHOD. The depth sensor is the default wherever the phone carries one
// (LiDAR on iPhone, ARCore depth on supported Android): the phone's own body
// recognition confirms a person-shaped body standing in front of the surface behind
// it, so a lamp, a doorway, or a shifting shadow cannot be mistaken for a figure the
// way a contrast reading of the same scene can. Everywhere else — and any time the
// depth scan cannot start, or dies mid-session — the contrast scan runs, exactly the
// detection these tools used before.
//
// THE TORCH RULE. The darkest end of the brightness scale turns the phone's torch on.
// The depth module owns the camera for the whole session and cannot drive the torch,
// and a figure can only be confirmed with some light on it, so a torch setting keeps
// the contrast scan: it is the one trigger that works in a dark room. Drop the
// brightness below the torch band and the depth scan returns — the investigator's own
// choice is remembered, never overwritten by the rule.
//
// HOW A FIGURE IS READ. Depth figures arrive already confirmed and are held only
// while the sensor keeps reconfirming them, so a stalled sensor leaves nothing on
// screen (depthFreshness). A figure whose skeleton actually travels between frames is
// the stronger reading and is reported as moving on top of the detection — the same
// two tiers the standalone Anomaly Camera and SIEG use.
const STORAGE_KEY = 'ages_anomaly_trigger'; // 'depth' | 'contrast'; absent = never chosen
const DEPTH_FPS = 8;
const CONTRAST_FLASH_MS = 3000; // a contrast detection stays on screen this long
const FIGURE_TICK_MS = 250;     // how often the depth figure state is re-read

const readSaved = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'depth' || saved === 'contrast' ? saved : null;
  } catch {
    return null;
  }
};

const depthStartMessage = (e) => (
  e?.category === 'permission'
    ? 'Camera access was denied, so the depth scan could not start — using the Contrast Scan instead.'
    : e?.category === 'unsupported'
      ? 'This device cannot run the depth scan — using the Contrast Scan instead.'
      : e?.category === 'unavailable'
        ? 'The depth module did not respond in this build of the app — using the Contrast Scan instead.'
        : 'The depth scan could not start — using the Contrast Scan instead.'
);

export default function useAnomalyTrigger({ sensitivity, onFire, setSensorError }) {
  const [preference, setPreferenceState] = useState(readSaved);
  const [depthAvailable, setDepthAvailable] = useState(false);
  const [method, setMethod] = useState(null);         // what is running now
  const [lastMethod, setLastMethod] = useState(null); // what the last session ran
  const [active, setActive] = useState(false);
  const [moving, setMoving] = useState(false);

  const sensitivityRef = useRef(sensitivity);
  const onFireRef = useRef(onFire);
  const activeRef = useRef(false);
  const startedRef = useRef(false);
  const armedRef = useRef(false);      // scanning allowed (the tool's settle pause is over)

  const contrastStreamRef = useRef(null);
  const contrastVideoRef = useRef(null);
  const contrastCanvasRef = useRef(null);
  const contrastLoopRef = useRef(null);
  const flashTimerRef = useRef(null);

  const depthFrameRef = useRef(null);
  const depthUnsubRef = useRef(null);
  const depthErrorUnsubRef = useRef(null);
  const figureTickRef = useRef(null);
  const depthUpRef = useRef(false);

  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  useEffect(() => { onFireRef.current = onFire; }, [onFire]);

  // Whether this phone can run a depth scan at all, asked once per app run.
  useEffect(() => {
    let cancelled = false;
    depthSupport().then((result) => { if (!cancelled) setDepthAvailable(result.supported); });
    return () => { cancelled = true; };
  }, []);

  // The torch setting outranks the depth default (see THE TORCH RULE above).
  const torchOn = isTorchActive(sensitivity);
  const torchForcesContrast = depthAvailable && preference !== 'contrast' && torchOn;
  const mode = depthAvailable && preference !== 'contrast' && !torchOn ? 'depth' : 'contrast';

  const setActiveState = useCallback((value) => {
    if (activeRef.current === value) return;
    activeRef.current = value;
    setActive(value);
  }, []);

  // ── The camera-image scan ─────────────────────────────────────────────────
  const releaseContrast = useCallback(() => {
    if (contrastLoopRef.current) { cancelAnimationFrame(contrastLoopRef.current); contrastLoopRef.current = null; }
    if (flashTimerRef.current) { clearTimeout(flashTimerRef.current); flashTimerRef.current = null; }
    if (contrastStreamRef.current) {
      disableTorch(contrastStreamRef.current);
      contrastStreamRef.current.getTracks().forEach((t) => t.stop());
      contrastStreamRef.current = null;
    }
    const video = contrastVideoRef.current;
    if (video) {
      try { video.srcObject = null; } catch { /* already detached */ }
      try { video.remove(); } catch { /* never attached */ }
      contrastVideoRef.current = null;
    }
    contrastCanvasRef.current = null;
  }, []);

  const flashActive = useCallback(() => {
    setActiveState(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setActiveState(false), CONTRAST_FLASH_MS);
  }, [setActiveState]);

  // The camera image is read, never shown or recorded: the sweeper's own board is what
  // gets recorded, exactly as before.
  const processContrastFrame = useCallback(() => {
    const video = contrastVideoRef.current;
    const canvas = contrastCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      contrastLoopRef.current = requestAnimationFrame(processContrastFrame);
      return;
    }
    const w = video.videoWidth || 320;
    const h = video.videoHeight || 240;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    try {
      const figures = detectFigures(ctx.getImageData(0, 0, w, h), w, h, sensitivityRef.current);
      if (figures.length > 0 && armedRef.current) {
        flashActive();
        onFireRef.current?.({ method: 'contrast', moving: false, figures: figures.length });
      }
    } catch { /* an unreadable frame is a skipped frame */ }
    contrastLoopRef.current = requestAnimationFrame(processContrastFrame);
  }, [flashActive]);

  const startContrast = useCallback(async () => {
    if (contrastStreamRef.current) {
      setMethod('contrast');
      setLastMethod('contrast');
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 320 }, height: { ideal: 240 } },
          audio: false,
        });
        contrastStreamRef.current = stream;
        // Kept off-screen but in the document, the way these tools have always run it.
        const video = document.createElement('video');
        video.playsInline = true;
        video.muted = true;
        video.defaultMuted = true;
        video.style.display = 'none';
        document.body.appendChild(video);
        video.srcObject = stream;
        await video.play().catch(() => {});
        contrastVideoRef.current = video;
        contrastCanvasRef.current = document.createElement('canvas');
        setMethod('contrast');
        setLastMethod('contrast');
        if (isTorchActive(sensitivityRef.current)) {
          const ok = await enableTorch(stream);
          if (!ok) setSensorError?.((prev) => `${prev ? `${prev} ` : ''}Torch not supported on this device — the anomaly trigger still works without it.`);
        }
      } catch {
        setSensorError?.((prev) => `${prev ? `${prev} ` : ''}Camera access denied — anomaly trigger disabled, but motion/orientation triggers still work.`);
        return false;
      }
    }
    if (armedRef.current && !contrastLoopRef.current) {
      contrastLoopRef.current = requestAnimationFrame(processContrastFrame);
    }
    return true;
  }, [processContrastFrame, setSensorError]);

  // ── The depth sensor ──────────────────────────────────────────────────────
  const releaseDepth = useCallback(() => {
    if (depthUnsubRef.current) { depthUnsubRef.current(); depthUnsubRef.current = null; }
    if (depthErrorUnsubRef.current) { depthErrorUnsubRef.current(); depthErrorUnsubRef.current = null; }
    if (figureTickRef.current) { clearInterval(figureTickRef.current); figureTickRef.current = null; }
    depthFrameRef.current = null;
    depthUpRef.current = false;
    stopDepthStream();
  }, []);

  const tickDepthFigures = useCallback(() => {
    const frame = depthFrameRef.current;
    const now = Date.now();
    const live = frame ? liveDepthFigures(frame, now) : [];
    setActiveState(live.length > 0);
    setMoving(live.length > 0 && movingFigureCount(live, now) > 0);
  }, [setActiveState]);

  const handleDepthFrame = useCallback((data) => {
    // The colourised depth image is not used here — a sweeper shows its own board, not
    // a camera view — so it is dropped and only the frame's figures are kept.
    const receivedAt = Date.now();
    const frame = stampDepthFrame({ ...data, image: undefined }, null, receivedAt, depthFrameRef.current);
    depthFrameRef.current = frame;
    const live = liveDepthFigures(frame, receivedAt);
    const movingCount = movingFigureCount(live, receivedAt);
    if (live.length > 0) {
      setActiveState(true);
      setMoving(movingCount > 0);
      if (armedRef.current) {
        onFireRef.current?.({ method: 'depth', moving: movingCount > 0, figures: live.length });
      }
    }
  }, [setActiveState]);

  const startDepth = useCallback(async () => {
    try {
      await startDepthStream(DEPTH_FPS);
    } catch (e) {
      setSensorError?.((prev) => `${prev ? `${prev} ` : ''}${depthStartMessage(e)}`);
      return false;
    }
    depthUpRef.current = true;
    depthFrameRef.current = null;
    setMethod('depth');
    setLastMethod('depth');
    depthUnsubRef.current = onDepthFrame(handleDepthFrame);
    depthErrorUnsubRef.current = onDepthError((failure) => {
      // The depth scan is gone mid-session: everything else keeps running, and the
      // contrast scan comes up in its place so the trigger is not simply lost.
      releaseDepth();
      setMethod(null);
      setSensorError?.((prev) => `${prev ? `${prev} ` : ''}${failure?.category === 'permission'
        ? 'The depth scan stopped — camera access was denied. Falling back to the Contrast Scan.'
        : 'The depth scan stopped. Falling back to the Contrast Scan.'}`);
      startContrast();
    });
    figureTickRef.current = setInterval(tickDepthFigures, FIGURE_TICK_MS);
    return true;
  }, [handleDepthFrame, releaseDepth, setSensorError, startContrast, tickDepthFigures]);

  // ── Session lifecycle ─────────────────────────────────────────────────────
  const stop = useCallback(() => {
    startedRef.current = false;
    armedRef.current = false;
    releaseDepth();
    releaseContrast();
    setMethod(null);
    setActiveState(false);
    setMoving(false);
  }, [releaseContrast, releaseDepth, setActiveState]);

  /**
   * Acquire the trigger. `scan: false` takes the camera and the permission prompt but
   * holds the scan until beginScan(), so a tool can let the device settle after the
   * last permission tap before anything can fire — the timing these tools already use.
   */
  const start = useCallback(async ({ scan = true } = {}) => {
    stop();
    startedRef.current = true;
    armedRef.current = !!scan;
    if (mode === 'depth' && await startDepth()) return 'depth';
    return (await startContrast()) ? 'contrast' : null;
  }, [mode, startContrast, startDepth, stop]);

  const beginScan = useCallback(() => {
    armedRef.current = true;
    if (startedRef.current && !depthUpRef.current && !contrastLoopRef.current) {
      contrastLoopRef.current = requestAnimationFrame(processContrastFrame);
    }
  }, [processContrastFrame]);

  const setPreference = useCallback((next) => {
    setPreferenceState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
  }, []);

  // A tool that unmounts mid-session must not leave a camera or a depth session open.
  useEffect(() => () => { releaseDepth(); releaseContrast(); }, [releaseContrast, releaseDepth]);

  return {
    mode,                 // the method this session uses
    method,               // what is running now, null when nothing is
    lastMethod,           // what the last session ran, for the evidence note
    preference,
    setPreference,
    depthAvailable,
    torchForcesContrast,
    active,               // an anomaly is on screen now
    activeRef,            // the same, for the recorded board
    moving,               // that anomaly is the movement-confirmed tier
    start,
    beginScan,
    stop,
  };
}