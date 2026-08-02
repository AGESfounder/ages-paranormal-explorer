import { useState, useCallback, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { audioAcquire, audioRelease, getMusicSettings } from '@/lib/hauntedAudio';

export default function useGhostVoice() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const chimeIntervalRef = useRef(null);
  const gainRef = useRef(null);
  const audioCtxRef = useRef(null);
  const srcRef = useRef(null);
  const recordDestRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    return () => {
      stopEerieBackground();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (srcRef.current) { try { srcRef.current.stop(); } catch {} srcRef.current = null; }
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} audioCtxRef.current = null; }
    };
  }, []);

  const acquireNarration = () => { if (!busyRef.current) { audioAcquire(); busyRef.current = true; } };
  const releaseNarration = () => { if (busyRef.current) { audioRelease(); busyRef.current = false; } };

  const playChime = (ctx, masterGain) => {
    try {
      // Pentatonic bell frequencies for haunting chimes
      const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
      const freq = notes[Math.floor(Math.random() * notes.length)];

      // Main chime tone
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      oscGain.gain.setValueAtTime(0, ctx.currentTime);
      oscGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.05);
      oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      osc.connect(oscGain);
      oscGain.connect(masterGain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.5);

      // Subtle overtone for richness
      const osc2 = ctx.createOscillator();
      const osc2Gain = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 1.01; // slight detune
      osc2Gain.gain.setValueAtTime(0, ctx.currentTime);
      osc2Gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.03);
      osc2Gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      osc2.connect(osc2Gain);
      osc2Gain.connect(masterGain);
      osc2.start(ctx.currentTime);
      osc2.stop(ctx.currentTime + 1.2);
    } catch (e) {
      // ignore individual chime errors
    }
  };

  const startEerieBackground = () => {
    try {
      const { enabled, volume } = getMusicSettings();
      if (!enabled) return; // respect the Background Music toggle
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const masterGain = ctx.createGain();
      masterGain.gain.value = (volume / 100) * 0.6;
      masterGain.connect(ctx.destination);
      gainRef.current = masterGain;

      // Play chimes at random intervals
      const scheduleChime = () => {
        playChime(ctx, masterGain);
        const delay = 1200 + Math.random() * 2500;
        chimeIntervalRef.current = setTimeout(scheduleChime, delay);
      };
      // First chime after a short delay
      chimeIntervalRef.current = setTimeout(scheduleChime, 300);
    } catch (e) {
      // AudioContext unavailable
    }
  };

  const stopEerieBackground = () => {
    if (chimeIntervalRef.current) {
      clearTimeout(chimeIntervalRef.current);
      chimeIntervalRef.current = null;
    }
    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch (e) {}
      gainRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  };

  const sanitizeText = (text) => {
    return text.replace(/A\.G\.E\.S\.?/gi, 'Ages');
  };

  // Call within a user gesture (e.g. a button tap) to unlock Web Audio + HTML
  // audio playback so speech triggered later by non-gesture events (sensors)
  // can actually play on iOS.
  const unlock = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      audioCtxRef.current.resume();
      const ctx = audioCtxRef.current;
      try { if (!recordDestRef.current) recordDestRef.current = ctx.createMediaStreamDestination(); } catch {}
      const buf = ctx.createBuffer(1, 1, 8000);
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(ctx.destination);
      s.start();
    } catch {}
    try {
      const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      a._hauntedMusic = true; // silent unlock buffer — don't pause the ambience
      a.volume = 0;
      a.play().then(() => a.pause()).catch(() => {});
    } catch {}
  }, []);

  const speak = useCallback(async (text, opts = {}) => {
    // Stop any current playback so a new word can be spoken immediately
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    stopEerieBackground();
    releaseNarration();
    setIsSpeaking(false);
    setIsGenerating(true);
    try {
      const result = await base44.integrations.Core.GenerateSpeech({
        text: sanitizeText(text),
        voice: opts.voice || 'storm',
      });

      startEerieBackground();

      // Prefer Web Audio (unlocked via unlock()) so non-gesture-triggered
      // speech plays on iOS. Fall back to HTMLAudio if unavailable/blocked.
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === 'running') {
        try {
          const resp = await fetch(result.url);
          const ab = await resp.arrayBuffer();
          const audioBuf = await ctx.decodeAudioData(ab);
          if (srcRef.current) { try { srcRef.current.stop(); } catch {} }
          const sNode = ctx.createBufferSource();
          sNode.buffer = audioBuf;
          if (opts.creepy) sNode.playbackRate.value = 0.8;
          sNode.connect(ctx.destination);
          if (recordDestRef.current) sNode.connect(recordDestRef.current);
          srcRef.current = sNode;
          setIsGenerating(false);
          setIsSpeaking(true);
          acquireNarration();
          sNode.onended = () => { setIsSpeaking(false); stopEerieBackground(); releaseNarration(); srcRef.current = null; };
          sNode.start();
          return;
        } catch {}
      }

      const audio = new Audio(result.url);
      audioRef.current = audio;
      audio.volume = 1;
      // Creepy mode: slow + deepen the playback for a haunting delivery
      if (opts.creepy) {
        audio.playbackRate = 0.8;
      }
      setIsGenerating(false);
      setIsSpeaking(true);
      acquireNarration();

      audio.onended = () => {
        setIsSpeaking(false);
        stopEerieBackground();
        releaseNarration();
        audioRef.current = null;
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        stopEerieBackground();
        releaseNarration();
        audioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      setIsGenerating(false);
      setIsSpeaking(false);
      stopEerieBackground();
      releaseNarration();
    }
  }, [isSpeaking, isGenerating]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (srcRef.current) { try { srcRef.current.stop(); } catch {} srcRef.current = null; }
    stopEerieBackground();
    releaseNarration();
    setIsSpeaking(false);
    setIsGenerating(false);
  }, []);

  const narrate = useCallback((text, opts = {}) => {
    if (isSpeaking || isGenerating) {
      stop();
    } else {
      speak(text, opts);
    }
  }, [isSpeaking, isGenerating, speak, stop]);

  // Connect the mic into the same Web Audio destination that captures the
  // dictated speech, returning one audio track containing both — so the
  // recorded video includes the voiced terms, not just ambient sound.
  const attachMicToRecording = useCallback((micStream) => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return null;
      if (!recordDestRef.current) recordDestRef.current = ctx.createMediaStreamDestination();
      if (micStream) {
        const micSrc = ctx.createMediaStreamSource(micStream);
        micSrc.connect(recordDestRef.current);
      }
      return recordDestRef.current.stream.getAudioTracks()[0] || null;
    } catch { return null; }
  }, []);

  // Play a pre-generated TTS audio URL via Web Audio (so it's captured in the
  // recording and plays reliably on iOS). Returns a promise that resolves when
  // the audio ends. Does NOT set isSpeaking/isGenerating — callers manage their
  // own completion callbacks.
  const playPreGenerated = useCallback(async (url, opts = {}) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (srcRef.current) { try { srcRef.current.stop(); } catch {} srcRef.current = null; }
    stopEerieBackground();
    releaseNarration();
    try {
      const ctx = audioCtxRef.current;
      if (ctx) { try { await ctx.resume(); } catch {} }
      if (!ctx || ctx.state !== 'running') {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.volume = 1;
        if (opts.creepy) audio.playbackRate = 0.8;
        return new Promise(resolve => {
          audio.onended = () => { audioRef.current = null; resolve(); };
          audio.onerror = () => { audioRef.current = null; resolve(); };
          audio.play().catch(() => resolve());
        });
      }
      const resp = await fetch(url);
      const ab = await resp.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(ab);
      const sNode = ctx.createBufferSource();
      sNode.buffer = audioBuf;
      if (opts.creepy) sNode.playbackRate.value = 0.8;
      sNode.connect(ctx.destination);
      if (recordDestRef.current) sNode.connect(recordDestRef.current);
      srcRef.current = sNode;
      acquireNarration();
      return new Promise(resolve => {
        sNode.onended = () => { releaseNarration(); srcRef.current = null; resolve(); };
      });
    } catch (err) {
      releaseNarration();
    }
  }, []);

  // Fetch + decode an audio URL into an AudioBuffer for instant playback later.
  const fetchAudioBuffer = useCallback(async (url) => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return null;
      try { await ctx.resume(); } catch {}
      const resp = await fetch(url);
      const ab = await resp.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(ab);
      return audioBuf;
    } catch { return null; }
  }, []);

  // Play a pre-decoded AudioBuffer via Web Audio (captured in recording).
  // Returns a promise that resolves when the audio ends.
  const playAudioBuffer = useCallback(async (buffer, opts = {}) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (srcRef.current) { try { srcRef.current.stop(); } catch {} srcRef.current = null; }
    stopEerieBackground();
    releaseNarration();
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      try { await ctx.resume(); } catch {}
      if (ctx.state !== 'running') return;
      const sNode = ctx.createBufferSource();
      sNode.buffer = buffer;
      if (opts.creepy) sNode.playbackRate.value = 0.8;
      sNode.connect(ctx.destination);
      if (recordDestRef.current) sNode.connect(recordDestRef.current);
      srcRef.current = sNode;
      acquireNarration();
      return new Promise(resolve => {
        sNode.onended = () => { releaseNarration(); srcRef.current = null; resolve(); };
      });
    } catch (err) {
      releaseNarration();
    }
  }, []);

  return { isSpeaking, isGenerating, narrate, speak, playPreGenerated, playAudioBuffer, fetchAudioBuffer, stop, unlock, attachMicToRecording };
}