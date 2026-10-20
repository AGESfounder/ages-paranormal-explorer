// Expiry is checked on every paint, not just when a new native frame arrives.
// A stopped/stalled sensor must never leave a confirmed skeleton on screen.
export function stampDepthFrame(data, imageEl, receivedAt = Date.now()) {
  return {
    ...data,
    imageEl,
    receivedAt,
    figures: (data.figures || []).map((figure) => ({
      ...figure,
      expiresAt: receivedAt + Math.max(0, Math.min(1000, Number.isFinite(figure.validForMs) ? figure.validForMs : 1000)),
    })),
  };
}

export function liveDepthFigures(frame, now = Date.now()) {
  return (frame?.figures || []).filter((figure) => Number.isFinite(figure.expiresAt) && figure.expiresAt > now);
}