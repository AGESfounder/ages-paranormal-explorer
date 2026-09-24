// Content-based investigation time estimation. After stop content is
// enriched or regenerated, the investigation time and tour duration should
// reflect the actual amount of content to read/listen to — not the original
// LLM skeleton estimate which assumed full-length content.

// Estimate investigation time for a single stop based on its enriched content.
// Reading/narration at ~150 wpm (slower for immersive paranormal content) plus
// a 3-minute base for arriving, looking around, and taking initial photos.
// Returns a string like "5-10 minutes", rounded to 5-minute increments.
export function estimateStopTime(stop) {
  const text = [stop.historical_info, stop.paranormal_info, stop.narration_text]
    .filter(Boolean)
    .join(' ');
  const words = (text.match(/\S+/g) || []).length;
  const totalMin = words / 150 + 3;
  const low = Math.max(5, Math.ceil(totalMin / 5) * 5);
  const high = Math.max(low + 5, Math.ceil((totalMin * 1.4) / 5) * 5);
  return `${low}-${high} minutes`;
}

// Parse a time string like "15-20 minutes" or "2-3 hours" into [low, high] in minutes.
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const str = String(timeStr).toLowerCase().trim();
  const matches = str.match(/(\d+(?:\.\d+)?)/g);
  if (!matches) return null;
  const nums = matches.map(Number);
  const multiplier = str.includes('min') || str.includes('minute') ? 1 : 60;
  return nums.length >= 2
    ? [nums[0] * multiplier, nums[1] * multiplier]
    : [nums[0] * multiplier, nums[0] * multiplier];
}

function formatMinutes(m) {
  if (m < 60) return `${Math.max(5, Math.round(m / 5) * 5)} minutes`;
  const h = m / 60;
  const rounded = Math.round(h * 2) / 2; // nearest 0.5 hr
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded} hours`;
}

// Estimate total tour duration from stop investigation times plus travel time
// between stops. Returns a string like "1.5-2 hours" or "45-60 minutes".
export function estimateTourDuration(stops, tourType) {
  const tourStops = stops.filter(
    (s) => s.stop_type !== 'parking' && s.stop_type !== 'shuttle'
  );
  if (tourStops.length === 0) return '';

  let totalMin = 0;
  for (const s of tourStops) {
    const range = parseTimeToMinutes(s.estimated_investigation_time);
    const mid = range ? (range[0] + range[1]) / 2 : 15;
    totalMin += mid;
  }

  // Travel time between stops: ~2 min walking, ~8 min driving
  const travelPerStop = tourType === 'driving' ? 8 : 2;
  totalMin += Math.max(0, tourStops.length - 1) * travelPerStop;

  const lowMin = Math.round(totalMin * 0.85);
  const highMin = Math.round(totalMin * 1.15);

  return `${formatMinutes(lowMin)}-${formatMinutes(highMin)}`;
}