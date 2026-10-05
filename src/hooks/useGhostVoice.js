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

  const numberToWords = (n) => {
    if (n === 0) return 'zero';
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const twoDigits = (num) => num < 20 ? ones[num] : tens[Math.floor(num / 10)] + (num % 10 > 0 ? '-' + ones[num % 10] : '');
    if (n < 100) return twoDigits(n);
    if (n < 1000) return ones[Math.floor(n / 100)] + ' hundred' + (n % 100 > 0 ? ' ' + twoDigits(n % 100) : '');
    if (n === 1000) return 'one thousand';
    // Years 1001-1999: read as "eighteen sixty-two" style
    if (n < 2000) {
      const firstTwo = Math.floor(n / 100);
      const lastTwo = n % 100;
      return lastTwo === 0 ? twoDigits(firstTwo) + ' hundred' : twoDigits(firstTwo) + ' ' + twoDigits(lastTwo);
    }
    if (n < 2100) {
      const r = n - 2000;
      return 'two thousand' + (r > 0 ? ' ' + twoDigits(r) : '');
    }
    if (n < 10000) {
      const thousands = Math.floor(n / 1000);
      const r = n % 1000;
      return twoDigits(thousands) + ' thousand' + (r > 0 ? ' ' + numberToWords(r) : '');
    }
    if (n < 1000000) {
      const thousands = Math.floor(n / 1000);
      const r = n % 1000;
      return numberToWords(thousands) + ' thousand' + (r > 0 ? ' ' + numberToWords(r) : '');
    }
    return String(n);
  };

  const sanitizeText = (text) => {
    let result = text.replace(/A\.G\.E\.S\.?/gi, 'Ages');
    // Strip web addresses so TTS doesn't spell them out character-by-character
    result = result.replace(/\bhttps?:\/\/[^\s]+/gi, '');
    result = result.replace(/\bwww\.[^\s]+/gi, '');
    result = result.replace(/\b[a-z0-9.-]+\.(?:com|org|net|edu|gov|io|co|us)\b(?:\/[^\s]*)?/gi, '');
    // Clean up leftover punctuation/spacing from removed URLs
    result = result.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
    // Remove commas from comma-separated numbers (e.g., "1,500" → "1500")
    result = result.replace(/(\d{1,3}(?:,\d{3})+)/g, (m) => m.replace(/,/g, ''));
    // Convert standalone numbers to words so TTS pronounces them correctly
    // (e.g., "150" → "one hundred fifty", "1862" → "eighteen sixty-two").
    // Decimal parts (3.5) and numbers adjacent to letters (10pm, 5th) are
    // left as-is since TTS handles those fine.
    result = result.replace(/(?<!\d\.)\b\d+\b(?!\.\d)/g, (match) => {
      const n = parseInt(match, 10);
      if (isNaN(n)) return match;
      return numberToWords(n);
    });
    return result;
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
          const gainNode = ctx.createGain();
          gainNode.gain.value = opts.volume || 1.0;
          sNode.connect(gainNode);
          gainNode.connect(ctx.destination);
          if (recordDestRef.current) gainNode.connect(recordDestRef.current);
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
      audio.volume = Math.min(1, opts.volume || 1.0);
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
    // Halt device-side speechSynthesis (device-voice test path) — the
    // server path never uses speechSynthesis so this is a no-op there.
    try { window.speechSynthesis?.cancel(); } catch {}
    stopEerieBackground();
    releaseNarration();
    setIsSpeaking(false);
    setIsGenerating(false);
  }, []);

  // Play a pre-generated TTS audio URL via Web Audio. Defined before narrate
  // to avoid a temporal-dead-zone reference in narrate's dependency array.
  const playPreGenerated = useCallback(async (url, opts = {}) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (srcRef.current) { try { srcRef.current.stop(); } catch {} srcRef.current = null; }
    stopEerieBackground();
    releaseNarration();
    // Clear any stuck state from a previous speak() attempt so the UI
    // reflects the new playback and the toggle (press-to-stop) works.
    setIsSpeaking(false);
    setIsGenerating(false);
    try {
      const ctx = audioCtxRef.current;
      if (ctx) { try { await ctx.resume(); } catch {} }
      if (!ctx || ctx.state !== 'running') {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.volume = Math.min(1, opts.volume || 1.0);
        if (opts.creepy) audio.playbackRate = 0.8;
        setIsSpeaking(true);
        return new Promise(resolve => {
          audio.onended = () => { setIsSpeaking(false); audioRef.current = null; resolve(); };
          audio.onerror = () => { setIsSpeaking(false); audioRef.current = null; resolve(); };
          audio.play().catch(() => { setIsSpeaking(false); resolve(); });
        });
      }
      const resp = await fetch(url);
      const ab = await resp.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(ab);
      const sNode = ctx.createBufferSource();
      sNode.buffer = audioBuf;
      if (opts.creepy) sNode.playbackRate.value = 0.8;
      const gainNode = ctx.createGain();
      gainNode.gain.value = opts.volume || 1.0;
      sNode.connect(gainNode);
      gainNode.connect(ctx.destination);
      if (recordDestRef.current) gainNode.connect(recordDestRef.current);
      srcRef.current = sNode;
      setIsSpeaking(true);
      acquireNarration();
      return new Promise(resolve => {
        sNode.onended = () => { setIsSpeaking(false); releaseNarration(); srcRef.current = null; resolve(); };
      });
    } catch (err) {
      setIsSpeaking(false);
      releaseNarration();
    }
  }, []);

  // Device-side TTS (browser speechSynthesis). Used only for the one-tour
  // device-narration test — no server GenerateSpeech call, no credit cost.
  // Prefers a male British-English voice, falling back to any English voice.
  const speakDevice = useCallback((text, opts = {}) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (srcRef.current) { try { srcRef.current.stop(); } catch {} srcRef.current = null; }
    stopEerieBackground();
    // Acquire the busy bus FIRST so HauntedMusic ducks immediately, before
    // any voice selection or synth.speak(). The old releaseNarration() here
    // briefly dropped busyCount to 0 — HauntedMusic saw "not busy" and called
    // audio.play(); the async play() promise then resolved AFTER the later
    // acquireNarration() had already run its duck, so the duck's pause()
    // missed (the element wasn't "playing" yet) and the music kept playing.
    acquireNarration();
    setIsSpeaking(false);
    setIsGenerating(true);
    try {
      const synth = window.speechSynthesis;
      if (!synth) { setIsGenerating(false); releaseNarration(); return; }
      synth.cancel();
      // Synchronous voice selection — on iOS, awaiting voices (even a
      // resolved promise) pushes synth.speak() past the user-gesture
      // window and the first tap is silently dropped. getVoices() returns
      // synchronously on iOS, so we pick from the immediate list and call
      // speak() in the same tick as the tap.
      const voices = synth.getVoices() || [];
      // 1. User-selected voice from the test-tour voice picker (localStorage)
      let savedVoice = null;
      try {
        const savedURI = localStorage.getItem('ages_device_voice_uri');
        if (savedURI) savedVoice = voices.find(v => v.voiceURI === savedURI);
      } catch {}
      // 2. Improved auto-selection (1a): score by quality (Enhanced/Premium),
      //    then language (en-GB > any en), then gender (male preferred).
      const voiceScore = (v) => {
        const name = (v.name || '').toLowerCase();
        const lang = (v.lang || '').toLowerCase();
        let s = 0;
        if (/enhanced|premium|neural|natural/.test(name)) s += 100;
        if (/en[-_]gb/.test(lang)) s += 50;
        else if (/^en/.test(lang)) s += 30;
        if (/male|daniel|arthur|george|oliver|david|mark|james|fred/.test(name)) s += 20;
        return s;
      };
      const voice = savedVoice || [...voices].sort((a, b) => voiceScore(b) - voiceScore(a))[0] || voices[0];
      // Read user tuning settings (rate/pitch/volume/echo) saved by the
      // DeviceVoicePicker. Falls back to defaults if not set.
      let savedSettings = { rate: 0.92, pitch: 0.9, volume: 1.0, echo: false };
      try {
        const raw = localStorage.getItem('ages_device_voice_settings');
        if (raw) savedSettings = { ...savedSettings, ...JSON.parse(raw) };
      } catch {}
      const effectiveRate = opts.rate != null ? opts.rate : savedSettings.rate;
      const effectivePitch = opts.pitch != null ? opts.pitch : savedSettings.pitch;
      const effectiveVolume = Math.min(1, opts.volume != null ? opts.volume : savedSettings.volume);
      const echoEnabled = false; // Ghostly Echo removed from DeviceVoicePicker
      const u = new SpeechSynthesisUtterance(sanitizeText(text));
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.rate = effectiveRate;
      u.pitch = effectivePitch;
      u.volume = effectiveVolume;
      setIsGenerating(false);
      setIsSpeaking(true);
      // acquireNarration() already called at the top of speakDevice.
      // Track whether speech actually started — Chrome desktop can fire onend
      // prematurely (before onstart) due to the cancel()→speak() race, which
      // would release the busy bus and un-duck the music before narration
      // begins. Only release when speech genuinely started and ended.
      let started = false;
      // echoDone gates the busy-bus release: when echo is on, the main
      // utterance's onend does NOT release — the echo's onend does. If echo
      // is off, echoDone starts true so the main onend releases directly.
      let echoDone = !echoEnabled;
      u.onstart = () => {
        started = true;
        // Ghostly echo: queue a quieter, lower-pitch trailing voice shortly
        // after the main narration starts. Creates a haunting layered effect.
        if (echoEnabled) {
          setTimeout(() => {
            try {
              const echo = new SpeechSynthesisUtterance(sanitizeText(text));
              if (voice) { echo.voice = voice; echo.lang = voice.lang; }
              echo.rate = effectiveRate * 0.8;
              echo.pitch = effectivePitch * 0.6;
              echo.volume = effectiveVolume * 0.35;
              echo.onend = () => {
                echoDone = true;
                setIsSpeaking(false); stopEerieBackground(); releaseNarration();
              };
              echo.onerror = (e) => {
                const code = e?.error || '';
                if (code === 'canceled' || code === 'interrupted') return;
                echoDone = true;
                setIsSpeaking(false); stopEerieBackground(); releaseNarration();
              };
              synth.speak(echo);
            } catch {
              echoDone = true;
              setIsSpeaking(false); stopEerieBackground(); releaseNarration();
            }
          }, 400);
        }
      };
      u.onend = () => {
        // If !started (premature onend), keep the busy bus acquired so the
        // music stays ducked — stop() will release it when the user taps Stop.
        if (!started) return;
        if (echoDone) {
          setIsSpeaking(false); stopEerieBackground(); releaseNarration();
        }
        // If echo is pending (echoDone = false), the echo's onend/onerror
        // will release. If the echo never fires (browser bug), the user can
        // tap Stop to release manually.
      };
      u.onerror = (e) => {
        // 'canceled'/'interrupted' fire from synth.cancel() or a new utterance
        // — stop() or the next speakDevice handles the release. Don't un-duck
        // the music on these benign errors.
        const code = e?.error || '';
        if (code === 'canceled' || code === 'interrupted') return;
        echoDone = true;
        setIsSpeaking(false); stopEerieBackground(); releaseNarration();
      };
      startEerieBackground(); // mirror the server path so chimes play under narration
      synth.speak(u);
    } catch (e) {
      setIsGenerating(false);
      setIsSpeaking(false);
      stopEerieBackground();
      releaseNarration();
    }
  }, []);

  const narrate = useCallback((text, opts = {}) => {
    // Device-voice test path: bypass server GenerateSpeech entirely.
    if (opts?.useDeviceVoice) {
      if (isSpeaking || isGenerating) { stop(); return; }
      speakDevice(text, opts);
      return;
    }
    // Pre-generated (offline) audio takes priority — playPreGenerated
    // handles stopping any current playback internally. The isSpeaking
    // check still allows the toggle (press again to stop) once the
    // playing state is tracked (set in playPreGenerated).
    if (opts?.preGenerated) {
      if (isSpeaking) {
        stop();
      } else {
        playPreGenerated(text, opts);
      }
    } else if (isSpeaking || isGenerating) {
      stop();
    } else {
      speak(text, opts);
    }
  }, [isSpeaking, isGenerating, speak, stop, playPreGenerated, speakDevice]);

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
        // Boost the mic level before the recording destination so the
        // captured audio (ambient + acoustic TTS bleed) is hotter and
        // clearer on playback, especially on iOS where the raw feed is
        // otherwise quiet.
        const micGain = ctx.createGain();
        micGain.gain.value = 2.0;
        micSrc.connect(micGain);
        micGain.connect(recordDestRef.current);
      }
      return recordDestRef.current.stream.getAudioTracks()[0] || null;
    } catch { return null; }
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

  // Resume the AudioContext (e.g. after getUserMedia suspended it on iOS).
  const resumeContext = useCallback(async () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtxRef.current.state !== 'running') {
        await audioCtxRef.current.resume();
      }
      return audioCtxRef.current.state === 'running';
    } catch { return false; }
  }, []);

  return { isSpeaking, isGenerating, narrate, speak, playPreGenerated, playAudioBuffer, fetchAudioBuffer, resumeContext, stop, unlock, attachMicToRecording };
}