// Trigger cues for the Sweeper tools (Yes/No/IDK, Alphabet, Term).
//
// Each tool speaks every item in ONE voice — the user's device narration voice.
// A triggered item is announced with a non-speech cue, so the speech engine is
// never stopped, flushed, or switched: the cue plays in the gap after the item
// in flight has finished speaking.
//
// Cues are synthesized with Web Audio (no asset files) and are connected to the
// recording destination as well as the speaker, so trigger audio ends up in the
// saved evidence recording.
//
// Tuned for a PHONE SPEAKER, which is the only way these are ever heard on a
// real session: everything sits in the 1-8 kHz band a small speaker reproduces
// loudest (and the ear is most sensitive to). Low tones such as a true gong
// barely move a phone driver, so loud cues are bright and percussive instead.
// The bus runs hot so a trigger is unmistakable, and a limiter keeps stacked
// layers clean instead of clipping harshly.
//
// Cue code:
//   xylophone — Yes/No/IDK Sweeper: 1 note = YES, 2 notes = NO, 3 notes = I DON'T
//               KNOW. Notes climb the scale and are spaced so they stay
//               countable by ear.
//   cymbal    — Term Sweeper: any triggered term (a full crash).
//   chime     — Alphabet Sweeper: any triggered letter.
//   magnetic / pressure / combined — Environmental Anomaly Monitor: one departure on
//               the magnetic channel, one on the pressure channel, or both at once.

export const CUE_XYLOPHONE = 'xylophone';
export const CUE_CYMBAL = 'cymbal';
export const CUE_CHIME = 'chime';
export const CUE_MAGNETIC = 'magnetic';
export const CUE_PRESSURE = 'pressure';
export const CUE_COMBINED = 'combined';

const BUS_GAIN = 0.95;

const XYLO_NOTES = [2093, 2637, 3136, 4186, 5274]; // C7 · E7 · G7 · C8 · E8
const XYLO_GAP = 0.32;     // seconds between notes — must stay countable
const XYLO_DECAY = 1.0;
const XYLO_FLOOR = 0.03;   // level (vs. peak) the note fades to — keeps the ring audible

const CRASH_DECAY = 2.6;
const CRASH_FLOOR = 0.03;  // a crash fades to this level, then trails off, instead of dying in a blink

// Cymbal is run harder than the other cues: more drive into a near brick-wall
// limiter raises the average loudness of the noise without letting it clip.
const CRASH_DRIVE = 1.8;

const CHIME_STEP = 0.17;
const CHIME_DECAY = 0.5;
const CHIME_NOTES = [1568, 2094, 2637]; // G6 · C7 · E7

// Environmental Anomaly Monitor cues: one short struck tone per sensor channel,
// pitched and levelled by how big the departure was — the magnetic channel low and
// wooden, the pressure channel higher and glassier — and both of them, a beat apart,
// when the two sensors depart together. Bright, brief and obviously synthetic on
// purpose: these land inside the session recording, and a beep must never pass for an
// EVP when that recording is reviewed.
const SENSOR_TONES = {
  magnetic: { freq: 1046, rise: 0.22, gain: 0.6, decay: 0.4, partials: [[2, 0.22, 0.5], [3, 0.16, 0.3]] },
  pressure: { freq: 1760, rise: 0.28, gain: 0.55, decay: 0.55, partials: [[2, 0.16, 0.55]] },
};
const COMBINED_GAP = 0.14;
const SENSOR_SHINE = 3136;

function connect(nodes, node) {
  nodes.forEach((dest) => { try { node.connect(dest); } catch {} });
}

// One struck tone: a sine fundamental plus partials, each with a short attack
// and an exponential decay. Partial levels are absolute gains — the bright ones
// are what make a cue cut through on a phone speaker.
//
// `floor` (optional) is the fraction of the peak the tone fades to over `decay`.
// An exponential fade all the way to silence is mostly inaudible after the first
// quarter of its length, so cues that must ring on fade only to `floor` and then
// ease out. Omitted, the tone decays to silence as before.
function strike(ctx, dest, { freq, gain, decay, attack = 0.004, at = 0, partials = [], floor }) {
  const start = ctx.currentTime + at;

  const voice = (f, g, d) => {
    if (!(g > 0) || !(d > 0)) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(g, start + attack);
    env.gain.exponentialRampToValueAtTime(floor ? g * floor : 0.0001, start + d);
    if (floor) env.gain.linearRampToValueAtTime(0, start + d + 0.08);
    osc.connect(env);
    env.connect(dest);
    osc.start(start);
    osc.stop(start + d + 0.12);
  };

  voice(freq, gain, decay);
  partials.forEach(([mult, g, decayFactor]) => voice(freq * mult, g, decay * decayFactor));
}

// A burst of filtered white noise with a short attack and exponential decay.
// `filter` is { type, freq, q } — highpass for the cymbal wash, bandpass for the
// sizzle and the mallet click.
function noiseBurst(ctx, dest, { gain, decay, attack = 0.002, at = 0, filter, floor }) {
  const start = ctx.currentTime + at;
  const length = Math.max(1, Math.floor(ctx.sampleRate * (decay + 0.2)));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const biquad = ctx.createBiquadFilter();
  biquad.type = filter.type;
  biquad.frequency.value = filter.freq;
  biquad.Q.value = filter.q ?? 0.7;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(floor ? gain * floor : 0.0001, start + decay);
  if (floor) env.gain.linearRampToValueAtTime(0, start + decay + 0.08);

  src.connect(biquad);
  biquad.connect(env);
  env.connect(dest);
  src.start(start);
  src.stop(start + decay + 0.12);
}

