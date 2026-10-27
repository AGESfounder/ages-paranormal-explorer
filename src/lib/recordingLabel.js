import { Capacitor } from '@capacitor/core';

// How a finished recording is declared to the rest of the app.
//
// Android's device save reads a recording's declared type to decide how to hand
// the file on, and the native step behind it expects the container name alone.
// A blob that declares its codecs ("video/webm;codecs=vp9,opus") is refused
// there, which is what stopped the Sweeper tools saving to a device while the
// camera tools — which declare "video/webm" — saved fine.
//
// iOS is deliberately unchanged: it keeps the declared type exactly as before.

export function isAndroidRecording() {
  try {
    return Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

// The type a finished recording should carry. Sources are tried in order: what
// the recorder reports it actually produced, then the chunks, then what was
// requested, then the container fallback for this path.
export function recordingBlobType({ recorderMime, chunkMime, requestedMime, fallback }) {
  const reported = recorderMime || chunkMime || requestedMime || fallback || '';
  if (!isAndroidRecording()) return reported;
  return String(reported).split(';')[0].trim() || fallback;
}