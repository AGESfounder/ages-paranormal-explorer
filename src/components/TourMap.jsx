import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import LongPressMarker from './LongPressMarker';
import StopMarkers from './map/StopMarkers';
import { makeNeedsPlacementIcon, makeParkingIcon, makeShuttleIcon, makeUnconfirmedParkingIcon } from './map/stopMarkerIcons';
import { makeAmenityIcon } from './amenities/AmenityMarkerIcon';
import { getCategory } from '@/lib/amenityCategories';
import tourRouteGeometry from '@/lib/tourRouteGeometry';

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

export default function TourMap({ stops, tour, highlightedStopId, height = 'h-64', draggable = false, parkingLocked = false, onMarkerDragEnd, amenities = [] }) {
  const [showAmenities, setShowAmenities] = useState(false);
  if (!stops || stops.length === 0) return null;

  // Find parking stop (from stops list, fallback to tour entity for legacy tours)
  const parkingStop = stops.find(s => s.stop_type === 'parking' && s.latitude && s.longitude);
  const parkingLat = parkingStop?.latitude || tour?.parking_latitude;
  const parkingLon = parkingStop?.longitude || tour?.parking_longitude;
  // An unplaced lot has no confirmed spot, so its recorded name is only a guess
  // and must not be shown as the lot's name.
  const parkingName = parkingStop?.needs_placement === true
    ? 'Parking Area'
    : (parkingStop?.name || tour?.parking_name);
  const parkingCost = parkingStop?.parking_cost || tour?.parking_cost;
  const parkingUnconfirmed = parkingStop?.needs_placement === true;
  const hasParking = parkingLat != null && parkingLon != null;

  const shuttleStop = stops.find(s => s.stop_type === 'shuttle' && s.latitude && s.longitude);
  const hasShuttle = shuttleStop != null;

  // Tour stops only (exclude parking and shuttle) for route line and stop markers
  const validStops = stops.filter(s => s.latitude && s.longitude && s.stop_type !== 'parking' && s.stop_type !== 'shuttle' && !s.needs_placement);
  const needsPlacementStops = stops.filter(s => s.latitude && s.longitude && s.stop_type !== 'parking' && s.stop_type !== 'shuttle' && s.needs_placement);
  if (validStops.length === 0 && !hasParking && !hasShuttle && needsPlacementStops.length === 0) return null;

  // Filter out geographic outliers so one bad coordinate can't zoom the
  // map to a continental scale. Compute the median center, then keep only
  // stops within a reasonable distance (50 mi normal, 200 mi road trips).
  // Outliers are still shown as markers but excluded from bounds/route.
  const allCoords = [...validStops, ...needsPlacementStops, ...(hasParking ? [{ latitude: parkingLat, longitude: parkingLon }] : []), ...(hasShuttle ? [{ latitude: shuttleStop.latitude, longitude: shuttleStop.longitude }] : [])];
  const sortedLats = allCoords.map(s => s.latitude).sort((a, b) => a - b);
  const sortedLngs = allCoords.map(s => s.longitude).sort((a, b) => a - b);
  const medianLat = sortedLats[Math.floor(sortedLats.length / 2)];
  const medianLon = sortedLngs[Math.floor(sortedLngs.length / 2)];
  const maxDist = tour?.tour_category === 'road_trip' ? 200
    : (tour?.tour_category === 'cold_spot' || tour?.tour_category === 'ship') ? 0.5
    : tour?.tour_category === 'area' ? (tour?.tour_type === 'mixed' || tour?.tour_type === 'driving' ? 15 : 2.5)
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
  const allLats = [...lats, ...needsPlacementStops.map(s => s.latitude), ...(hasParking ? [parkingLat] : []), ...(hasShuttle ? [shuttleStop.latitude] : [])];
  const allLngs = [...lngs, ...needsPlacementStops.map(s => s.longitude), ...(hasParking ? [parkingLon] : []), ...(hasShuttle ? [shuttleStop.longitude] : [])];
  const center = [
    (Math.min(...allLats) + Math.max(...allLats)) / 2,
    (Math.min(...allLngs) + Math.max(...allLngs)) / 2,
  ];

  const bounds = allLats.length > 1
    ? [[Math.min(...allLats), Math.min(...allLngs)], [Math.max(...allLats), Math.max(...allLngs)]]
    : undefined;

  // The planner expands the walk through short connected links, including
  // retracing a street to parking. A long direct return is never drawn as a
  // shortcut and never changes a nearby stop into a driving stop.
  const route = tourRouteGeometry([
    ...boundsStops,
    ...(parkingStop ? [parkingStop] : hasParking ? [{ stop_type: 'parking', latitude: parkingLat, longitude: parkingLon, needs_placement: parkingUnconfirmed }] : []),
    ...(shuttleStop ? [shuttleStop] : []),
  ], tour);
  const walkingLine = route.walkingLines.length ? route.walkingLines : undefined;
  const drivingLine = route.drivingLine.length ? route.drivingLine : undefined;

  return (
    <div className={`${height} rounded-xl overflow-hidden border border-border/40 relative`}>
      <MapContainer
        center={center}
        zoom={14}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        />
        <FitBounds bounds={bounds} />
        {walkingLine && (
          <Polyline positions={walkingLine} color="hsl(199,89%,48%)" weight={2} opacity={0.5} dashArray="8 6" />
        )}
        {drivingLine && (
          <Polyline positions={drivingLine} color="hsl(270,40%,50%)" weight={2} opacity={0.5} dashArray="8 6" />
        )}
        {hasParking && hasShuttle && (
          <Polyline
            positions={[[parkingLat, parkingLon], [shuttleStop.latitude, shuttleStop.longitude]]}
            color="hsl(142, 70%, 45%)"
            weight={1.5}
            opacity={0.4}
            dashArray="4 4"
          />
        )}
        {hasParking && (
          <LongPressMarker
            position={[parkingLat, parkingLon]}
            icon={parkingUnconfirmed ? makeUnconfirmedParkingIcon() : makeParkingIcon()}
            draggable={draggable && !parkingLocked}
            stopId={parkingStop?.id}
            onMarkerDragEnd={onMarkerDragEnd}
          >
            <Popup>
              <div className="text-xs font-heading">
                <strong>Parking: {parkingName || 'Parking Area'}</strong>
                {parkingCost && <><br /><span className="text-muted-foreground">{parkingCost}</span></>}
                {parkingUnconfirmed && (
                  <div className="text-pink-400 text-[10px] mt-1">
                    Parking not confirmed — centered on the tour loop. Long press to drag it to the real lot.
                  </div>
                )}
              </div>
            </Popup>
          </LongPressMarker>
        )}
        {hasShuttle && (
          <LongPressMarker
            position={[shuttleStop.latitude, shuttleStop.longitude]}
            icon={makeShuttleIcon()}
            draggable={draggable}
            stopId={shuttleStop.id}
            onMarkerDragEnd={onMarkerDragEnd}
          >
            <Popup>
              <div className="text-xs font-heading">
                <strong>Shuttle Drop-Off: {shuttleStop.name}</strong>
                {shuttleStop.parking_cost && <><br /><span className="text-muted-foreground">{shuttleStop.parking_cost}</span></>}
              </div>
            </Popup>
          </LongPressMarker>
        )}
        <StopMarkers stops={validStops} draggable={draggable} onMarkerDragEnd={onMarkerDragEnd} />
        {needsPlacementStops.map(stop => (
          <LongPressMarker
            key={stop.id}
            position={[stop.latitude, stop.longitude]}
            icon={makeNeedsPlacementIcon(stop.stop_number)}
            draggable
            stopId={stop.id}
            onMarkerDragEnd={onMarkerDragEnd}
          >
            <Popup>
              <div className="text-xs font-heading">
                <strong>Stop {stop.stop_number}:</strong> {stop.name}
                <div className="text-pink-400 text-[10px] mt-1">Needs Placement — long press to drag</div>
              </div>
            </Popup>
          </LongPressMarker>
        ))}

        {showAmenities && amenities.filter(a => a.latitude != null && a.longitude != null).map(a => {
          const cat = getCategory(a.category);
          return (
            <Marker
              key={a.id}
              position={[a.latitude, a.longitude]}
              icon={makeAmenityIcon(a.category)}
            >
              <Popup>
                <div className="text-xs font-heading">
                  <strong>{a.name}</strong>
                  <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: `hsl(${cat?.color || '220, 8%, 58%'})` }}>{cat?.label}</div>
                  {a.note && <p className="text-[10px] text-muted-foreground mt-1 font-body leading-relaxed">{a.note}</p>}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {amenities.length > 0 && (
        <button
          onClick={() => setShowAmenities(s => !s)}
          className="absolute top-2 right-2 z-[1000] flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-card/90 border border-border/60 text-[10px] font-heading uppercase tracking-wider backdrop-blur-sm hover:bg-card transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-primary" />
          {amenities.length} Field Stop{amenities.length !== 1 ? 's' : ''}
          <span className="text-muted-foreground">{showAmenities ? 'on' : 'off'}</span>
        </button>
      )}
    </div>
  );
}