// Draws the sensor-trigger badges onto a sweeper canvas so they appear in the
// session recording. Each badge lights only while its sensor is flashing (a
// confirmed, held departure — not a transient). Layout keeps the existing
// positions (anomaly top-center, motion bottom-center) and adds the two new
// environmental triggers on the sides: barometric left, magnetic right.
function drawBadge(ctx, x, y, w, h, text, bg) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + w / 2, y + h / 2 + 4);
}

export function drawSweeperBadges(ctx, w, h, states) {
  const { anomaly, motion, magnetic, barometric } = states;
  if (anomaly) drawBadge(ctx, w / 2 - 85, 44, 170, 22, '⚠ ANOMALY DETECTED', 'rgba(239,68,68,0.92)');
  if (motion) drawBadge(ctx, w / 2 - 85, h - 52, 170, 22, '⚠ MOTION DETECTED', 'rgba(245,158,11,0.92)');
  if (barometric) drawBadge(ctx, 8, h / 2 - 11, 112, 22, '⚠ BAROMETRIC', 'rgba(96,165,250,0.92)');
  if (magnetic) drawBadge(ctx, w - 120, h / 2 - 11, 112, 22, '⚠ MAGNETIC', 'rgba(167,139,250,0.92)');
}