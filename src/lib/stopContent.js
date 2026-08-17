// Conclusion-like phrases that signal the end of a tour. These should only
// appear on the FINAL stop's narration_text / paranormal_info. When they
// appear on non-final stops they look sloppy and premature.
// Two tiers:
// - OPENERS: match at the start of a sentence (stripped from the first 3
//   sentences of non-final stops).
// - ANYWHERE: match anywhere in a sentence (stripped from ALL sentences of
//   non-final stops). Catches mid-text references like "the cellar where our
//   tour ends" that the LLM buries deeper in the narration.
const CONCLUSION_OPENERS = [
  /^(as )?we (conclude|wrap up|finish|end|bring|come to (an end|a close)|say (goodbye|farewell))/i,
  /^(to )?conclude[,\s]/i,
  /^(in )?conclusion[,\s]/i,
  /^wrapping up/i,
  /^(as )?our (tour|journey|investigation) (comes to|ends|draws to|winds down|finishes|concludes)/i,
  /^(as )?we (bring|close|finish|end) (our|this) (tour|journey|investigation)/i,
  /^(our|this|the) (final|last) stop/i,
  /^(and so|thus|finally),? (we|our|as)/i,
  /^(as )?we (near|approach) (the end|our final)/i,
  /^having (concluded|finished|completed|explored)/i,
  /^(as )?we (leave|depart|exit|step away from) (this|our|the) (final|last)/i,
  /^with (this|our) (final|last)/i,
];

// Phrases that reference the tour ending/wrapping up anywhere in a sentence.
// These are stripped from every sentence of non-final stops, not just the
// opening ones — the LLM sometimes buries "where our tour ends" or "as we
// conclude" mid-narration.
const CONCLUSION_ANYWHERE = [
  /\b(where|as|before|when|after|until|while)\s+(our|the|this)\s+(tour|journey|investigation)\s+(ends|concludes|finishes|wraps up|comes to (an end|a close)|draws to (a close|an end))\b/i,
  /\b(our|this|the)\s+(final|last)\s+stop\b/i,
  /\b(wrapping up|to conclude|in conclusion)\b/i,
  /\b(as|when)\s+we\s+(conclude|wrap up|finish|end|leave|depart)\s+(our|the|this)\s+(tour|journey|investigation)\b/i,
  /\b(bringing|bring)\s+(our|the)\s+(tour|journey|investigation)\s+(to an end|to a close)\b/i,
  /\b(our|the)\s+(tour|journey|investigation)\s+(comes to an end|draws to a close|winds down)\b/i,
];

// Strip conclusion-like references from a stop's text. Only the final stop
// on a tour may keep these phrases. Two passes:
// 1. Opening pass: removes up to 2 leading sentences (from the first 3) that
//    begin with a conclusion opener phrase.
// 2. Anywhere pass: removes ANY sentence (regardless of position) that
//    contains a mid-text conclusion reference like "where our tour ends" or
//    "as we conclude our investigation". This catches references the LLM
//    buries deeper in the narration, not just at the start.
// If all sentences are stripped (text was entirely conclusion filler),
// fall back to the original text rather than returning an empty string.
export function stripConclusionOpeners(text, isFinalStop) {
  if (!text || isFinalStop) return text;
  const sentences = text.match(/[^.!?]+[.!?]+["'\u201d]?\s*/g);
  if (!sentences) return text;
  const filtered = [];
  let removed = 0;
  for (let i = 0; i < sentences.length; i++) {
    const trimmed = sentences[i].trim();
    // Opening pass — first 3 sentences, max 2 removed
    if (i < 3 && removed < 2 && CONCLUSION_OPENERS.some((re) => re.test(trimmed))) {
      removed++;
      continue;
    }
    // Anywhere pass — strip any sentence containing a mid-text conclusion
    // reference, regardless of its position in the text
    if (CONCLUSION_ANYWHERE.some((re) => re.test(trimmed))) {
      continue;
    }
    filtered.push(sentences[i]);
  }
  return filtered.length > 0 ? filtered.join('').trim() : text;
}

// Shared prompt instruction block — append to any stop-generation prompt
// so the LLM reserves conclusion phrasing for the final stop only.
export const CONCLUSION_PHRASE_RULE = `\nCONCLUSION PHRASE RULE — FOLLOW EXACTLY: For any stop that is NOT the last stop on the tour, do NOT include ANY references to the tour ending, wrapping up, concluding, finishing, or coming to a close — not just at the beginning, but ANYWHERE in the narration_text or paranormal_info. This means: no "as we end our tour", no "where the tour concludes", no "our final stop", no "as we wrap up", no "before we finish", no "the cellar where our tour ends", no "bringing our investigation to a close", and no similar phrasing anywhere in the text — beginning, middle, or end. Each non-final stop must focus ENTIRELY on its own haunted history and paranormal activity as if it is a standalone story. Only the LAST stop on the tour may reference the tour ending or use wrap-up / conclusion language.`;