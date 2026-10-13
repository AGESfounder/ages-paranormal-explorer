// SIEG — Septer Inquiry Evidence Gleaner. Session definitions and shared copy.
//
// SIEG is an integrated paranormal investigation system: it runs several of the
// rack's detectors at once over one session, on one clock, and records the whole
// screen as one file. The four lanes are the Acoustic Anomaly Sweeper's listening
// baseline, the Anomaly Camera's figure scan, the Vibration Communicator's sensor
// disturbance detection, and the Environmental Anomaly Monitor's magnetic and
// barometric channels.
//
// The five session lengths are named, not just numbered, and each is capped well
// under the point where a session's recording could outgrow what the app can
// save. The countdown starts AFTER a shared baseline is measured, so the window
// named on the button is the window that actually measures.

export const SIEG_DESCRIPTOR =
  'SIEG is an integrated paranormal investigation system that uses and combines many functions of several existing tools in AGES Explorer into one interface.';

// One shared baseline window for every lane, so all four are judged against the
// same quiet room and their events line up on the same clock.
export const SIEG_CALIBRATION_MS = 10000;

export const SIEG_SESSIONS = [
  {
    id: 'classic',
    minutes: 13,
    name: 'The Paranormal Classic',
    purpose: 'Full session',
  },
  {
    id: 'signal',
    minutes: 11,
    name: 'The Mysterious Signal',
    purpose: 'Deep listen',
  },
  {
    id: 'threefold',
    minutes: 9,
    name: 'The Threefold Mystery',
    purpose: 'Pattern watch',
  },
  {
    id: 'occult',
    minutes: 7,
    name: 'The Occult Number',
    purpose: 'Focused sweep',
  },
  {
    id: 'brief',
    minutes: 3,
    name: 'The Brief Encounter',
    purpose: 'Quick check',
  },
];

// What an investigator has to do before stepping away. The microphone is open for
// the whole session, so anything the phone itself makes is recorded as room
// evidence — the app holds its own music and cues quiet, but only the device's
// own volume, ringer and notifications are the investigator's to silence.
export const SIEG_SETUP_STEPS = [
  'Silence your device — ringer off, notifications off, volume down.',
  'Plug in and set the phone face-up on a stable surface.',
  'Step away from the phone. Handling it registers as vibration.',
  "Talk, move, and make noise away from the room you're measuring.",
];