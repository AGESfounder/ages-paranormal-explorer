import { base44 } from '@/api/base44Client';
import { callJson } from '@/lib/llmJson';
import { BRAND_RULE_STOP, ADDRESS_RULE, CONCLUSION_PHRASE_RULE } from '@/lib/stopContent';
import prepareTourStops, { stopIdentity } from '@/lib/prepareTourStops';
import auditThinTour from '@/lib/auditThinTour';
import saveTourStopBatch from '@/lib/saveTourStopBatch';
import finalizeTourBuild from '@/lib/finalizeTourBuild';

const builds = new Map();

// Smallest area tour that may be saved at all. A short build is usually a model
// that clustered its stops on one property, and three stops read as a broken
// tour to a visitor, so below this nothing is written: the tour is flagged for
// review instead. Between this and the full floor a tour may still ship, but
// only carrying the Special Circumstance label the shortfall audit earned.
const SHORT_TOUR_FLOOR = 5;

// On an area tour one stop is one property, so stops that share a street address
// are dropped. That can gut a build when the model proposes several separate
// buildings of one historic village (Old Trail Town in Cody is six stops at one
// address). The retry is told which addresses are already used, so it looks for
// other properties instead of returning the same cluster again.
const sharedAddresses = rawStops => {
  const seen = new Map();
  const shared = [];
  for (const stop of rawStops) {
    const key = stopIdentity(stop?.address);
    if (!key) continue;
    if (!seen.has(key)) { seen.set(key, String(stop.address || '').trim()); continue; }
    const label = seen.get(key);
    if (!shared.includes(label)) shared.push(label);
  }
  return shared;
};

