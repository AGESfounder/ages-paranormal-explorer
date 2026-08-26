import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import LongPressMarker from './LongPressMarker';

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

function makeShuttleIcon() {
  return new L.DivIcon({
    className: 'shuttle-marker',
    html: `<div style="
      width: 28px; height: 28px;
      background: hsl(142, 70%, 45%);
      border-radius: 6px;
      box-shadow: 0 0 12px hsl(142, 70%, 45%, 0.6), 0 0 24px hsl(142, 70%, 45%, 0.3);
      border: 2px solid hsl(142, 70%, 45%);
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 14px; font-weight: bold; font-family: 'Cinzel', serif;
    ">S</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function makeStopIcon(stopNumber, estimated = false) {
  if (estimated) {
    return new L.DivIcon({
      className: 'stop-marker estimated',
      html: `<div style="position:relative;width:28px;height:28px;">
        <div style="width:28px;height:28px;background:hsl(35,90%,50%);border-radius:50%;box-shadow:0 0 12px hsl(35,90%,50%,0.6),0 0 24px hsl(35,90%,50%,0.3);border:2px dashed hsl(35,90%,50%);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;font-family:'Cinzel',serif;">${stopNumber}</div>
        <div style="position:absolute;top:-6px;right:-6px;min-width:18px;height:14px;padding:0 3px;background:hsl(35,90%,50%);border-radius:7px;border:1.5px solid hsl(222,47%,8%);display:flex;align-items:center;justify-content:center;color:white;font-size:8px;font-weight:bold;font-family:'Inter',sans-serif;line-height:1;letter-spacing:0.5px;">EST</div>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    });
  }
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

