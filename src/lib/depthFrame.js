// Draws a native depth frame and the forms detected in it onto the Anomaly
// Camera's canvas, in the same house style as the contrast view (grid, header,
// figure count, clock). Everything drawn here lands in the recording, so a saved
// depth session carries the trace and the boxes exactly as they were on screen.

export function drawDepthFrame(ctx, canvas, frame, { figureCount }) {
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#02070c';
  ctx.fillRect(0, 0, w, h);

  if (frame?.imageEl) {
    ctx.drawImage(frame.imageEl, 0, 0, w, h);
  }

  ctx.strokeStyle = 'rgba(0, 255, 100, 0.06)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // Bounding box + label for each form the sensor found.
  (frame?.figures || []).forEach(({ x, y, w: bw, h: bh }) => {
    const boxX = x * w;
    const boxY = y * h;
    ctx.strokeStyle = 'rgba(0, 180, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, bw * w, bh * h);
    ctx.fillStyle = 'rgba(0, 180, 255, 0.9)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ANOMALY DETECTED', boxX, Math.max(12, boxY - 8));
  });

  ctx.fillStyle = 'rgba(0, 255, 100, 0.7)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('ANOMALY CAM · DEPTH SCAN', 8, 16);
  ctx.fillText(`FIGURES: ${figureCount}`, 8, 30);
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleTimeString(), w - 8, 16);
}