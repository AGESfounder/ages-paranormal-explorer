// SIEG composite display.
//
// One canvas carries the whole session, in the same layout every time: a header
// band (session, conditions, time remaining), the camera pane, four detector
// lanes, and a status footer. Because this canvas is what gets recorded, the
// saved file shows exactly what the session measured, in the order it happened.
//
// SIEG runs seven tools at once; four of them draw a lane here. The other three
// (Weather Monitor, Moon Phase, Audio Recorder) feed the header and the recording.
//
// Each lane draws its own detector's units — dB of departure from the room's
// baseline, a form count, a disturbance level, and the magnetic/barometric
// departures — normalised so a lane's full height means "three times its own
// reporting threshold", not an absolute figure. The lanes share one time axis, so
// two events at the same moment sit at the same x, and a correlation is drawn as
// the white band the tools' additive-colour idea implies.

import { drawSiegAnomalyScan } from '@/components/sieg/anomalyScanDisplay';
import { drawFigureSkeleton } from '@/lib/figureSkeleton';
import { figureIsMoving } from '@/lib/figureMotion';

export const SIEG_LANES = [
  { id: 'acoustic', label: 'ACOUSTIC', color: '#a3e635', unit: 'dB from baseline' },
  { id: 'figure', label: 'FIGURE', color: '#33e0ff', unit: 'figures in view' },
  { id: 'vibration', label: 'VIBRATION', color: '#4ade80', unit: 'device disturbance' },
  { id: 'environment', label: 'ENVIRONMENT', color: '#fb923c', unit: 'magnetic + pressure' },
];

export const MAGNETIC_COLOR = '#a78bfa';
export const PRESSURE_COLOR = '#22d3ee';
export const CORRELATION_COLOR = '#ffffff';

export const SIEG_W = 640;
export const SIEG_H = 480;

export const SIEG_CAMERA_Y = 60;
export const SIEG_CAMERA_H = 250;
const HEADER_H = SIEG_CAMERA_Y;
const CAM_Y = SIEG_CAMERA_Y;
const CAM_H = SIEG_CAMERA_H;
const LANE_Y = CAM_Y + CAM_H;
const LANE_H = 144;
const FOOT_Y = LANE_Y + LANE_H;
const TRACE_X0 = 76;
const TRACE_X1 = SIEG_W - 12;
const WINDOW_MS = 24000;

const C = {
  bg: '#04060b',
  panel: '#0b1220',
  text: '#e2ebf3',
  name: '#a9bccf',
  muted: '#7588a3',
  accent: '#2dd4bf',
  rec: '#ef4444',
};

