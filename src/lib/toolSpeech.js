// Shared text-to-speech adapter for the investigation Tools (Alphabet
// Sweeper, Term Sweeper, Yes/No Sweeper).
//
// Platform paths:
//   - Android (native): @capacitor-community/text-to-speech v6 (MIT) over
//     android.speech.tts.TextToSpeech.
//   - iOS (native):     same plugin over AVSpeechSynthesizer.
//   - Web:              the browser's window.speechSynthesis (previous path).
//
// Voice gender is best-effort only: the OSes expose voice names but no
// reliable gender flag, so the female/male roles are matched by name
// heuristics and differentiated by pitch. When no role-matching voice exists
// the Tools gracefully fall back to any local English voice (then the engine
// default). Local (on-device) voices are preferred over network voices.

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

// ── Best-effort voice name heuristics (no gender guarantee) ────────────────
// Female names cover the iOS voices the Tools historically preferred plus a
// generic "female" hint for Android engine voice ids ("en-us-x-sfg#female_1-local").
const FEMALE_VOICE_RE = /samantha|karen|moira|tessa|fiona|serena|allison|ava|victoria|susan|kathy|zoe|female/i;
const MALE_VOICE_NAMES = ['Daniel', 'Alex', 'Oliver', 'Tom', 'Arthur', 'Ralph', 'Rocko', 'Aaron', 'Finn', 'Fred', 'Greg', 'Gordon', 'James', 'Joey', 'Juan', 'Kanya', 'Karl', 'Kenji', 'Lee', 'Mark', 'Matt', 'Nicky', 'Noah', 'Nora', 'Paul', 'Rishi', 'Tyler', 'Wayne'];
const MALE_VOICE_RE = /male|daniel|alex|fred|tom|david|mark|oliver|arthur|aaron|james|paul/i;

const isEnglish = (v) => /^en/i.test(v.lang || '');
const isEnUS = (v) => /^en[-_]US/i.test(v.lang || '');
const isEnGB = (v) => /^en[-_]GB/i.test(v.lang || '');

// Android reports the engine voice id in voiceURI while `name` is only the
// locale label ("English United States"), so match against both.
const voiceLabel = (v) => `${v.name || ''} ${v.voiceURI || ''}`;
const hasFemaleHint = (v) => FEMALE_VOICE_RE.test(voiceLabel(v));
const hasMaleHint = (v) => {
  const s = voiceLabel(v);
  // "female" contains "male" — exclude female-labelled voices explicitly.
  return MALE_VOICE_RE.test(s) && !/female/i.test(s);
};

/** Prefer on-device (localService) voices over network voices. */
function preferLocal(list) {
  const local = list.filter((v) => v.local);
  return local.length ? local : list;
}

function pickFemaleVoice(voices, maleVoice) {
  const enUS = preferLocal(voices.filter(isEnUS));
  const en = preferLocal(voices.filter(isEnglish));
  // Avoid landing on the same voice the male role picked — when the device
  // has no gender-coded voice, both roles would otherwise fall back to the
  // same first English voice and only pitch would differentiate them.
  const notMale = (v) =>
    !maleVoice ||
    (v.voiceURI && maleVoice.voiceURI && v.voiceURI !== maleVoice.voiceURI) ||
    v.index !== maleVoice.index;
  return (
    enUS.find((v) => hasFemaleHint(v) && notMale(v)) ||
    enUS.find(hasFemaleHint) ||
    en.find((v) => hasFemaleHint(v) && notMale(v)) ||
    en.find(hasFemaleHint) ||
    enUS.find(notMale) ||
    enUS[0] ||
    en.find(notMale) ||
    en[0] ||
    null
  );
}

function pickMaleVoice(voices) {
  const en = preferLocal(voices.filter(isEnglish));
  for (const name of MALE_VOICE_NAMES) {
    const match = en.find((v) => voiceLabel(v).toLowerCase().includes(name.toLowerCase()));
    if (match && !hasFemaleHint(match)) return match;
  }
  return (
    en.find(hasMaleHint) ||
    preferLocal(voices.filter(isEnGB)).find((v) => /daniel/i.test(voiceLabel(v))) ||
    en[0] ||
    null
  );
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

// Resolve both roles together so the female voice can be chosen as a
// *different* voice from the male voice (see pickFemaleVoice). Cached once a
// non-empty voice list is available.
async function resolveRoleVoices() {
  if (roleVoiceCache) return roleVoiceCache;
  const voices = await getToolVoices();
  if (!voices.length) return { male: null, female: null };
  const male = pickMaleVoice(voices);
  const female = pickFemaleVoice(voices, male);
  roleVoiceCache = { male, female };
  return roleVoiceCache;
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
    const voice = opts.role === 'male' ? male : female;
    const speakOpts = {
      text,
      lang: 'en-US',
      rate: opts.rate,
      pitch: opts.pitch,
      volume: opts.volume,
    };
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
    const voice = opts.role === 'male' ? male : female;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
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
 * @param {{ role?: 'female' | 'male', rate?: number, pitch?: number, volume?: number }} [opts]
 *   role selects the best-effort female (dictation) or male (trigger/lock)
 *   voice; pitch should still be set by the caller to differentiate roles.
 * @returns {Promise<'ended' | 'cancelled' | 'error'>} Always settles:
 *   'ended'     — speech finished naturally;
 *   'error'     — engine/playback failure (treat like 'ended' for flow);
 *   'cancelled' — stopToolSpeech() or a newer native speak superseded it.
 *   Callers must NOT treat 'cancelled' as completion (prevents stale session
 *   restarts).
 */
export function speakToolText(text, { role = 'female', rate = 1, pitch = 1, volume = 1 } = {}) {
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
      speakNative(spoken, { role, rate, pitch, volume }, gen, settle);
    } else {
      pending.add(entry);
      speakWeb(spoken, { role, rate, pitch, volume }, gen, settle);
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