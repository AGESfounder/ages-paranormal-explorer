import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import LongPressMarker from '../LongPressMarker';
import { makeArrowIcon, makeNeedsPlacementIcon, makeStackedIcon, makeStopIcon } from './stopMarkerIcons';

// Two markers closer than this on screen sit on top of each other. Stops that
// close are drawn as a small dot at the stop's real point plus the numbered
// marker pushed out on a short leader line with an arrow back to that dot, so
// the number stays readable and still shows exactly where the stop is.
const CLOSE_PX = 34;
const MARKER_PX = 28;
const ARROW_GAP_PX = 11;
// The callout ring grows only as far as the numbers need to stay apart, so
// every leader line stays as short as it can be.
const CALLOUT_MIN_PX = 26;
const CALLOUT_MAX_PX = 66;

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

// Every number keeps its own stop's true bearing from the cluster's middle, so
// the callouts read in the same direction as the ground beneath them. Bearings
// too close together to keep the numbers apart are eased apart, never shuffled
// into a different order.
function layoutCallouts(cluster, anchor, ringPx) {
  const entries = cluster
    .map(item => ({
      ...item,
      angle: Math.atan2(item.point.y - anchor.y, item.point.x - anchor.x),
    }))
    .sort((a, b) => a.angle - b.angle);

  const minGap = Math.min(Math.PI, 2 * Math.asin(Math.min(1, (MARKER_PX + 3) / (2 * ringPx))));
  const twoPi = Math.PI * 2;

  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < entries.length; i++) {
      const next = entries[(i + 1) % entries.length];
      const gap = i + 1 < entries.length
        ? next.angle - entries[i].angle
        : next.angle + twoPi - entries[i].angle;
      if (gap < minGap - 1e-6) {
        const push = (minGap - gap) / 2;
        entries[i].angle -= push;
        next.angle += push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return entries;
}

function StopPopup({ stop }) {
  return (
    <Popup>
      <div className="text-xs font-heading">
        <strong>Stop {stop.stop_number}:</strong> {stop.name}
        {stop.boat_access === true && (
          <div className="text-cyan-300 text-[10px] mt-1">Boat access — open water separates this stop from the rest of the tour</div>
        )}
        {stop.needs_placement
          ? <div className="text-pink-400 text-[10px] mt-1">Needs Placement — long press to drag</div>
          : stop.geocoded === false && <div className="text-amber-400 text-[10px] mt-1">Estimated — needs verification</div>}
      </div>
    </Popup>
  );
}

export default function StopMarkers({ stops, draggable = false, onMarkerDragEnd }) {
  const map = useMap();
  const [zoom, setZoom] = useState(14);
  // An unplaced stop keeps its pink "Needs Placement" pin and stays draggable
  // so a visitor can drop it on the real spot, but it takes part in the same
  // overlap layout as every other stop so the pins never hide each other.
  const iconFor = (stop) => (stop.needs_placement
    ? makeNeedsPlacementIcon(stop.stop_number)
    : makeStopIcon(stop.stop_number, stop.geocoded === false, stop.boat_access === true));
  const canDrag = (stop) => draggable || stop.needs_placement === true;

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
              icon={iconFor(stop)}
              draggable={canDrag(stop)}
              stopId={stop.id}
              onMarkerDragEnd={onMarkerDragEnd}
            >
              <StopPopup stop={stop} />
            </LongPressMarker>
          );
        }

        // Each number sits on its own stop's side of the cluster, on the
        // smallest ring that keeps the numbers from touching, so the callouts
        // follow the layout of the streets instead of a fixed ring order.
        const anchor = cluster
          .reduce((sum, item) => sum.add(item.point), L.point(0, 0))
          .divideBy(cluster.length);
        const ringPx = Math.min(
          CALLOUT_MAX_PX,
          Math.max(CALLOUT_MIN_PX, (MARKER_PX / 2 + 4) / Math.sin(Math.PI / cluster.length)),
        );
        const ordered = layoutCallouts(cluster, anchor, ringPx);

        return (
          <React.Fragment key={first.stop.id}>
            {ordered.map(item => {
              const offsetX = Math.cos(item.angle) * ringPx;
              const offsetY = Math.sin(item.angle) * ringPx;
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
                    icon={iconFor(item.stop)}
                    draggable={canDrag(item.stop)}
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