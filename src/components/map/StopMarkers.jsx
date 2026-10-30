import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import LongPressMarker from '../LongPressMarker';
import { makeArrowIcon, makeStackedIcon, makeStopIcon } from './stopMarkerIcons';

// Two markers closer than this on screen sit on top of each other. Stops that
// close are drawn as a small dot at the stop's real point plus the numbered
// marker pushed out on a short leader line with an arrow back to that dot, so
// the number stays readable and still shows exactly where the stop is.
const CLOSE_PX = 34;
const CALLOUT_PX = 52;
const ARROW_GAP_PX = 11;

// Single-linkage grouping in screen pixels at the current zoom, so the result
// matches what the visitor can actually see at any zoom level.
function clusterByProximity(map, stops, zoom) {
  const points = stops.map(stop => ({
    stop,
    point: map.project([stop.latitude, stop.longitude], zoom),
  }));
  const clusters = [];
  const taken = new Set();

  for (let i = 0; i < points.length; i++) {
    if (taken.has(i)) continue;
    const cluster = [points[i]];
    taken.add(i);
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < points.length; j++) {
        if (taken.has(j)) continue;
        if (cluster.some(item => item.point.distanceTo(points[j].point) <= CLOSE_PX)) {
          cluster.push(points[j]);
          taken.add(j);
          grew = true;
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function StopPopup({ stop }) {
  return (
    <Popup>
      <div className="text-xs font-heading">
        <strong>Stop {stop.stop_number}:</strong> {stop.name}
        {stop.geocoded === false && <div className="text-amber-400 text-[10px] mt-1">Estimated — needs verification</div>}
      </div>
    </Popup>
  );
}

export default function StopMarkers({ stops, draggable = false, onMarkerDragEnd }) {
  const map = useMap();
  const [zoom, setZoom] = useState(14);

  useEffect(() => {
    const syncZoom = () => setZoom(map.getZoom());
    syncZoom();
    map.on('zoomend', syncZoom);
    return () => map.off('zoomend', syncZoom);
  }, [map]);

  // Same-structure stops sharing one coordinate are one building (rooms, decks)
  // and keep their count badge. Everything else is checked for overlap.
  const { stacks, loose } = useMemo(() => {
    const byCoord = {};
    for (const stop of stops) {
      const key = `${stop.latitude.toFixed(5)},${stop.longitude.toFixed(5)}`;
      (byCoord[key] = byCoord[key] || []).push(stop);
    }
    const stackedGroups = [];
    const looseStops = [];
    for (const group of Object.values(byCoord)) {
      if (group.length > 1 && group.every(s => s.same_structure === true)) stackedGroups.push(group);
      else looseStops.push(...group);
    }
    return { stacks: stackedGroups, loose: looseStops };
  }, [stops]);

  const clusters = useMemo(() => clusterByProximity(map, loose, zoom), [map, loose, zoom]);

  return (
    <>
      {stacks.map(group => {
        const first = group[0];
        return (
          <LongPressMarker
            key={first.id}
            position={[first.latitude, first.longitude]}
            icon={makeStackedIcon(first.stop_number, group.length)}
            draggable={draggable}
            stopId={first.id}
            onMarkerDragEnd={onMarkerDragEnd}
          >
            <Popup>
              <div className="text-xs font-heading">
                <strong>Stop {first.stop_number} (+{group.length - 1} more):</strong>
                <ul className="mt-1 space-y-0.5 list-none p-0">
                  {group.map(s => <li key={s.id}>• {s.name}</li>)}
                </ul>
              </div>
            </Popup>
          </LongPressMarker>
        );
      })}

      {clusters.map(cluster => {
        const [first] = cluster;

        if (cluster.length === 1) {
          const { stop } = first;
          return (
            <LongPressMarker
              key={stop.id}
              position={[stop.latitude, stop.longitude]}
              icon={makeStopIcon(stop.stop_number, stop.geocoded === false)}
              draggable={draggable}
              stopId={stop.id}
              onMarkerDragEnd={onMarkerDragEnd}
            >
              <StopPopup stop={stop} />
            </LongPressMarker>
          );
        }

        // Fan the numbers around the group's shared point, evenly and upward
        // first, so none of them cover the dots they point at.
        const anchor = cluster
          .reduce((sum, item) => sum.add(item.point), L.point(0, 0))
          .divideBy(cluster.length);
        const step = cluster.length <= 4 ? 52 : 360 / cluster.length;

        return (
          <React.Fragment key={first.stop.id}>
            {cluster.map((item, i) => {
              const angle = (-90 + (i - (cluster.length - 1) / 2) * step) * (Math.PI / 180);
              const offsetX = Math.cos(angle) * CALLOUT_PX;
              const offsetY = Math.sin(angle) * CALLOUT_PX;
              const callout = map.unproject(anchor.add(L.point(offsetX, offsetY)), zoom);
              const dot = map.unproject(item.point, zoom);
              const dotPixel = item.point;

              // Direction from the offset number to its dot drives both the
              // arrowhead placement and its rotation.
              const towardX = dotPixel.x - (anchor.x + offsetX);
              const towardY = dotPixel.y - (anchor.y + offsetY);
              const length = Math.hypot(towardX, towardY) || 1;
              const arrow = map.unproject(
                L.point(dotPixel.x - (towardX / length) * ARROW_GAP_PX, dotPixel.y - (towardY / length) * ARROW_GAP_PX),
                zoom,
              );
              const rotation = (Math.atan2(towardX, -towardY) * 180) / Math.PI;

              return (
                <React.Fragment key={item.stop.id}>
                  <Polyline
                    positions={[[callout.lat, callout.lng], [dot.lat, dot.lng]]}
                    color="hsl(199,89%,62%)"
                    weight={1.5}
                    opacity={0.75}
                    interactive={false}
                  />
                  <Marker position={[arrow.lat, arrow.lng]} icon={makeArrowIcon(rotation)} interactive={false} />
                  <LongPressMarker
                    position={[callout.lat, callout.lng]}
                    icon={makeStopIcon(item.stop.stop_number, item.stop.geocoded === false)}
                    draggable={draggable}
                    stopId={item.stop.id}
                    onMarkerDragEnd={onMarkerDragEnd}
                  >
                    <StopPopup stop={item.stop} />
                  </LongPressMarker>
                  <CircleMarker
                    center={[dot.lat, dot.lng]}
                    radius={4}
                    pathOptions={{ color: 'hsl(222,47%,6%)', weight: 1.5, fillColor: 'hsl(199,89%,62%)', fillOpacity: 1 }}
                    interactive={false}
                  />
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}