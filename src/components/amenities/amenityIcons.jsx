import { Droplet, Utensils, Camera, Fuel, Bed, MapPin } from 'lucide-react';

// Maps an amenity category id to its lucide icon component for React UI.
// The Leaflet map markers use inline HTML (see AmenityMarkerIcon.js), not
// these components.
const ICONS = {
  restroom: Droplet,
  food: Utensils,
  site: Camera,
  gas: Fuel,
  lodging: Bed,
  other: MapPin,
};

export function AmenityIcon({ category, className, style }) {
  const Icon = ICONS[category] || MapPin;
  return <Icon className={className} style={style} />;
}