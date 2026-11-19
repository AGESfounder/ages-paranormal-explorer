// The stamp burned into every recording: the date the session began (fixed for
// the whole session), the live clock, and the location the journal save uses.
// Formatting lives here so all eight recorders burn the same thing, and so the
// saved record can be built from the exact same values the frames carry.

const pad = (n) => String(n).padStart(2, '0');

// "11/19/2026"
export function formatStampDate(d) {
  const s = d instanceof Date ? d : new Date();
  return `${pad(s.getMonth() + 1)}/${pad(s.getDate())}/${s.getFullYear()}`;
}

// "11/19/2026 · 10:52:31 PM" — the date is fixed at the session's start, the
// clock keeps ticking.
export function formatStampLine(start, now = new Date()) {
  return `${formatStampDate(start)} · ${now.toLocaleTimeString()}`;
}

// The journal's own date and time fields, taken from the session's start so the
// burned stamp and the saved record always describe the same moment.
export function stampRecordFields(start) {
  const s = start instanceof Date ? start : new Date();
  return {
    date: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`,
    time: `${pad(s.getHours())}:${pad(s.getMinutes())}`,
  };
}

// Shorten a label to the space it has on the canvas, so a long stop name never
// runs off the frame or over another readout. Call with the font already set.
export function fitStampText(ctx, text, maxWidth) {
  if (!text || !(maxWidth > 0)) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}