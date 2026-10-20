import { Utensils, Camera, Fuel, Bed, MapPin } from 'lucide-react';

// A custom toilet icon matching the map marker's SVG (AmenityMarkerIcon.js),
// so the form and the map show the same shape for the restroom category.
function ToiletIcon({ className, style }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style}>
      <rect x="7" y="2.5" width="10" height="5" rx="1" />
      <path d="M5 7.5h14v3.5a7 7 0 0 1-7 7H12a7 7 0 0 1-7-7z" />
      <path d="M9 18h6v3H9z" />
    </svg>
  );
}

// Maps an amenity category id to its icon component for React UI.
// The Leaflet map markers use inline HTML (see AmenityMarkerIcon.js), not
// these components.
const ICONS = {
  restroom: ToiletIcon,
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