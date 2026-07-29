import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import {
  onAudioBusyChange,
  onMusicSettingsChange,
  getMusicSettings,
  setMusicSettings,
  isAudioBusy,
} from '@/lib/hauntedAudio';

// Generative haunted ambient soundscape (low drone + drifting wind + occasional
// eerie chimes) that loops forever. Ducks to silence while narration or any
// recording is active. Volume follows the Settings > Music Volume control.
export default function HauntedMusic() {
  const ctxRef = useRef(null);
  const masterRef = useRef(null);
  const chimeTimerRef = useRef(null);

  useEffect(() => {
    let unsubBusy;
    let unsubMusic;
    let unlocked = false;

    // Seed the live store from persisted user settings.
    base44.auth.me().then((u) => {
      try {
        const s = typeof u?.settings === 'string' ? JSON.parse(u.settings) : u?.settings;
        if (s && typeof s === 'object') {
          setMusicSettings({
            enabled: s.backgroundMusic !== undefined ? s.backgroundMusic : true,
            volume: s.musicVolume !== undefined ? s.musicVolume : 50,
          });
        }
      } catch {}
    }).catch(() => {});

    const buildSoundscape = (ctx, master) => {
      // Low drone — two detuned sines through a lowpass, with a slow swell LFO.
      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.12;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      lp.Q.value = 1;
      droneGain.connect(lp);
      lp.connect(master);
      const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.5;
      o1.connect(droneGain); o2.connect(droneGain);
      o1.start(); o2.start();
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.05;
      lfo.connect(lfoGain); lfoGain.connect(droneGain.gain); lfo.start();

      // Wind — looping filtered noise with a slowly sweeping cutoff.
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
      const windGain = ctx.createGain(); windGain.gain.value = 0.05;
      const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 600; bp.Q.value = 0.7;
      noise.connect(bp); bp.connect(windGain); windGain.connect(master);
      noise.start();
      const windLfo = ctx.createOscillator(); windLfo.type = 'sine'; windLfo.frequency.value = 0.03;
      const windLfoGain = ctx.createGain(); windLfoGain.gain.value = 250;
      windLfo.connect(windLfoGain); windLfoGain.connect(bp.frequency); windLfo.start();

      // Eerie chimes — soft pentatonic tones at random long intervals.
      const scheduleChime = () => {
        const notes = [261.63, 329.63, 392.0, 523.25, 587.33];
        const f = notes[Math.floor(Math.random() * notes.length)];
        try {
          const osc = ctx.createOscillator(); const g = ctx.createGain();
          osc.type = 'sine'; osc.frequency.value = f;
          g.gain.setValueAtTime(0, ctx.currentTime);
          g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + 2.2);
          osc.connect(g); g.connect(master);
          osc.start(); osc.stop(ctx.currentTime + 2.3);
        } catch {}
        chimeTimerRef.current = setTimeout(scheduleChime, 6000 + Math.random() * 12000);
      };
      chimeTimerRef.current = setTimeout(scheduleChime, 4000);
    };

    const ensureContext = () => {
      if (ctxRef.current) return ctxRef.current;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctxRef.current = ctx;
        const master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);
        masterRef.current = master;
        buildSoundscape(ctx, master);
        return ctx;
      } catch { return null; }
    };

    const applyGain = () => {
      if (!masterRef.current || !ctxRef.current) return;
      const { enabled, volume } = getMusicSettings();
      const target = enabled && !isAudioBusy() ? (volume / 100) * 0.3 : 0;
      try {
        masterRef.current.gain.cancelScheduledValues(ctxRef.current.currentTime);
        masterRef.current.gain.setTargetAtTime(target, ctxRef.current.currentTime, 0.4);
      } catch {}
    };

    // Browsers require a user gesture to start audio — resume on first interaction.
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      const ctx = ensureContext();
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume().then(applyGain).catch(() => {});
        else applyGain();
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchstart', unlock);
    window.addEventListener('keydown', unlock);

    unsubBusy = onAudioBusyChange(applyGain);
    unsubMusic = onMusicSettingsChange(applyGain);

    return () => {
      unsubBusy && unsubBusy();
      unsubMusic && unsubMusic();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
      if (chimeTimerRef.current) clearTimeout(chimeTimerRef.current);
      if (ctxRef.current) { try { ctxRef.current.close(); } catch {} ctxRef.current = null; masterRef.current = null; }
    };
  }, []);

  return null;
}