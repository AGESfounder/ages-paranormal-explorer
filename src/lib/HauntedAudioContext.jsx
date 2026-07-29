import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

const HauntedAudioContext = createContext(null);
export const useHauntedAudio = () => useContext(HauntedAudioContext);

const DEFAULT_ENABLED = true;
const DEFAULT_VOLUME = 0.5;

// Procedural haunted ambient drone (Web Audio): low detuned oscillators, a slow
// swell LFO, and filtered wind noise. Loops forever, ducks while other audio or
// a recording is active, and is gated by the user's Background Music setting.
export function HauntedAudioProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [enabled, setEnabled] = useState(DEFAULT_ENABLED);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);

  const ctxRef = useRef(null);
  const masterRef = useRef(null);
  const duckRef = useRef(null);
  const builtRef = useRef(false);
  const mediaEls = useRef(new Set());
  const recCount = useRef(0);
  const voiceCount = useRef(0);
  const enabledRef = useRef(enabled);
  const volumeRef = useRef(volume);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  // Initialize enabled/volume from saved user settings
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    (async () => {
      try {
        const u = await base44.auth.me();
        if (!active || !u) return;
        const s = u.settings ? (typeof u.settings === 'string' ? JSON.parse(u.settings) : u.settings) : {};
        // Default ON for everyone until the user explicitly toggles it (backgroundMusicConfigured).
        setEnabled(s.backgroundMusicConfigured ? !!s.backgroundMusic : DEFAULT_ENABLED);
        setVolume(typeof s.musicVolume === 'number' ? s.musicVolume / 100 : DEFAULT_VOLUME);
      } catch {}
    })();
    return () => { active = false; };
  }, [isAuthenticated]);

  const recomputeDuck = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !duckRef.current) return;
    const ducked = mediaEls.current.size > 0 || recCount.current > 0 || voiceCount.current > 0;
    duckRef.current.gain.setTargetAtTime(ducked ? 0 : 1, ctx.currentTime, 0.4);
  }, []);

  const build = useCallback(() => {
    if (builtRef.current) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    const duck = ctx.createGain();
    duck.gain.value = 1;
    duck.connect(master);
    master.connect(ctx.destination);
    masterRef.current = master;
    duckRef.current = duck;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.connect(duck);

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.3;
    droneGain.connect(lp);
    [110, 130.8, 164.8].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.5 : 1;
      o.connect(g);
      g.connect(droneGain);
      o.start();
    });

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.05;
    lfo.connect(lfoG);
    lfoG.connect(droneGain.gain);
    lfo.start();

    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 0.6;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.012;
    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(duck);
    noise.start();
    const nlfo = ctx.createOscillator();
    nlfo.type = 'sine';
    nlfo.frequency.value = 0.08;
    const nlfoG = ctx.createGain();
    nlfoG.gain.value = 0.008;
    nlfo.connect(nlfoG);
    nlfoG.connect(nGain.gain);
    nlfo.start();

    builtRef.current = true;
    try { ctx.resume().catch(() => {}); } catch {}
    // Best-effort autoplay: retry shortly after load in case sticky activation arrives
    setTimeout(() => { try { ctxRef.current && ctxRef.current.resume().catch(() => {}); } catch {} }, 800);
  }, []);

  // Build the graph once enabled (plays for all visitors, logged in or not)
  useEffect(() => {
    if (enabled && !builtRef.current) build();
  }, [enabled, build]);

  // Resume the (suspended) context on the first user gesture and fade in
  useEffect(() => {
    const onGesture = () => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (masterRef.current && enabledRef.current) {
        masterRef.current.gain.setTargetAtTime(volumeRef.current, ctx.currentTime, 0.3);
      }
    };
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    window.addEventListener('touchstart', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      window.removeEventListener('touchstart', onGesture);
    };
  }, []);

  // Master gain follows enabled + volume (also after the graph is built)
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !masterRef.current) return;
    masterRef.current.gain.setTargetAtTime(enabled ? volume : 0, ctx.currentTime, 0.5);
  }, [isAuthenticated, enabled, volume]);

  // Ducking: media elements, MediaRecorder, ghost-voice narration
  useEffect(() => {
    const onPlay = (e) => {
      const el = e.target;
      if (el && (el.tagName === 'AUDIO' || el.tagName === 'VIDEO') && !el.muted && el.volume !== 0) {
        mediaEls.current.add(el);
        recomputeDuck();
      }
    };
    const onStop = (e) => {
      const el = e.target;
      if (el && (el.tagName === 'AUDIO' || el.tagName === 'VIDEO')) {
        mediaEls.current.delete(el);
        recomputeDuck();
      }
    };
    const onVoiceStart = () => { voiceCount.current += 1; recomputeDuck(); };
    const onVoiceStop = () => { voiceCount.current = Math.max(0, voiceCount.current - 1); recomputeDuck(); };

    document.addEventListener('play', onPlay, true);
    document.addEventListener('playing', onPlay, true);
    document.addEventListener('pause', onStop, true);
    document.addEventListener('ended', onStop, true);
    document.addEventListener('emptied', onStop, true);
    window.addEventListener('ages-audio-start', onVoiceStart);
    window.addEventListener('ages-audio-stop', onVoiceStop);

    const MR = window.MediaRecorder;
    if (MR && !MR.__agesPatched) {
      const origStart = MR.prototype.start;
      const origStop = MR.prototype.stop;
      MR.prototype.start = function (...a) {
        try { recCount.current += 1; recomputeDuck(); } catch {}
        return origStart.apply(this, a);
      };
      MR.prototype.stop = function (...a) {
        try { recCount.current = Math.max(0, recCount.current - 1); recomputeDuck(); } catch {}
        return origStop.apply(this, a);
      };
      MR.__agesPatched = true;
    }

    return () => {
      document.removeEventListener('play', onPlay, true);
      document.removeEventListener('playing', onPlay, true);
      document.removeEventListener('pause', onStop, true);
      document.removeEventListener('ended', onStop, true);
      document.removeEventListener('emptied', onStop, true);
      window.removeEventListener('ages-audio-start', onVoiceStart);
      window.removeEventListener('ages-audio-stop', onVoiceStop);
    };
  }, [recomputeDuck]);

  // Close context on unmount
  useEffect(() => () => {
    if (ctxRef.current) { try { ctxRef.current.close(); } catch {} }
  }, []);

  const setEnabledLive = useCallback((on) => setEnabled(!!on), []);
  const setVolumeLive = useCallback((v) => setVolume(Math.max(0, Math.min(1, v))), []);

  return (
    <HauntedAudioContext.Provider value={{ enabled, volume, setEnabledLive, setVolumeLive }}>
      {children}
    </HauntedAudioContext.Provider>
  );
}