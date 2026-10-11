// The voice and delivery the user configured in the Device Voice Picker,
// used by the Sweeper tools so every item they speak is read in the user's own
// device narration voice, exactly as they have it set — the tools no longer
// apply their own per-voice rate/pitch rules.
//
// Keys are the ones the Device Voice Picker writes and that
// useGhostVoice.speakDevice() reads; the defaults match its fallbacks.
const DEFAULTS = { rate: 0.92, pitch: 0.9, volume: 1.0 };

export function getDeviceVoiceOptions() {
  let settings = DEFAULTS;
  try {
    const raw = localStorage.getItem('ages_device_voice_settings');
    if (raw) settings = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}

  let voiceURI = null;
  try { voiceURI = localStorage.getItem('ages_device_voice_uri') || null; } catch {}

  return {
    voiceURI,
    rate: settings.rate,
    pitch: settings.pitch,
    volume: Math.min(1, settings.volume ?? DEFAULTS.volume),
  };
}