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
// real session: every component sits in the mid/upper band a small speaker can
// actually reproduce (a true ~130 Hz gong is inaudible there — it simply does
// not move the driver), the bus runs hot so a trigger is unmistakable, and a
// limiter keeps stacked rings clean instead of clipping harshly.
//
// Cue code:
//   bell  — Yes/No/IDK Sweeper: 1 ring = YES, 2 rings = NO, 3 rings = I DON'T
//           KNOW. Rings are deliberately spaced so they stay countable by ear.
//   gong  — Term Sweeper: any triggered term.
//   chime — Alphabet Sweeper: any triggered letter.

export const CUE_BELL = 'bell';
export const CUE_GONG = 'gong';
export const CUE_CHIME = 'chime';

const BUS_GAIN = 0.95;
const RING_GAP = 0.6;      // seconds between bell rings — must stay countable
const BELL_DECAY = 0.6;
const GONG_DECAY = 1.8;
const CHIME_STEP = 0.17;
const CHIME_DECAY = 0.5;
const CHIME_NOTES = [1568, 2094, 2637]; // G6 · C7 · E7

function connect(ctx, nodes, node) {
  nodes.forEach((dest) => { try { node.connect(dest); } catch {} });
}

// One struck tone: a sine fundamental plus inharmonic partials, each with a
// short attack and an exponential decay. Partial levels are absolute gains — the
// bright ones are what make a cue cut through on a phone speaker.
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

    // Limiter: stacked rings/notes would otherwise sum past full scale and clip
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
    connect(ctx, dests, out);

    if (kind === CUE_GONG) {
      // Gong character held in the mid band (C4 fundamental with inharmonic
      // partials): the slow swell and the long metallic tail read as a gong
      // while every partial stays inside what a phone speaker reproduces.
      strike(ctx, bus, {
        freq: 262,
        gain: 0.55,
        decay: GONG_DECAY,
        attack: 0.03,
        partials: [[1.5, 0.3, 0.85], [2.2, 0.22, 0.65], [3.4, 0.14, 0.5], [5.1, 0.08, 0.3]],
      });
      return Math.round((GONG_DECAY + 0.15) * 1000);
    }

    if (kind === CUE_CHIME) {
      CHIME_NOTES.forEach((freq, i) => {
        strike(ctx, bus, { freq, gain: 0.5, decay: CHIME_DECAY, attack: 0.003, at: i * CHIME_STEP, partials: [[2.0, 0.14, 0.6]] });
      });
      return Math.round(((CHIME_NOTES.length - 1) * CHIME_STEP + CHIME_DECAY + 0.1) * 1000);
    }

    // bell — one ring per answer, voiced like the counter bell you press to get
    // someone's attention: a bright, high strike with a crisp metallic ring and
    // a short tail, so one, two, and three rings stay countable by ear.
    const count = Math.max(1, Math.min(5, Math.round(rings) || 1));
    for (let i = 0; i < count; i++) {
      strike(ctx, bus, {
        freq: 1318,
        gain: 0.6,
        decay: BELL_DECAY,
        attack: 0.002,
        at: i * RING_GAP,
        partials: [[1.5, 0.1, 0.85], [2.0, 0.22, 0.7], [2.76, 0.16, 0.5]],
      });
    }
    return Math.round(((count - 1) * RING_GAP + BELL_DECAY + 0.15) * 1000);
  } catch {
    return 0;
  }
}