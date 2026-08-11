// Detect whether a tour is a large property (park, fort, farm, battlefield,
// plantation) where structures can be spread over a wide area. These get
// relaxed coordinate and walking-distance thresholds. Typical haunted
// houses and small landmarks use stricter thresholds.
const LARGE_PROPERTY_KEYWORDS = [
  'park', 'fort', 'farm', 'battlefield', 'battle field',
  'plantation', 'farmstead',
];

export function isLargeProperty(tour) {
  if (!tour) return false;
  const text = [
    tour.title || '',
    tour.start_location_name || '',
    tour.description || '',
  ].join(' ').toLowerCase();
  return LARGE_PROPERTY_KEYWORDS.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + escaped + '\\b').test(text);
  });
}