import React, { useRef, useState, useEffect } from 'react';
import { Music } from 'lucide-react';

// Self-contained creepy ambient soundscape synthesized via the Web Audio API
// (no external file needed). Starts on user tap to satisfy autoplay policies.
export default function CreepyAmbience() {
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const eerieRef = useRef(null);

  const stop = () => {
    if (eerieRef.current) { clearInterval(eerieRef.current); eerieRef.current = null; }
    if (nodesRef.current) {
      nodesRef.current.oscs.forEach(o => { try { o.stop(); } catch { /* */ } });
    }
    if (ctxRef.current) { try { ctxRef.current.close(); } catch { /* */ } }
    ctxRef.current = null;
    nodesRef.current = null;
    setPlaying(false);
  };

  const start = () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 2.5);

    // Low drone: detuned sawtooths through a slowly-sweeping lowpass filter
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    droneGain.connect(filter);
    filter.connect(master);

    const oscs = [55, 55.6, 82.5].map(f => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(droneGain);
      o.start();
      return o;
    });

    // Slow LFO modulating the filter cutoff for an unsettled, breathing feel
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 70;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    oscs.push(lfo);

    nodesRef.current = { oscs, master };

    // Occasional eerie high tones
    eerieRef.current = setInterval(() => {
      const c = ctxRef.current;
      if (!c || !nodesRef.current) return;
      const o = c.createOscillator();
      o.type = 'sine';
      const baseFreqs = [440, 523, 659, 784, 880];
      o.frequency.value = baseFreqs[Math.floor(Math.random() * baseFreqs.length)] * (Math.random() * 0.2 + 0.9);
      const g = c.createGain();
      g.gain.value = 0;
      o.connect(g);
      g.connect(nodesRef.current.master);
      const t = c.currentTime;
      g.gain.linearRampToValueAtTime(0.05, t + 1.5);
      g.gain.linearRampToValueAtTime(0, t + 4.5);
      o.start(t);
      o.stop(t + 4.7);
    }, 6500);

    setPlaying(true);
  };

  const toggle = () => (playing ? stop() : start());

  useEffect(() => {
    start();
    const tryResume = () => {
      if (ctxRef.current && ctxRef.current.state === 'suspended') ctxRef.current.resume();
      setPlaying(true);
    };
    document.addEventListener('pointerdown', tryResume, { once: true });
    return () => { document.removeEventListener('pointerdown', tryResume); stop(); };
  }, []);

  return (
    <button
      onClick={toggle}
      className="fixed bottom-20 right-4 z-50 w-11 h-11 rounded-full bg-card/90 border border-border flex items-center justify-center backdrop-blur-md shadow-lg"
      title={playing ? 'Mute creepy ambience' : 'Play creepy ambience'}
    >
      <Music className={`w-5 h-5 ${playing ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
    </button>
  );
}