// A short, explicit quiet window for the Sweeper tools' magnetic and vibration
// channels, armed only by a LOUD announce cue.
//
// The phone's own speaker is the one sound source that can disturb these
// channels: the driver's magnet sits beside the magnetometer and moves the field,
// and a hard crash visibly shakes the chassis the accelerometer is measuring.
// Those two sounds are the only ones that ever did it — the Term Sweeper crash
// and the three-note I DON'T KNOW bell — so the window is armed from the cue
// itself, for exactly as long as that cue rings.
//
// Never from "the app is playing audio": the recording tools hold that state for
// an entire session, which left these channels deaf for the whole investigation
// and made spoken words look like the cause.
//
// Nothing needs clearing — the window is a timestamp and expires on its own.
let quietUntil = 0;

/** Arm the quiet window for a cue of the given length, in milliseconds. */
export function markLoudCue(ms) {
  if (!ms || ms <= 0) return;
  quietUntil = Math.max(quietUntil, Date.now() + ms);
}

/** True while the app's own loud cue is still ringing. */
export function isSensorQuiet(now = Date.now()) {
  return now < quietUntil;
}