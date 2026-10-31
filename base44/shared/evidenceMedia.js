// Evidence media access policy — the single source of truth for who may view a
// piece of stored media and how long the link that shows it stays valid.
// Used by functions/evidence-media-link; never import this from a frontend file.

// Stills (photographs and any other non-timed attachment) get a fixed window.
export const STILL_TTL_SECONDS = 900;
// The signed-URL API accepts 60–3600 seconds and nothing outside that range.
export const MIN_TTL_SECONDS = 60;
export const MAX_TTL_SECONDS = 3600;
// A recording's link lives as long as the recording plus this viewing allowance.
export const VIEWING_ALLOWANCE_SECONDS = 300;

export const TIMED_MEDIA_TYPES = ['video', 'evp'];

/**
 * How long a link to this media should stay valid.
 * Timed recordings: actual duration + viewing allowance, clamped to the API's
 * hard ceiling. A recording whose real duration could not be measured takes the
 * ceiling instead of a guess, because a link that dies mid-playback is worse
 * than a link that outlives the viewer's attention.
 */
export function ttlForMedia(mediaType, durationSeconds) {
  if (!TIMED_MEDIA_TYPES.includes(mediaType)) return STILL_TTL_SECONDS;
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) return MAX_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.ceil(duration) + VIEWING_ALLOWANCE_SECONDS));
}

/**
 * Records longer than this cannot be covered by one link, so the player renews
 * the link before it expires.
 */
export function needsLinkRenewal(mediaType, durationSeconds) {
  return ttlForMedia(mediaType, durationSeconds) >= MAX_TTL_SECONDS;
}

/**
 * Mirrors the Evidence read rules: an admin may see anything, the author may
 * see their own record, and anyone signed in may see a record that has been
 * deliberately shared. Private evidence stays with its author.
 */
export function canViewEvidence(record, user) {
  if (!record || !user) return false;
  if (user.role === 'admin') return true;
  if (record.created_by_id && record.created_by_id === user.id) return true;
  return record.is_private === false;
}