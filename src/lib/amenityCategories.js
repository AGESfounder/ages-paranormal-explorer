// Amenity category metadata — pure data shared by the React UI and the
// Leaflet marker factory. `color` is an HSL channel string (e.g. "15, 85%, 55%")
// consumed as hsl(<color>) and hsl(<color>, <alpha>), matching the existing
// tour-marker style. Hues are chosen to stay distinct from tour markers:
// stop blue (199), parking yellow (45), shuttle green (142), needs-placement
// pink (330), stacked purple (270).

export const AMENITY_CATEGORIES = [
  { id: 'restroom', label: 'Restroom',  letter: 'R', color: '15, 85%, 55%'  },
  { id: 'food',     label: 'Good Eats', letter: 'F', color: '30, 90%, 55%'  },
  { id: 'site',     label: 'Site to See', letter: 'S', color: '300, 60%, 62%' },
  { id: 'gas',      label: 'Gas Station', letter: 'G', color: '165, 65%, 42%' },
  { id: 'lodging',  label: 'Lodging',  letter: 'L', color: '230, 60%, 62%' },
  { id: 'other',    label: 'Other',    letter: 'O', color: '220, 8%, 58%'  },
];

const BY_ID = Object.fromEntries(AMENITY_CATEGORIES.map(c => [c.id, c]));

export function getCategory(id) {
  return BY_ID[id] || BY_ID.other;
}