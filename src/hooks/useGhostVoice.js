import { useState, useCallback, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function useGhostVoice() {
  useEffect(() => {
    return () => {
      // cleanup on unmount
      oscillatorsRef.current.forEach(({ osc, lfo }) => {
        try { osc.stop(); lfo.stop(); } catch (e) {}
      });
      oscillatorsRef.current = [];
      if (gainRef.current) {
        try { gainRef.current.disconnect(); } catch (e) {}
        gainRef.current = null;
      }
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const audioRef = useRef(null);
  const ctxRef = useRef(null);
  const oscillatorsRef = useRef([]);
  const gainRef = useRef(null);

  const startEerieBackground = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.06;
      masterGain.connect(ctx.destination);
      gainRef.current = masterGain;

      // Haunting music-box drone: detuned sine waves with slow LFO wobble
      const frequencies = [196, 233, 277, 311, 370];
      const oscs = [];
      frequencies.forEach((freq) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        oscGain.gain.value = 0.10;

        // Slow detuning LFO for eerie wobble
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 0.25 + Math.random() * 0.3;
        lfoGain.gain.value = 2.5;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();

        osc.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start();
        oscs.push({ osc, lfo });
      });
      oscillatorsRef.current = oscs;
    } catch (e) {
      // AudioContext unavailable — skip background
    }
  };

  const stopEerieBackground = () => {
    oscillatorsRef.current.forEach(({ osc, lfo }) => {
      try { osc.stop(); lfo.stop(); } catch (e) {}
    });
    oscillatorsRef.current = [];
    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch (e) {}
      gainRef.current = null;
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  };

  const speak = useCallback(async (text) => {
    if (isSpeaking || isGenerating) return;
    setIsGenerating(true);
    try {
      const result = await base44.integrations.Core.GenerateSpeech({
        text,
        voice: 'storm',
      });

      startEerieBackground();

      const audio = new Audio(result.url);
      audioRef.current = audio;
      audio.volume = 1;
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

  const narrate = useCallback((text) => {
    if (isSpeaking || isGenerating) {
      stop();
    } else {
      speak(text);
    }
  }, [isSpeaking, isGenerating, speak, stop]);

  return { isSpeaking, isGenerating, narrate, stop };
}