// Coerces an AI-generated stop into the exact shape the TourStop entity accepts.
//
// The generator sometimes returns a text field as an array (e.g. famous_people:
// ["Washington Irving", "Katrina Van Tassel"]) or an extra field the schema
// doesn't have. TourStop.create rejects the whole record on either, and in the
// tour view that rejection happens before any stop is saved — which is how
// tours ended up stored with zero stops. Coerce here, never trust the model.
//
// Only the fields listed below are written through, so when TourStop gains a
// new field, add it here too — otherwise AI-generated stops won't fill it.

const TEXT_FIELDS = [
  'name',
  'address',
  'historical_info',
  'paranormal_info',
  'narration_text',
  'hours_of_operation',
  'entry_fee',
  'estimated_investigation_time',
  'construction_date',
  'famous_people',
  'parking_cost',
];

const NUMERIC_FIELDS = ['latitude', 'longitude', 'stop_number'];
const ENUMS = {
  stop_type: ['tour', 'parking', 'shuttle'],
  travel_method: ['walking', 'driving'],
  access_area: ['interior', 'exterior'],
  parking_type: ['street', 'parking_lot', 'parking_garage', 'shuttle_free', 'shuttle_paid'],
};

const asText = (value) => {
  if (typeof value === 'string') return value.trim() ? value : undefined;
  if (Array.isArray(value)) {
    const parts = value.map(asText).filter(Boolean);
    return parts.length ? parts.join(', ') : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
};

export function sanitizeStopRecord(stop) {
  const out = {};
  if (!stop || typeof stop !== 'object') return out;

  for (const field of TEXT_FIELDS) {
    const value = asText(stop[field]);
    if (value) out[field] = value;
  }

  for (const field of NUMERIC_FIELDS) {
    const raw = stop[field];
    if (raw == null || typeof raw === 'boolean' || (typeof raw === 'string' && !raw.trim())) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out[field] = value;
  }

  for (const [field, allowed] of Object.entries(ENUMS)) {
    if (allowed.includes(stop[field])) out[field] = stop[field];
  }

  for (const field of ['same_structure', 'geocoded', 'needs_placement', 'user_verified', 'has_verification_photo']) {
    if (typeof stop[field] === 'boolean') out[field] = stop[field];
  }

  if (Array.isArray(stop.investigation_suggestions)) {
    const items = stop.investigation_suggestions.map(asText).filter(Boolean);
    if (items.length) out.investigation_suggestions = items;
  }

  if (Array.isArray(stop.people)) {
    const people = stop.people
      .map((p) => ({ name: asText(p?.name) || '', story: asText(p?.story) || '' }))
      .filter((p) => p.name || p.story);
    if (people.length) out.people = people;
  }

  for (const field of ['tour_id', 'image_url', 'verified_by_id', 'verification_photo_url', 'verification_photo_uri', 'verification_photo_by_id', 'verified_date']) {
    const value = asText(stop[field]);
    if (value) out[field] = value;
  }

  return out;
}