// Shared text-to-speech adapter for the investigation Tools (Alphabet
// Sweeper, Term Sweeper, Yes/No Sweeper).
//
// Platform paths:
//   - Android (native): @capacitor-community/text-to-speech v6 (MIT) over
//     android.speech.tts.TextToSpeech.
//   - iOS (native):     same plugin over AVSpeechSynthesizer.
//   - Web:              the browser's window.speechSynthesis (previous path).
//
// Tools now speak in a single voice: callers pass the user's saved device
// narration voiceURI (see deviceVoicePrefs.js) to address that exact voice.
// The older 'female'/'male' role labels remain as a fallback (first two English
// voices in device order) for callers that only pass a role.

import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

/** True when running inside the Capacitor native shell (iOS/Android). */
export function isNativeToolSpeech() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True only in the native iOS shell — the engine that needs Add-queue speech. */
export function isIosNative() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

// ── Async voice enumeration ────────────────────────────────────────────────
/** @type {Array<{name: string, lang: string, local: boolean, voiceURI: string, index: number, webVoice: any}> | null} */
let voicesCache = null;
let voicesLoading = null;

async function loadNativeVoices() {
  // The Android TTS engine initializes asynchronously — getSupportedVoices
  // can reject or return empty until onInit fires, so retry briefly before
  // giving up (callers fall back to the engine default voice).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { voices } = await TextToSpeech.getSupportedVoices();
      if (voices && voices.length) {
        return voices.map((v, i) => ({
          name: v.name || '',
          lang: v.lang || '',
          local: v.localService !== false,
          voiceURI: v.voiceURI || '',
          index: i,
          webVoice: null,
        }));
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  return [];
}

function loadWebVoices() {
  const wrap = (list) =>
    (list || []).map((v, i) => ({
      name: v.name || '',
      lang: v.lang || '',
      local: v.localService !== false,
      voiceURI: v.voiceURI || '',
      index: i,
      webVoice: v,
    }));
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return Promise.resolve([]);
    const synth = window.speechSynthesis;
    const immediate = synth.getVoices();
    if (immediate && immediate.length) return Promise.resolve(wrap(immediate));
    // Browsers populate the voice list asynchronously via voiceschanged —
    // wait for it, but never block speech for more than 1.5s.
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try { synth.removeEventListener('voiceschanged', finish); } catch {}
        let list = [];
        try { list = synth.getVoices() || []; } catch {}
        resolve(wrap(list));
      };
      try { synth.addEventListener('voiceschanged', finish); } catch {}
      setTimeout(finish, 1500);
    });
  } catch {
    return Promise.resolve([]);
  }
}

/**
 * Enumerate the available TTS voices (normalized shape). Voice lists are
 * never assumed to be loaded synchronously; this is always async. Resolves to
 * an empty array when the platform provides none. Results are cached once a
 * non-empty list is known.
 */
export function getToolVoices({ refresh = false } = {}) {
  if (!refresh && voicesCache) return Promise.resolve(voicesCache);
  if (!refresh && voicesLoading) return voicesLoading;
  const loader = isNativeToolSpeech() ? loadNativeVoices() : loadWebVoices();
  voicesLoading = loader
    .then((voices) => {
      if (voices && voices.length) voicesCache = voices;
      voicesLoading = null;
      return voicesCache || voices || [];
    })
    .catch(() => {
      voicesLoading = null;
      return voicesCache || [];
    });
  return voicesLoading;
}

let roleVoiceCache = null;

// Prefer English voices so English words are read intelligibly. Many Android
// TTS engines list non-English voices (Swedish, German, …) ahead of English
// ones in their raw enumeration, so the old "first two voices" pick produced
// heavily accented speech. English voices are taken in device order to keep
// the white/rotation (voice 1) vs blue/trigger (voice 2) contrast; only fall
// back to the raw first two voices when no English voice exists. Role names
// remain compatibility labels (female = voice 1, male = voice 2).
async function resolveRoleVoices() {
  if (roleVoiceCache) return roleVoiceCache;
  const voices = await getToolVoices();
  if (!voices.length) return { male: null, female: null };
  const en = voices.filter((v) => typeof v.lang === 'string' && v.lang.toLowerCase().startsWith('en'));
  const pool = en.length ? en : voices;
  roleVoiceCache = { female: pool[0], male: pool[1] || pool[0] };
  return roleVoiceCache;
}

// The user's saved device-narration voice, addressed by its voiceURI. This is
// what lets the Tools use the voice the user actually chose instead of one of
// the two role slots. Native voices are addressed by their index into
// getSupportedVoices(); web voices carry the SpeechSynthesisVoice object.
async function resolveSavedVoice(voiceURI) {
  if (!voiceURI) return null;
  try {
    const voices = await getToolVoices();
    return voices.find((v) => v.voiceURI === voiceURI) || null;
  } catch {
    return null;
  }
}

// ── Speak / stop with a generation guard ───────────────────────────────────
// `generation` bumps on every stopToolSpeech(). A speak promise that settles
// after its generation was invalidated reports 'cancelled' — never 'ended' —
// so a stopped/unmounted Tool session cannot be restarted by a stale
// completion callback.
let generation = 0;
const pending = new Set(); // { gen, resolve }

