// The live transparent layer and the recorded canvas share all annotations.
// The green camera image is left underneath; only real detector regions are lit.
export function drawAnomalyCameraOverlay(ctx, width, height, figures) {
  ctx.save();
  ctx.fillStyle = '#00b4ff';
  figures.forEach(({ pixels }) => {
    for (const pixel of pixels || []) {
      const x = pixel % width, y = Math.floor(pixel / width);
      ctx.fillRect(x, y, Math.min(4, width - x), Math.min(4, height - y));
    }
  });
  ctx.strokeStyle = 'rgba(0, 255, 100, 0.06)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < width; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  figures.forEach(({ pixels }) => {
    if (!pixels?.size) return;
    ctx.beginPath();
    for (const pixel of pixels) {
      const x = pixel % width, y = Math.floor(pixel / width);
      if (x + 4 >= width || !pixels.has(pixel + 4)) { ctx.moveTo(x + 4, y); ctx.lineTo(x + 4, y + 4); }
      if (x - 4 < 0 || !pixels.has(pixel - 4)) { ctx.moveTo(x, y); ctx.lineTo(x, y + 4); }
      if (y - 4 < 0 || !pixels.has(pixel - 4 * width)) { ctx.moveTo(x, y); ctx.lineTo(x + 4, y); }
      if (y + 4 >= height || !pixels.has(pixel + 4 * width)) { ctx.moveTo(x, y + 4); ctx.lineTo(x + 4, y + 4); }
    }
    ctx.strokeStyle = 'rgba(51, 224, 255, 0.28)';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = '#33e0ff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  });
  figures.forEach(({ x, y, w, h }) => {
    ctx.strokeStyle = 'rgba(0, 180, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(0, 180, 255, 0.9)';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('ANOMALY DETECTED', x, y - 8);
  });
  ctx.fillStyle = 'rgba(0, 255, 100, 0.7)';
  ctx.font = '10px monospace';
  ctx.fillText('ANOMALY CAM · FIGURE SCAN', 8, 16);
  ctx.fillText(`FIGURES: ${figures.length}`, 8, 30);
  ctx.fillText(new Date().toLocaleTimeString(), width - 72, 16);
  ctx.restore();
}