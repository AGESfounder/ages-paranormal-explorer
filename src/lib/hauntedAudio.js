// Global audio-coordination for the AGES haunted background music.
// 1) A "busy" bus: narration (useGhostVoice) and any MediaRecorder session
//    acquire/release the bus; the HauntedMusic player ducks to silence while
//    busy so it never competes with narration or recording.
// 2) A live in-memory store for the music enabled/volume settings, kept in sync
//    with the persisted user settings by the Settings page.

let busyCount = 0;
const busyListeners = new Set();

export function audioAcquire() {
  busyCount += 1;
  notifyBusy();
}
export function audioRelease() {
  busyCount = Math.max(0, busyCount - 1);
  notifyBusy();
}
export function isAudioBusy() {
  return busyCount > 0;
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

// Patch MediaRecorder so any recording session (EVP, radio sweep, SLS, REM,
// sweepers) signals the busy bus — the music ducks while recording.
if (typeof window !== 'undefined' && window.MediaRecorder && !window.MediaRecorder.__hauntedPatched) {
  const _start = window.MediaRecorder.prototype.start;
  const recording = new WeakSet();
  window.MediaRecorder.prototype.start = function (...args) {
    if (!recording.has(this)) {
      recording.add(this);
      try { audioAcquire(); } catch {}
      const releaseOnce = () => {
        if (recording.has(this)) {
          recording.delete(this);
          try { audioRelease(); } catch {}
        }
      };
      try { this.addEventListener('stop', releaseOnce, { once: true }); } catch {}
      try { this.addEventListener('error', releaseOnce, { once: true }); } catch {}
    }
    return _start.apply(this, args);
  };
  window.MediaRecorder.__hauntedPatched = true;
}

// Document-level capture listeners: any <audio>/<video> (e.g. an evidence
// recording played in the journal) signals the busy bus — the haunted ambience
// pauses while it plays and resumes when it stops. Using the capture phase
// catches native-controls play buttons that may bypass a prototype patch.
// The haunted player's own element is marked _hauntedMusic and skipped.
if (typeof window !== 'undefined' && !window.__hauntedMediaDelegated) {
  const playingMedia = new WeakSet();
  const onPlay = (e) => {
    const el = e.target;
    if (!el || el._hauntedMusic || !(el instanceof HTMLMediaElement)) return;
    if (!playingMedia.has(el)) {
      playingMedia.add(el);
      try { audioAcquire(); } catch {}
    }
  };
  const onStop = (e) => {
    const el = e.target;
    if (!el || el._hauntedMusic || !(el instanceof HTMLMediaElement)) return;
    if (playingMedia.has(el)) {
      playingMedia.delete(el);
      try { audioRelease(); } catch {}
    }
  };
  document.addEventListener('play', onPlay, true);
  document.addEventListener('pause', onStop, true);
  document.addEventListener('ended', onStop, true);
  document.addEventListener('error', onStop, true);
  window.__hauntedMediaDelegated = true;
}