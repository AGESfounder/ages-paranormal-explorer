// Singleton Web Audio context shared across the app (ambient music + narration).
// On mobile (especially iOS) only ONE AudioContext can be "running" at a time;
// creating a second one suspends the first. Sharing a single context prevents
// the ambient-music and narration engines from fighting each other.

let sharedCtx = null;

export function getSharedAudioContext() {
  if (sharedCtx) return sharedCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    sharedCtx = new AC();
  } catch (e) {
    return null;
  }
  return sharedCtx;
}

export function resumeSharedAudioContext() {
  const ctx = getSharedAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try { ctx.resume().catch(() => {}); } catch (e) {}
  }
  return ctx;
}