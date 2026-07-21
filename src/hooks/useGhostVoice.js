import { useState, useCallback, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function useGhostVoice() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const chimeIntervalRef = useRef(null);
  const gainRef = useRef(null);

  useEffect(() => {
    return () => {
      stopEerieBackground();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
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
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  };

  const sanitizeText = (text) => {
    return text.replace(/A\.G\.E\.S\.?/gi, 'Ages');
  };

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
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        stopEerieBackground();
        audioRef.current = null;
      };

      await audio.play();
    } catch (err) {
      setIsGenerating(false);
      setIsSpeaking(false);
      stopEerieBackground();
    }
  }, [isSpeaking, isGenerating]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    stopEerieBackground();
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

  return { isSpeaking, isGenerating, narrate, speak, stop };
}