// One sensor tone: the channel's own note, raised and lifted by how large the
// departure was, so a small departure is a small sound and a large one is
// unmistakable. Returns how long it lasts in milliseconds.
function sensorStrike(ctx, bus, kind, strength, at = 0) {
  const tone = SENSOR_TONES[kind];
  const s = Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 0.5));
  strike(ctx, bus, {
    freq: tone.freq * (1 + tone.rise * s),
    gain: tone.gain * (0.75 + 0.25 * s),
    decay: tone.decay,
    attack: 0.003,
    at,
    partials: tone.partials,
  });
  return Math.round((at + tone.decay + 0.2) * 1000);
}

// Schedules a cue on the given context and returns how long it lasts in
// milliseconds, so callers can resume the rotation when it has finished.
// Never throws — a cue that cannot play must not break a running session.
export function synthesizeCue(ctx, nodes, kind, { rings = 1, strength = 0.5 } = {}) {
  const dests = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean);
  if (!ctx || !dests.length) return 0;

  try {
    const crash = kind === CUE_CYMBAL;
    const bus = ctx.createGain();
    bus.gain.value = crash ? CRASH_DRIVE : BUS_GAIN;
    let out = bus;

    // Limiter: stacked notes/layers would otherwise sum past full scale and clip
    // harshly on a small speaker. A single strike stays untouched. The crash
    // runs a tighter, harder limiter so its extra drive reads as loudness.
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = crash ? -1 : -2;
      limiter.knee.value = 0;
      limiter.ratio.value = crash ? 20 : 8;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.15;
      bus.connect(limiter);
      out = limiter;
    }
    connect(dests, out);

    if (kind === CUE_MAGNETIC || kind === CUE_PRESSURE) {
      return sensorStrike(ctx, bus, kind, strength);
    }

    if (kind === CUE_COMBINED) {
      // Both channels departing at once is the one event this tool exists to catch,
      // so it is the only cue that carries both notes — the second a beat behind the
      // first, under a bright shimmer that sets it apart from either channel alone.
      sensorStrike(ctx, bus, CUE_MAGNETIC, strength, 0);
      const ms = sensorStrike(ctx, bus, CUE_PRESSURE, strength, COMBINED_GAP);
      strike(ctx, bus, {
        freq: SENSOR_SHINE,
        gain: 0.22 * (0.75 + 0.25 * Math.max(0, Math.min(1, strength))),
        decay: 0.5,
        attack: 0.002,
        at: COMBINED_GAP,
      });
      return ms;
    }

    if (kind === CUE_CYMBAL) {
      // Cymbal crash: a long bright noise wash, two bands of sizzle, and a few
      // inharmonic metal partials. All of it lives between 2 and 8 kHz — the
      // range a phone speaker plays at full volume — so it is far louder on a
      // device than any low gong could be.
      noiseBurst(ctx, bus, { gain: 0.9, decay: CRASH_DECAY, floor: CRASH_FLOOR, filter: { type: 'highpass', freq: 2800, q: 0.7 } });
      noiseBurst(ctx, bus, { gain: 0.7, decay: CRASH_DECAY * 0.75, floor: CRASH_FLOOR, filter: { type: 'bandpass', freq: 4500, q: 0.9 } });
      noiseBurst(ctx, bus, { gain: 0.6, decay: CRASH_DECAY * 0.55, floor: CRASH_FLOOR, filter: { type: 'bandpass', freq: 7000, q: 0.8 } });
      strike(ctx, bus, {
        freq: 3150,
        gain: 0.25,
        decay: CRASH_DECAY * 0.85,
        attack: 0.002,
        floor: CRASH_FLOOR,
        partials: [[1.35, 0.22, 0.9], [1.82, 0.2, 0.8], [2.4, 0.14, 0.7]],
      });
      return Math.round((CRASH_DECAY + 0.2) * 1000);
    }

    if (kind === CUE_CHIME) {
      CHIME_NOTES.forEach((freq, i) => {
        strike(ctx, bus, { freq, gain: 0.5, decay: CHIME_DECAY, attack: 0.003, at: i * CHIME_STEP, partials: [[2.0, 0.14, 0.6]] });
      });
      return Math.round(((CHIME_NOTES.length - 1) * CHIME_STEP + CHIME_DECAY + 0.1) * 1000);
    }

    // xylophone — one wooden mallet note per count, climbing the scale. Each
    // note is a bright, quick-dying tone with the 3x overtone that gives a
    // xylophone bar its "tock", plus a tiny noise click for the mallet hit.
    const count = Math.max(1, Math.min(XYLO_NOTES.length, Math.round(rings) || 1));
    for (let i = 0; i < count; i++) {
      const at = i * XYLO_GAP;
      strike(ctx, bus, {
        freq: XYLO_NOTES[i],
        gain: 0.75,
        decay: XYLO_DECAY,
        attack: 0.002,
        at,
        floor: XYLO_FLOOR,
        partials: [[2.0, 0.3, 0.6], [3.0, 0.3, 0.35]],
      });
      noiseBurst(ctx, bus, { gain: 0.3, decay: 0.025, attack: 0.001, at, filter: { type: 'bandpass', freq: 3500, q: 1 } });
    }
    return Math.round(((count - 1) * XYLO_GAP + XYLO_DECAY + 0.2) * 1000);
  } catch {
    return 0;
  }
}