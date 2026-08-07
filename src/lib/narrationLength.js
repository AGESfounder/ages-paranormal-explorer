// Story-length preference for tour/stop content and narration.
import { callJson } from '@/lib/llmJson';
// Stored in localStorage so it persists across sessions without a schema change.

export const NARRATION_LENGTHS = [
  { value: 'whisper', label: 'Glimpse into the Past', description: '⅓ the full story' },
  { value: 'echo', label: 'Uncover the Mystery', description: '⅔ the full story' },
  { value: 'manifestation', label: 'Relive the Legend', description: 'The complete story' },
];

const STORAGE_KEY = 'ages_narration_length';

export function getNarrationLength() {
  if (typeof localStorage === 'undefined') return 'manifestation';
  return localStorage.getItem(STORAGE_KEY) || 'manifestation';
}

export function saveNarrationLength(value) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, value);
}

// Split text into sentences, keeping the ending punctuation.
function splitSentences(text) {
  if (!text) return [];
  const matches = text.match(/[^.!?]+[.!?]+["'")\]]?(?:\s+|$)/g);
  if (!matches || matches.length <= 1) return [text];
  return matches.map(s => s.trim()).filter(Boolean);
}

/**
 * Truncate text to the target fraction at sentence boundaries.
 * @param {string} text - full text
 * @param {string} mode - 'whisper' (1/3), 'echo' (2/3), or 'manifestation' (full)
 * @returns {string} truncated text
 */
export function truncateText(text, mode) {
  if (!text || mode === 'manifestation') return text || '';
  const sentences = splitSentences(text);
  if (sentences.length <= 2) return text || '';
  const fraction = mode === 'whisper' ? 1 / 3 : 2 / 3;
  const count = Math.max(1, Math.ceil(sentences.length * fraction));
  return sentences.slice(0, count).join(' ');
}

// ===== LLM-powered condensation =====
// Rather than cutting text off at sentence boundaries, the LLM rewrites each
// text into a cohesive, self-contained narrative at the target length. Results
// are cached in localStorage so each text+mode is only condensed once (1
// manifestation energy per batch of uncached texts on a page).

function hashKey(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function condCacheKey(text, mode) {
  return `ages_cond_${mode}_${hashKey(text)}`;
}

const MAX_CACHE_ENTRIES = 200;

export function getCachedCondensation(text, mode) {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(condCacheKey(text, mode)) || null;
  } catch { return null; }
}

export function cacheCondensation(text, mode, result) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(condCacheKey(text, mode), result);
    // Prune oldest entries if over limit
    const keys = Object.keys(localStorage).filter(k => k.startsWith('ages_cond_'));
    if (keys.length > MAX_CACHE_ENTRIES) {
      keys.slice(0, keys.length - MAX_CACHE_ENTRIES).forEach(k => localStorage.removeItem(k));
    }
  } catch {}
}

/**
 * Condense multiple texts in a single LLM call. Returns { key: condensedText }.
 * @param {Object} textMap - { key: fullText }
 * @param {string} mode - 'whisper' or 'echo'
 */
export async function condenseTextsBatch(textMap, mode) {
  const fraction = mode === 'whisper' ? 'one-third' : 'two-thirds';
  const entries = Object.entries(textMap);
  if (entries.length === 0) return {};

  const prompt = `You are a skilled paranormal narrator. For each text below, write a cohesive, self-contained summary that captures the essential atmosphere, key events, and most compelling paranormal details. Do NOT simply cut off the text — restructure each into a complete, well-rounded narrative that stands on its own as a polished piece of writing. Target length: approximately ${fraction} of the original.

${entries.map(([key, text]) => `=== ${key} ===\n${text}`).join('\n\n')}

Return a JSON object mapping each key to its condensed text. Output ONLY valid JSON, no markdown fences.`;

  return await callJson(prompt, { useWeb: false }) || {};
}

// ===== Adjusted duration =====
// Scales the tour's estimated duration based on the selected story length.
// Glimpse (whisper) is lowered beyond the 1/3 text fraction because users who
// read less also tend to investigate less; Uncover (echo) ~60%; Relive full.

const DURATION_FACTORS = {
  whisper: 0.25,
  echo: 0.6,
  manifestation: 1.0,
};

function parseDurationToMinutes(durationStr) {
  if (!durationStr) return null;
  const str = String(durationStr).toLowerCase().trim();
  const rangeMatch = str.match(/([\d.]+)\s*[-\u2013to]+\s*([\d.]+)/);
  const singleMatch = str.match(/([\d.]+)/);
  let low, high;
  if (rangeMatch) {
    low = parseFloat(rangeMatch[1]);
    high = parseFloat(rangeMatch[2]);
  } else if (singleMatch) {
    low = high = parseFloat(singleMatch[1]);
  } else {
    return null;
  }
  const multiplier = (str.includes('min') || str.includes('minute')) ? 1 : 60;
  return [Math.round(low * multiplier), Math.round(high * multiplier)];
}

function roundTo5(m) {
  return Math.max(5, Math.round(m / 5) * 5);
}

function formatMinutes(m) {
  if (m >= 60) {
    const h = m / 60;
    const rounded = Math.round(h * 2) / 2; // nearest 0.5 hr
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded} hr`;
  }
  return `${roundTo5(m)} min`;
}

// Returns the Glimpse-low to Relive-high range for display in tour lists/cards.
export function computeDurationRange(durationStr, extraMinutes = 0) {
  const parsed = parseDurationToMinutes(durationStr);
  if (!parsed) return durationStr || '';
  const [low, high] = parsed;
  const glimpseLow = Math.max(5, Math.round(low * DURATION_FACTORS.whisper));
  const reliveHigh = Math.max(5, Math.round(high * DURATION_FACTORS.manifestation) + extraMinutes);
  if (glimpseLow === reliveHigh) return formatMinutes(reliveHigh);
  return `${formatMinutes(glimpseLow)}\u2013${formatMinutes(reliveHigh)}`;
}

export function computeAdjustedDuration(durationStr, mode, extraMinutes = 0) {
  const parsed = parseDurationToMinutes(durationStr);
  if (!parsed) return durationStr || '';
  const [low, high] = parsed;
  const factor = DURATION_FACTORS[mode] || 1.0;
  const adjLow = Math.max(5, Math.round(low * factor));
  const adjHigh = Math.max(5, Math.round(high * factor) + extraMinutes);
  if (adjLow === adjHigh) return formatMinutes(adjLow);
  return `${formatMinutes(adjLow)}\u2013${formatMinutes(adjHigh)}`;
}