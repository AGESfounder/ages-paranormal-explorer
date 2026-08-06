import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

// Auto-fit the map to show all stops. Without this the map uses a fixed zoom
// centered on the midpoint, so stops at the edges fall off-screen.
function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }
  }, [bounds, map]);
  return null;
}

function makeStopIcon(stopNumber) {
  return new L.DivIcon({
    className: 'stop-marker',
    html: `<div style="
      width: 28px; height: 28px;
      background: hsl(199,89%,48%);
      border-radius: 50%;
      box-shadow: 0 0 12px hsl(199,89%,48%,0.6), 0 0 24px hsl(199,89%,48%,0.3);
      border: 2px solid hsl(199,89%,48%);
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 12px; font-weight: bold; font-family: 'Cinzel', serif;
    ">${stopNumber}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

// Spread stops that share the exact same coordinates (landmark/ship tours
// where all stops geocode to one address) into a small spiral so each marker
// is visible on the map instead of stacking on top of each other.
function spreadOverlappingStops(stops) {
  const roundKey = (lat, lon) => `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const groups = {};
  for (const s of stops) {
    const key = roundKey(s.latitude, s.longitude);
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  }
  const offsetMap = {};
  for (const [key, group] of Object.entries(groups)) {
    if (group.length < 2) continue;
    const [baseLat, baseLon] = key.split(',').map(Number);
    group.forEach((s, i) => {
      const angle = (i * 2 * Math.PI) / group.length;
      const radius = 0.0012 * (1 + i * 0.4); // spiral outward
      offsetMap[s.id] = {
        latitude: baseLat + radius * Math.sin(angle),
        longitude: baseLon + radius * Math.cos(angle) * Math.cos(baseLat * Math.PI / 180),
      };
    });
  }
  return stops.map(s => {
    const off = offsetMap[s.id];
    return off ? { ...s, latitude: off.latitude, longitude: off.longitude } : s;
  });
}

export default function TourMap({ stops, tour, highlightedStopId, height = 'h-64' }) {
  if (!stops || stops.length === 0) return null;

  // Find map center from stops, spreading any that share identical coordinates
  const rawValid = stops.filter(s => s.latitude && s.longitude);
  if (rawValid.length === 0) return null;
  const validStops = spreadOverlappingStops(rawValid);

  const lats = validStops.map(s => s.latitude);
  const lngs = validStops.map(s => s.longitude);
  const center = [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  ];

  const bounds = validStops.length > 1
    ? [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]
    : undefined;

  const routeLine = validStops.length > 1
    ? validStops.map(s => [s.latitude, s.longitude])
    : undefined;

  return (
    <div className={`${height} rounded-xl overflow-hidden border border-border/40`}>
      <MapContainer
        center={center}
        zoom={14}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds bounds={bounds} />
        {bounds && <Polyline positions={routeLine} color="hsl(199,89%,48%)" weight={2} opacity={0.5} dashArray="8 6" />}
        {validStops.map((stop) => (
          <Marker
            key={stop.id}
            position={[stop.latitude, stop.longitude]}
            icon={makeStopIcon(stop.stop_number)}
          >
            <Popup>
              <div className="text-xs font-heading">
                <strong>Stop {stop.stop_number}:</strong> {stop.name}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}