function settleEntry(entry, result) {
  if (!pending.has(entry)) return;
  pending.delete(entry);
  entry.resolve(entry.gen !== generation && result === 'ended' ? 'cancelled' : result);
}

async function speakNative(text, opts, gen, settle) {
  try {
    const { male, female } = await resolveRoleVoices();
    if (gen !== generation) { settle('cancelled'); return; }
    // A saved voiceURI addresses that exact voice; the role pair is the fallback.
    const saved = await resolveSavedVoice(opts.voiceURI);
    if (gen !== generation) { settle('cancelled'); return; }
    const voice = saved || (opts.role === 'male' ? male : female);
    const speakOpts = {
      text,
      lang: voice?.lang || 'en-US',
      rate: opts.rate,
      pitch: opts.pitch,
      volume: opts.volume,
    };
    // iOS only: QUEUE_ADD (1). Every tool item is awaited before the next one is
    // queued, so nothing ever needs interrupting — and asking the iOS engine to
    // flush before each utterance is what silenced every item after the first.
    // Android keeps the default flush strategy, which its cadence relies on.
    if (isIosNative()) speakOpts.queueStrategy = 1;
    // The plugin selects voices by index into getSupportedVoices().
    if (voice && Number.isInteger(voice.index)) speakOpts.voice = voice.index;
    // Resolves when the utterance finishes (iOS also resolves on cancel;
    // Android never settles after stop() — handled by stopToolSpeech/flush).
    await TextToSpeech.speak(speakOpts);
    settle('ended');
  } catch {
    settle('error');
  }
}

async function speakWeb(text, opts, gen, settle) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) { settle('error'); return; }
    const synth = window.speechSynthesis;
    const { male, female } = await resolveRoleVoices();
    if (gen !== generation) { settle('cancelled'); return; }
    const saved = await resolveSavedVoice(opts.voiceURI);
    if (gen !== generation) { settle('cancelled'); return; }
    const voice = saved || (opts.role === 'male' ? male : female);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang || 'en-US';
    u.rate = opts.rate;
    u.pitch = opts.pitch;
    u.volume = opts.volume;
    if (voice && voice.webVoice) u.voice = voice.webVoice;
    u.onend = () => settle('ended');
    u.onerror = () => settle('error');
    synth.speak(u);
  } catch {
    settle('error');
  }
}

/**
 * Speak text for a Tool.
 *
 * @param {string} text
 * @param {{ voiceURI?: string | null, role?: 'female' | 'male', rate?: number, pitch?: number, volume?: number }} [opts]
 *   voiceURI addresses the user's saved device narration voice directly (the
 *   Sweeper tools pass it, via getDeviceVoiceOptions(), so every item is read
 *   in the voice the user set up). role is the fallback when no voiceURI
 *   matches: 'female' = first English voice in device order, 'male' = second.
 * @returns {Promise<'ended' | 'cancelled' | 'error'>} Always settles:
 *   'ended'     — speech finished naturally;
 *   'error'     — engine/playback failure (treat like 'ended' for flow);
 *   'cancelled' — stopToolSpeech() or a newer native speak superseded it.
 *   Callers must NOT treat 'cancelled' as completion (prevents stale session
 *   restarts).
 */
export function speakToolText(text, { voiceURI = null, role = 'female', rate = 1, pitch = 1, volume = 1 } = {}) {
  const gen = generation;
  const spoken = String(text ?? '');
  return new Promise((resolve) => {
    const entry = { gen, resolve };
    const settle = (result) => { clearTimeout(watchdog); settleEntry(entry, result); };
    // Watchdog: engines occasionally drop completion callbacks (WKWebView
    // speechSynthesis stalls, Android engine restarts). Generous on purpose —
    // the Tools' own per-utterance fallbacks fire far earlier; this only
    // guarantees the promise cannot hang forever.
    const watchdog = setTimeout(() => settleEntry(entry, 'error'), Math.max(30000, spoken.length * 250 + 10000));
    if (isNativeToolSpeech()) {
      // Native speak uses QUEUE_FLUSH: a new speak drops the in-flight
      // utterance (and Android then never settles its callback), so resolve
      // any previous pending speak as cancelled before starting this one.
      for (const prev of [...pending]) settleEntry(prev, 'cancelled');
      pending.add(entry);
      speakNative(spoken, { voiceURI, role, rate, pitch, volume }, gen, settle);
    } else {
      pending.add(entry);
      speakWeb(spoken, { voiceURI, role, rate, pitch, volume }, gen, settle);
    }
  });
}

/** Stop all Tool speech immediately and invalidate pending completions. */
export function stopToolSpeech() {
  generation++;
  for (const entry of [...pending]) settleEntry(entry, 'cancelled');
  if (isNativeToolSpeech()) {
    try { TextToSpeech.stop().catch(() => {}); } catch {}
  } else {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
  }
}

/**
 * Call inside the session-start tap gesture. Web: primes speechSynthesis
 * (iOS WKWebView requires speech to start within a user gesture) and warms
 * the voice list. Native: pre-loads the voice list so the first speak does
 * not wait on enumeration.
 */
export function primeToolSpeech() {
  try { getToolVoices(); } catch {}
  if (isNativeToolSpeech()) return;
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  } catch {}
}