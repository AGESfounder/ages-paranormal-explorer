// SIEG uses the standalone camera's green pixel treatment and blue detector
// regions, drawn into its existing composite rather than showing a raw player.
const surfaces = new WeakMap();

export function drawSiegAnomalyScan(ctx, video, fit, detection) {
  let canvas = surfaces.get(video);
  if (!canvas) { canvas = document.createElement('canvas'); surfaces.set(video, canvas); }
  const width = video.videoWidth, height = video.videoHeight;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const scan = canvas.getContext('2d', { willReadFrequently: true });
  scan.drawImage(video, 0, 0, width, height);
  const image = scan.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.2 + data[i + 1] * 0.6 + data[i + 2] * 0.2;
    data[i] = 0; data[i + 1] = Math.min(255, gray * 1.3); data[i + 2] = 0;
  }
  scan.putImageData(image, 0, 0);
  ctx.drawImage(canvas, fit.dx, fit.dy, fit.dw, fit.dh);
  if (!detection?.boxes?.length) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(fit.dx, fit.dy, fit.dw, fit.dh); ctx.clip();
  ctx.translate(fit.dx, fit.dy);
  ctx.scale(fit.dw / detection.width, fit.dh / detection.height);
  ctx.fillStyle = '#00b4ff';
  for (const { pixels } of detection.boxes) {
    if (!pixels?.size) continue;
    ctx.beginPath();
    for (const pixel of pixels) {
      const x = pixel % detection.width, y = Math.floor(pixel / detection.width);
      ctx.fillRect(x, y, Math.min(4, detection.width - x), Math.min(4, detection.height - y));
      if (x + 4 >= detection.width || !pixels.has(pixel + 4)) { ctx.moveTo(x + 4, y); ctx.lineTo(x + 4, y + 4); }
      if (x < 4 || !pixels.has(pixel - 4)) { ctx.moveTo(x, y); ctx.lineTo(x, y + 4); }
      if (y < 4 || !pixels.has(pixel - 4 * detection.width)) { ctx.moveTo(x, y); ctx.lineTo(x + 4, y); }
      if (y + 4 >= detection.height || !pixels.has(pixel + 4 * detection.width)) { ctx.moveTo(x, y + 4); ctx.lineTo(x + 4, y + 4); }
    }
    ctx.strokeStyle = 'rgba(51, 224, 255, 0.28)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = '#33e0ff'; ctx.lineWidth = 2.5; ctx.stroke();
  }
  ctx.restore();
}