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
  const duration = 18; // seconds — drone frequencies are integer #cycles over
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

  // Dark tritone drone (A2 + D#2 — the "diabolus in musica") + sub-octave, with
  // a slow swell.
  const drone = [
    { f: 110, amp: 0.05 },   // 1980 cycles
    { f: 155, amp: 0.03 },   // 2790 cycles  (tritone above 110)
    { f: 220, amp: 0.02 },   // 3960 cycles  (octave for depth)
  ];
  const tremolo = 0.5; // Hz → 9 cycles over 18s

  // Haunting music-box phrase in A harmonic minor — slow, descending, with the
  // augmented-2nd (F–G#) colour, a tritone, and an unresolved ending.
  const melody = [
    { t: 0.4,  f: 220.00 },   // A3
    { t: 1.7,  f: 261.63 },   // C4
    { t: 3.0,  f: 329.63 },   // E4
    { t: 4.3,  f: 349.23 },   // F4
    { t: 5.6,  f: 329.63 },   // E4
    { t: 6.9,  f: 261.63 },   // C4
    { t: 8.2,  f: 220.00 },   // A3
    { t: 9.5,  f: 246.94 },   // B3   (minor 2nd)
    { t: 10.8, f: 220.00 },   // A3
    { t: 12.1, f: 349.23 },   // F4
    { t: 13.4, f: 311.13 },   // D#4  (tritone)
    { t: 14.7, f: 329.63 },   // E4
    { t: 16.0, f: 220.00 },   // A3   (ends open / unresolved)
  ];
  const bellAmp = 0.16;
  const harmAmp = 0.08;   // a fifth below — soft organ harmony
  const echoAmp = 0.07;   // octave below — depth
  const attack = 0.01;
  const bellDecay = 0.217;  // ~1.5s
  const harmDecay = 0.26;   // ~1.8s
  const echoDecay = 0.217;

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
      if (dt < 0 || dt > 2.2) continue;
      // Music-box bell: fundamental + 4 harmonics + a detuned partial for wobble.
      const e = env(dt, bellDecay);
      if (e > 0.0005) {
        const ph = 2 * Math.PI * n.f * t;
        s += bellAmp * e * (
          Math.sin(ph) + 0.4 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph) +
          0.15 * Math.sin(4 * ph) + 0.1 * Math.sin(5 * ph) +
          0.4 * Math.sin(2 * Math.PI * n.f * 1.004 * t)
        );
      }
      // Soft harmony a fifth below (open, medieval/haunting).
      const eh = env(dt, harmDecay);
      if (eh > 0.0005) s += harmAmp * eh * Math.sin(2 * Math.PI * (n.f / 1.498) * t);
      // Octave echo for depth.
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
            hauntedEnabled: s.hauntedMusic !== undefined ? s.hauntedMusic : true,
            hauntedVolume: s.hauntedMusicVolume !== undefined ? s.hauntedMusicVolume : 50,
          });
        }
      } catch {}
    }).catch(() => {});

    currentUrl = buildHauntedWavUrl();
    const audio = new Audio(currentUrl);
    audio._hauntedMusic = true; // don't let the play-patch acquire the busy bus against itself
    audio.loop = true;
    audio.preload = 'auto';
    currentAudio = audio;
    audioRef.current = audio;

    // Pause/play + volume in one place so the Settings toggle is obvious.
    const applyVolume = () => {
      const a = audioRef.current;
      if (!a) return;
      const { hauntedEnabled, hauntedVolume } = getMusicSettings();
      const shouldPlay = hauntedEnabled && !isAudioBusy() && !document.hidden;
      a.volume = shouldPlay ? (hauntedVolume / 100) * 0.9 : 0;
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
    // Safety net: keep the player's volume in sync with the live settings even
    // if a settings-change event is missed.
    const poll = setInterval(applyVolume, 400);

    return () => {
      unsubBusy && unsubBusy();
      unsubMusic && unsubMusic();
      clearInterval(poll);
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