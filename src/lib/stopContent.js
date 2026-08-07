// Conclusion-like opening phrases that signal the end of a tour.
// These should only appear on the FINAL stop's narration_text / paranormal_info.
// When they appear on non-final stops they look sloppy and premature.
const CONCLUSION_OPENERS = [
  /^(as )?we (conclude|wrap up|finish|end|bring|come to (an end|a close)|say (goodbye|farewell))/i,
  /^(to )?conclude[,\s]/i,
  /^(in )?conclusion[,\s]/i,
  /^wrapping up/i,
  /^(as )?our (tour|journey|investigation) (comes to|ends|draws to|winds down|finishes|concludes)/i,
  /^(as )?we (bring|close|finish|end) (our|this) (tour|journey|investigation)/i,
  /^our (final|last) stop/i,
  /^(and so|thus|finally),? (we|our|as)/i,
  /^(as )?we (near|approach) (the end|our final)/i,
  /^having (concluded|finished|completed|explored)/i,
  /^(as )?we (leave|depart|exit|step away from) (this|our|the) (final|last)/i,
  /^with (this|our) (final|last)/i,
];

// Strip conclusion-like opening sentences from a stop's text. Only the
// final stop on a tour may keep these phrases. Removes up to 2 leading
// sentences that match a conclusion opener; preserves the rest of the text.
export function stripConclusionOpeners(text, isFinalStop) {
  if (!text || isFinalStop) return text;
  const sentences = text.match(/[^.!?]+[.!?]+["'\u201d]?\s*/g);
  if (!sentences) return text;
  const filtered = [];
  let removed = 0;
  for (let i = 0; i < sentences.length; i++) {
    if (i < 3 && removed < 2) {
      const trimmed = sentences[i].trim();
      if (CONCLUSION_OPENERS.some((re) => re.test(trimmed))) {
        removed++;
        continue;
      }
    }
    filtered.push(sentences[i]);
  }
  return filtered.length > 0 ? filtered.join('').trim() : text;
}

// Shared prompt instruction block — append to any stop-generation prompt
// so the LLM reserves conclusion phrasing for the final stop only.
export const CONCLUSION_PHRASE_RULE = `\nCONCLUSION PHRASE RULE — FOLLOW EXACTLY: Do NOT begin any stop's narration_text or paranormal_info with conclusion-like phrases such as "We conclude our tour...", "As we wrap up...", "Our final stop...", "As our journey ends...", or "In conclusion...". These phrases are reserved for the LAST stop on the tour ONLY. Every non-final stop must begin directly with content specific to that stop's own haunted history and paranormal activity. Only the final stop may use wrap-up / conclusion language.`;