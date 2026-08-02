import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, CameraOff, Video, Save, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { detectFigures } from '@/lib/anomalyDetect';

export default function SLSCamera() {
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
  const anomalyTimerRef = useRef(null);

  const formatDuration = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
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

  const startCamera = async () => {
    setError('');
    setRecordedBlob(null);
    setRecordDuration(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setActive(true);
      processFrame();

      // Record from canvas (what's shown on screen) + audio from camera
      await new Promise(r => setTimeout(r, 300));
      const canvasStream = canvasRef.current.captureStream(30);
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) canvasStream.addTrack(audioTrack);

      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';
      const mr = new MediaRecorder(canvasStream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
        setRecordedBlob(blob);
        canvasStream.getTracks().forEach(t => t.stop());
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };
      mr.start(1000);
      setRecording(true);

      // Timer
      setRecordDuration(0);
      timerRef.current = setInterval(() => setRecordDuration(prev => prev + 1), 1000);
    } catch (e) {
      setError('Camera access denied. Please allow camera permissions.');
    }
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
    const figures = detectFigures(imageData, w, h);

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
            d[pi + 1] = Math.min(255, d[pi + 1] + 120);
            d[pi + 2] = 0;
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

    setFigureCount(figures.length);
    if (figures.length > 0 && !anomalyDetected) {
      setAnomalyDetected(true);
      if (anomalyTimerRef.current) clearTimeout(anomalyTimerRef.current);
      anomalyTimerRef.current = setTimeout(() => setAnomalyDetected(false), 3000);
    }

    // Bounding box + label for each detected figure
    figures.forEach(({ x, y, w: bw, h: bh }) => {
      ctx.strokeStyle = 'rgba(0, 255, 150, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, bw, bh);
      ctx.fillStyle = 'rgba(0,255,150,0.9)';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('ANOMALY DETECTED', x, y - 8);
    });

    ctx.fillStyle = 'rgba(0, 255, 100, 0.7)';
    ctx.font = '10px monospace';
    ctx.fillText('ANOMALY CAM · IR DEPTH SCAN', 8, 16);
    ctx.fillText(`FIGURES: ${figures.length}`, 8, 30);
    ctx.fillText(new Date().toLocaleTimeString(), w - 72, 16);

    animFrameRef.current = requestAnimationFrame(processFrame);
  };

  const saveRecording = async () => {
    if (!recordedBlob) return;
    setSaving(true);
    try {
      const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([recordedBlob], `anomaly_session.${ext}`, { type: recordedBlob.type });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const now = new Date();
      await base44.entities.Evidence.create({
        title: `Anomaly Camera Session ${now.toISOString().split('T')[0]}`,
        type: 'video',
        description: `Anomaly Camera session — ${formatDuration(recordDuration)} recorded.`,
        file_url,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().slice(0, 5),
      });
      setRecordedBlob(null);
      setRecordDuration(0);
    } catch (e) {
      console.error('Save failed', e);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-lg overflow-hidden bg-black border border-green-500/30" style={{ aspectRatio: '4/3' }}>
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover opacity-0" playsInline muted />
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

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${active ? 'bg-green-400 animate-pulse' : 'bg-red-500/50'}`} />
          <span className="text-[10px] font-mono text-muted-foreground">
            {active ? `LIVE · ${figureCount} figure${figureCount !== 1 ? 's' : ''} detected` : 'STANDBY'}
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

      {/* Post-session save controls */}
      {!active && recordedBlob && (
        <div className="space-y-2">
          <video src={URL.createObjectURL(recordedBlob)} controls className="w-full rounded border border-border/30" style={{ maxHeight: 160 }} />
          <button onClick={saveRecording} disabled={saving} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-heading text-xs uppercase tracking-wider hover:bg-green-500/20 transition-colors disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save to Evidence Journal'}
          </button>
          <button onClick={() => { setRecordedBlob(null); setRecordDuration(0); }} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border/40 text-muted-foreground font-heading text-xs uppercase tracking-wider hover:border-red-500/30 hover:text-red-400 transition-colors">
            <X className="w-3.5 h-3.5" /> Discard
          </button>
        </div>
      )}

      <div className="p-2.5 rounded-lg bg-card/30 border border-border/30">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          IR depth analysis maps humanoid shapes invisible to the naked eye. Session is recorded — save to your Evidence Journal when done.
        </p>
      </div>
    </div>
  );
}