// The Environmental Anomaly Monitor's alert tones.
//
// On by default, because the tone is part of the session: it marks a departure in
// the recording by ear as well as in the log, and it goes through the same audio bus
// the recording listens to. The switch sits in the session header and is remembered
// on this device, so a session that wants the recording kept sonically clean can
// turn it off before the first departure.
const KEY = 'ages_monitor_tones';

export function monitorTonesEnabled() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === null ? true : saved === '1';
  } catch {
    return true;
  }
}

export function setMonitorTonesEnabled(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
}