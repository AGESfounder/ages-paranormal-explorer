import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import {
  onAudioBusyChange,
  onMusicSettingsChange,
  getMusicSettings,
  setMusicSettings,
  isAudioBusy,
} from '@/lib/hauntedAudio';

// Build a seamless-looping haunted music-box melody as a WAV blob URL and play
// it through a native <audio loop> element. Ducks (pauses) while narration or
// any recording is active. Volume follows Settings.

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function buildHauntedWavUrl() {
  const sampleRate = 22050;
  const duration = 14; // seconds — drone frequencies are integer #cycles over
                      // this duration so the loop is click-free.
  const total = sampleRate * duration;
  const numCh = 1;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = total * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Soft drone underneath (integer cycles over the loop for a seamless join).
  const drone = [
    { f: 110, amp: 0.06 },   // 1540 cycles
    { f: 165, amp: 0.03 },   // 2310 cycles
  ];
  const tremolo = 0.5; // Hz → 7 cycles over 14s

  // Haunting A-minor music-box phrase. Each note is a bell (fundamental + 2nd/3rd
  // harmonics) with an exponential decay, plus a quiet octave-below organ echo.
  const melody = [
    { t: 0.3,  f: 440.00 },   // A4
    { t: 1.5,  f: 523.25 },   // C5
    { t: 2.7,  f: 659.25 },   // E5
    { t: 3.9,  f: 587.33 },   // D5
    { t: 5.1,  f: 523.25 },   // C5
    { t: 6.3,  f: 440.00 },   // A4
    { t: 7.5,  f: 392.00 },   // G4
    { t: 8.7,  f: 440.00 },   // A4
    { t: 9.9,  f: 523.25 },   // C5
    { t: 11.1, f: 659.25 },   // E5
    { t: 12.3, f: 440.00 },   // A4
  ];
  const bellAmp = 0.22;
  const echoAmp = 0.10;
  const attack = 0.01;
  const bellDecay = 0.17;   // exp time const → ~1.2s to near-silence
  const echoDecay = 0.22;   // longer echo

  const env = (dt, decay) => {
    if (dt < 0) return 0;
    if (dt < attack) return dt / attack;
    return Math.exp(-(dt - attack) / decay);
  };

  let off = 44;
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    let s = 0;
    // Drone with slow tremolo.
    const tr = 0.8 + 0.2 * Math.sin(2 * Math.PI * tremolo * t);
    for (const d of drone) s += d.amp * Math.sin(2 * Math.PI * d.f * t) * tr;
    // Melody bells + octave echo.
    for (const n of melody) {
      const dt = t - n.t;
      if (dt < 0 || dt > 2.0) continue;
      const e = env(dt, bellDecay);
      if (e > 0.0005) {
        const ph = 2 * Math.PI * n.f * t;
        s += bellAmp * e * (Math.sin(ph) + 0.4 * Math.sin(2 * ph) + 0.2 * Math.sin(3 * ph));
      }
      const e2 = env(dt, echoDecay);
      if (e2 > 0.0005) s += echoAmp * e2 * Math.sin(2 * Math.PI * (n.f / 2) * t);
    }
    const v = Math.max(-1, Math.min(1, s));
    view.setInt16(off, v * 32767, true);
    off += 2;
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export default function HauntedMusic() {
  const audioRef = useRef(null);
  const urlRef = useRef(null);

  useEffect(() => {
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

    urlRef.current = buildHauntedWavUrl();
    const audio = new Audio(urlRef.current);
    audio.loop = true;
    audio.preload = 'auto';
    audioRef.current = audio;

    // Pause/play + volume in one place so the Settings toggle is obvious.
    const applyVolume = () => {
      const a = audioRef.current;
      if (!a) return;
      const { enabled, volume } = getMusicSettings();
      const shouldPlay = enabled && !isAudioBusy();
      a.volume = shouldPlay ? (volume / 100) * 0.6 : 0;
      if (shouldPlay && a.paused) a.play().catch(() => {});
      else if (!shouldPlay && !a.paused) a.pause();
    };

    // Browsers require a user gesture to start audio — play on first tap.
    const unlock = () => {
      if (!audioRef.current) return;
      audioRef.current.play().then(applyVolume).catch(() => {});
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchstart', unlock);
    window.addEventListener('keydown', unlock);

    const unsubBusy = onAudioBusyChange(applyVolume);
    const unsubMusic = onMusicSettingsChange(applyVolume);

    return () => {
      unsubBusy && unsubBusy();
      unsubMusic && unsubMusic();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    };
  }, []);

  return null;
}