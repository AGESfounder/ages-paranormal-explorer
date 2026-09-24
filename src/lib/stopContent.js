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
  // Allow an optional adjective (e.g. "paranormal") between the possessive
  // and the noun — the LLM writes "our paranormal investigation reaches its
  // conclusion" which the old strict pattern missed.
  /\b(where|as|before|when|after|until|while)\s+(our|the|this)\s+(?:\w+\s+)?(tour|journey|investigation)\s+(ends|concludes|finishes|wraps up|comes to (an end|a close)|draws to (a close|an end)|reaches (its|a) conclusion)\b/i,
  /\b(our|this|the)\s+(final|last)\s+stop\b/i,
  /\b(wrapping up|to conclude|in conclusion)\b/i,
  /\b(as|when)\s+we\s+(conclude|wrap up|finish|end|leave|depart)\s+(our|the|this)\s+(tour|journey|investigation)\b/i,
  /\b(bringing|bring)\s+(our|the)\s+(tour|journey|investigation)\s+(to an end|to a close)\b/i,
  /\b(our|the)\s+(tour|journey|investigation)\s+(comes to an end|draws to a close|winds down)\b/i,
  // Standalone catch — "reaches its conclusion", "nearing a conclusion", etc.
  // regardless of what precedes it.
  /\b(reaches|reaching|nears|nearing|approaches|approaching)\s+(its|a|their)\s+conclusion\b/i,
];

// Strip conclusion-like references from a stop's text. NO stop — not even
// the final stop — may contain conclusion language. The tour's Conclusion
// field is the ONLY place wrap-up/closing statements belong. Two passes:
// 1. Opening pass: removes up to 2 leading sentences (from the first 3) that
//    begin with a conclusion opener phrase.
// 2. Anywhere pass: removes ANY sentence (regardless of position) that
//    contains a mid-text conclusion reference like "where our tour ends" or
//    "as we conclude our investigation". This catches references the LLM
//    buries deeper in the narration, not just at the start.
// If all sentences are stripped (text was entirely conclusion filler),
// fall back to the original text rather than returning an empty string.
// The isFinalStop parameter is accepted for backward compatibility but
// has no effect — ALL stops are scrubbed.
export function stripConclusionOpeners(text, isFinalStop = false) {
  if (!text) return text;
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

// Strip conclusion phrases from all three text fields on a stop. Returns an
// object with only the fields that actually changed (for bulkUpdate / update).
// NO stop keeps conclusion language — the tour's Conclusion field is the only
// place for closing statements. The isFinalStop parameter is accepted for
// backward compatibility but has no effect.
export function stripStopConclusion(stop, isFinalStop = false) {
  if (!stop) return {};
  const updates = {};
  const cleanNarration = stripConclusionOpeners(stop.narration_text, false);
  const cleanParanormal = stripConclusionOpeners(stop.paranormal_info, false);
  const cleanHistorical = stripConclusionOpeners(stop.historical_info, false);
  if (cleanNarration !== stop.narration_text) updates.narration_text = cleanNarration;
  if (cleanParanormal !== stop.paranormal_info) updates.paranormal_info = cleanParanormal;
  if (cleanHistorical !== stop.historical_info) updates.historical_info = cleanHistorical;
  return updates;
}

// Brand rule for STOP-level content (narration_text, paranormal_info,
// historical_info). The full expansion "AGES (Accessible Ghost Exploration
// Solutions)" is reserved for the tour's introduction and conclusion only.
// In stops, only the abbreviation "AGES" is used — saying the full expansion
// at every stop is repetitive and the user flagged it as excessive.
export const BRAND_RULE_STOP = `\nBRAND RULE — FOLLOW EXACTLY: The app is branded AGES (Accessible Ghost Exploration Solutions). In stop content (narration_text, paranormal_info, historical_info), use ONLY the abbreviation "AGES" — NEVER write out the full expansion "Accessible Ghost Exploration Solutions" in stop content. The full "AGES (Accessible Ghost Exploration Solutions)" expansion is reserved for the tour's introduction and conclusion only. Using "AGES" alone in stops is correct and preferred.`;

// Brand rule for TOUR-level generation prompts (generate the tour shell plus
// stops). The full expansion is allowed in the introduction and conclusion,
// but stops must use only "AGES".
export const BRAND_RULE_TOUR = `\nBRAND RULE: The app is branded AGES, which stands for "Accessible Ghost Exploration Solutions" (never "Affordable"). You may use the full expansion "AGES (Accessible Ghost Exploration Solutions)" in the tour's introduction and conclusion. However, in STOP content (narration_text, paranormal_info, historical_info), use ONLY the abbreviation "AGES" — never write out the full expansion in stops. The full expansion in every stop is repetitive; "AGES" alone is correct for stops.`;

// Shared prompt instruction block — append to any stop-generation prompt
// so the LLM never includes conclusion language in stop content. The tour's
// Conclusion field is the ONLY place closing statements belong.
export const CONCLUSION_PHRASE_RULE = `\nCONCLUSION PHRASE RULE — FOLLOW EXACTLY: Do NOT include ANY conclusion, wrap-up, or ending statements in ANY stop's narration_text, paranormal_info, or historical_info — not even the last stop. The tour has a dedicated Conclusion field where all closing remarks belong. This means: no "as we end our tour", no "we conclude", no "final stop", no "last stop", no "finish", no "wrapping up", no "to conclude", no "in conclusion", no "bringing our investigation to a close", no "our tour ends here", no "as we wrap up", and no similar phrasing ANYWHERE in the text — beginning, middle, or end. Each stop must focus ENTIRELY on its own haunted history and paranormal activity as if it is a standalone story. The tour's Conclusion field handles all wrap-up language.`;

// Version of the stop-content enrichment prompt. Bump when the prompt rules
// change (e.g. the stop-focus directive that prevents repeating tour-level
// history in every stop). Tours with content_version < STOP_CONTENT_VERSION
// are auto-regenerated with the improved prompt when a paid user or admin
// opens them (one-time, at their energy expense). Once stamped, the tour's
// stops are permanently upgraded for all users.
export const STOP_CONTENT_VERSION = 1;