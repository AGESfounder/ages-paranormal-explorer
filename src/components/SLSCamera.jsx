import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, CameraOff, Video } from 'lucide-react';

const JOINT_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // spine + head
  [2, 5], [5, 6], [6, 7],               // left arm
  [2, 8], [8, 9], [9, 10],              // right arm
  [3, 11], [11, 12], [12, 13],           // left leg
  [3, 14], [14, 15], [15, 16],           // right leg
];

// Normalized skeleton joint positions (0-1 range, relative to bounding box)
// 0=head, 1=neck, 2=shoulders_mid, 3=hips_mid, 4=ground, 5=l_shoulder, 6=l_elbow, 7=l_wrist,
// 8=r_shoulder, 9=r_elbow, 10=r_wrist, 11=l_hip, 12=l_knee, 13=l_ankle,
// 14=r_hip, 15=r_knee, 16=r_ankle
const BASE_SKELETON = [
  [0.5, 0.0],   // 0 head
  [0.5, 0.13],  // 1 neck
  [0.5, 0.25],  // 2 shoulders mid
  [0.5, 0.55],  // 3 hips mid
  [0.5, 1.0],   // 4 ground (unused)
  [0.35, 0.25], // 5 l_shoulder
  [0.22, 0.42], // 6 l_elbow
  [0.12, 0.58], // 7 l_wrist
  [0.65, 0.25], // 8 r_shoulder
  [0.78, 0.42], // 9 r_elbow
  [0.88, 0.58], // 10 r_wrist
  [0.40, 0.55], // 11 l_hip
  [0.38, 0.75], // 12 l_knee
  [0.36, 0.98], // 13 l_ankle
  [0.60, 0.55], // 14 r_hip
  [0.62, 0.75], // 15 r_knee
  [0.64, 0.98], // 16 r_ankle
];

function detectFigures(imageData, width, height) {
  const data = imageData.data;
  const regions = [];
  const visited = new Uint8Array(width * height);
  const SKIN_THRESHOLD = 1800; // minimum cluster pixel count

  // Simple skin/warm-tone detection in the video frame
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      // Detect warm tones (human skin / warm objects) — broad range to catch bodies
      const isSkin = r > 60 && g > 40 && b > 20 &&
        r > g && r > b &&
        (r - g) > 10 &&
        r < 255 && g < 230;

      if (isSkin && !visited[y / 4 * Math.floor(width / 4) + x / 4]) {
        // BFS flood fill to find connected region
        const queue = [[x, y]];
        let minX = x, maxX = x, minY = y, maxY = y;
        let pixelCount = 0;
        while (queue.length > 0) {
          const [cx, cy] = queue.shift();
          const vi = cy / 4 * Math.floor(width / 4) + cx / 4;
          if (visited[vi]) continue;
          visited[vi] = 1;
          pixelCount++;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          const neighbors = [[cx - 4, cy], [cx + 4, cy], [cx, cy - 4], [cx, cy + 4]];
          for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const ni = (ny * width + nx) * 4;
            const nr = data[ni], ng = data[ni + 1], nb = data[ni + 2];
            const nSkin = nr > 60 && ng > 40 && nb > 20 && nr > ng && nr > nb && (nr - ng) > 10 && nr < 255 && ng < 230;
            if (nSkin) queue.push([nx, ny]);
          }
        }
        if (pixelCount > SKIN_THRESHOLD) {
          const bw = maxX - minX;
          const bh = maxY - minY;
          // Human body aspect ratio filter: taller than wide, reasonable size
          if (bh > bw * 0.8 && bh > 40 && bw > 15) {
            regions.push({ x: minX, y: minY, w: bw, h: bh });
          }
        }
      }
    }
  }

  // Merge overlapping regions
  const merged = [];
  const used = new Set();
  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;
    let r = { ...regions[i] };
    for (let j = i + 1; j < regions.length; j++) {
      if (used.has(j)) continue;
      const a = r, b = regions[j];
      const overlap = !(a.x + a.w < b.x - 20 || b.x + b.w < a.x - 20 || a.y + a.h < b.y - 20 || b.y + b.h < a.y - 20);
      if (overlap) {
        const nx = Math.min(a.x, b.x);
        const ny = Math.min(a.y, b.y);
        r = { x: nx, y: ny, w: Math.max(a.x + a.w, b.x + b.w) - nx, h: Math.max(a.y + a.h, b.y + b.h) - ny };
        used.add(j);
      }
    }
    merged.push(r);
  }

  return merged;
}

