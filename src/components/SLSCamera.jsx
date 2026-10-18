import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, CameraOff, Video, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { buildEvidenceContext } from '@/lib/evidenceContext';
import { useToolGpsSave } from '@/hooks/useToolGpsSave';
import EvidenceSaveButtons from './EvidenceSaveButtons';
import { detectFigures } from '@/lib/anomalyDetect';
import useSensitivity, { isTorchActive } from '../hooks/useSensitivity';
import { enableTorch, disableTorch } from '@/lib/torchControl';
import SensitivityControl from './SensitivityControl';
import AnomalyModePicker from './AnomalyModePicker';
import { drawDepthFrame } from '@/lib/depthFrame';
import { depthSupport, startDepthStream, stopDepthStream, onDepthFrame, onDepthError } from '@/lib/nativeDepth';
import useDepthDetection from '@/hooks/useDepthDetection';
import DepthSensitivityControl from './DepthSensitivityControl';
import { toast } from '@/components/ui/use-toast';
import AnomalyCameraSource from '@/components/anomaly/AnomalyCameraSource';

export default function SLSCamera({ gateSave, refundSave }) {
  const { captureGpsForSave, gpsDialog, trackingOffDialog } = useToolGpsSave();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [figureCount, setFigureCount] = useState(0);
  const [anomalyDetected, setAnomalyDetected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const [saving, setSaving] = useState(false);
  // Which method the camera uses. The depth layer is only ever offered on a device
  // that actually has a depth sensor, so the tool is unchanged everywhere else.
  const [mode, setMode] = useState('contrast');
  const [depthAvailable, setDepthAvailable] = useState(false);
  const [centerDepth, setCenterDepth] = useState(null);
  const [depthHint, setDepthHint] = useState(null);
  const anomalyTimerRef = useRef(null);
  const depthUnsubRef = useRef(null);
  const depthErrorUnsubRef = useRef(null);
  const depthHintTimerRef = useRef(null);
  const depthTimeoutRef = useRef(null);
  const depthFrameRef = useRef(null);
  const depthAudioRef = useRef(null);

  const { sensitivity, setSensitivity, sensitivityRef } = useSensitivity();
  // The depth method's own two gates (stand-out distance, smallest figure), pushed
  // to the native module so a change applies to the next frame.
  const depthDetection = useDepthDetection();

  const formatDuration = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    // Turn off the torch before stopping the track (Torch mode).
    if (streamRef.current) disableTorch(streamRef.current);
    // A depth session runs on the native module rather than a web stream, so it is
    // released here as well.
    if (depthUnsubRef.current) { depthUnsubRef.current(); depthUnsubRef.current = null; }
    if (depthErrorUnsubRef.current) { depthErrorUnsubRef.current(); depthErrorUnsubRef.current = null; }
    if (depthHintTimerRef.current) { clearTimeout(depthHintTimerRef.current); depthHintTimerRef.current = null; }
    if (depthTimeoutRef.current) { clearTimeout(depthTimeoutRef.current); depthTimeoutRef.current = null; }
    depthFrameRef.current = null;
    setDepthHint(null);
    stopDepthStream();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setActive(false);
    setRecording(false);
    setFigureCount(0);
    setAnomalyDetected(false);
  }, []);

  useEffect(() => () => {
    stopCamera();
    if (anomalyTimerRef.current) clearTimeout(anomalyTimerRef.current);
  }, [stopCamera]);

  // Ask the native module once whether this device can do a depth scan at all.
  useEffect(() => {
    let cancelled = false;
    depthSupport().then((result) => { if (!cancelled) setDepthAvailable(result.supported); });
    return () => { cancelled = true; };
  }, []);

  // Recorder plumbing shared by both methods: whichever stream it is handed (the
  // on-screen canvas, or the raw camera feed where a canvas cannot be recorded),
  // it picks a supported format, collects the chunks and assembles the saved
  // evidence blob when the session stops. onFinish releases whatever that session
  // was holding — the camera stream, or the session's microphone.
  const startSessionRecorder = (recordStream, onFinish) => {
    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(recordStream, mimeType ? { mimeType } : {});
    mediaRecorderRef.current = mr;
    chunksRef.current = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      // Name the file after the format the recorder actually produced. It reports
      // its real container in .mimeType, so a device that silently used a
      // different one still saves under the right extension.
      const actualType = (mr.mimeType || mimeType || 'video/webm').split(';')[0];
      setRecordedBlob(new Blob(chunksRef.current, { type: actualType }));
      recordStream.getTracks().forEach(t => t.stop());
      if (onFinish) onFinish();
    };
    mr.start(1000);
    setRecording(true);
  };

  const startCamera = async () => {
    setError('');
    setRecordedBlob(null);
    setRecordDuration(0);
    if (mode === 'depth' && depthAvailable) { await startDepthCamera(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // Torch mode: turn on the phone's torch for the duration of the session.
      if (isTorchActive(sensitivityRef.current)) {
        const ok = await enableTorch(stream);
        if (!ok) setError('Torch not supported on this device — using Dark mode detection instead.');
      }

      setActive(true);
      processFrame();

      // Record from canvas (what's shown on screen) + audio from camera. A device
      // whose web view cannot capture a canvas is fed the live camera feed instead,
      // so a session there still saves a file — the raw feed, without the overlay.
      await new Promise(r => setTimeout(r, 300));
      const canvasCapture = !!canvasRef.current && typeof canvasRef.current.captureStream === 'function';
      const recordStream = canvasCapture ? canvasRef.current.captureStream(30) : new MediaStream();
      if (!canvasCapture) stream.getVideoTracks().forEach((t) => recordStream.addTrack(t));
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) recordStream.addTrack(audioTrack);

      startSessionRecorder(recordStream, () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      });

      // Timer
      setRecordDuration(0);
      timerRef.current = setInterval(() => setRecordDuration(prev => prev + 1), 1000);
    } catch (e) {
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Camera access denied. Allow camera and microphone permissions in your device settings, then try again.');
      } else if (name === 'NotFoundError') {
        setError('No camera was found on this device.');
      } else if (name === 'NotReadableError') {
        setError('Camera is in use by another app. Close other camera apps and try again.');
      } else if (name === 'NotSupportedError' || /MediaRecorder/i.test(String(e?.message || ''))) {
        setError('Live camera recording is not supported in this browser. Still-photo capture cannot replace session recording.');
      } else {
        setError('Could not start the camera. Please try again.');
      }
    }
  };

  // Depth session: the native module supplies the colourised depth image (LiDAR)
  // and the figures it confirmed. Frames are drawn onto the same canvas the contrast
  // method uses, so the recording and the Evidence save are unchanged — and the
  // saved file carries the depth image exactly as it looked on screen.
  const startDepthCamera = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 640;
    canvas.height = 480;
    depthFrameRef.current = null;

    // The failure listener goes up before the session starts, so an ARKit fault
    // at startup can never arrive unobserved. A fatal native error ends the
    // depth session: the message says what actually happened, and stopCamera
    // lands the session in the usual Stop & Save state — the recorder and the
    // native session never outlive a depth lane that has already failed.
    depthErrorUnsubRef.current = onDepthError((failure) => {
      setError(failure?.category === 'permission'
        ? 'The depth session stopped — camera access is denied. Allow camera access for the app in Settings, then start again.'
        : failure?.category === 'unsupported'
          ? 'The depth session stopped — this device or its current configuration cannot run a depth scan.'
          : `The depth session failed: ${failure?.message || 'the native depth session ended.'}`);
      stopCamera();
    });

    try {
      await startDepthStream(8);
    } catch (e) {
      if (depthErrorUnsubRef.current) { depthErrorUnsubRef.current(); depthErrorUnsubRef.current = null; }
      // Coded rejections: say which of the distinct failures actually happened
      // instead of a generic "could not start".
      setError(e?.category === 'permission'
        ? 'Camera access is denied. Allow camera access for the app in Settings, then try again.'
        : e?.category === 'unsupported'
          ? 'The depth module reports this device has no depth sensor, so a depth scan cannot run.'
          : e?.category === 'unavailable'
            ? 'The depth module did not respond in this build of the app — update the app and try again.'
            : 'The depth sensor could not start. Close other camera apps and try again.');
      return;
    }
    depthUnsubRef.current = onDepthFrame((data) => {
      const imageEl = new Image();
      imageEl.onload = () => { depthFrameRef.current = { ...data, imageEl }; };
      imageEl.src = data.image;
      setCenterDepth(data.centerDepth ?? null);
      setDepthHint(null);
    });

    setFigureCount(0);
    setActive(true);
    processDepthFrame();

    // The depth module owns the camera, so the session's own microphone is opened
    // separately and recorded alongside the canvas.
    let audioTrack = null;
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
      depthAudioRef.current = audioStream;
      audioTrack = audioStream.getAudioTracks()[0] || null;
    } catch { /* record the picture without sound */ }

    if (typeof canvas.captureStream === 'function') {
      const recordStream = canvas.captureStream(30);
      if (audioTrack) recordStream.addTrack(audioTrack);
      startSessionRecorder(recordStream, () => {
        if (depthAudioRef.current) {
          depthAudioRef.current.getTracks().forEach(t => t.stop());
          depthAudioRef.current = null;
        }
      });
    } else {
      setError('This device cannot record the on-screen depth view, so the session cannot be saved.');
    }

    setRecordDuration(0);
    timerRef.current = setInterval(() => setRecordDuration(prev => prev + 1), 1000);

    // The sensor needs a moment to build its map before the first trustworthy
    // reading (on a phone with no dedicated depth sensor the room has to be swept
    // first), and a session that never delivers a frame at all means depth is not
    // available. Both are said on screen rather than left as an empty view.
    depthHintTimerRef.current = setTimeout(() => {
      if (!depthFrameRef.current && depthUnsubRef.current) {
        setDepthHint('Building the depth map — slowly sweep the phone across the room.');
      }
    }, 2500);
    depthTimeoutRef.current = setTimeout(() => {
      if (!depthFrameRef.current && depthUnsubRef.current) {
        setError('The depth module is connected, but no depth readings are arriving — close other camera apps and try again.');
      }
    }, 12000);
  };

  const processDepthFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const frame = depthFrameRef.current;
    const count = frame?.figures?.length || 0;
    setFigureCount(count);
    if (count > 0 && !anomalyDetected) {
      setAnomalyDetected(true);
      if (anomalyTimerRef.current) clearTimeout(anomalyTimerRef.current);
      anomalyTimerRef.current = setTimeout(() => setAnomalyDetected(false), 3000);
    }
    drawDepthFrame(canvas.getContext('2d'), canvas, frame, { figureCount: count });
    animFrameRef.current = requestAnimationFrame(processDepthFrame);
  };

  const processFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w; canvas.height = h;

    const ctx = canvas.getContext('2d');

    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const figures = detectFigures(imageData, w, h, sensitivityRef.current);

    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = d[i] * 0.2 + d[i + 1] * 0.6 + d[i + 2] * 0.2;
      d[i] = 0; d[i + 1] = Math.min(255, gray * 1.3); d[i + 2] = 0;
    }

    // Light up detected figure shapes in bright green (actual shape & size)
    figures.forEach(({ pixels }) => {
      if (!pixels) return;
      for (const vi of pixels) {
        const cx = vi % w;
        const cy = Math.floor(vi / w);
        for (let dy = 0; dy < 4 && cy + dy < h; dy++) {
          for (let dx = 0; dx < 4 && cx + dx < w; dx++) {
            const pi = ((cy + dy) * w + (cx + dx)) * 4;
            d[pi] = 0;
            d[pi + 1] = 180;
            d[pi + 2] = 255;
          }
        }
      }
    });
    ctx.putImageData(imageData, 0, 0);

    // Overlay drawn directly on canvas so recording captures what's on screen
    ctx.strokeStyle = 'rgba(0, 255, 100, 0.06)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Bright blue outline tracing the edge of each detected shape. Every lit
    // pixel is drawn as a 4x4 block on a 4px grid, so a side is an outline edge
    // when the neighbouring grid block is not part of the shape. Stroked twice —
    // a wide soft halo under a solid bright line — so the outline stays visible
    // against the dim green image. Drawn on the canvas, so it records too.
    figures.forEach(({ pixels }) => {
      if (!pixels || !pixels.size) return;
      ctx.beginPath();
      for (const vi of pixels) {
        const cx = vi % w;
        const cy = Math.floor(vi / w);
        if (cx + 4 >= w || !pixels.has(vi + 4)) { ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 4, cy + 4); }
        if (cx - 4 < 0 || !pixels.has(vi - 4)) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 4); }
        if (cy - 4 < 0 || !pixels.has(vi - 4 * w)) { ctx.moveTo(cx, cy); ctx.lineTo(cx + 4, cy); }
        if (cy + 4 >= h || !pixels.has(vi + 4 * w)) { ctx.moveTo(cx, cy + 4); ctx.lineTo(cx + 4, cy + 4); }
      }
      ctx.strokeStyle = 'rgba(51, 224, 255, 0.28)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#33e0ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });

    setFigureCount(figures.length);
    if (figures.length > 0 && !anomalyDetected) {
      setAnomalyDetected(true);
      if (anomalyTimerRef.current) clearTimeout(anomalyTimerRef.current);
      anomalyTimerRef.current = setTimeout(() => setAnomalyDetected(false), 3000);
    }

    // Bounding box + label for each detected figure
    figures.forEach(({ x, y, w: bw, h: bh }) => {
      ctx.strokeStyle = 'rgba(0, 180, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, bw, bh);
      ctx.fillStyle = 'rgba(0, 180, 255, 0.9)';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('ANOMALY DETECTED', x, y - 8);
    });

    ctx.fillStyle = 'rgba(0, 255, 100, 0.7)';
    ctx.font = '10px monospace';
    ctx.fillText('ANOMALY CAM · FIGURE SCAN', 8, 16);
    ctx.fillText(`FIGURES: ${figures.length}`, 8, 30);
    ctx.fillText(new Date().toLocaleTimeString(), w - 72, 16);

    animFrameRef.current = requestAnimationFrame(processFrame);
  };

  const saveRecording = async (isPrivate = true) => {
    if (!recordedBlob) return;
    setSaving(true);
    let gateSucceeded = false;
    try {
      // Upload and capture GPS BEFORE gating so a failed upload or cancelled
      // GPS flow does NOT consume a daily evidence save.
      const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([recordedBlob], `anomaly_session.${ext}`, { type: recordedBlob.type });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const now = new Date();
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
        title: `Anomaly Camera Session ${now.toISOString().split('T')[0]}`,
        type: recordedBlob.type.startsWith('audio') ? 'evp' : 'video',
        source_tool: 'sls',
        description: `Anomaly Camera session — ${formatDuration(recordDuration)} recorded.`,
        file_url,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().slice(0, 5),
        is_private: isPrivate,
        ...gpsResult,
        ...ctx,
      });
      setRecordedBlob(null);
      setRecordDuration(0);
    } catch (e) {
      if (gateSucceeded && refundSave) await refundSave();
      console.error('Save failed', e);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-lg overflow-hidden bg-black border border-green-500/30" style={{ aspectRatio: '4/3' }}>
        <AnomalyCameraSource videoRef={videoRef} />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
            <Camera className="w-12 h-12 text-green-500/50" />
            <p className="text-xs text-green-500/70 font-mono">ANOMALY CAMERA OFFLINE</p>
            {error && <p className="text-xs text-red-400 text-center px-4">{error}</p>}
          </div>
        )}

        {active && anomalyDetected && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded bg-red-500/80 animate-pulse">
            <p className="text-[10px] font-mono text-white font-bold">⚠ ANOMALY</p>
          </div>
        )}

        {active && recording && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/80">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[9px] text-white font-mono">REC {formatDuration(recordDuration)}</span>
          </div>
        )}
      </div>

      {!active && (
        <div className="space-y-3">
          <AnomalyModePicker mode={mode} onChange={setMode} depthAvailable={depthAvailable} />
          {mode === 'contrast' && (
            <SensitivityControl sensitivity={sensitivity} onChange={setSensitivity} />
          )}
          {mode === 'depth' && (
            <DepthSensitivityControl
              protrusion={depthDetection.protrusion}
              minSize={depthDetection.minSize}
              onChange={depthDetection.update}
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${active ? 'bg-green-400 animate-pulse' : 'bg-red-500/50'}`} />
          <span className="text-[10px] font-mono text-muted-foreground">
            {active
              ? mode === 'depth'
                ? `LIVE · ${figureCount} figure${figureCount !== 1 ? 's' : ''}${centerDepth ? ` · ${centerDepth.toFixed(1)} m centre` : ''}`
                : `LIVE · ${figureCount} figure${figureCount !== 1 ? 's' : ''} detected`
              : 'STANDBY'}
          </span>
        </div>
        {active ? (
          <button onClick={stopCamera} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-heading text-[10px] uppercase tracking-wider hover:bg-red-500/20 transition-colors">
            <CameraOff className="w-3 h-3" /> Stop & Save
          </button>
        ) : (
          <button onClick={startCamera} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-heading text-[10px] uppercase tracking-wider hover:bg-green-500/20 transition-colors">
            <Video className="w-3 h-3" /> Activate
          </button>
        )}
      </div>

      {depthHint && (
        <p className="text-[10px] text-amber-400/90 text-center px-2">{depthHint}</p>
      )}

      {/* Post-session save controls */}
      {!active && recordedBlob && (
        <div className="space-y-2">
          <video src={URL.createObjectURL(recordedBlob)} controls className="w-full rounded border border-border/30" style={{ maxHeight: 160 }} />
          <EvidenceSaveButtons onSave={saveRecording} saving={saving} />
          <button onClick={() => { setRecordedBlob(null); setRecordDuration(0); }} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-red-500/30 hover:text-red-400 transition-colors">
            <X className="w-3.5 h-3.5" /> Discard
          </button>
        </div>
      )}

      <div className="p-2.5 rounded-lg bg-card/30 border border-border/30">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {mode === 'depth'
            ? 'Depth analysis marks human figures only: the phone\'s own body recognition confirms a person-shaped body standing in front of the surface behind it, and only then is it outlined, with the skeleton it found drawn over it. Everything else the sensor sees stays as the room\'s own depth image, so furniture and doorways are never labelled. Both gates can be tuned above: how far a figure must stand out, and the smallest figure counted. The figure needs some light on it; the depth reading itself does not. Session is recorded — save to your Evidence Journal when done.'
            : 'The live camera image is scanned for human-shaped patches of skin-toned colour, and any it finds are outlined. It can only flag what the camera can actually see — no infrared or depth sensing. Session is recorded — save to your Evidence Journal when done.'}
        </p>
      </div>
      {gpsDialog}
      {trackingOffDialog}
    </div>
  );
}