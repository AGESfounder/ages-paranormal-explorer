import { Marker } from 'react-leaflet';
import { useRef, useEffect } from 'react';

// Wraps react-leaflet's Marker with long-press-to-drag behavior.
// The user must press and hold for LONG_PRESS_DELAY before the marker
// becomes draggable. This prevents accidental marker movement when
// panning/zooming the map.
//
// Key design decisions:
// 1. Map dragging is disabled during the long-press so the map doesn't
//    steal the touch gesture (panning away before the timer completes).
// 2. Custom drag tracking is used instead of Leaflet's built-in dragger,
//    because Leaflet's dragger only listens for NEW touchstart/mousedown
//    events — it can't pick up the current touch after we enable it.
const LONG_PRESS_DELAY = 500;

export default function LongPressMarker({ draggable = false, onMarkerDragEnd, stopId, children, eventHandlers, ...props }) {
  const markerRef = useRef(null);
  const pressTimer = useRef(null);
  const isDragging = useRef(false);
  const moveHandler = useRef(null);
  const endHandler = useRef(null);

  const setMarkerRef = (ref) => {
    markerRef.current = ref;
  };

  useEffect(() => {
    return () => {
      clearTimeout(pressTimer.current);
      if (moveHandler.current) {
        document.removeEventListener('touchmove', moveHandler.current);
        document.removeEventListener('mousemove', moveHandler.current);
      }
      if (endHandler.current) {
        document.removeEventListener('touchend', endHandler.current);
        document.removeEventListener('mouseup', endHandler.current);
      }
    };
  }, []);

  const startPress = () => {
    if (!draggable) return;
    clearTimeout(pressTimer.current);
    // Disable map dragging so the map doesn't pan during the long-press.
    const map = markerRef.current?._map;
    if (map && map.dragging) {
      map.dragging.disable();
    }
    pressTimer.current = setTimeout(() => {
      const marker = markerRef.current;
      if (!marker) return;
      isDragging.current = true;
      marker._icon?.classList.add('marker-ready-to-drag');

      // Custom move handler — updates the marker position in real time.
      // Works on the SAME touch that started the long-press (Leaflet's
      // built-in dragger can't do this).
      moveHandler.current = (e) => {
        if (!isDragging.current || !markerRef.current) return;
        if (e.cancelable) e.preventDefault();
        const point = e.touches ? e.touches[0] : e;
        const map = markerRef.current._map;
        const rect = map._container.getBoundingClientRect();
        const latLng = map.containerPointToLatLng([point.clientX - rect.left, point.clientY - rect.top]);
        markerRef.current.setLatLng(latLng);
      };

      // Custom end handler — finalizes the position and calls the callback.
      endHandler.current = () => {
        if (!isDragging.current) return;
        isDragging.current = false;
        const marker = markerRef.current;
        if (marker) {
          marker._icon?.classList.remove('marker-ready-to-drag');
          const latLng = marker.getLatLng();
          onMarkerDragEnd?.(stopId, latLng);
        }
        const map = marker?._map;
        if (map && map.dragging) {
          map.dragging.enable();
        }
        document.removeEventListener('touchmove', moveHandler.current);
        document.removeEventListener('mousemove', moveHandler.current);
        document.removeEventListener('touchend', endHandler.current);
        document.removeEventListener('mouseup', endHandler.current);
        moveHandler.current = null;
        endHandler.current = null;
      };

      document.addEventListener('touchmove', moveHandler.current, { passive: false });
      document.addEventListener('mousemove', moveHandler.current);
      document.addEventListener('touchend', endHandler.current);
      document.addEventListener('mouseup', endHandler.current);
    }, LONG_PRESS_DELAY);
  };

  const cancelPress = () => {
    // Only cancel if the long-press hasn't triggered yet.
    // If we're already dragging, the end handler manages cleanup.
    if (!isDragging.current) {
      clearTimeout(pressTimer.current);
      const map = markerRef.current?._map;
      if (map && map.dragging) {
        map.dragging.enable();
      }
    }
  };

  return (
    <Marker
      {...props}
      draggable={false}
      ref={setMarkerRef}
      eventHandlers={{
        mousedown: startPress,
        touchstart: startPress,
        mouseup: cancelPress,
        touchend: cancelPress,
        mouseout: cancelPress,
      }}
    >
      {children}
    </Marker>
  );
}