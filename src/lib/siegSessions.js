// SIEG — Septer Inquiry Evidence Gleaner. Session definitions and shared copy.
//
// SIEG is an integrated paranormal investigation system: it runs seven of the
// rack's tools at once over one session, on one clock, and records the whole
// screen as one file. Four of those seven draw live lanes — the Acoustic Anomaly
// Sweeper's listening baseline, the Anomaly Camera's figure scan, the Vibration
// Communicator's disturbance detection, and the Environmental Anomaly Monitor's
// magnetic and barometric channels — while the Weather Monitor and Moon Phase
// supply the conditions on screen and the Audio Recorder captures the session.
//
// The five session lengths are named, not just numbered, and each one was chosen
// for what it gives an investigation rather than for being a round number. The
// countdown starts AFTER a shared baseline is measured, so the window named on
// the button is the window that actually measures.

export const SIEG_DESCRIPTOR =
  'SIEG is an integrated paranormal investigation system that uses and combines many functions of several existing tools in AGES Explorer into one interface. It runs seven of them at once, on one clock, and records the whole screen as a single file.';

// The seven tools running inside a session. Four of them draw a live lane; the
// other three feed the session around the lanes.
export const SIEG_TOOLS = [
  'Acoustic Anomaly Sweeper',
  'Anomaly Camera',
  'Vibration Communicator',
  'Environmental Anomaly Monitor',
  'Weather Monitor',
  'Moon Phase',
  'Audio Recorder',
];

// One shared baseline window for every lane, so all four are judged against the
// same quiet room and their events line up on the same clock.
export const SIEG_CALIBRATION_MS = 10000;

// Each length is named for what it is, and carries the reason it was picked: five
// windows that an investigator can choose between on purpose instead of guessing
// at a slider.
export const SIEG_SESSIONS = [
  {
    id: 'classic',
    minutes: 13,
    name: 'The Paranormal Classic',
    purpose: 'Full session',
    why: 'Thirteen has been the number of the uncanny for centuries — the thirteenth guest at the table, the thirteen of the coven, the number most hauntings are said to keep. It is also the practical maximum: the longest window that still fits one sitting, with time for a room to settle after you arrive before it has to answer.',
  },
  {
    id: 'signal',
    minutes: 11,
    name: 'The Mysterious Signal',
    purpose: 'Deep listen',
    why: 'Eleven is a master number in numerology: the messenger, intuition, and things arriving from outside the ordinary. As a session it is nearly the full length, so you give up very little reach and keep two minutes back to review what came through.',
  },
  {
    id: 'threefold',
    minutes: 9,
    name: 'The Threefold Mystery',
    purpose: 'Pattern watch',
    why: 'Nine is three threes: the completed cycle, the number that closes things. Nine minutes is long enough for a repeating sound to show itself as a pattern rather than a coincidence — which is what separates a draught from a response.',
  },
  {
    id: 'occult',
    minutes: 7,
    name: 'The Occult Number',
    purpose: 'Focused sweep',
    why: 'Seven shows up in more haunting accounts, folk tales and rites than any other number — seven knocks, seven steps, seven years. Seven minutes is a real listen that is still short enough to repeat somewhere else the same night.',
  },
  {
    id: 'brief',
    minutes: 3,
    name: 'The Brief Encounter',
    purpose: 'Quick check',
    why: 'Three is the oldest pattern there is: knock, wait, knock. Three minutes covers the baseline and the answer, and it is the length for somewhere you cannot stay — a doorway, a passing cemetery, or a room you want to check before committing an evening to it.',
  },
];

// What an investigator has to do before stepping away. The microphone is open for
// the whole session, so anything the phone itself makes is recorded as room
// evidence — the app holds its own music and cues quiet, but only the device's
// own volume, ringer and notifications are the investigator's to silence.
export const SIEG_SETUP_STEPS = [
  'AGES holds its own music and cues quiet while SIEG is open — your ringer and notifications are yours to silence.',
  'Plug in and set the phone face-up on a stable surface.',
  'Step away from the phone. Handling it registers as vibration.',
  "Talk, move, and make noise away from the room you're measuring.",
];