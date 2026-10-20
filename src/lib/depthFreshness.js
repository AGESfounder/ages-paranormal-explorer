import { annotateFigureMotion } from '@/lib/figureMotion';

// Expiry is checked on every paint, not just when a new native frame arrives.
// A stopped/stalled sensor must never leave a confirmed skeleton on screen.
// Movement is measured against the frame this one replaces, so a figure's movement
// confirmation travels with the figure and expires on its own.
export function stampDepthFrame(data, imageEl, receivedAt = Date.now(), previous = null) {
  return {
    ...data,
    imageEl,
    receivedAt,
    figures: annotateFigureMotion(data.figures, previous?.figures, receivedAt).map((figure) => ({
      ...figure,
      expiresAt: receivedAt + Math.max(0, Math.min(1000, Number.isFinite(figure.validForMs) ? figure.validForMs : 1000)),
    })),
  };
}

export function liveDepthFigures(frame, now = Date.now()) {
  return (frame?.figures || []).filter((figure) => Number.isFinite(figure.expiresAt) && figure.expiresAt > now);
}