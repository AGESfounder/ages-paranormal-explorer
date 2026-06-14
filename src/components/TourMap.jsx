import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';

// Ghost-themed marker icon
const ghostIcon = new L.DivIcon({
  className: 'ghost-marker',
  html: `<div style="
    width: 28px; height: 28px;
    background: hsl(199,89%,48%);
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 0 12px hsl(199,89%,48%,0.6), 0 0 24px hsl(199,89%,48%,0.3);
    border: 2px solid hsl(199,89%,48%);
  "></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -30],
});

const startIcon = new L.DivIcon({
  className: 'start-marker',
  html: `<div style="
    width: 24px; height: 24px;
    background: hsl(270,40%,45%);
    border-radius: 50%;
    box-shadow: 0 0 10px hsl(270,40%,45%,0.6), 0 0 20px hsl(270,40%,45%,0.3);
    border: 2px solid hsl(270,40%,60%);
    display: flex; align-items: center; justify-content: center;
    color: white; font-size: 12px; font-weight: bold;
  ">S</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

export default function TourMap({ stops, tour, highlightedStopId, height = 'h-64' }) {
  if (!stops || stops.length === 0) return null;

  // Find map center from stops
  const validStops = stops.filter(s => s.latitude && s.longitude);
  if (validStops.length === 0) return null;

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
        {bounds && <Polyline positions={routeLine} color="hsl(199,89%,48%)" weight={2} opacity={0.5} dashArray="8 6" />}
        {validStops.map((stop) => (
          <Marker
            key={stop.id}
            position={[stop.latitude, stop.longitude]}
            icon={highlightedStopId === stop.id ? startIcon : ghostIcon}
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