// Global audio-coordination for the AGES haunted background music.
// 1) A "busy" bus: narration (useGhostVoice) and any MediaRecorder session
//    acquire/release the bus; the HauntedMusic player ducks to silence while
//    busy so it never competes with narration or recording.
// 2) A live in-memory store for the music enabled/volume settings, kept in sync
//    with the persisted user settings by the Settings page.

// Duck holds are counted per owner rather than as one anonymous counter, so a
// hold whose owner no longer exists can be reconciled away instead of ducking
// the ambience forever:
//   narrationHolds — narration / tool speech (useGhostVoice)
//   liveRecorders  — MediaRecorder instances currently started
//   liveMedia      — playing <audio>/<video> elements
let narrationHolds = 0;
const liveRecorders = new Set();
const liveMedia = new Set();
const busyListeners = new Set();

export function audioAcquire() {
  narrationHolds += 1;
  notifyBusy();
}
export function audioRelease() {
  narrationHolds = Math.max(0, narrationHolds - 1);
  notifyBusy();
}
export function isAudioBusy() {
  return narrationHolds > 0 || liveRecorders.size > 0 || liveMedia.size > 0;
}
export function onAudioBusyChange(cb) {
  busyListeners.add(cb);
  cb(isAudioBusy());
  return () => busyListeners.delete(cb);
}
function notifyBusy() {
  const b = isAudioBusy();
  busyListeners.forEach((l) => l(b));
}

// Drop holds whose owner is gone: a recorder that never fired stop (it failed
// to start, or its stream was stopped without one) and a media element removed
// from the screen while playing. Without this, one lost hold left the ambience
// silenced for the rest of the app run. Safe to call at any time — the
// HauntedMusic player calls it on its existing poll, so the music always comes
// back on its own.
export function reconcileAudioBusy() {
  let changed = false;
  liveRecorders.forEach((r) => {
    if (!r || r.state === 'inactive') { liveRecorders.delete(r); changed = true; }
  });
  if (changed) notifyBusy();
}

// Playing media holds the bus, and that hold is re-derived from what is on
// screen instead of trusted from events: the phone reports a video as paused for
// an instant while it opens full screen, seeks or buffers, and acting on one
// such reading is what let the ambience come back underneath a video that was
// still playing. Only the element's own play event acquires a hold; this keeps
// the holds honest afterwards. Three consecutive stopped readings are treated as
// the video really stopping (~1.2s at the player's 400ms poll), so a single
// false reading cannot release anything. Called by the HauntedMusic player on
// that poll, so it is safe to call at any time.
const liveMediaMisses = new WeakMap();
export function syncLiveMediaBusy() {
  if (typeof document === 'undefined') return;
  const playing = new Set();
  document.querySelectorAll('audio, video').forEach((el) => {
    if (el._hauntedMusic || el.paused || el.ended || !el.isConnected) return;
    playing.add(el);
  });
  let changed = false;
  playing.forEach((el) => {
    if (!liveMedia.has(el)) { liveMedia.add(el); changed = true; }
  });
  liveMedia.forEach((el) => {
    if (!el.isConnected) { liveMediaMisses.delete(el); liveMedia.delete(el); changed = true; return; }
    if (playing.has(el)) { liveMediaMisses.delete(el); return; }
    const misses = (liveMediaMisses.get(el) || 0) + 1;
    if (misses < 3) { liveMediaMisses.set(el, misses); return; }
    liveMediaMisses.delete(el);
    liveMedia.delete(el);
    changed = true;
  });
  if (changed) notifyBusy();
}

let musicState = { enabled: true, volume: 50, hauntedEnabled: true, hauntedVolume: 50 };
const musicListeners = new Set();
export function getMusicSettings() {
  return musicState;
}
export function setMusicSettings(partial) {
  musicState = { ...musicState, ...partial };
  musicListeners.forEach((l) => l(musicState));
}
export function onMusicSettingsChange(cb) {
  musicListeners.add(cb);
  cb(musicState);
  return () => musicListeners.delete(cb);
}

// Playback health for validation / Settings diagnostics. Does not change product.
let playbackState = { status: 'idle', error: null, updatedAt: 0 };
const playbackListeners = new Set();
export function getHauntedPlaybackState() {
  return playbackState;
}
export function setHauntedPlaybackState(partial) {
  playbackState = { ...playbackState, ...partial, updatedAt: Date.now() };
  playbackListeners.forEach((l) => {
    try { l(playbackState); } catch {}
  });
}
export function onHauntedPlaybackStateChange(cb) {
  playbackListeners.add(cb);
  try { cb(playbackState); } catch {}
  return () => playbackListeners.delete(cb);
}

// Patch MediaRecorder so any recording session (EVP, radio sweep, SLS, REM,
// sweepers) signals the busy bus — the music ducks while recording.
if (typeof window !== 'undefined' && window.MediaRecorder && !window.MediaRecorder.__hauntedPatched) {
  const _start = window.MediaRecorder.prototype.start;
  window.MediaRecorder.prototype.start = function (...args) {
    // Start FIRST: if the recorder refuses to start (the flakiness these tools
    // hit on iOS), nothing is held, so a failed start can never leave the
    // ambience ducked with no stop event coming.
    const result = _start.apply(this, args);
    if (!liveRecorders.has(this)) {
      liveRecorders.add(this);
      try { notifyBusy(); } catch {}
      const releaseOnce = () => {
        if (liveRecorders.delete(this)) {
          try { notifyBusy(); } catch {}
        }
      };
      try { this.addEventListener('stop', releaseOnce, { once: true }); } catch {}
      try { this.addEventListener('error', releaseOnce, { once: true }); } catch {}
      // A stream stopped by the caller ends its tracks without necessarily
      // firing a stop event — release as soon as the audio track is gone.
      try {
        (this.stream?.getAudioTracks?.() || []).forEach((t) => t.addEventListener('ended', releaseOnce, { once: true }));
      } catch {}
    }
    return result;
  };
  window.MediaRecorder.__hauntedPatched = true;
}

// Document-level capture listeners: any <audio>/<video> (e.g. an evidence
// recording played in the journal) signals the busy bus — the haunted ambience
// pauses while it plays and resumes when it stops. Using the capture phase
// catches native-controls play buttons that may bypass a prototype patch.
// The haunted player's own element is marked _hauntedMusic and skipped.
//
// Only 'play' acquires a hold here, and 'ended' releases one: those are the two
// readings the phone reports reliably. Every other release is left to
// syncLiveMediaBusy()'s state check, because a pause event fires for an instant
// while a video is in fact still playing (opening full screen, seeking,
// buffering) and reacting to it brought the ambience back over the video.
if (typeof window !== 'undefined' && !window.__hauntedMediaDelegated) {
  const onPlay = (e) => {
    const el = e.target;
    if (!el || el._hauntedMusic || !(el instanceof HTMLMediaElement)) return;
    if (!liveMedia.has(el)) {
      liveMedia.add(el);
      try { notifyBusy(); } catch {}
    }
  };
  const onStop = (e) => {
    const el = e.target;
    if (!el || el._hauntedMusic || !(el instanceof HTMLMediaElement)) return;
    if (liveMedia.delete(el)) {
      try { notifyBusy(); } catch {}
    }
  };
  document.addEventListener('play', onPlay, true);
  document.addEventListener('ended', onStop, true);
  window.__hauntedMediaDelegated = true;
}