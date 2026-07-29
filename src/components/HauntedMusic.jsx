import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import {
  onAudioBusyChange,
  onMusicSettingsChange,
  getMusicSettings,
  setMusicSettings,
  isAudioBusy,
} from '@/lib/hauntedAudio';

// Module-level singleton: guarantees only one audio element ever exists, even
// across hot-reloads (a stale player from a previous mount is paused first).
let currentAudio = null;
let currentUrl = null;

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function buildHauntedWavUrl() {
  const sampleRate = 22050;
  const duration = 16; // seconds — drone frequencies are integer #cycles over
                      // this duration so the loop joins seamlessly.
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

  // Dark tritone drone (A2 + D#2 — the "diabolus in musica") with a slow swell.
  const drone = [
    { f: 110, amp: 0.06 },   // 1760 cycles
    { f: 155, amp: 0.035 },  // 2480 cycles  (tritone above 110)
  ];
  const tremolo = 0.5; // Hz → 8 cycles over 16s

  // Slow, descending, dissonant phrase in a low register — emphasises the
  // tritone (A–D#) and the minor 2nd, and ends unresolved for an uneasy feel.
  const melody = [
    { t: 0.5,  f: 220.00 },   // A3
    { t: 2.5,  f: 311.13 },   // D#4  (tritone)
    { t: 4.5,  f: 220.00 },   // A3
    { t: 6.5,  f: 246.94 },   // B3   (minor 2nd)
    { t: 8.5,  f: 311.13 },   // D#4  (tritone)
    { t: 10.5, f: 261.63 },   // C4   (minor 3rd)
    { t: 12.5, f: 220.00 },   // A3
    { t: 14.5, f: 311.13 },   // D#4  (ends on the tritone — unresolved)
  ];
  const bellAmp = 0.20;
  const echoAmp = 0.09;
  const attack = 0.01;
  const bellDecay = 0.20;   // ~1.4s to near-silence
  const echoDecay = 0.20;

  const env = (dt, decay) => {
    if (dt < 0) return 0;
    if (dt < attack) return dt / attack;
    return Math.exp(-(dt - attack) / decay);
  };

  let off = 44;
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    let s = 0;
    const tr = 0.8 + 0.2 * Math.sin(2 * Math.PI * tremolo * t);
    for (const d of drone) s += d.amp * Math.sin(2 * Math.PI * d.f * t) * tr;
    for (const n of melody) {
      const dt = t - n.t;
      if (dt < 0 || dt > 2.0) continue;
      const e = env(dt, bellDecay);
      if (e > 0.0005) {
        const ph = 2 * Math.PI * n.f * t;
        // Bell timbre + a slightly detuned partial for an uneasy wobble.
        s += bellAmp * e * (
          Math.sin(ph) + 0.3 * Math.sin(2 * ph) + 0.15 * Math.sin(3 * ph) + 0.5 * Math.sin(2 * Math.PI * n.f * 1.004 * t)
        );
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

  useEffect(() => {
    // Pause + discard any stale player left over from a previous mount/HMR.
    if (currentAudio) { try { currentAudio.pause(); } catch {} }
    if (currentUrl) { try { URL.revokeObjectURL(currentUrl); } catch {} }
    currentAudio = null;
    currentUrl = null;

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

    currentUrl = buildHauntedWavUrl();
    const audio = new Audio(currentUrl);
    audio.loop = true;
    audio.preload = 'auto';
    currentAudio = audio;
    audioRef.current = audio;

    // Pause/play + volume in one place so the Settings toggle is obvious.
    const applyVolume = () => {
      const a = audioRef.current;
      if (!a) return;
      const { enabled, volume } = getMusicSettings();
      const shouldPlay = enabled && !isAudioBusy() && !document.hidden;
      a.volume = shouldPlay ? (volume / 100) * 0.8 : 0;
      if (shouldPlay && a.paused) a.play().catch(() => {});
      else if (!shouldPlay && !a.paused) a.pause();
    };

    // Browsers require a user gesture to start audio — play on first tap.
    const unlock = () => {
      if (!audioRef.current) return;
      audioRef.current.play().then(applyVolume).catch(() => {});
    };
    // Stop playback when the app is backgrounded / closed.
    const onVisibility = () => {
      if (document.hidden) audioRef.current?.pause();
      else applyVolume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchstart', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);

    const unsubBusy = onAudioBusyChange(applyVolume);
    const unsubMusic = onMusicSettingsChange(applyVolume);

    return () => {
      unsubBusy && unsubBusy();
      unsubMusic && unsubMusic();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      if (currentAudio === audio) currentAudio = null;
      if (currentUrl) { try { URL.revokeObjectURL(currentUrl); } catch {} currentUrl = null; }
    };
  }, []);

  return null;
}