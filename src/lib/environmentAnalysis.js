// Baseline tracking and event thresholds for the Environmental Anomaly Monitor.
//
// Both channels are judged against the room's own measured start, never against an
// absolute figure. The phone's magnetic reading carries a large device-specific
// offset (the speaker magnet sits beside the sensor) and barometric pressure varies
// with weather and altitude, so a fixed number would mean a different thing on
// every device. The tool therefore records what the room was doing when the session
// began and reports departures from that — the same method the Acoustic Anomaly
// Sweeper uses, for the same reason.

// A channel needs this many samples before its baseline is trusted. The barometer
// reports far more slowly than the magnetometer (about 1 Hz on iOS), so it needs
// far fewer samples to cover the same wall-clock calibration window.
const MIN_SAMPLES = { magnetic: 25, pressure: 6 };

// The smallest departure worth reporting at all. These are what a phone sensor can
// genuinely resolve from its own noise, not calibration figures.
const FLOOR = { magnetic: 2.5, pressure: 0.12 };

// The room's own steadiness sets the working threshold too: a restless room
// (traffic, HVAC cycling, electrical hum) has to move further before it counts than
// a still one does. Multiples of the measured spread.
const SIGMA_MULTIPLE = { magnetic: 2.5, pressure: 3 };

// Detector sensitivity scales the threshold: lower = reports smaller departures.
export const SENSITIVITY = { low: 1.8, normal: 1, high: 0.6 };

// How far the phone must be from rest (m/s²) before the pressure channel is held.
// Barometric pressure changes with height — a phone being lifted, carried or
// handled reports movement, not the room — so a moving phone is not evidence.
export const MOVEMENT_LIMIT = 0.35;

export function magneticThreshold(sd, sensitivity) {
  return Math.max(FLOOR.magnetic, (sd || 0) * SIGMA_MULTIPLE.magnetic) * sensitivity;
}

export function pressureThreshold(sd, sensitivity) {
  return Math.max(FLOOR.pressure, (sd || 0) * SIGMA_MULTIPLE.pressure) * sensitivity;
}

function createChannel(min) {
  return { min, n: 0, mean: 0, m2: 0, ready: false };
}

// Running mean and variance (Welford), used both to set the baseline and to know
// how noisy the channel is.
function push(channel, value) {
  channel.n += 1;
  const delta = value - channel.mean;
  channel.mean += delta / channel.n;
  channel.m2 += delta * (value - channel.mean);
  if (channel.n >= channel.min) channel.ready = true;
}

function spread(channel) {
  return channel.n > 1 ? Math.sqrt(Math.max(0, channel.m2) / (channel.n - 1)) : 0;
}

export function createEnvironmentTracker() {
  const channels = {
    magnetic: createChannel(MIN_SAMPLES.magnetic),
    pressure: createChannel(MIN_SAMPLES.pressure),
  };

  return {
    // True once at least one channel has a trusted baseline.
    get calibrated() {
      return channels.magnetic.ready || channels.pressure.ready;
    },

    // Whether this channel's baseline is usable (the device may have only one).
    has(channel) {
      return channels[channel].ready;
    },

    baseline(channel) {
      return channels[channel].ready ? channels[channel].mean : null;
    },

    // Every sample before the session starts feeds the baseline.
    calibrate(sample) {
      if (Number.isFinite(sample.magnetic)) push(channels.magnetic, sample.magnetic);
      if (Number.isFinite(sample.pressure)) push(channels.pressure, sample.pressure);
    },

    /**
     * Departure from the baseline, in each channel's own units. `hold` freezes a
     * channel's baseline while it is being reported (or while the phone is moving),
     * so the baseline cannot quietly absorb the very excursion being measured.
     */
    deviation(sample, hold = {}) {
      const out = { magnetic: null, pressure: null, magSd: 0, presSd: 0 };
      ['magnetic', 'pressure'].forEach((channel) => {
        const value = sample[channel];
        const state = channels[channel];
        if (!state.ready || !Number.isFinite(value)) return;
        const dev = value - state.mean;
        out[channel] = dev;
        if (channel === 'magnetic') out.magSd = spread(state);
        else out.presSd = spread(state);
        // A quiet channel drifts with the room (weather moving, HVAC cycling) so a
        // long session does not accumulate into a false departure. Held and busy
        // channels are left alone; the sample count is capped so the pull stays
        // responsive rather than decaying to nothing.
        if (!hold[channel] && Math.abs(dev) < FLOOR[channel] / 2 && state.n < 5000) {
          push(state, value);
        }
      });
      return out;
    },
  };
}