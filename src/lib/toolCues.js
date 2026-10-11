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

export const CUE_XYLOPHONE = 'xylophone';
export const CUE_CYMBAL = 'cymbal';
export const CUE_CHIME = 'chime';

const BUS_GAIN = 0.95;

const XYLO_NOTES = [1047, 1319, 1568, 2093, 2637]; // C6 · E6 · G6 · C7 · E7
const XYLO_GAP = 0.24;     // seconds between notes — must stay countable
const XYLO_DECAY = 0.4;

const CRASH_DECAY = 1.6;

const CHIME_STEP = 0.17;
const CHIME_DECAY = 0.5;
const CHIME_NOTES = [1568, 2094, 2637]; // G6 · C7 · E7

function connect(nodes, node) {
  nodes.forEach((dest) => { try { node.connect(dest); } catch {} });
}

// One struck tone: a sine fundamental plus partials, each with a short attack
// and an exponential decay. Partial levels are absolute gains — the bright ones
// are what make a cue cut through on a phone speaker.
function strike(ctx, dest, { freq, gain, decay, attack = 0.004, at = 0, partials = [] }) {
  const start = ctx.currentTime + at;

  const voice = (f, g, d) => {
    if (!(g > 0) || !(d > 0)) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(g, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + d);
    osc.connect(env);
    env.connect(dest);
    osc.start(start);
    osc.stop(start + d + 0.05);
  };

  voice(freq, gain, decay);
  partials.forEach(([mult, g, decayFactor]) => voice(freq * mult, g, decay * decayFactor));
}

// A burst of filtered white noise with a short attack and exponential decay.
// `filter` is { type, freq, q } — highpass for the cymbal wash, bandpass for the
// sizzle and the mallet click.
function noiseBurst(ctx, dest, { gain, decay, attack = 0.002, at = 0, filter }) {
  const start = ctx.currentTime + at;
  const length = Math.max(1, Math.floor(ctx.sampleRate * (decay + 0.1)));
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
  env.gain.exponentialRampToValueAtTime(0.0001, start + decay);

  src.connect(biquad);
  biquad.connect(env);
  env.connect(dest);
  src.start(start);
  src.stop(start + decay + 0.05);
}

// Schedules a cue on the given context and returns how long it lasts in
// milliseconds, so callers can resume the rotation when it has finished.
// Never throws — a cue that cannot play must not break a running session.
export function synthesizeCue(ctx, nodes, kind, { rings = 1 } = {}) {
  const dests = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean);
  if (!ctx || !dests.length) return 0;

  try {
    const bus = ctx.createGain();
    bus.gain.value = BUS_GAIN;
    let out = bus;

    // Limiter: stacked notes/layers would otherwise sum past full scale and clip
    // harshly on a small speaker. A single strike stays untouched.
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.15;
      bus.connect(limiter);
      out = limiter;
    }
    connect(dests, out);

    if (kind === CUE_CYMBAL) {
      // Cymbal crash: a long bright noise wash, two bands of sizzle, and a few
      // inharmonic metal partials. All of it lives between 2 and 8 kHz — the
      // range a phone speaker plays at full volume — so it is far louder on a
      // device than any low gong could be.
      noiseBurst(ctx, bus, { gain: 0.8, decay: CRASH_DECAY, filter: { type: 'highpass', freq: 2800, q: 0.7 } });
      noiseBurst(ctx, bus, { gain: 0.6, decay: 1.1, filter: { type: 'bandpass', freq: 4500, q: 0.9 } });
      noiseBurst(ctx, bus, { gain: 0.5, decay: 0.8, filter: { type: 'bandpass', freq: 7000, q: 0.8 } });
      strike(ctx, bus, {
        freq: 3150,
        gain: 0.2,
        decay: 1.2,
        attack: 0.002,
        partials: [[1.35, 0.18, 0.9], [1.82, 0.16, 0.8], [2.4, 0.1, 0.7]],
      });
      return Math.round((CRASH_DECAY + 0.15) * 1000);
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
        partials: [[3.0, 0.42, 0.35], [6.1, 0.1, 0.12]],
      });
      noiseBurst(ctx, bus, { gain: 0.3, decay: 0.025, attack: 0.001, at, filter: { type: 'bandpass', freq: 3500, q: 1 } });
    }
    return Math.round(((count - 1) * XYLO_GAP + XYLO_DECAY + 0.15) * 1000);
  } catch {
    return 0;
  }
}