// Stacked marker for same_structure stops sharing identical coordinates
// (rooms in one building, decks on a ship). Shows the first stop's number
// with a purple count badge indicating how many stops are at this location.
function makeStackedIcon(stopNumber, count) {
  return new L.DivIcon({
    className: 'stop-marker stacked',
    html: `<div style="position:relative;width:28px;height:28px;">
      <div style="width:28px;height:28px;background:hsl(199,89%,48%);border-radius:50%;box-shadow:0 0 12px hsl(199,89%,48%,0.6),0 0 24px hsl(199,89%,48%,0.3);border:2px solid hsl(199,89%,48%);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;font-family:'Cinzel',serif;">${stopNumber}</div>
      <div style="position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 3px;background:hsl(270,40%,50%);border-radius:8px;border:1.5px solid hsl(222,47%,8%);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:bold;font-family:'Inter',sans-serif;line-height:1;">${count}</div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function makeNeedsPlacementIcon(stopNumber) {
  return new L.DivIcon({
    className: 'stop-marker needs-placement',
    html: `<div style="position:relative;width:28px;height:28px;">
      <div style="width:28px;height:28px;background:hsl(330,80%,55%);border-radius:50%;box-shadow:0 0 12px hsl(330,80%,55%,0.6),0 0 24px hsl(330,80%,55%,0.3);border:2px dashed hsl(330,80%,55%);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;font-family:'Cinzel',serif;">${stopNumber}</div>
      <div style="position:absolute;top:-6px;right:-6px;min-width:22px;height:14px;padding:0 3px;background:hsl(330,80%,55%);border-radius:7px;border:1.5px solid hsl(222,47%,8%);display:flex;align-items:center;justify-content:center;color:white;font-size:7px;font-weight:bold;font-family:'Inter',sans-serif;line-height:1;letter-spacing:0.3px;">PLACE</div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

export default function TourMap({ stops, tour, highlightedStopId, height = 'h-64', draggable = false, onMarkerDragEnd }) {
  if (!stops || stops.length === 0) return null;

  // Find parking stop (from stops list, fallback to tour entity for legacy tours)
  const parkingStop = stops.find(s => s.stop_type === 'parking' && s.latitude && s.longitude);
  const parkingLat = parkingStop?.latitude || tour?.parking_latitude;
  const parkingLon = parkingStop?.longitude || tour?.parking_longitude;
  const parkingName = parkingStop?.name || tour?.parking_name;
  const parkingCost = parkingStop?.parking_cost || tour?.parking_cost;
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

  const routeLine = boundsStops.length > 1
    ? boundsStops.map(s => [s.latitude, s.longitude])
    : undefined;

  // Group stops by coordinates for stacked marker display. When multiple
  // same_structure stops share identical coordinates (rooms in one building,
  // decks on a ship), show a single marker with a count badge instead of
  // overlapping markers that can't be tapped individually.
  const coordGroups = {};
  for (const stop of validStops) {
    const key = `${stop.latitude.toFixed(5)},${stop.longitude.toFixed(5)}`;
    if (!coordGroups[key]) coordGroups[key] = [];
    coordGroups[key].push(stop);
  }
  const renderGroups = Object.values(coordGroups).map(group => ({
    stops: group,
    isStacked: group.length > 1 && group.every(s => s.same_structure === true),
  }));

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
        {hasParking && hasShuttle && (
          <Polyline
            positions={[[parkingLat, parkingLon], [shuttleStop.latitude, shuttleStop.longitude]]}
            color="hsl(142, 70%, 45%)"
            weight={1.5}
            opacity={0.4}
            dashArray="4 4"
          />
        )}
        {hasShuttle && boundsStops.length > 0 && (
          <Polyline
            positions={[[shuttleStop.latitude, shuttleStop.longitude], [boundsStops[0].latitude, boundsStops[0].longitude]]}
            color="hsl(142, 70%, 45%)"
            weight={1.5}
            opacity={0.4}
            dashArray="4 4"
          />
        )}
        {hasParking && !hasShuttle && boundsStops.length > 0 && (
          <Polyline
            positions={[[parkingLat, parkingLon], [boundsStops[0].latitude, boundsStops[0].longitude]]}
            color="hsl(45, 90%, 50%)"
            weight={1.5}
            opacity={0.4}
            dashArray="4 4"
          />
        )}
        {hasParking && (
          <LongPressMarker
            position={[parkingLat, parkingLon]}
            icon={makeParkingIcon()}
            draggable={draggable}
            stopId={parkingStop?.id}
            onMarkerDragEnd={onMarkerDragEnd}
          >
            <Popup>
              <div className="text-xs font-heading">
                <strong>Parking: {parkingName || 'Parking Area'}</strong>
                {parkingCost && <><br /><span className="text-muted-foreground">{parkingCost}</span></>}
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
        {renderGroups.flatMap((group) => {
          if (group.isStacked) {
            const first = group.stops[0];
            return (
              <LongPressMarker
                key={first.id}
                position={[first.latitude, first.longitude]}
                icon={makeStackedIcon(first.stop_number, group.stops.length)}
                draggable={draggable}
                stopId={first.id}
                onMarkerDragEnd={onMarkerDragEnd}
              >
                <Popup>
                  <div className="text-xs font-heading">
                    <strong>Stop {first.stop_number} (+{group.stops.length - 1} more):</strong>
                    <ul className="mt-1 space-y-0.5 list-none p-0">
                      {group.stops.map(s => <li key={s.id}>• {s.name}</li>)}
                    </ul>
                  </div>
                </Popup>
              </LongPressMarker>
            );
          }
          return group.stops.map(stop => (
            <LongPressMarker
              key={stop.id}
              position={[stop.latitude, stop.longitude]}
              icon={makeStopIcon(stop.stop_number, stop.geocoded === false)}
              draggable={draggable}
              stopId={stop.id}
              onMarkerDragEnd={onMarkerDragEnd}
            >
              <Popup>
                <div className="text-xs font-heading">
                  <strong>Stop {stop.stop_number}:</strong> {stop.name}
                  {stop.geocoded === false && <div className="text-amber-400 text-[10px] mt-1">Estimated — needs verification</div>}
                </div>
              </Popup>
            </LongPressMarker>
          ));
        })}
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
      </MapContainer>
    </div>
  );
}