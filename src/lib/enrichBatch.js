// Batched stop enrichment.
//
// Enrichment normally makes one LLM call per stop, plus a second focus-rewrite
// call on single-site tours. This module lets two stops share each call, which
// halves the calls the app pays for and the manifestation energy the user
// spends.
//
// Batching two stops into one prompt is the risk: stops inside a single
// property share the same general history, so the model can blend them.
// Every batch is therefore checked by crossCheckBatch() — a purely local,
// zero-cost check — and a batch that fails it is discarded so the caller
// re-runs those stops one at a time. A failed batch costs extra calls, never
// wrong content.
import { callJson, extractJson } from '@/lib/llmJson';
import { BRAND_RULE_STOP, CONCLUSION_PHRASE_RULE } from '@/lib/stopContent';

export const ENRICH_BATCH_SIZE = 2;
const THIN_THRESHOLD = 600;

export function isSingleSiteCategory(category) {
  return category === 'landmark' || category === 'ship' || category === 'cold_spot';
}

// ---------- prompt builders ----------

export function buildBatchEnrichPrompt(stops, tourContext = {}, { force = false } = {}) {
  const singleSite = isSingleSiteCategory(tourContext.category);
  const intro = tourContext.introduction ? tourContext.introduction.slice(0, 1500) : '';
  const introText = intro
    ? `\nTOUR INTRODUCTION (already covers the property's general history — DO NOT repeat any of this information in any stop):\n${intro}\n`
    : '';
  const siblings = (tourContext.siblingStopNames || []).filter(Boolean);
  const siblingText = siblings.length
    ? `\nOTHER STOPS ON THIS TOUR (context only — do not write their content):\n${siblings.map((n) => `- ${n}`).join('\n')}\n`
    : '';

  const stopList = stops
    .map((s, i) => {
      const notes = !force && (s.historical_info || s.paranormal_info)
        ? `\n   Existing notes: ${s.historical_info || ''} ${s.paranormal_info || ''}`
        : '';
      return `STOP ${i} — "${s.name}"${s.address ? ` (${s.address})` : ''}${notes}`;
    })
    .join('\n');

  const histRule = singleSite
    ? ' — events that occurred in this specific room/area/section, not the property as a whole. Who used THIS room? What was THIS area for? What specific events happened HERE'
    : " — construction dates and architecture, major historical events that occurred there, notable figures who lived/worked/visited/died there, scandals/murders/tragedies, and the area's significance over time";
  const paraSuffix = singleSite ? ' — all SPECIFIC TO THIS STOP, not the property in general' : '';

  const focusRule = singleSite
    ? `\nSTOP-FOCUS RULE — FOLLOW EXACTLY (CRITICAL — THE MOST IMPORTANT RULE IN THIS PROMPT):
This is a single-property tour: every stop is a room, area, or section within ONE location ("${tourContext.title || ''}"). The general property history — construction date, the founder's name, the building's overall significance, its timeline — is already in the tour introduction above. DO NOT repeat ANY of it in any stop.
FIRST SENTENCE RULE: each stop's historical_info MUST open with a sentence about THAT stop, not about the property. Do NOT open with the property name, construction date, founder, or address.
BAD opening sentences (NEVER WRITE THESE): "The [Property Name] was constructed in [year]...", "Originally built by [Founder]...", "The [Property], established in [year]...", "The [Property] stands as a testament to..."
GOOD opening sentences: "This room served as...", "Within these walls...", "This area was used for...", "This specific corridor held..."
`
    : '';

  const separationRule = `\nSEPARATION RULE — FOLLOW EXACTLY (CRITICAL):
You are writing for ${stops.length} DIFFERENT stops on the same tour. Each entry in your output holds content for ONE stop and nothing else.
- NEVER merge two stops into one entry.
- NEVER copy a sentence, fact, or person from one entry into another.
- Each entry's first sentence must name ITS OWN stop.
SELF-CHECK before returning: re-read each entry on its own. If a sentence could sit unchanged in the other entry, delete it and write something specific to this entry's stop.
`;

  return `Generate rich, detailed content for ${stops.length} separate paranormal investigation stops on the same tour. Write each stop completely independently — they are shown to visitors on separate stop pages.

Tour: ${tourContext.title || ''}
${introText}${siblingText}${focusRule}${separationRule}
STOPS TO WRITE:
${stopList}

For EACH stop above, produce:
- historical_info: 3-4 DETAILED paragraphs covering the history SPECIFIC TO THAT STOP${histRule}. Include specific dates, full names, and documented events. Do not merely mention people — explain who they were, what happened to them, and why it matters. Every paragraph must be about that stop alone.
- paranormal_info: 3-4 DETAILED paragraphs covering specific ghost sightings (with dates and eyewitness names when known), EVP recordings and their content, apparition descriptions (clothing, behavior, exact location), shadow figures, cold spots, poltergeist activity, residual vs intelligent hauntings, and local folklore${paraSuffix}. Include investigator testimonies and well-known paranormal events. Tell full ghost stories, not just names.
- people: array of { name, story } covering EVERY notable person mentioned in THAT stop's two text fields. "name" MUST appear verbatim (same spelling/casing) in that stop's text so it can be highlighted. "story": 4-6 detailed sentences — who they were, their role, fate (how they died if relevant), and their paranormal connection.

Each stop is a tour stop — do NOT include any conclusion, wrap-up, or ending statements. The tour has a dedicated Conclusion field for all closing remarks.
${BRAND_RULE_STOP}${CONCLUSION_PHRASE_RULE}
Return ONE JSON object in exactly this shape, with one entry per stop in the same order and "index" matching the STOP number above:
{ "stops": [ { "index": 0, "historical_info": "...", "paranormal_info": "...", "people": [ { "name": "...", "story": "..." } ] } ] }
Output ONLY valid JSON. No markdown fences, no commentary.`;
}

