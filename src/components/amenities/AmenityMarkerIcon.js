import L from 'leaflet';
import { getCategory } from '@/lib/amenityCategories';

// Inline SVG paths (lucide-style, 24x24 stroke icons) for each amenity
// category, so the Leaflet map markers show a recognizable shape — fork &
// spoon for food, droplet for restroom, camera for site, fuel pump for gas,
// bed for lodging, pin for other — instead of a letter.
const ICON_SVG = {
  restroom: '<rect x="7" y="2.5" width="10" height="5" rx="1"/><path d="M5 7.5h14v3.5a7 7 0 0 1-7 7H12a7 7 0 0 1-7-7z"/><path d="M9 18h6v3H9z"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  site: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  gas: '<path d="M3 22h12V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v18z"/><path d="M3 12h12"/><path d="M15 6h2a2 2 0 0 1 2 2v8a2 2 0 1 0 4 0V8l-3-3"/>',
  lodging: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8V4h8"/>',
  other: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
};

// Leaflet DivIcon for a community amenity marker. A colored circle (category
// hue) with the category's shape icon in white inside, a dark border for
// contrast on the dark map, and a soft glow in the category color. Slightly
// smaller (26px) than the numbered stop circles (28px) so it reads as a
// secondary layer.
export function makeAmenityIcon(category) {
  const cat = getCategory(category);
  const path = ICON_SVG[category] || ICON_SVG.other;
  return new L.DivIcon({
    className: 'amenity-marker',
    html: `<div style="
      width: 26px; height: 26px;
      background: hsl(${cat.color});
      border-radius: 50%;
      box-shadow: 0 0 10px hsl(${cat.color}, 0.6), 0 0 20px hsl(${cat.color}, 0.3);
      border: 2px solid hsl(222, 47%, 8%);
      display: flex; align-items: center; justify-content: center;
    "><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}