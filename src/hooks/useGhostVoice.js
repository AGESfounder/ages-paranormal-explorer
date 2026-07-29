import { useState, useCallback, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { getSharedAudioContext } from '@/lib/sharedAudioContext';

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

  useEffect(() => {
    return () => {
      stopEerieBackground();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (srcRef.current) { try { srcRef.current.stop(); } catch {} srcRef.current = null; }
    };
  }, []);

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
      oscGain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
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
      osc2Gain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.03);
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
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      ctxRef.current = ctx;
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.20;
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
    ctxRef.current = null;
  };

  const sanitizeText = (text) => {
    return text.replace(/A\.G\.E\.S\.?/gi, 'Ages');
  };

  // Call within a user gesture (e.g. a button tap) to unlock Web Audio + HTML
  // audio playback so speech triggered later by non-gesture events (sensors)
  // can actually play on iOS.
  const unlock = useCallback(() => {
    try {
      const ctx = getSharedAudioContext();
      if (ctx) {
        audioCtxRef.current = ctx;
        ctx.resume();
        try { if (!recordDestRef.current) recordDestRef.current = ctx.createMediaStreamDestination(); } catch {}
        const buf = ctx.createBuffer(1, 1, 8000);
        const s = ctx.createBufferSource();
        s.buffer = buf;
        s.connect(ctx.destination);
        s.start();
      }
    } catch {}
    try {
      const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
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
          sNode.onended = () => { setIsSpeaking(false); stopEerieBackground(); srcRef.current = null; window.dispatchEvent(new CustomEvent('ages-audio-stop')); };
          sNode.start();
          window.dispatchEvent(new CustomEvent('ages-audio-start'));
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

      audio.onended = () => {
        setIsSpeaking(false);
        stopEerieBackground();
        audioRef.current = null;
        window.dispatchEvent(new CustomEvent('ages-audio-stop'));
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        stopEerieBackground();
        audioRef.current = null;
        window.dispatchEvent(new CustomEvent('ages-audio-stop'));
      };

      await audio.play();
      window.dispatchEvent(new CustomEvent('ages-audio-start'));
    } catch (err) {
      setIsGenerating(false);
      setIsSpeaking(false);
      stopEerieBackground();
      window.dispatchEvent(new CustomEvent('ages-audio-stop'));
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
    setIsSpeaking(false);
    setIsGenerating(false);
    window.dispatchEvent(new CustomEvent('ages-audio-stop'));
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

  return { isSpeaking, isGenerating, narrate, speak, stop, unlock, attachMicToRecording };
}