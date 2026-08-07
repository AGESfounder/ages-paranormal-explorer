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

function makeParkingIcon() {
  return new L.DivIcon({
    className: 'parking-marker',
    html: `<div style="
      width: 28px; height: 28px;
      background: hsl(45, 90%, 50%);
      border-radius: 6px;
      box-shadow: 0 0 12px hsl(45, 90%, 50%, 0.6), 0 0 24px hsl(45, 90%, 50%, 0.3);
      border: 2px solid hsl(45, 90%, 50%);
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 14px; font-weight: bold; font-family: 'Cinzel', serif;
    ">P</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
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

export default function TourMap({ stops, tour, highlightedStopId, height = 'h-64', draggable = false, onMarkerDragEnd }) {
  if (!stops || stops.length === 0) return null;

  // Find map center from stops
  const validStops = stops.filter(s => s.latitude && s.longitude);
  if (validStops.length === 0) return null;

  // Filter out geographic outliers so one bad coordinate can't zoom the
  // map to a continental scale. Compute the median center, then keep only
  // stops within a reasonable distance (50 mi normal, 200 mi road trips).
  // Outliers are still shown as markers but excluded from bounds/route.
  const sortedLats = [...validStops].map(s => s.latitude).sort((a, b) => a - b);
  const sortedLngs = [...validStops].map(s => s.longitude).sort((a, b) => a - b);
  const medianLat = sortedLats[Math.floor(sortedLats.length / 2)];
  const medianLon = sortedLngs[Math.floor(sortedLngs.length / 2)];
  const maxDist = tour?.tour_category === 'road_trip' ? 200
    : (tour?.tour_category === 'cold_spot' || tour?.tour_category === 'ship') ? 0.5
    : tour?.tour_category === 'area' ? 2.5
    : 5;
  const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  const inBounds = validStops.filter(s => haversine(medianLat, medianLon, s.latitude, s.longitude) <= maxDist);
  const boundsStops = inBounds.length > 0 ? inBounds : validStops;

  const lats = boundsStops.map(s => s.latitude);
  const lngs = boundsStops.map(s => s.longitude);
  const hasParking = tour?.parking_latitude != null && tour?.parking_longitude != null;
  const allLats = [...lats, ...(hasParking ? [tour.parking_latitude] : [])];
  const allLngs = [...lngs, ...(hasParking ? [tour.parking_longitude] : [])];
  const center = [
    (Math.min(...allLats) + Math.max(...allLats)) / 2,
    (Math.min(...allLngs) + Math.max(...allLngs)) / 2,
  ];

  const bounds = allLats.length > 1
    ? [[Math.min(...allLats), Math.min(...allLngs)], [Math.max(...allLats), Math.max(...allLngs)]]
    : undefined;

  const routeLine = boundsStops.length > 1
    ? boundsStops.map(s => [s.latitude, s.longitude])
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
        {hasParking && boundsStops.length > 0 && (
          <Polyline
            positions={[[tour.parking_latitude, tour.parking_longitude], [boundsStops[0].latitude, boundsStops[0].longitude]]}
            color="hsl(45, 90%, 50%)"
            weight={1.5}
            opacity={0.4}
            dashArray="4 4"
          />
        )}
        {hasParking && (
          <Marker
            position={[tour.parking_latitude, tour.parking_longitude]}
            icon={makeParkingIcon()}
          >
            <Popup>
              <div className="text-xs font-heading">
                <strong>Parking: {tour.parking_name || 'Parking Area'}</strong>
                {tour.parking_cost && <><br /><span className="text-muted-foreground">{tour.parking_cost}</span></>}
              </div>
            </Popup>
          </Marker>
        )}
        {validStops.map((stop) => (
          <Marker
            key={stop.id}
            position={[stop.latitude, stop.longitude]}
            icon={makeStopIcon(stop.stop_number)}
            draggable={draggable}
            eventHandlers={draggable ? { dragend: (e) => onMarkerDragEnd?.(e.target.getLatLng()) } : undefined}
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