// Trigger cues for the Sweeper tools (Yes/No/IDK, Alphabet, Term).
//
// Each tool now speaks every item in ONE voice — the user's device narration
// voice — instead of dictating white items in voice 1 and blue/triggered items
// in voice 2. A triggered item is announced with a non-speech cue, so the
// speech engine is never stopped, flushed, or switched: the cue simply plays in
// the gap after the item in flight has finished speaking.
//
// Cues are synthesized with Web Audio (no asset files) and are connected to the
// recording destination as well as the speaker, so trigger audio ends up in the
// saved evidence recording.
//
// Cue code:
//   bell  — Yes/No/IDK Sweeper: 1 ring = YES, 2 rings = NO, 3 rings = I DON'T
//           KNOW. Rings are evenly spaced so they stay countable by ear.
//   gong  — Term Sweeper: any triggered term.
//   chime — Alphabet Sweeper: any triggered letter.

export const CUE_BELL = 'bell';
export const CUE_GONG = 'gong';
export const CUE_CHIME = 'chime';

const RING_GAP = 0.32;    // seconds between bell rings (must stay countable)
const BELL_DECAY = 0.40;
const GONG_DECAY = 1.50;
const CHIME_STEP = 0.13;
const CHIME_NOTES = [1318.51, 1567.98, 2093.00]; // E6 · G6 · C7

function connect(ctx, nodes, node) {
  nodes.forEach((dest) => { try { node.connect(dest); } catch {} });
}

// One struck tone: a sine fundamental plus a partial, with a short attack and
// an exponential decay — bell-like at high frequencies, gong-like when low and
// slow.
function strike(ctx, nodes, { freq, decay, gain, partial = 2.02, partialGain = 0.3, at = 0, attack = 0.006 }) {
  const start = ctx.currentTime + at;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + decay);
  osc.connect(env);
  connect(ctx, nodes, env);
  osc.start(start);
  osc.stop(start + decay + 0.05);

  const over = ctx.createOscillator();
  over.type = 'sine';
  over.frequency.value = freq * partial;
  const overEnv = ctx.createGain();
  overEnv.gain.setValueAtTime(0, start);
  overEnv.gain.linearRampToValueAtTime(gain * partialGain, start + attack);
  overEnv.gain.exponentialRampToValueAtTime(0.0001, start + decay * 0.7);
  over.connect(overEnv);
  connect(ctx, nodes, overEnv);
  over.start(start);
  over.stop(start + decay + 0.05);
}

// Schedules a cue on the given context and returns how long it lasts in
// milliseconds, so callers can resume the rotation when it has finished.
// Never throws — a cue that cannot play must not break a running session.
export function synthesizeCue(ctx, nodes, kind, { rings = 1 } = {}) {
  const dests = (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean);
  if (!ctx || !dests.length) return 0;

  try {
    if (kind === CUE_GONG) {
      strike(ctx, dests, { freq: 131, decay: GONG_DECAY, gain: 0.34, partial: 2.75, partialGain: 0.22, attack: 0.02 });
      strike(ctx, dests, { freq: 197, decay: GONG_DECAY * 0.8, gain: 0.16, partial: 1.51, partialGain: 0.2, attack: 0.02 });
      return Math.round((GONG_DECAY + 0.1) * 1000);
    }

    if (kind === CUE_CHIME) {
      CHIME_NOTES.forEach((freq, i) => {
        strike(ctx, dests, { freq, decay: 0.32, gain: 0.2, partial: 2.0, partialGain: 0.18, at: i * CHIME_STEP, attack: 0.004 });
      });
      return Math.round(((CHIME_NOTES.length - 1) * CHIME_STEP + 0.42) * 1000);
    }

    // bell
    const count = Math.max(1, Math.min(5, Math.round(rings) || 1));
    for (let i = 0; i < count; i++) {
      strike(ctx, dests, { freq: 987.77, decay: BELL_DECAY, gain: 0.3, partial: 2.76, partialGain: 0.25, at: i * RING_GAP, attack: 0.004 });
    }
    return Math.round(((count - 1) * RING_GAP + BELL_DECAY + 0.08) * 1000);
  } catch {
    return 0;
  }
}