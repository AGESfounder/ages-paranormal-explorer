// Acoustic Anomaly Sweeper — measurement and baseline math.
//
// The tool is listen-only: it never emits sound, it only listens through the
// device microphone. This module turns FFT frames from an AnalyserNode into
// per-band levels and compares them with a baseline measured in the room
// itself, so a rise is reported relative to that room's own quiet level rather
// than against an absolute number.
//
// Every figure here is RELATIVE. A phone microphone has no calibration, so the
// values are dBFS at the analyser, not sound-pressure level — they answer "how
// far is the room from its own baseline right now", nothing more.
//
// Why a baseline at all: raw level is useless as a trigger (a quiet basement
// and a room with a fridge both just read "loud"). Measuring the room first and
// watching for a sustained departure is what makes a rise meaningful, and the
// slow drift adaptation is what stops a fridge cycling, a building settling or
// air handling from accumulating into a stream of false events.

// Audible bands the strip chart reports on. Ranges are Hz.
export const ACOUSTIC_BANDS = [
  { id: 'sub', label: 'SUB', range: [20, 60] },
  { id: 'low', label: 'LOW', range: [60, 250] },
  { id: 'voice', label: 'VOICE', range: [250, 2000] },
  { id: 'high', label: 'HIGH', range: [2000, 6000] },
  { id: 'air', label: 'AIR', range: [6000, 16000] },
];

// Analyser floor. Bins at or below this are treated as "no signal".
export const FLOOR_DB = -100;

// How fast the baseline follows the room once calibrated, per sample (the tool
// samples 10x a second). Fast enough to absorb a slow drift within a minute or
// so, far too slow to absorb a real event, which lasts a fraction of a second.
const DRIFT_ALPHA = 0.003;
// Drift adaptation only runs while the room sits near its baseline — otherwise
// a genuine sustained event would be swallowed by the baseline moving to meet it.
const DRIFT_HOLD_DB = 6;

// Minimum frames collected before a calibration is trusted.
const CALIBRATION_FRAMES = 6;

// Average POWER over a bin range, not average dB: one loud bin inside a band has
// to move that band, and averaging in dB alone flattens it away.
function rangeLevelDb(freqData, sampleRate, fftSize, lo, hi) {
  const binHz = sampleRate / fftSize;
  const start = Math.max(1, Math.floor(lo / binHz));
  const end = Math.min(freqData.length - 1, Math.ceil(hi / binHz));
  if (end < start) return FLOOR_DB;
  let power = 0;
  let n = 0;
  for (let i = start; i <= end; i++) {
    const db = freqData[i];
    n++;
    if (!Number.isFinite(db) || db <= FLOOR_DB) continue;
    power += Math.pow(10, db / 10);
  }
  if (!n || power <= 0) return FLOOR_DB;
  return 10 * Math.log10(power / n);
}

// One FFT frame → broadband level plus a level per band, in dB at the analyser.
export function measureLevels(freqData, sampleRate, fftSize) {
  const bands = {};
  for (const band of ACOUSTIC_BANDS) {
    bands[band.id] = rangeLevelDb(freqData, sampleRate, fftSize, band.range[0], band.range[1]);
  }
  return {
    // Broadband spans the whole audible range the device microphone can reach.
    broadband: rangeLevelDb(freqData, sampleRate, fftSize, 40, 16000),
    bands,
  };
}

// Event threshold in dB above baseline. Anchored to the room's own measured
// variation: a quiet room has a small spread and gets a sensitive threshold, a
// noisy one has a wide spread and needs a bigger rise to count. Sensitivity is
// the user's own multiplier on top of that.
export function eventThresholdDb(baselineSd, sensitivityFactor = 1) {
  const base = Math.max(6, (Number.isFinite(baselineSd) ? baselineSd : 0) * 3);
  return base / sensitivityFactor;
}

// The room's own baseline: calibration first, then slow drift tracking.
export function createBaselineTracker() {
  const calibBroadband = [];
  const calibBands = {};
  const bandBaseline = {};
  let mean = null;
  let sd = 0;

  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    get calibrated() { return mean !== null; },
    get mean() { return mean; },
    get sd() { return sd; },

    // Calibration: collect the room's own level before anything is reported.
    calibrate(levels) {
      calibBroadband.push(levels.broadband);
      for (const band of ACOUSTIC_BANDS) {
        if (!calibBands[band.id]) calibBands[band.id] = [];
        calibBands[band.id].push(levels.bands[band.id]);
      }
      if (calibBroadband.length >= CALIBRATION_FRAMES) {
        mean = avg(calibBroadband);
        sd = Math.sqrt(avg(calibBroadband.map((v) => (v - mean) ** 2)));
        for (const band of ACOUSTIC_BANDS) bandBaseline[band.id] = avg(calibBands[band.id]);
      }
      return mean !== null;
    },

    // How far this frame sits above the baseline, overall and per band.
    // `hold` is set while an event is being tracked: the baseline stops
    // adapting so the event it is measuring cannot move the mark it is
    // measured against.
    deviation(levels, { hold = false } = {}) {
      if (mean === null) return { broadband: 0, bands: {} };
      const broadband = levels.broadband - mean;
      const bands = {};
      for (const band of ACOUSTIC_BANDS) {
        bands[band.id] = levels.bands[band.id] - (bandBaseline[band.id] ?? levels.bands[band.id]);
      }
      if (!hold && Math.abs(broadband) < DRIFT_HOLD_DB) {
        mean += broadband * DRIFT_ALPHA;
        for (const band of ACOUSTIC_BANDS) {
          bandBaseline[band.id] = (bandBaseline[band.id] ?? levels.bands[band.id]) + bands[band.id] * DRIFT_ALPHA;
        }
      }
      return { broadband, bands };
    },
  };
}

// The band that moved most for a given frame — what an event is attributed to.
export function dominantBand(bandDeviations) {
  let best = null;
  let bestDb = 0;
  for (const band of ACOUSTIC_BANDS) {
    const db = bandDeviations[band.id];
    if (Number.isFinite(db) && db > bestDb) { bestDb = db; best = band; }
  }
  return best;
}