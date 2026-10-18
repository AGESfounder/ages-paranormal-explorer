// Trim options for session recording saves. Each recording tool offers these
// three on its review/stopped screen; "Full" is the default so nothing changes
// for users who don't care.
//
// How it works: every recorder already runs MediaRecorder.start(1000), which
// fires ondataavailable every second. We timestamp each chunk as it arrives.
// At save time, "Full" concatenates every chunk (the current behaviour);
// "Brief" and "Standard" take the first chunk (it carries the container
// header — EBML for webm, moov for mp4 — which is required for playback) plus
// only the chunks from the last N seconds. No re-encoding, no server-side
// trimming — just selecting which client-side chunks to include in the upload.

export const TRIM_OPTIONS = [
  { id: 'brief', label: 'Brief', seconds: 30, desc: 'last 30 seconds' },
  { id: 'standard', label: 'Standard', seconds: 90, desc: 'last 90 seconds' },
  { id: 'full', label: 'Full', seconds: null, desc: 'entire session' },
];

// Build a blob from timestamped chunks, optionally trimmed to the last N seconds.
// chunks: array of { blob, t } where t is the wall-clock ms when the chunk arrived.
// trimSeconds: null = full session, or a number of seconds to keep from the end.
// fallbackType: the mime type to use if the chunks don't carry one.
export function buildTrimmedBlob(chunks, trimSeconds, fallbackType) {
  if (!chunks || chunks.length === 0) return null;
  const type = (chunks[0].blob && chunks[0].blob.type) || fallbackType || 'video/webm';
  if (trimSeconds == null || trimSeconds <= 0) {
    return new Blob(chunks.map((c) => c.blob), { type });
  }
  const lastT = chunks[chunks.length - 1].t;
  const cutoff = lastT - trimSeconds * 1000;
  const tail = chunks.filter((c) => c.t >= cutoff);
  // Always include the first chunk (container header) + the tail. If every
  // chunk is within the trim window, tail already includes chunk[0], so just
  // use tail.
  const selected = tail.length > 0 && tail[0] === chunks[0] ? tail : (tail.length > 0 ? [chunks[0], ...tail] : chunks);
  return new Blob(selected.map((c) => c.blob), { type });
}