export default function SLSCamera() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [figureCount, setFigureCount] = useState(0);
  const [anomalyDetected, setAnomalyDetected] = useState(false);
  const anomalyTimerRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setActive(false);
    setFigureCount(0);
    setAnomalyDetected(false);
  }, []);

  useEffect(() => () => {
    stopCamera();
    if (anomalyTimerRef.current) clearTimeout(anomalyTimerRef.current);
  }, [stopCamera]);

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setActive(true);
      processFrame();
    } catch (e) {
      setError('Camera access denied. Please allow camera permissions.');
    }
  };

  const processFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || !canvas || !overlay || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    canvas.width = w;
    canvas.height = h;
    overlay.width = w;
    overlay.height = h;

    const ctx = canvas.getContext('2d');
    const octx = overlay.getContext('2d');

    ctx.drawImage(video, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    const figures = detectFigures(imageData, w, h);

    // Render night-vision green tint on main canvas
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = d[i] * 0.2 + d[i + 1] * 0.6 + d[i + 2] * 0.2;
      d[i] = 0;
      d[i + 1] = Math.min(255, gray * 1.3);
      d[i + 2] = 0;
    }
    ctx.putImageData(imageData, 0, 0);

    // Overlay: draw IR scan grid
    octx.clearRect(0, 0, w, h);
    octx.strokeStyle = 'rgba(0, 255, 100, 0.06)';
    octx.lineWidth = 0.5;
    for (let x = 0; x < w; x += 20) {
      octx.beginPath(); octx.moveTo(x, 0); octx.lineTo(x, h); octx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      octx.beginPath(); octx.moveTo(0, y); octx.lineTo(w, y); octx.stroke();
    }

    // Draw stick figures over detected regions
    setFigureCount(figures.length);
    if (figures.length > 0 && !anomalyDetected) {
      setAnomalyDetected(true);
      if (anomalyTimerRef.current) clearTimeout(anomalyTimerRef.current);
      anomalyTimerRef.current = setTimeout(() => setAnomalyDetected(false), 3000);
    }

    figures.forEach(({ x, y, w: bw, h: bh }) => {
      // Scale skeleton joints into bounding box
      const joints = BASE_SKELETON.map(([jx, jy]) => [
        x + jx * bw,
        y + jy * bh,
      ]);

      // Draw bones
      octx.strokeStyle = 'rgba(0, 255, 200, 0.9)';
      octx.lineWidth = 2;
      JOINT_CONNECTIONS.forEach(([a, b]) => {
        octx.beginPath();
        octx.moveTo(joints[a][0], joints[a][1]);
        octx.lineTo(joints[b][0], joints[b][1]);
        octx.stroke();
      });

      // Draw joints
      joints.forEach(([jx, jy], idx) => {
        if (idx === 4) return; // skip ground
        octx.beginPath();
        octx.arc(jx, jy, idx === 0 ? 7 : 4, 0, Math.PI * 2);
        octx.fillStyle = idx === 0 ? 'rgba(0,255,150,1)' : 'rgba(0,220,255,0.9)';
        octx.fill();
      });

      // Label
      octx.fillStyle = 'rgba(0,255,150,0.9)';
      octx.font = 'bold 11px monospace';
      octx.fillText('FIGURE DETECTED', x, y - 8);
    });

    // Corner HUD
    octx.fillStyle = 'rgba(0, 255, 100, 0.7)';
    octx.font = '10px monospace';
    octx.fillText('SLS CAM · IR DEPTH SCAN', 8, 16);
    octx.fillText(`FIGURES: ${figures.length}`, 8, 30);
    const now = new Date();
    octx.fillText(now.toLocaleTimeString(), w - 72, 16);

    animFrameRef.current = requestAnimationFrame(processFrame);
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-lg overflow-hidden bg-black border border-green-500/30" style={{ aspectRatio: '4/3' }}>
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover opacity-0" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full object-cover" />

        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
            <Camera className="w-12 h-12 text-green-500/50" />
            <p className="text-xs text-green-500/70 font-mono">SLS CAMERA OFFLINE</p>
            {error && <p className="text-xs text-red-400 text-center px-4">{error}</p>}
          </div>
        )}

        {active && anomalyDetected && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded bg-red-500/80 animate-pulse">
            <p className="text-[10px] font-mono text-white font-bold">⚠ ANOMALY</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${active ? 'bg-green-400 animate-pulse' : 'bg-red-500/50'}`} />
          <span className="text-[10px] font-mono text-muted-foreground">{active ? `LIVE · ${figureCount} figure${figureCount !== 1 ? 's' : ''} detected` : 'STANDBY'}</span>
        </div>
        {active ? (
          <button onClick={stopCamera} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-heading text-[10px] uppercase tracking-wider hover:bg-red-500/20 transition-colors">
            <CameraOff className="w-3 h-3" /> Power Off
          </button>
        ) : (
          <button onClick={startCamera} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 font-heading text-[10px] uppercase tracking-wider hover:bg-green-500/20 transition-colors">
            <Video className="w-3 h-3" /> Activate
          </button>
        )}
      </div>

      <div className="p-2.5 rounded-lg bg-card/30 border border-border/30">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Structured Light Sensor maps humanoid shapes via IR depth analysis. Stick figures appear over detected figures — including entities invisible to the naked eye. Point at empty spaces for anomalous readings.
        </p>
      </div>
    </div>
  );
}