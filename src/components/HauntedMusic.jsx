import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import {
  onAudioBusyChange,
  onMusicSettingsChange,
  getMusicSettings,
  setMusicSettings,
  isAudioBusy,
} from '@/lib/hauntedAudio';

// Build a seamless-looping haunted ambient drone as a WAV blob URL and play it
// through a native <audio loop> element — the most reliable cross-browser way to
// play background audio (play() on a user tap always works). Ducks to silence
// while narration or any recording is active. Volume follows Settings.

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function buildHauntedWavUrl() {
  const sampleRate = 22050;
  const duration = 6; // seconds — every frequency is an integer # of cycles over
                      // this duration, so the loop is click-free.
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
  // Partials (freq*duration all integer) + slow tremolo for an eerie swell.
  const partials = [
    { f: 130, amp: 0.42 },
    { f: 196, amp: 0.22 },
    { f: 261, amp: 0.13 },
    { f: 392, amp: 0.07 },
  ];
  const tremolo = 0.5; // Hz → 3 cycles over 6s
  let off = 44;
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    let s = 0;
    for (const p of partials) s += p.amp * Math.sin(2 * Math.PI * p.f * t);
    s *= 0.75 + 0.25 * Math.sin(2 * Math.PI * tremolo * t);
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

    const applyVolume = () => {
      if (!audioRef.current) return;
      const { enabled, volume } = getMusicSettings();
      const target = enabled && !isAudioBusy() ? (volume / 100) * 0.6 : 0;
      audioRef.current.volume = target;
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