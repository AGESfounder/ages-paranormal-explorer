// Strip chart for the Environmental Anomaly Monitor, drawn onto the canvas the
// session records — so the saved file carries exactly what was on screen.
//
// Two traces, one per sensor, each drawn as its departure from its own baseline and
// scaled to its own full range (pressure and magnetic field share no unit, so they
// cannot share a scale). Both are stroked with the canvas's additive blend, so where
// the two traces coincide the ink sums to white: one moment, both sensors departing
// together. The halo is drawn only over the stretches that are actually away from
// the baseline, so two resting traces lying on the centre line do not sum into a
// glow across the whole chart.

const PRESSURE_FULL = 0.6;   // ± hPa spans half the chart height
const MAGNETIC_FULL = 8;     // ± µT spans half the chart height
export const PRESSURE_COLOR = '#22d3ee';
export const MAGNETIC_COLOR = '#a78bfa';
export const COMBINED_COLOR = '#ffffff';

const WINDOW_SAMPLES = 300;
const CHART_TOP = 54;
const CHART_BOTTOM = 250;

function drawTrace(ctx, values, color, geom) {
  if (!values || values.length < 2) return;
  const { w, centerY, half, full, pxPerSample } = geom;
  const yAt = (v) => centerY - Math.max(-full, Math.min(full, v)) * (half / full);
  const xAt = (i) => w - (values.length - 1 - i) * pxPerSample;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Halo, broken wherever the trace is resting on the baseline.
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 7;
  ctx.beginPath();
  let haloOpen = false;
  values.forEach((v, i) => {
    const away = v != null && Math.abs(v) > full * 0.12;
    if (!away) { haloOpen = false; return; }
    if (haloOpen) ctx.lineTo(xAt(i), yAt(v));
    else { ctx.moveTo(xAt(i), yAt(v)); haloOpen = true; }
  });
  ctx.stroke();

  // The trace itself.
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  let open = false;
  values.forEach((v, i) => {
    if (v == null) { open = false; return; }
    if (open) ctx.lineTo(xAt(i), yAt(v));
    else { ctx.moveTo(xAt(i), yAt(v)); open = true; }
  });
  ctx.stroke();
  ctx.restore();
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function drawEnvironmentChart(ctx, canvas, s) {
  const w = canvas.width;
  const h = canvas.height;
  const centerY = (CHART_TOP + CHART_BOTTOM) / 2;
  const half = (CHART_BOTTOM - CHART_TOP) / 2;
  const pxPerSample = w / WINDOW_SAMPLES;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#e2ebf3';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('ENVIRONMENTAL ANOMALY MONITOR', 14, 24);
  ctx.fillStyle = '#64748b';
  ctx.font = '10px monospace';
  ctx.fillText('RELATIVE TO BASELINE · ACCURACY DEPENDS ON YOUR DEVICE', 14, 39);

  if (s.recording) {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(w - 60, 20, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('REC ' + formatDuration(s.duration), w - 14, 24);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '10px monospace';
    ctx.fillText(new Date().toLocaleTimeString(), w - 14, 38);
    ctx.textAlign = 'left';
  }

  // Frame, grid, and the baseline both traces are measured from.
  ctx.strokeStyle = 'rgba(148,163,184,0.16)';
  ctx.lineWidth = 1;
  ctx.strokeRect(1, CHART_TOP, w - 2, CHART_BOTTOM - CHART_TOP);
  for (let i = 1; i < 10; i++) {
    const x = i * (w / 10);
    ctx.beginPath(); ctx.moveTo(x, CHART_TOP); ctx.lineTo(x, CHART_BOTTOM); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(226,235,243,0.42)';
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(w, centerY); ctx.stroke();
  ctx.setLineDash([]);

  // Event markers, so a logged departure can be found on the trace. A white marker
  // is the one case worth looking for: both sensors moved at once.
  const nowSample = s.trace.pressure.length;
  s.markers.forEach((m) => {
    const x = w - (nowSample - m.sample) * pxPerSample;
    if (x < 0 || x > w) return;
    ctx.strokeStyle = m.combined ? 'rgba(255,255,255,0.85)'
      : m.channel === 'magnetic' ? 'rgba(167,139,250,0.75)' : 'rgba(34,211,238,0.75)';
    ctx.beginPath(); ctx.moveTo(x, CHART_TOP); ctx.lineTo(x, CHART_BOTTOM); ctx.stroke();
  });

  const geom = { w, centerY, half, pxPerSample };
  drawTrace(ctx, s.trace.pressure, PRESSURE_COLOR, { ...geom, full: PRESSURE_FULL });
  drawTrace(ctx, s.trace.magnetic, MAGNETIC_COLOR, { ...geom, full: MAGNETIC_FULL });

  // Legend and live readings, drawn into the recording as well as shown on screen.
  const rowY = CHART_BOTTOM + 26;
  const dev = (v, digits, unit) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(digits)} ${unit}`);
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';

  const pressureText = s.hasPressure
    ? `PRESSURE ${s.readouts.pressure == null ? '—' : s.readouts.pressure.toFixed(1) + ' hPa'}  ${dev(s.readouts.presDev, 2, 'hPa')}`
    : 'PRESSURE · not on this device';
  ctx.fillStyle = s.hasPressure ? PRESSURE_COLOR : '#475569';
  ctx.fillText(pressureText, 14, rowY);

  const magneticText = s.hasMagnetic
    ? `MAGNETIC ${s.readouts.magnetic == null ? '—' : s.readouts.magnetic.toFixed(1) + ' µT'}  ${dev(s.readouts.magDev, 1, 'µT')}`
    : 'MAGNETIC · not on this device';
  ctx.textAlign = 'right';
  ctx.fillStyle = s.hasMagnetic ? MAGNETIC_COLOR : '#475569';
  ctx.fillText(magneticText, w - 14, rowY);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '10px monospace';
  ctx.fillText('WHERE THE TWO TRACES MEET · BOTH SENSORS DEPARTING TOGETHER', w / 2, rowY + 20);

  // Status.
  const status = s.status === 'EVENT' ? 'DEPARTURE FROM BASELINE' : 'MONITORING — SENSORS AND STILLNESS';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = s.moving ? '#facc15' : s.status === 'EVENT' ? '#f87171' : '#4ade80';
  ctx.fillText(s.moving ? 'PHONE MOVING — PRESSURE ON HOLD' : status, 14, h - 26);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.fillText('EVENTS: ' + s.eventCount + ' · ' + String(s.sensitivity || '').toUpperCase(), w - 14, h - 26);

  if (s.calibrating) {
    ctx.fillStyle = 'rgba(250,204,21,0.85)';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`MEASURING BASELINE — HOLD STILL (${s.calibrationLeft}s)`, w / 2, centerY - 12);
  } else if (s.anomaly) {
    const label = s.anomaly.combined
      ? '⚠ BOTH SENSORS TOGETHER'
      : s.anomaly.channel === 'magnetic' ? '⚠ MAGNETIC DEPARTURE' : '⚠ PRESSURE DEPARTURE';
    ctx.fillStyle = s.anomaly.combined ? 'rgba(255,255,255,0.92)' : 'rgba(239,68,68,0.92)';
    ctx.fillRect(w / 2 - 112, CHART_TOP + 8, 224, 22);
    ctx.fillStyle = s.anomaly.combined ? '#0b1220' : '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, w / 2, CHART_TOP + 23);
  }
}