export function formatClock(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// The phone's own wall clock. Formatted once per second and reused, because the
// composite is painted on every animation frame and formatting time on each one
// is not worth the cost.
let wallClockCache = { sec: -1, text: '' };
export function formatWallClock(nowMs = Date.now()) {
  const sec = Math.floor(nowMs / 1000);
  if (wallClockCache.sec !== sec) {
    wallClockCache = {
      sec,
      text: new Date(sec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  }
  return wallClockCache.text;
}

// Moon phase, computed locally: no network call, so the ambient corner is always
// there even when the phone has no signal in the field.
export function moonPhase(date = new Date()) {
  const synodic = 2551443;
  const newMoon = Date.UTC(2000, 0, 6, 18, 14) / 1000;
  const phase = ((date.getTime() / 1000 - newMoon) % synodic) / synodic;
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  return {
    name: names[Math.round(phase * 8) % 8],
    illumination: Math.round((1 - Math.cos(phase * 2 * Math.PI)) * 50),
  };
}

function xForTime(t, now) {
  const dx = TRACE_X1 - TRACE_X0;
  return TRACE_X1 - ((now - t) / WINDOW_MS) * dx;
}

const clamp01 = (v) => Math.max(-1, Math.min(1, v));

// One trace inside a lane band. Nulls (a channel with no reading yet) are gaps,
// not zeros — a missing barometer must not read as a flat line of evidence.
function drawTrace(ctx, samples, now, pick, scale, y0, h, color, width = 1.4) {
  const mid = y0 + h / 2;
  const amp = h / 2 - 3;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  let started = false;
  for (const s of samples) {
    const v = pick(s);
    if (!Number.isFinite(v)) { started = false; continue; }
    const x = xForTime(s.t, now);
    const y = mid - clamp01(v / scale) * amp;
    if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
  }
  ctx.stroke();
}

// The visible and recorded composite share these outlines and calibration text.
export function drawSiegCameraOverlay(ctx, s, fit) {
  if (!fit) {
    ctx.fillStyle = C.muted;
    ctx.font = '11px monospace';
    ctx.fillText('CAMERA STARTING…', 12, CAM_Y + 22);
  }
  const boxes = s.figureBoxes;
  if (fit && boxes?.boxes?.length) {
    const sx = fit.dw / (boxes.width || 320);
    const sy = fit.dh / (boxes.height || 240);
    // No outline rectangle: the form reads as the body the depth image already
    // draws, with the confirmed skeleton over it — not a box around the figure.
    // A body the movement tier confirmed is lit brighter and labelled, so the
    // stronger confirmation is on the composite that gets recorded.
    boxes.boxes.forEach((b) => {
      if (!b.joints) return;
      const moving = figureIsMoving(b, s.now);
      drawFigureSkeleton(ctx, b.joints, ([jx, jy]) => [fit.dx + jx * sx, fit.dy + jy * sy], {
        moving,
        previousJoints: b.previousJoints,
      });
      if (!moving) return;
      const xs = Object.values(b.joints).map((j) => j[0]);
      const ys = Object.values(b.joints).map((j) => j[1]);
      if (!xs.length) return;
      ctx.fillStyle = '#eafeff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        'MOVEMENT CONFIRMED',
        fit.dx + Math.min(...xs) * sx,
        Math.max(fit.dy + 11, fit.dy + Math.min(...ys) * sy - 6),
      );
    });
  }
  if (s.calibrating) {
    ctx.fillStyle = 'rgba(4, 6, 11, 0.78)';
    ctx.fillRect(0, CAM_Y, SIEG_W, CAM_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.accent;
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('MEASURING THE ROOM’S BASELINE', SIEG_W / 2, CAM_Y + 108);
    ctx.fillStyle = C.text;
    ctx.font = 'bold 30px monospace';
    ctx.fillText(String(Math.max(0, Math.ceil((s.calibratingMsLeft || 0) / 1000))), SIEG_W / 2, CAM_Y + 156);
    ctx.fillStyle = C.muted;
    ctx.font = '11px sans-serif';
    ctx.fillText('Step away now — do not handle the device.', SIEG_W / 2, CAM_Y + 186);
    ctx.textAlign = 'left';
  }
}

// Fit a source frame inside the camera pane, centred, with no crop.
function fitPane(sourceW, sourceH) {
  const scale = Math.min(SIEG_W / sourceW, CAM_H / sourceH);
  const dw = sourceW * scale;
  const dh = sourceH * scale;
  return { dx: (SIEG_W - dw) / 2, dy: CAM_Y + (CAM_H - dh) / 2, dw, dh };
}

export function drawSiegFrame(ctx, canvas, s) {
  const now = s.now ?? Date.now();
  const samples = s.samples || [];

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SIEG_W, SIEG_H);

  // ── Header ──
  // Line one carries the three things an investigator glancing at the phone needs
  // together: the tool's own name, the room's conditions (moon phase and local
  // weather, at a size that can be read from across the room), and the countdown.
  // The chosen session sits on its own line under SIEG, where there is room for it.
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, SIEG_W, HEADER_H);
  ctx.fillStyle = C.accent;
  ctx.font = 'bold 24px monospace';
  ctx.fillText('SIEG', 10, 28);
  const siegW = ctx.measureText('SIEG').width;
  const condX = 24 + siegW;
  const condMax = SIEG_W - 96 - condX;
  ctx.font = '15px sans-serif';
  let conditions = s.conditions || '—';
  while (ctx.measureText(conditions).width > condMax && conditions.length > 6) {
    conditions = `${conditions.slice(0, -3)}…`;
  }
  ctx.fillStyle = C.text;
  ctx.fillText(conditions, condX, 27);
  ctx.fillStyle = C.name;
  ctx.font = '14px sans-serif';
  ctx.fillText(s.sessionName || '', 11, 51);
  ctx.textAlign = 'right';
  ctx.fillStyle = s.calibrating ? C.muted : C.text;
  ctx.font = 'bold 24px monospace';
  ctx.fillText(s.calibrating ? '—:—' : formatClock(s.remaining), SIEG_W - 10, 28);
  ctx.font = '9px sans-serif';
  ctx.fillStyle = C.muted;
  ctx.fillText(s.calibrating ? `baseline ${Math.max(0, Math.ceil((s.calibratingMsLeft || 0) / 1000))}s` : 'remaining', SIEG_W - 10, 45);
  // Real time on the line opposite the session's name: the phone's own clock, so a
  // time written down from the screen matches the recording and the event log.
  ctx.fillStyle = C.text;
  ctx.font = 'bold 15px monospace';
  ctx.fillText(formatWallClock(now), SIEG_W - 10, 51);
  ctx.textAlign = 'left';

  // ── Camera pane. The full frame is fitted inside the pane (no crop) so the
  // outline drawn around a detected form lands on the form it belongs to. ──
  ctx.fillStyle = '#000';
  ctx.fillRect(0, CAM_Y, SIEG_W, CAM_H);
  const vid = s.video;
  const depthImage = s.depthFrame?.imageEl;
  let fit = null;
  // A depth frame arrives from the sensor already colourised by distance, so it is
  // drawn as it is; the camera method is drawn through the same green scan the
  // standalone Anomaly Camera uses. Either way the full frame is fitted inside the
  // pane, so an outline lands on the form it belongs to.
  if (depthImage?.naturalWidth) {
    fit = fitPane(depthImage.naturalWidth, depthImage.naturalHeight);
    try { ctx.drawImage(depthImage, fit.dx, fit.dy, fit.dw, fit.dh); } catch { /* frame not readable yet */ }
  } else if (vid && vid.readyState >= 2 && vid.videoWidth) {
    fit = fitPane(vid.videoWidth, vid.videoHeight);
    try { drawSiegAnomalyScan(ctx, vid, fit, s.figureBoxes); } catch { /* frame not readable yet */ }
  }
  drawSiegCameraOverlay(ctx, s, fit);

  // ── Lanes ──
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, LANE_Y, SIEG_W, LANE_H);

  // Correlated moments first, so every trace and marker draws over the band.
  (s.correlations || []).forEach((t) => {
    const x = xForTime(t, now);
    if (x < TRACE_X0 || x > TRACE_X1) return;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(x - 4, LANE_Y + 2, 8, LANE_H - 4);
  });

  const laneH = LANE_H / 4;
  const scales = s.scales || {};

  SIEG_LANES.forEach((lane, i) => {
    const y0 = LANE_Y + i * laneH;
    const mid = y0 + laneH / 2;
    const amp = laneH / 2 - 3;

    ctx.fillStyle = lane.color;
    ctx.font = 'bold 8px monospace';
    ctx.fillText(lane.label, 8, mid + 3);
    ctx.fillStyle = C.muted;
    ctx.font = '7px sans-serif';
    ctx.fillText(lane.unit, 8, mid + 12);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(TRACE_X0, mid);
    ctx.lineTo(TRACE_X1, mid);
    ctx.stroke();
    ctx.setLineDash([]);

    if (lane.id === 'acoustic') {
      drawTrace(ctx, samples, now, (x) => x.acoustic, scales.acoustic || 12, y0, laneH, lane.color);
    } else if (lane.id === 'figure') {
      // A step, not a line: the lane reads "in view / not in view", so a form is a
      // raised block for as long as it is there.
      ctx.strokeStyle = lane.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      for (const smp of samples) {
        const x = xForTime(smp.t, now);
        const y = smp.figure ? mid - amp : mid;
        if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
      }
      ctx.stroke();
    } else if (lane.id === 'vibration') {
      drawTrace(ctx, samples, now, (x) => x.vibration, scales.vibration || 100, y0, laneH, lane.color);
    } else {
      drawTrace(ctx, samples, now, (x) => x.magnetic, scales.magnetic || 8, y0, laneH, MAGNETIC_COLOR, 1.2);
      drawTrace(ctx, samples, now, (x) => x.pressure, scales.pressure || 0.6, y0, laneH, PRESSURE_COLOR, 1.2);
    }

    // Event markers on their own lane.
    (s.markers || []).forEach((m) => {
      if (m.lane !== lane.id) return;
      const x = xForTime(m.t, now);
      if (x < TRACE_X0 || x > TRACE_X1) return;
      ctx.strokeStyle = lane.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y0 + 2);
      ctx.lineTo(x, y0 + laneH - 2);
      ctx.stroke();
    });

    // Live readout for the lane, at the right edge.
    const readout = s.readouts?.[lane.id];
    ctx.textAlign = 'right';
    ctx.fillStyle = readout ? lane.color : C.muted;
    ctx.font = 'bold 8px monospace';
    ctx.fillText(readout || '—', SIEG_W - 12, y0 + 9);
    ctx.textAlign = 'left';
  });

  // ── Footer ──
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, FOOT_Y, SIEG_W, SIEG_H - FOOT_Y);
  ctx.fillStyle = C.muted;
  ctx.font = '9px monospace';
  ctx.fillText(`EVENTS ${s.eventCount || 0}   ·   CORRELATED ${s.correlatedCount || 0}`, 10, FOOT_Y + 18);
  ctx.textAlign = 'right';
  ctx.fillText(s.statusText || '', SIEG_W - 10, FOOT_Y + 18);
  if (s.recording) {
    ctx.fillStyle = C.rec;
    ctx.fillText('● REC', SIEG_W - 96, FOOT_Y + 18);
  }
  ctx.textAlign = 'left';

  return { laneH, cameraFit: fit };
}