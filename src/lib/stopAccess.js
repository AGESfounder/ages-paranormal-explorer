// Classify a tour stop as "interior" (inside a building/enclosed structure)
// or "exterior" (outside) based on its name. Used to filter stops by the
// tour's access_type (Interior Only / Exterior Only / Interior/Exterior).

// Keywords that indicate a stop is INSIDE a building or enclosed structure
const INTERIOR_KEYWORDS = [
  'room', 'floor', 'hallway', 'hall', 'lobby', 'staircase', 'stairs',
  'ballroom', 'cafe', 'café', 'dining', 'wing', 'level', 'basement',
  'attic', 'kitchen', 'parlor', 'parlour', 'suite', 'chamber',
  'corridor', 'cabin', 'hold', 'galley', 'lounge', 'library', 'office',
  'mechanical', 'boiler', 'furnace', 'cellar', 'vault', 'penthouse',
  'foyer', 'vestibule', 'anteroom', 'cloakroom',
  'study', 'den', 'sitting', 'drawing', 'morning',
  'pantry', 'laundry', 'scullery', 'stillroom', 'dairy', 'brewery',
  'chapel', 'crypt', 'catacomb', 'ossuary', 'sepulchre',
  'engine', 'steerage', 'cargo',
  'bar', 'taproom', 'apartment', 'landing', 'storage',
  'dormitory', 'dorm', 'ward', 'cell', 'morgue',
  'theater', 'theatre', 'auditorium', 'dungeon', 'closet',
  'nursery', 'boudoir', 'dressing', 'music', 'billiard',
  'smoking', 'armory', 'throne',
  'conservatory', 'orangery', 'solarium', 'sunroom',
];

// Keywords that indicate a stop is OUTSIDE (exterior)
const EXTERIOR_KEYWORDS = [
  'garden', 'grounds', 'cemetery', 'graveyard', 'park',
  'bridge', 'courtyard', 'yard', 'field', 'battlefield', 'battery',
  'pond', 'lake', 'trail', 'path', 'road', 'street', 'sidewalk',
  'grove', 'forest', 'woods', 'memorial', 'statue', 'fountain',
  'well', 'ruins', 'foundation', 'mound', 'hill',
  'balcony', 'veranda', 'verandah', 'porch', 'portico',
  'deck', 'promenade', 'rampart', 'bastion', 'parapet',
  'wall', 'gate', 'driveway', 'walkway',
  'overlook', 'viewpoint', 'observation',
  'spire', 'steeple', 'belfry',
  'colonnade', 'peristyle', 'piazza', 'plaza', 'square',
  'green', 'common', 'meadow', 'pasture', 'orchard', 'vineyard',
  'barn', 'windmill', 'mill', 'forge', 'foundry',
  'cave', 'cavern', 'grotto', 'mine', 'quarry',
  'spring', 'creek', 'stream', 'river',
];

export function classifyStopAccess(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return 'exterior';
  // Check interior first — "Garden Room" should be interior (room wins)
  for (const w of INTERIOR_KEYWORDS) {
    if (n.includes(w)) return 'interior';
  }
  for (const w of EXTERIOR_KEYWORDS) {
    if (n.includes(w)) return 'exterior';
  }
  // No match — default to exterior (exterior access is more commonly
  // available for ghost hunting at night)
  return 'exterior';
}