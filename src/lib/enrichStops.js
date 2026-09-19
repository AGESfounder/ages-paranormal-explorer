// Shared stop-enrichment logic. Extracted from StopDetail's ensureRichContent
// so the offline download can pre-enrich all stops before saving — otherwise
// offline users only see the 2-3 sentence skeleton summaries.
import { base44 } from '@/api/base44Client';
import { callJson } from '@/lib/llmJson';
import { stripConclusionOpeners, BRAND_RULE_STOP, CONCLUSION_PHRASE_RULE } from '@/lib/stopContent';
import { checkManifestationGate, spendManifestationEnergy } from '@/hooks/useEnergyGate';

const THIN_THRESHOLD = 600;

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
// Returns { updates, generatedPeople }.
async function enrichStop(stop, isFinalStop) {
  const needsFull =
    isThinContent(stop.historical_info) || isThinContent(stop.paranormal_info);
  const updates = {};
  let generatedPeople = [];

  if (needsFull) {
    const prompt = `Generate rich, detailed content for a single paranormal investigation stop.

Stop name: ${stop.name}
Address: ${stop.address || ''}
Existing notes: ${(stop.historical_info || '')} ${(stop.paranormal_info || '')}
${isFinalStop ? 'This is the FINAL stop on the tour — you may use conclusion-style wrap-up language.' : 'This is NOT the final stop on the tour — do NOT begin with conclusion or wrap-up phrases.'}

Produce a JSON object with:
- historical_info: 4-5 DETAILED paragraphs covering construction dates and architecture, major historical events that occurred there, notable figures who lived/worked/visited/died there, scandals/murders/tragedies, and the area's significance over time. Include specific dates, full names, and documented events. Do not merely mention people — explain who they were, what happened to them, and why it matters.
- paranormal_info: 4-5 DETAILED paragraphs covering specific ghost sightings (with dates and eyewitness names when known), EVP recordings and their content, apparition descriptions (clothing, behavior, exact location), shadow figures, cold spots, poltergeist activity, residual vs intelligent hauntings, and local folklore. Include investigator testimonies and well-known paranormal events. Tell full ghost stories, not just names.
- people: array of { name, story }. Include EVERY notable person mentioned in historical_info or paranormal_info. "name" MUST appear verbatim (same spelling/casing) in the text so it can be highlighted. "story": 4-6 detailed sentences — who they were, their role, fate (how they died if relevant), and their paranormal connection (sightings, apparitions, EVPs, phenomena).
${BRAND_RULE_STOP}${CONCLUSION_PHRASE_RULE}
Use real history and paranormal lore for this location. Output ONLY a valid JSON object. No markdown fences, no commentary.`;
    let data = null;
    try { data = await callJson(prompt, { useWeb: true }); } catch (e) { console.error('Enrich (web) failed:', e); }
    if (!data) { try { data = await callJson(prompt, { useWeb: false }); } catch (e) { console.error('Enrich (no-web) failed:', e); } }
    if (data) {
      if (data.historical_info) updates.historical_info = data.historical_info;
      if (data.paranormal_info) updates.paranormal_info = stripConclusionOpeners(data.paranormal_info, isFinalStop);
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
  const maxStopNum =
    tourStops.length > 0
      ? Math.max(...tourStops.map((s) => s.stop_number || 0))
      : 0;

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

  for (let i = 0; i < enrichedStops.length; i++) {
    const s = enrichedStops[i];
    if (s.stop_type === 'parking' || s.stop_type === 'shuttle') continue;
    const needsEnrichment =
      isThinContent(s.historical_info) ||
      isThinContent(s.paranormal_info) ||
      !s.people ||
      s.people.length === 0;
    if (!needsEnrichment) continue;

    const isFinalStop =
      (s.stop_number || 0) === maxStopNum && tourStops.length > 1;

    try {
      const { updates, generatedPeople } = await enrichStop(s, isFinalStop);
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