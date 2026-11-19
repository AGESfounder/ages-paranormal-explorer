import { fitStampText } from '@/lib/recordingStamp';

// Keep metadata readable over bright camera images without changing detection.
// Both contrast and depth recordings burn this same two-line header.
export function drawAnomalyRecordingStamp(ctx, width, { title, figureText, stampLine, location }) {
  ctx.save();
  ctx.fillStyle = 'rgba(2, 7, 12, 0.88)';
  ctx.fillRect(0, 0, width, 42);
  ctx.font = '10px monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#b7f7d2';
  ctx.fillText(title, 8, 16);
  const titleWidth = ctx.measureText(title).width;
  ctx.fillText(figureText, 8, 32);
  const figureWidth = ctx.measureText(figureText).width;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e2ebf3';
  ctx.fillText(fitStampText(ctx, stampLine || '', width - titleWidth - 28), width - 8, 16);
  ctx.fillText(fitStampText(ctx, location || '', width - figureWidth - 28), width - 8, 32);
  ctx.restore();
}