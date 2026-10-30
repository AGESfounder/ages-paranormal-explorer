import { callJson } from '@/lib/llmJson';
import { BRAND_RULE_STOP, ADDRESS_RULE } from '@/lib/stopContent';

// A build that comes back short is making a claim: this area cannot fill a full
// tour. That claim has to be defended, because a lazy first pass looks exactly
// the same from the outside. So one audit call has to name every candidate it
// left out and the hard requirement each fails — and hand back any candidate
// that actually qualifies. Only an audit that recovers nothing earns the tour
// its Special Circumstance label.
const usableStop = s => !!s
  && String(s.name || '').trim() !== ''
  && String(s.address || '').trim() !== ''
  && String(s.hours_of_operation || '').trim() !== ''
  && String(s.entry_fee || '').trim() !== ''
  && Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude));

export default async function auditThinTour(tour, stops, min) {
  const listed = stops.map(s => s.name).join('; ');
  const result = await callJson(`A first pass proposed only ${stops.length} stop(s) for "${tour.title}" in ${tour.city}, ${tour.state} — fewer than the ${min} a complete tour needs. Before that short list is accepted, prove nothing else qualifies.

Stops already proposed: ${listed}.

List EVERY real, documented haunted location in and around ${tour.city} that you considered and left out. For each, name the ONE hard requirement it fails:
- no documented haunting (an ordinary building with no reports at all)
- no real street address
- cannot legally be visited after 7 PM, even from outside
- already covered by a stop listed above (same property or building)

If a location you left out actually passes all four requirements, do NOT reject it: return it in "recovered" with its real details, using exactly these fields:
stop_number, name, latitude, longitude, address (complete real street address), same_structure (boolean), access_area (interior/exterior), historical_info (2-3 factual sentences), paranormal_info (2-3 sentences), investigation_suggestions (3-5 strings), estimated_investigation_time, construction_date, famous_people, narration_text (4-6 vivid sentences about THIS stop), travel_method (walking/driving), hours_of_operation (required), entry_fee (required; Free only when known).

Never invent a location, a haunting, an address or visiting hours to reach a number. An honest short list is acceptable; a padded one is not.
Return ONLY JSON {"rejected":[{"name":"...","fails":"..."}],"recovered":[...],"reason":"one sentence explaining why this area cannot support a full tour"}.
${BRAND_RULE_STOP}${ADDRESS_RULE}`, { useWeb: true });
  return {
    recovered: Array.isArray(result?.recovered) ? result.recovered.filter(usableStop) : [],
    reason: String(result?.reason || '').trim().slice(0, 300),
  };
}