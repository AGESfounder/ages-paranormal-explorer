import L from 'leaflet';
import { getCategory } from '@/lib/amenityCategories';

// Leaflet DivIcon for a community amenity marker. Smaller (22px) than the
// numbered stop circles (28px) so it reads as a secondary layer, with the
// category color fill, a dark border for contrast on the dark map, and a
// soft glow in the category color. The category letter sits inside.
export function makeAmenityIcon(category) {
  const cat = getCategory(category);
  return new L.DivIcon({
    className: 'amenity-marker',
    html: `<div style="
      width: 22px; height: 22px;
      background: hsl(${cat.color});
      border-radius: 50%;
      box-shadow: 0 0 10px hsl(${cat.color}, 0.6), 0 0 20px hsl(${cat.color}, 0.3);
      border: 2px solid hsl(222, 47%, 8%);
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 11px; font-weight: bold; font-family: 'Inter', sans-serif;
    ">${cat.letter}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });
}