import { drawFigureSkeleton, hasSkeleton } from '@/lib/figureSkeleton';

// Draws a native depth frame and the figures confirmed in it onto the Anomaly
// Camera's canvas, in the same house style as the contrast view (grid, header,
// figure count, clock). Everything drawn here lands in the recording, so a saved
// depth session carries the room's depth image and the confirmed skeleton exactly as
// they were on screen.
//
// The depth image is fitted inside the canvas whole — never stretched — and the
// boxes and skeletons are mapped through the same fit, so a skeleton always lands on
// the body it was found on.
export function drawDepthFrame(ctx, canvas, frame, { figureCount }) {
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#02070c';
  ctx.fillRect(0, 0, w, h);

  const srcW = frame?.imageEl?.naturalWidth || w;
  const srcH = frame?.imageEl?.naturalHeight || h;
  const scale = Math.min(w / srcW, h / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  if (frame?.imageEl) ctx.drawImage(frame.imageEl, dx, dy, dw, dh);

  ctx.strokeStyle = 'rgba(0, 255, 100, 0.06)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  // Each confirmed figure, in the frame's own 0-1 coordinates: the box, the skeleton
  // the sensor actually found, and the one label this method has earned.
  (frame?.figures || []).forEach(({ x, y, w: bw, h: bh, joints }) => {
    const boxX = dx + x * dw;
    const boxY = dy + y * dh;
    ctx.strokeStyle = 'rgba(0, 180, 255, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, bw * dw, bh * dh);
    if (hasSkeleton({ joints })) {
      drawFigureSkeleton(ctx, joints, ([jx, jy]) => [dx + jx * dw, dy + jy * dh]);
    }
    ctx.fillStyle = 'rgba(0, 180, 255, 0.9)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('FIGURE DETECTED', boxX, Math.max(12, boxY - 8));
  });

  ctx.fillStyle = 'rgba(0, 255, 100, 0.7)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('ANOMALY CAM · DEPTH SCAN', 8, 16);
  ctx.fillText(`FIGURES: ${figureCount}`, 8, 30);
  if (!figureCount) ctx.fillText('SCANNING FOR A FIGURE', 8, 44);
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleTimeString(), w - 8, 16);
}