import { Capacitor } from '@capacitor/core';

// One microphone request for every recording tool, defined once instead of
// copy-pasted into each one. The phone's own processing is switched off (no echo
// cancellation, no noise suppression) and auto gain stays on, so the recorded
// track carries the room as it actually sounds. These are the values every tool
// already used, so the request itself is unchanged — only its home is.
export const MIC_AUDIO_CONSTRAINTS = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: true,
});

// A fresh object per call, so no caller can alter the shared settings.
export function micAudioConstraints() {
  return { ...MIC_AUDIO_CONSTRAINTS };
}

export function isAndroidPlatform() {
  return Capacitor.getPlatform() === 'android';
}