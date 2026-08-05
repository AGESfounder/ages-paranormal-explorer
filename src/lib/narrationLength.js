// Story-length preference for tour/stop content and narration.
// Stored in localStorage so it persists across sessions without a schema change.

export const NARRATION_LENGTHS = [
  { value: 'whisper', label: 'Whisper', description: '⅓ the full story' },
  { value: 'echo', label: 'Echo', description: '⅔ the full story' },
  { value: 'manifestation', label: 'Manifestation', description: 'The complete story' },
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