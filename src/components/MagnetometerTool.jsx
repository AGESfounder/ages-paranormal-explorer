import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Magnet, AlertTriangle } from 'lucide-react';

const MAX_HISTORY = 120;
const SPIKE_THRESHOLD = 8; // µT change considered a spike

export default function MagnetometerTool() {
  const canvasRef = useRef(null);
  const historyRef = useRef([]);
  const sensorRef = useRef(null);
  const animFrameRef = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState({ x: 0, y: 0, z: 0, magnitude: 0 });
  const [spike, setSpike] = useState(false);
  const spikeTimerRef = useRef(null);

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const history = historyRef.current;

    ctx.fillStyle = '#0a0f14';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(0,200,255,0.07)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const x = (w / 6) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }

    if (history.length < 2) return;

    const magnitudes = history.map(p => p.magnitude);
    const min = Math.min(...magnitudes);
    const max = Math.max(...magnitudes);
    const range = Math.max(max - min, 10);
    const pad = 8;

    // Draw magnitude line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,220,255,0.9)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0,220,255,0.5)';
    ctx.shadowBlur = 6;
    history.forEach((point, i) => {
      const x = (i / (MAX_HISTORY - 1)) * w;
      const y = h - pad - ((point.magnitude - min) / range) * (h - pad * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Fill under the curve
    ctx.lineTo((history.length - 1) / (MAX_HISTORY - 1) * w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,180,255,0.06)';
    ctx.fill();

    // Mark spikes
    for (let i = 1; i < history.length; i++) {
      const delta = Math.abs(history[i].magnitude - history[i - 1].magnitude);
      if (delta >= SPIKE_THRESHOLD) {
        const x = (i / (MAX_HISTORY - 1)) * w;
        const y = h - pad - ((history[i].magnitude - min) / range) * (h - pad * 2);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,80,80,0.9)';
        ctx.fill();
      }
    }

    // Labels
    ctx.fillStyle = 'rgba(0,220,255,0.5)';
    ctx.font = '9px monospace';
    ctx.fillText(`${max.toFixed(1)} µT`, 3, 12);
    ctx.fillText(`${min.toFixed(1)} µT`, 3, h - 3);
  }, []);

  useEffect(() => {
    if (!active) return;
    const loop = () => {
      drawGraph();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [active, drawGraph]);

  const startSensor = async () => {
    setError('');
    if (!window.Magnetometer) {
      // Fallback: DeviceOrientationEvent / DeviceMotionEvent
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); } catch (e) { /* ignore */ }
      }
      // Use DeviceOrientation alpha/beta/gamma as a proxy for magnetic heading if no Magnetometer API
      setError('Native Magnetometer API not available. Using orientation sensors as proxy.');
      const handler = (e) => {
        const x = e.alpha ?? 0;
        const y = e.beta ?? 0;
        const z = e.gamma ?? 0;
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const point = { x, y, z, magnitude };
        setCurrent(point);
        const prev = historyRef.current[historyRef.current.length - 1];
        if (prev && Math.abs(magnitude - prev.magnitude) >= SPIKE_THRESHOLD) {
          setSpike(true);
          if (spikeTimerRef.current) clearTimeout(spikeTimerRef.current);
          spikeTimerRef.current = setTimeout(() => setSpike(false), 2000);
        }
        historyRef.current = [...historyRef.current.slice(-MAX_HISTORY + 1), point];
      };
      window.addEventListener('deviceorientation', handler);
      sensorRef.current = { type: 'orientation', handler };
      setActive(true);
      return;
    }

    try {
      const sensor = new window.Magnetometer({ frequency: 10 });
      sensor.addEventListener('reading', () => {
        const x = sensor.x ?? 0;
        const y = sensor.y ?? 0;
        const z = sensor.z ?? 0;
        const magnitude = Math.sqrt(x * x + y * y + z * z);
        const point = { x, y, z, magnitude };
        setCurrent(point);
        const prev = historyRef.current[historyRef.current.length - 1];
        if (prev && Math.abs(magnitude - prev.magnitude) >= SPIKE_THRESHOLD) {
          setSpike(true);
          if (spikeTimerRef.current) clearTimeout(spikeTimerRef.current);
          spikeTimerRef.current = setTimeout(() => setSpike(false), 2000);
        }
        historyRef.current = [...historyRef.current.slice(-MAX_HISTORY + 1), point];
      });
      sensor.addEventListener('error', (e) => setError(e.error?.message || 'Sensor error'));
      sensor.start();
      sensorRef.current = { type: 'magnetometer', sensor };
      setActive(true);
    } catch (e) {
      setError('Magnetometer not supported on this device/browser.');
    }
  };

  const stopSensor = () => {
    if (sensorRef.current?.type === 'magnetometer') {
      sensorRef.current.sensor.stop();
    } else if (sensorRef.current?.type === 'orientation') {
      window.removeEventListener('deviceorientation', sensorRef.current.handler);
    }
    sensorRef.current = null;
    historyRef.current = [];
    setActive(false);
    setSpike(false);
    setCurrent({ x: 0, y: 0, z: 0, magnitude: 0 });
  };

  useEffect(() => () => { stopSensor(); if (spikeTimerRef.current) clearTimeout(spikeTimerRef.current); }, []);

  const getMagnitudeColor = (mag) => {
    if (mag > 80) return 'text-red-400';
    if (mag > 50) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getActivityLevel = (mag) => {
    if (mag > 80) return 'HIGH ANOMALY';
    if (mag > 50) return 'ELEVATED';
    if (mag > 20) return 'NORMAL';
    return 'LOW';
  };

  return (
    <div className="space-y-3">
      {/* Live readout */}
      <div className="p-3 rounded-lg bg-black/50 border border-cyan-500/20 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-cyan-400/70">EMF FIELD STRENGTH</span>
          {spike && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-red-400 animate-pulse">
              <AlertTriangle className="w-3 h-3" /> SPIKE
            </span>
          )}
        </div>
        <div className={`text-3xl font-mono font-bold text-center ${getMagnitudeColor(current.magnitude)}`}>
          {current.magnitude.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">µT</span>
        </div>
        <div className="text-center">
          <span className={`text-[10px] font-heading uppercase tracking-widest ${getMagnitudeColor(current.magnitude)}`}>
            {getActivityLevel(current.magnitude)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          {[['X', current.x], ['Y', current.y], ['Z', current.z]].map(([axis, val]) => (
            <div key={axis} className="text-center p-1.5 rounded bg-card/40 border border-border/30">
              <p className="text-[9px] text-muted-foreground font-mono">{axis}-axis</p>
              <p className="text-xs font-mono text-foreground">{Number(val).toFixed(1)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Graph */}
      <div className="rounded-lg overflow-hidden border border-cyan-500/20">
        <canvas ref={canvasRef} width={320} height={100} className="w-full" style={{ imageRendering: 'pixelated' }} />
      </div>
      <p className="text-[9px] text-muted-foreground/50 font-mono text-center -mt-1">MAGNETIC FIELD HISTORY · RED DOTS = SPIKES ≥ {SPIKE_THRESHOLD}µT</p>

      {error && (
        <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-[10px] text-yellow-400">{error}</p>
        </div>
      )}

      <button
        onClick={active ? stopSensor : startSensor}
        className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg font-heading text-xs uppercase tracking-wider transition-colors ${active ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20' : 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'}`}
      >
        <Magnet className="w-3.5 h-3.5" />
        {active ? 'Stop Sensor' : 'Activate Magnetometer'}
      </button>

      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
        Measures ambient magnetic field via device magnetometer. Sudden spikes may indicate electromagnetic anomalies. Baseline varies by location — watch for rapid changes.
      </p>
    </div>
  );
}