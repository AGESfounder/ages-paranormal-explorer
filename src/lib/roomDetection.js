// Detect if a stop name refers to a ROOM, AREA, or SECTION within a single
// building/vessel rather than a distinct separate structure. Used to
// auto-classify stops the LLM failed to tag as same_structure: true.
// When true, the stop should share the building's coordinates (same_structure: true)
// and NOT be web-searched for distinct coordinates (which matches wrong businesses).
const ROOM_WORDS = [
  'room', 'floor', 'hallway', 'hall', 'lobby', 'staircase', 'stairs',
  'ballroom', 'café', 'cafe', 'dining', 'wing', 'level', 'basement',
  'attic', 'kitchen', 'parlor', 'parlour', 'suite', 'chamber',
  'corridor', 'portico', 'porch', 'exterior', 'interior', 'deck',
  'cabin', 'hold', 'galley', 'bridge', 'lounge', 'library', 'office',
  'mechanical', 'boiler', 'furnace', 'cellar', 'vault', 'tower room',
  'tower floor', 'penthouse', 'balcony', 'veranda', 'verandah',
  'foyer', 'vestibule', 'anteroom', 'cloakroom',
  'conservatory', 'orangery', 'solarium', 'sunroom',
  'study', 'den', 'sitting room', 'drawing room', 'morning room',
  'servants hall', "servants' hall", "butler's pantry", 'pantry',
  'laundry', 'scullery', 'stillroom', 'dairy', 'brewery',
  'chapel', 'crypt', 'catacomb', 'ossuary', 'sepulchre',
  'promenade deck', 'lido deck', 'sun deck', 'boat deck',
  'engine room', 'boiler room', 'steerage', 'cargo hold',
  // Additional room/area words (added after "Main Bar" & "Apartment Landing"
  // stops were scattered across the city by wrong web-search matches)
  'bar', 'taproom', 'tap room', 'apartment', 'landing', 'storage',
];

export function looksLikeRoomOrArea(name) {
  const n = String(name || '').toLowerCase();
  return ROOM_WORDS.some((w) => n.includes(w));
}