async function performBuild(tour) {
  const { data } = await base44.functions.invoke('tourBuildLease', { tourId: tour.id, action: 'acquire' });
  const nonce = data.nonce;
  try {
    await base44.entities.Tour.update(tour.id, { build_status: 'building' });
    const singleSite = ['landmark', 'ship', 'cold_spot'].includes(tour.tour_category);
    // On an area tour one street address is one stop, so a model that spends its
    // whole list on a single historic village loses most of it. Ask for extra
    // candidate properties up front so a full tour survives that filtering.
    const range = tour.tour_category === 'cold_spot' ? '1-4' : singleSite ? '8-10' : '12-14';
    const prompt = `Build ${range} investigation stops for "${tour.title}" in ${tour.city}, ${tour.state}.
Category: ${tour.tour_category}. Description: ${tour.description || ''}.
${singleSite ? 'Every stop must be a distinct room, area, or structure at this ONE property/vessel. Rooms in one building legitimately share the building coordinates; set same_structure true. Separate structures need their actual individual coordinates.' : 'Each stop must be a DIFFERENT physical haunted location. No repeated properties under different names. Look up each actual physical address independently, not a tour company meeting point. Every stop needs its OWN street address: stops that share an address are dropped, so list extra separate properties instead of several buildings of one.'}
${tour.tour_category === 'road_trip' ? 'This is a driving route with most stops at least 5 miles apart.' : 'Use a connected walking cluster, no more than 0.33 miles per link (up to 1 mile on a large property). Area walking routes must total at most 2.5 miles. Put any genuinely remote driving stops after the walk.'}
Only include real documented locations that can legally be visited after 7 PM, at least from outside; accurately state restrictions. Never invent access or claim closed grounds are open.
Return ONLY JSON {"stops": [...]} with these fields for EVERY stop:
stop_number, name, latitude, longitude, address (complete real street address), same_structure (boolean), access_area (interior/exterior), historical_info (2-3 factual sentences), paranormal_info (2-3 sentences distinguishing reported folklore), investigation_suggestions (3-5 strings), estimated_investigation_time, construction_date, famous_people, narration_text (4-6 vivid sentences about THIS stop), travel_method (walking/driving), hours_of_operation (required), entry_fee (required; Free only when known).
Find coordinates from real mapped sources; do not fabricate room coordinates or pad the count with duplicates.
${BRAND_RULE_STOP}${ADDRESS_RULE}${CONCLUSION_PHRASE_RULE}`;
    const limits = { min: tour.tour_category === 'cold_spot' ? 1 : 7, max: tour.tour_category === 'cold_spot' ? 4 : 10, allowShort: true };
    // A shortfall is usually stops at one address being dropped, so the retry is
    // told which addresses are spent and must hunt other properties instead.
    const addressNote = used => singleSite || !used.length ? ''
      : `\nA previous attempt for this tour was rejected: more than one of its stops shared a street address (${used.join('; ')}). Every stop must be at a DIFFERENT street address — at most one stop per property. Do not reuse those addresses; find other documented haunted properties in ${tour.city}.`;
    let collapsed = [];
    // Retry the way the normal generation path does — web, then no-web, then a web
    // retry — stopping as soon as the floor is met and keeping the first usable
    // answer as a fallback, so a thin first pass is retried instead of saved.
    let records = [];
    let rawStops = [];
    let lastError = null;
    for (const useWeb of [true, false, true]) {
      let candidate = null;
      let candidateRaw = null;
      try {
        const result = await callJson(prompt + addressNote(collapsed), { useWeb });
        if (!Array.isArray(result?.stops)) throw new Error('No usable stops were returned. Nothing new was saved.');
        candidate = prepareTourStops(result.stops, tour, limits);
        candidateRaw = result.stops;
      } catch (error) {
        lastError = error;
        console.error(`Build attempt (web: ${useWeb}) failed:`, error);
        continue;
      }
      if (!candidate.length) continue;
      collapsed = singleSite ? [] : sharedAddresses(candidateRaw);
      if (!records.length || candidate.length >= limits.min) { records = candidate; rawStops = candidateRaw; }
      if (candidate.length >= limits.min) break;
      console.warn(`Build attempt returned only ${candidate.length} stops (min ${limits.min}), retrying...`);
    }
    if (!records.length) throw lastError || new Error('No usable stops were returned. Nothing new was saved.');
    // The audit runs ONLY on a shortfall, so a healthy area never pays for a
    // second call. It either recovers the stops the first pass skipped, or it
    // earns the tour its Special Circumstance label by naming what it rejected.
    // A failed audit must never discard real stops: it falls back to the label.
    let shortfall = '';
    if (records.length < limits.min) {
      let audit = { recovered: [], reason: '' };
      try {
        audit = await auditThinTour(tour, records, limits.min, sharedAddresses(rawStops));
      } catch (error) {
        console.error('Shortfall audit failed; keeping the stops it returned:', error);
      }
      if (audit.recovered.length) records = prepareTourStops([...rawStops, ...audit.recovered], tour, limits);
      if (records.length < limits.min) {
        shortfall = audit.reason || `Only ${records.length} documented stops exist in ${tour.city}.`;
      }
      // A stub never ships: below the hard floor nothing is written and the tour
      // is flagged for review, so a collapsed build cannot reach a visitor.
      const floor = Math.min(limits.min, SHORT_TOUR_FLOOR);
      if (records.length < floor) {
        throw new Error(`Only ${records.length} documented ${records.length === 1 ? 'property' : 'properties'} could be found in ${tour.city}, under the ${floor}-stop minimum. Nothing new was saved; the tour needs review.`);
      }
    }
    await saveTourStopBatch(tour.id, records);
    const built = await finalizeTourBuild(tour, nonce);
    const label = shortfall
      ? { special_circumstance: true, special_circumstance_reason: shortfall }
      : { special_circumstance: false, special_circumstance_reason: '' };
    await base44.entities.Tour.update(tour.id, label);
    return { ...built, tour: { ...built.tour, ...label } };
  } catch (error) {
    await base44.entities.Tour.update(tour.id, { build_status: 'needs_review' });
    throw error;
  } finally {
    await base44.functions.invoke('tourBuildLease', { tourId: tour.id, action: 'release', nonce })
      .catch(error => console.error('Tour build lease release failed; it will expire:', error));
  }
}

export default function buildTourStops(tour) {
  if (!builds.has(tour.id)) builds.set(tour.id, performBuild(tour).finally(() => builds.delete(tour.id)));
  return builds.get(tour.id);
}