export function buildBatchPeoplePrompt(stops) {
  const blocks = stops
    .map((s, i) => `STOP ${i} — "${s.name}"

Historical information:
${s.historical_info || ''}

Paranormal information:
${s.paranormal_info || ''}`)
    .join('\n\n');

  return `For each paranormal tour stop below, identify EVERY notable person mentioned in THAT stop's historical and paranormal information. For each person, write a detailed account (4-6 sentences) of who they were, their role, what happened to them (including how they died if relevant), and their paranormal connection — the ghost stories, sightings, apparitions, EVPs, and phenomena associated with them.

Only include people actually mentioned in THAT stop's own text — never carry a person over from another stop. Each person's "name" MUST match exactly how it appears in that stop's text so it can be highlighted.

${blocks}

Return ONE JSON object with one entry per stop, in the same order, "index" matching the STOP number above:
{ "stops": [ { "index": 0, "people": [ { "name": "...", "story": "..." } ] } ] }
Output ONLY valid JSON. No markdown fences, no commentary.`;
}

function buildBatchRewritePrompt(stops, contents, tourContext) {
  const intro = tourContext.introduction ? tourContext.introduction.slice(0, 1500) : '';
  const blocks = stops
    .map((s, i) => `STOP ${i} — "${s.name}"

CURRENT HISTORICAL CONTENT:
${contents[i]?.historical_info || ''}

CURRENT PARANORMAL CONTENT:
${contents[i]?.paranormal_info || ''}`)
    .join('\n\n');

  return `You are editing content for ${stops.length} stops on the paranormal tour "${tourContext.title || ''}".

Each stop's content below contains general property history that belongs in the tour introduction, not in that specific stop.
${intro ? `\nTOUR INTRODUCTION (already covers the property's general history — construction, founder, Civil War role, etc.):\n${intro}\n` : ''}
${blocks}

REWRITE INSTRUCTIONS — FOLLOW EXACTLY, FOR EACH STOP INDEPENDENTLY:
1. Remove ALL general property history — anything about the property's construction, founding, overall significance, or historical role that applies to the WHOLE property rather than that one stop. That belongs in the tour introduction.
2. Keep ONLY content specific to that stop — what that specific room/area was used for, what happened THERE, what paranormal activity occurs in THAT exact spot.
3. Each entry's historical_info must start with a sentence about that stop, not about the property.
4. If most of a stop's content is general property history with little stop-specific detail, keep whatever stop-specific details exist and expand on them to fill 3-4 paragraphs.
5. Do not add new historical facts, and do not move content between stops.

Return ONE JSON object with one entry per stop, in the same order, "index" matching the STOP number above:
{ "stops": [ { "index": 0, "historical_info": "...", "paranormal_info": "..." } ] }
Output ONLY valid JSON. No markdown fences, no commentary.`;
}

// ---------- parsing ----------

function normalizeEntry(entry) {
  return {
    historical_info: typeof entry.historical_info === 'string' ? entry.historical_info.trim() : '',
    paranormal_info: typeof entry.paranormal_info === 'string' ? entry.paranormal_info.trim() : '',
    people: Array.isArray(entry.people)
      ? entry.people.filter((p) => p && p.name && p.story)
      : [],
  };
}

// Map a batch response back onto the stops that were sent, by the "index" the
// prompt asked for. Anything unmatched stays null. Costs nothing.
export function parseBatchResponse(raw, stops) {
  const out = stops.map(() => null);
  const parsed = typeof raw === 'string' ? extractJson(raw) : raw;
  if (!parsed || typeof parsed !== 'object') return out;

  const list = Array.isArray(parsed.stops) ? parsed.stops : null;
  if (!list) {
    // Model answered for a single stop instead of an array — only usable if
    // the batch really had one stop.
    if (stops.length === 1 && (parsed.historical_info || parsed.paranormal_info)) {
      out[0] = normalizeEntry(parsed);
    }
    return out;
  }

  list.forEach((entry, pos) => {
    if (!entry || typeof entry !== 'object') return;
    const idx = Number.isInteger(entry.index) ? entry.index : pos;
    if (idx < 0 || idx >= out.length || out[idx]) return;
    const normalized = normalizeEntry(entry);
    if (normalized.historical_info || normalized.paranormal_info || normalized.people.length) {
      out[idx] = normalized;
    }
  });
  return out;
}

// ---------- free cross-check ----------

// Stop names are mostly generic words ("room", "house", "level"); only the
// words that actually identify a stop are worth matching on.
const GENERIC_NAME_WORDS = new Set([
  'the', 'and', 'room', 'rooms', 'area', 'areas', 'hall', 'house', 'building',
  'level', 'floor', 'floors', 'wing', 'stop', 'stops', 'site', 'section',
  'first', 'second', 'third', 'fourth', 'fifth', 'main', 'old', 'new',
  'north', 'south', 'east', 'west', 'upper', 'lower', 'front', 'back', 'side',
  'this', 'that', 'with', 'from', 'into', 'part', 'annex', 'block',
]);

function distinctiveTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !GENERIC_NAME_WORDS.has(w));
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let at = 0;
  while ((at = haystack.indexOf(needle, at)) !== -1) {
    count++;
    at += needle.length;
  }
  return count;
}

// Local, zero-cost validation of a batch response. Flags a stop that is
// missing, came back too thin to be real, or carries its neighbour's
// distinctive wording without any of its own — the signature of content
// landing on the wrong stop. Makes no model call, so it is free to run.
export function crossCheckBatch(contents, stops, { mode = 'full' } = {}) {
  const issues = [];
  const tokenSets = stops.map((s) => distinctiveTokens(s.name));

  stops.forEach((stop, i) => {
    const content = contents[i];
    if (!content) {
      issues.push({ index: i, stop: stop.name, reason: 'missing' });
      return;
    }

    const hist = content.historical_info || '';
    const para = content.paranormal_info || '';
    if (mode === 'full' && (hist.trim().length < THIN_THRESHOLD || para.trim().length < THIN_THRESHOLD)) {
      issues.push({ index: i, stop: stop.name, reason: 'thin' });
      return;
    }

    const own = tokenSets[i];
    const neighbour = tokenSets.filter((_, j) => j !== i).flat();
    if (own.length === 0 || neighbour.length === 0) return;

    const peopleText = content.people.map((p) => `${p.name} ${p.story}`).join(' ');
    const text = `${hist} ${para} ${peopleText}`.toLowerCase();
    const ownHits = own.reduce((n, t) => n + countOccurrences(text, t), 0);
    const neighbourHits = neighbour.reduce((n, t) => n + countOccurrences(text, t), 0);
    if (ownHits === 0 && neighbourHits >= 2) {
      issues.push({ index: i, stop: stop.name, reason: 'cross_assignment' });
    }
  });

  return { ok: issues.length === 0, issues };
}

// ---------- orchestration ----------

// Runs one batched enrichment for `stops` (up to ENRICH_BATCH_SIZE): a single
// content call, then a single focus-rewrite call on single-site tours.
// Returns an array aligned to `stops`, where null means "run this stop on its
// own" — either because the response failed the free cross-check, or because
// the call failed outright.
export async function enrichStopBatch(stops, tourContext = {}, { mode = 'full', force = false } = {}) {
  const none = stops.map(() => null);
  if (stops.length < 2) return none;

  let contents = none;
  try {
    if (mode === 'people') {
      contents = parseBatchResponse(await callJson(buildBatchPeoplePrompt(stops), { useWeb: false }), stops);
    } else {
      const prompt = buildBatchEnrichPrompt(stops, tourContext, { force });
      try {
        contents = parseBatchResponse(await callJson(prompt, { useWeb: true }), stops);
      } catch (e) {
        console.error('Batch enrich (web) failed:', e);
      }
      if (!contents.some(Boolean)) {
        // Web search returned nothing usable — retry once without it.
        try {
          contents = parseBatchResponse(await callJson(prompt, { useWeb: false }), stops);
        } catch (e) {
          console.error('Batch enrich (no-web) failed:', e);
        }
      }
    }
  } catch (e) {
    console.error('Batch enrichment failed:', e);
    return none;
  }

  // Pre-check before spending the focus-rewrite call: if the first pass
  // already dropped or blended a stop, stop here rather than paying for a
  // second call on content we are going to throw away.
  if (!contents.every(Boolean) || !crossCheckBatch(contents, stops, { mode }).ok) return none;

  if (mode === 'full' && isSingleSiteCategory(tourContext.category)) {
    try {
      const rewritten = parseBatchResponse(
        await callJson(buildBatchRewritePrompt(stops, contents, tourContext), { useWeb: false }),
        stops
      );
      rewritten.forEach((r, i) => {
        if (!r) return;
        contents[i] = {
          ...contents[i],
          historical_info: r.historical_info || contents[i].historical_info,
          paranormal_info: r.paranormal_info || contents[i].paranormal_info,
        };
      });
    } catch (e) {
      // Keep the first-pass content, exactly as the single-stop path does.
      console.error('Batch focus rewrite failed:', e);
    }
  }

  // Re-check on the final content — the rewrite is the step that can blend two stops.
  if (!crossCheckBatch(contents, stops, { mode }).ok) return none;

  return contents;
}