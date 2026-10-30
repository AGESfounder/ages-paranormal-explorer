import { base44 } from '@/api/base44Client';
import { callJson } from '@/lib/llmJson';
import { BRAND_RULE_STOP, ADDRESS_RULE, CONCLUSION_PHRASE_RULE } from '@/lib/stopContent';
import prepareTourStops from '@/lib/prepareTourStops';
import saveTourStopBatch from '@/lib/saveTourStopBatch';
import finalizeTourBuild from '@/lib/finalizeTourBuild';

const builds = new Map();

async function performBuild(tour) {
  const { data } = await base44.functions.invoke('tourBuildLease', { tourId: tour.id, action: 'acquire' });
  const token = data.token;
  try {
    await base44.entities.Tour.update(tour.id, { build_status: 'building' });
    const singleSite = ['landmark', 'ship', 'cold_spot'].includes(tour.tour_category);
    const range = tour.tour_category === 'cold_spot' ? '1-4' : '8-10';
    const result = await callJson(`Build ${range} investigation stops for "${tour.title}" in ${tour.city}, ${tour.state}.
Category: ${tour.tour_category}. Description: ${tour.description || ''}.
${singleSite ? 'Every stop must be a distinct room, area, or structure at this ONE property/vessel. Rooms in one building legitimately share the building coordinates; set same_structure true. Separate structures need their actual individual coordinates.' : 'Each stop must be a DIFFERENT physical haunted location. No repeated properties under different names. Look up each actual physical address independently, not a tour company meeting point.'}
${tour.tour_category === 'road_trip' ? 'This is a driving route with most stops at least 5 miles apart.' : 'Use a connected walking cluster, no more than 0.33 miles per link (up to 1 mile on a large property). Area walking routes must total at most 2.5 miles. Put any genuinely remote driving stops after the walk.'}
Only include real documented locations that can legally be visited after 7 PM, at least from outside; accurately state restrictions. Never invent access or claim closed grounds are open.
Return ONLY JSON {"stops": [...]} with these fields for EVERY stop:
stop_number, name, latitude, longitude, address (complete real street address), same_structure (boolean), access_area (interior/exterior), historical_info (2-3 factual sentences), paranormal_info (2-3 sentences distinguishing reported folklore), investigation_suggestions (3-5 strings), estimated_investigation_time, construction_date, famous_people, narration_text (4-6 vivid sentences about THIS stop), travel_method (walking/driving), hours_of_operation (required), entry_fee (required; Free only when known).
Find coordinates from real mapped sources; do not fabricate room coordinates or pad the count with duplicates.
${BRAND_RULE_STOP}${ADDRESS_RULE}${CONCLUSION_PHRASE_RULE}`, { useWeb: true });
    if (!Array.isArray(result?.stops)) throw new Error('No usable stops were returned. Nothing new was saved.');
    const records = prepareTourStops(result.stops, tour, { min: tour.tour_category === 'cold_spot' ? 1 : 5, max: tour.tour_category === 'cold_spot' ? 4 : 10 });
    await saveTourStopBatch(tour.id, records);
    return await finalizeTourBuild(tour, token);
  } catch (error) {
    await base44.entities.Tour.update(tour.id, { build_status: 'needs_review' });
    throw error;
  } finally {
    await base44.functions.invoke('tourBuildLease', { tourId: tour.id, action: 'release', token })
      .catch(error => console.error('Tour build lease release failed; it will expire:', error));
  }
}

export default function buildTourStops(tour) {
  if (!builds.has(tour.id)) builds.set(tour.id, performBuild(tour).finally(() => builds.delete(tour.id)));
  return builds.get(tour.id);
}