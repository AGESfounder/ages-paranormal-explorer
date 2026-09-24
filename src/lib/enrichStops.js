// Shared stop-enrichment logic. Extracted from StopDetail's ensureRichContent
// so the offline download can pre-enrich all stops before saving — otherwise
// offline users only see the 2-3 sentence skeleton summaries.
import { base44 } from '@/api/base44Client';
import { callJson } from '@/lib/llmJson';
import { stripConclusionOpeners, BRAND_RULE_STOP, CONCLUSION_PHRASE_RULE, STOP_CONTENT_VERSION } from '@/lib/stopContent';
import { checkManifestationGate, spendManifestationEnergy } from '@/hooks/useEnergyGate';

const THIN_THRESHOLD = 600;

// Second-pass LLM rewrite: takes generated content and removes general
// property history, keeping only what's specific to this stop. The LLM is
// much better at EDITING existing content to remove redundancy than at
// following negative constraints during generation — this is why the
// first-pass prompt's "don't repeat property history" rules fail but a
// focused rewrite succeeds.
//
// Only runs for single-site tours (landmark/ship/cold_spot) where all stops
// are rooms/areas within one property. Area/road_trip tours don't have this
// problem — each stop is a different property.
export async function rewriteForStopFocus(stop, generatedContent, tourContext) {
  const isSingleSite = tourContext.category === 'landmark' || tourContext.category === 'ship' || tourContext.category === 'cold_spot';
  if (!isSingleSite) return generatedContent;

  const intro = tourContext.introduction ? tourContext.introduction.slice(0, 1500) : '';
  const prompt = `You are editing content for a paranormal tour stop at "${tourContext.title}".

The content below was written for "${stop.name}" but contains general property history that belongs in the tour introduction, not this specific stop.

${intro ? `TOUR INTRODUCTION (already covers the property's general history — construction, founder, Civil War role, etc.):\n${intro}\n` : ''}

CURRENT HISTORICAL CONTENT:
${generatedContent.historical_info || ''}

CURRENT PARANORMAL CONTENT:
${generatedContent.paranormal_info || ''}

REWRITE INSTRUCTIONS — FOLLOW EXACTLY:
1. Remove ALL general property history — anything about the property's construction, founding, overall significance, or historical role that applies to the WHOLE property, not just this stop. That's in the tour introduction.
2. Keep ONLY content specific to "${stop.name}" — what this specific room/area was used for, what happened HERE, what paranormal activity occurs in THIS exact spot.
3. Start with a sentence about "${stop.name}" specifically, not about the property.
4. If most of the content is general property history with little stop-specific detail, keep whatever stop-specific details exist and expand on them to fill 3-4 paragraphs.
5. Do not add new historical facts — just remove the redundant property history and keep/expand the stop-specific content.

Return JSON: { "historical_info": "...", "paranormal_info": "..." }
Output ONLY valid JSON. No markdown fences.`;

  try {
    const result = await callJson(prompt, { useWeb: false });
    if (result && (result.historical_info || result.paranormal_info)) {
      return {
        historical_info: result.historical_info || generatedContent.historical_info,
        paranormal_info: result.paranormal_info || generatedContent.paranormal_info,
      };
    }
  } catch (e) {
    console.error('Rewrite for stop focus failed:', e);
  }
  return generatedContent; // Fall back to original if rewrite fails
}

export function isThinContent(s) {
  return !s || s.trim().length < THIN_THRESHOLD;
}

// Count stops that need enrichment (for credit display in the download dialog).
export function countThinStops(stops) {
  return (stops || []).filter(
    (s) =>
      s.stop_type !== 'parking' &&
      s.stop_type !== 'shuttle' &&
      (isThinContent(s.historical_info) ||
        isThinContent(s.paranormal_info) ||
        !s.people ||
        s.people.length === 0)
  ).length;
}

// Enrich a single stop with full historical/paranormal detail and notable people.
// tourContext = { title, category, introduction, siblingStopNames } provides the
// surrounding tour so the LLM doesn't repeat general property history in every
// stop (the Cashtown Inn problem — each stop re-explained 1797, Peter Marck,
// Chambersburg Pike, etc.). When force=true, regenerates even if the content
// is already rich (used by regenerateTourContent for old tours).
// Returns { updates, generatedPeople }.
async function enrichStop(stop, tourContext = {}, options = {}) {
  const { force = false, isFirstStop = false } = options;
  const needsFull =
    force || isThinContent(stop.historical_info) || isThinContent(stop.paranormal_info);
  const updates = {};
  let generatedPeople = [];

  if (needsFull) {
    const isSingleSite = tourContext.category === 'landmark' || tourContext.category === 'ship' || tourContext.category === 'cold_spot';
    // When force-regenerating (old content_version upgrade), do NOT pass the
    // old content as "Existing notes" — the LLM just copies the redundant
    // general-property history from it. Start fresh so the stop-focus rules
    // actually shape the output.
    const existingNotesText = force ? '' : `\nExisting notes: ${(stop.historical_info || '')} ${(stop.paranormal_info || '')}`;
    const tourIntroText = tourContext.introduction
      ? `\nTOUR INTRODUCTION (already covers the general property history — DO NOT repeat any of this information in this stop):\n${tourContext.introduction.slice(0, 1500)}\n`
      : '';
    const siblingText = tourContext.siblingStopNames && tourContext.siblingStopNames.length > 0
      ? `\nOTHER STOPS ON THIS TOUR (for context — this stop is one of several areas within the same location; focus on THIS stop, do not repeat their content):\n${tourContext.siblingStopNames.map(n => `- ${n}`).join('\n')}\n`
      : '';
    const stopFocusRule = isSingleSite
      ? `\nSTOP-FOCUS RULE — FOLLOW EXACTLY (CRITICAL — THE MOST IMPORTANT RULE IN THIS PROMPT):
This is a single-property tour where all stops are rooms, areas, or sections within ONE location ("${tourContext.title || ''}"). The general property history — construction date, founder's name, the building's overall significance, Civil War context, the property's timeline — was already covered in the tour introduction above. DO NOT repeat ANY of it here. Every paragraph must be about THIS specific stop, not the building as a whole.

FIRST SENTENCE RULE: Your very first sentence MUST be about THIS specific stop ("${stop.name}"), not the property. Do NOT begin with the property name, construction date, founder, or address.
BAD first sentences (NEVER WRITE THESE): "The [Property Name] was constructed in [year]...", "Originally built by [Founder]...", "The [Property], established in [year]...", "The [Property], located at [address], was originally...", "The [Property] stands as a testament to..."
GOOD first sentences: "This room served as...", "Within these walls...", "This area was used for...", "The [stop name] witnessed...", "This specific corridor held..."

Focus EXCLUSIVELY on what is unique to THIS specific stop — the specific room, area, or section named "${stop.name}". What happened HERE, in this room? Who occupied THIS specific space? What was THIS area used for? What paranormal activity occurs in THIS exact spot? If a sentence is about the property in general (not this specific room/area), DELETE it.

SELF-CHECK before returning: Re-read your historical_info. If any sentence could be moved to a different stop on this tour unchanged (because it's about the general property, not this specific room), DELETE that sentence and replace it with something specific to THIS stop. If any sentence starts with the property name or construction date, DELETE it and start with something about THIS stop.
`
      : '';
    const singleSiteHistRule = ' — events that occurred in this specific room/area/section, not the property as a whole. Who used THIS room? What was THIS area for? What specific events happened HERE';
    const multiSiteHistRule = " — construction dates and architecture, major historical events that occurred there, notable figures who lived/worked/visited/died there, scandals/murders/tragedies, and the area's significance over time";
    const histRule = isSingleSite ? singleSiteHistRule : multiSiteHistRule;
    const paraRuleSuffix = isSingleSite ? ' — all SPECIFIC TO THIS STOP, not the property in general' : '';
    const prompt = `Generate rich, detailed content for a single paranormal investigation stop.

Tour: ${tourContext.title || ''}
Stop name: ${stop.name}
Address: ${stop.address || ''}${existingNotesText}${tourIntroText}${siblingText}${stopFocusRule}
This is a stop on a paranormal tour — do NOT include any conclusion, wrap-up, or ending statements. The tour has a dedicated Conclusion field for all closing remarks.

Produce a JSON object with:
- historical_info: 3-4 DETAILED paragraphs covering the history SPECIFIC TO THIS STOP${histRule}. Include specific dates, full names, and documented events. Do not merely mention people — explain who they were, what happened to them, and why it matters. Every paragraph must be about THIS stop, not the property as a whole.
- paranormal_info: 3-4 DETAILED paragraphs covering specific ghost sightings (with dates and eyewitness names when known), EVP recordings and their content, apparition descriptions (clothing, behavior, exact location), shadow figures, cold spots, poltergeist activity, residual vs intelligent hauntings, and local folklore${paraRuleSuffix}. Include investigator testimonies and well-known paranormal events. Tell full ghost stories, not just names. Every paragraph must be about paranormal activity in THIS specific stop, not the property in general.
- people: array of { name, story }. Include EVERY notable person mentioned in historical_info or paranormal_info. "name" MUST appear verbatim (same spelling/casing) in the text so it can be highlighted. "story": 4-6 detailed sentences — who they were, their role, fate (how they died if relevant), and their paranormal connection (sightings, apparitions, EVPs, phenomena).
${BRAND_RULE_STOP}${CONCLUSION_PHRASE_RULE}
Use real history and paranormal lore for this location. Output ONLY a valid JSON object. No markdown fences, no commentary.`;
    let data = null;
    try { data = await callJson(prompt, { useWeb: true }); } catch (e) { console.error('Enrich (web) failed:', e); }
    if (!data) { try { data = await callJson(prompt, { useWeb: false }); } catch (e) { console.error('Enrich (no-web) failed:', e); } }
    if (data) {
      // Second-pass rewrite for single-site tours: remove general property
      // history and keep only stop-specific content. The LLM edits the
      // generated content — far more reliable than regex scrubbing.
      const rewritten = await rewriteForStopFocus(stop, data, tourContext);
      if (rewritten.historical_info) updates.historical_info = stripConclusionOpeners(rewritten.historical_info, false);
      if (rewritten.paranormal_info) updates.paranormal_info = stripConclusionOpeners(rewritten.paranormal_info, false);
      generatedPeople = (data.people || []).filter((p) => p.name && p.story);
      if (generatedPeople.length) updates.people = generatedPeople;
    }
  } else if (!stop.people || stop.people.length === 0) {
    // Content is rich but people haven't been extracted yet
    const prompt = `For the paranormal tour stop "${stop.name}", identify EVERY notable person mentioned in the historical and paranormal information. For each person, write a detailed account (4-6 sentences) of who they were, their role, what happened to them (including how they died if relevant), and their paranormal connection — the ghost stories, sightings, apparitions, EVPs, and phenomena associated with them. Only include people actually mentioned in the text. Each person's "name" MUST match exactly how they appear in the text so it can be highlighted.

Stop name: ${stop.name}
Historical information: ${stop.historical_info || ''}
Paranormal information: ${stop.paranormal_info || ''}

Return JSON with a "people" array, each item { name, story }. Output ONLY valid JSON. No markdown fences.`;
    let data = null;
    try { data = await callJson(prompt, { useWeb: false }); } catch (e) { console.error('People extract failed:', e); }
    if (data) {
      generatedPeople = (data.people || []).filter((p) => p.name && p.story);
      if (generatedPeople.length) updates.people = generatedPeople;
    }
  }

  return { updates, generatedPeople };
}

// Enrich all thin stops in a tour. Persists enriched content to the database
// and spends manifestation energy per stop. Returns { enrichedStops, energySpent }.
// Calls onProgress(completed, total, stopName) as each stop is processed.
export async function enrichTourStops(tour, stops, onProgress) {
  const gate = await checkManifestationGate();
  if (!gate.allowed) {
    throw new Error(gate.message || 'Cannot enrich stops — plan or energy issue.');
  }

  const tourStops = (stops || []).filter(
    (s) => s.stop_type !== 'parking' && s.stop_type !== 'shuttle'
  );
  const siblingNames = tourStops.map(s => s.name).filter(Boolean);
  const tourContext = {
    title: tour.title,
    category: tour.tour_category,
    introduction: tour.introduction,
  };

  const enrichedStops = [...stops];
  const toEnrich = enrichedStops.filter(
    (s) =>
      s.stop_type !== 'parking' &&
      s.stop_type !== 'shuttle' &&
      (isThinContent(s.historical_info) ||
        isThinContent(s.paranormal_info) ||
        !s.people ||
        s.people.length === 0)
  );
  const total = toEnrich.length;
  let completed = 0;
  let energySpent = 0;

  let isFirstTourStop = true;
  for (let i = 0; i < enrichedStops.length; i++) {
    const s = enrichedStops[i];
    if (s.stop_type === 'parking' || s.stop_type === 'shuttle') continue;
    const stopIsFirst = isFirstTourStop;
    isFirstTourStop = false;
    const needsEnrichment =
      isThinContent(s.historical_info) ||
      isThinContent(s.paranormal_info) ||
      !s.people ||
      s.people.length === 0;
    if (!needsEnrichment) continue;

    try {
      const siblingStopNames = siblingNames.filter(n => n !== s.name);
      const { updates, generatedPeople } = await enrichStop(s, { ...tourContext, siblingStopNames }, { force: false, isFirstStop: stopIsFirst });
      if (Object.keys(updates).length > 0) {
        try {
          await base44.entities.TourStop.update(s.id, updates);
          enrichedStops[i] = { ...s, ...updates };
          if (generatedPeople.length) enrichedStops[i].people = generatedPeople;
          await spendManifestationEnergy();
          energySpent++;
        } catch (e) {
          console.error(`Failed to persist enrichment for ${s.name}:`, e);
          // Still use the enriched data for the offline save even if DB persist failed
          enrichedStops[i] = { ...s, ...updates };
          if (generatedPeople.length) enrichedStops[i].people = generatedPeople;
        }
      }
    } catch (e) {
      console.error(`Enrichment failed for ${s.name}:`, e);
    }
    completed++;
    if (onProgress) onProgress(completed, total, s.name || `Stop ${s.stop_number}`);
  }

  return { enrichedStops, energySpent };
}

// Force-regenerate ALL stop content for a tour using the current enrichment
// prompt. Used to upgrade old tours whose content_version is below
// STOP_CONTENT_VERSION — the "Cashtown Inn problem" where every stop repeated
// the general property history instead of focusing on the specific room/area.
//
// Checks the manifestation gate (paid/admin only) and spends manifestation
// energy per stop. Stamps the tour with the current content_version so it
// never regenerates again. Only touches text fields (historical_info,
// paranormal_info, people) — coordinates, addresses, and stop order are
// preserved. Calls onProgress(completed, total, stopName) as each stop is
// processed. Returns { enrichedStops, energySpent }.
export async function regenerateTourContent(tour, stops, onProgress) {
  const gate = await checkManifestationGate();
  if (!gate.allowed) {
    throw new Error(gate.message || 'Cannot regenerate stops — plan or energy issue.');
  }

  const tourStops = (stops || []).filter(
    (s) => s.stop_type !== 'parking' && s.stop_type !== 'shuttle'
  );
  const siblingNames = tourStops.map(s => s.name).filter(Boolean);
  const tourContext = {
    title: tour.title,
    category: tour.tour_category,
    introduction: tour.introduction,
  };

  const enrichedStops = [...stops];
  const total = tourStops.length;
  let completed = 0;
  let energySpent = 0;

  let isFirstTourStop = true;
  for (let i = 0; i < enrichedStops.length; i++) {
    const s = enrichedStops[i];
    if (s.stop_type === 'parking' || s.stop_type === 'shuttle') continue;
    const stopIsFirst = isFirstTourStop;
    isFirstTourStop = false;

    try {
      const siblingStopNames = siblingNames.filter(n => n !== s.name);
      const { updates, generatedPeople } = await enrichStop(s, { ...tourContext, siblingStopNames }, { force: true, isFirstStop: stopIsFirst });
      if (Object.keys(updates).length > 0) {
        try {
          await base44.entities.TourStop.update(s.id, updates);
          enrichedStops[i] = { ...s, ...updates };
          if (generatedPeople.length) enrichedStops[i].people = generatedPeople;
          await spendManifestationEnergy();
          energySpent++;
        } catch (e) {
          console.error(`Failed to persist regeneration for ${s.name}:`, e);
          enrichedStops[i] = { ...s, ...updates };
          if (generatedPeople.length) enrichedStops[i].people = generatedPeople;
        }
      }
    } catch (e) {
      console.error(`Regeneration failed for ${s.name}:`, e);
    }
    completed++;
    if (onProgress) onProgress(completed, total, s.name || `Stop ${s.stop_number}`);
  }

  // Stamp the tour with the current content version so it never regenerates again
  try {
    await base44.entities.Tour.update(tour.id, { content_version: STOP_CONTENT_VERSION });
  } catch (e) {
    console.error('Failed to stamp content_version:', e);
  }

  return { enrichedStops, energySpent };
}