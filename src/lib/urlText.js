// URL pattern for matching web addresses in text. Used by stripUrlsForNarration
// (TTS — says "link" instead of reading the URL) and LinkifiedText (display —
// renders URLs as clickable blue links). Matches http/https URLs, www.
// prefixed domains, and bare domains with common TLDs (with optional paths).
const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.(?:com|org|net|edu|gov|io|info|biz)(?:\/[^\s]*)?)/i;
export const URL_REGEX = new RegExp(URL_PATTERN.source, 'gi');
export const URL_TEST = URL_PATTERN;

// Strips URLs from text for narration. Removes URLs entirely so the narrator
// skips them — the blue link in the display is enough, no need to say anything.
export function stripUrlsForNarration(text) {
  if (!text) return text;
  return text.replace(URL_REGEX, '');
}