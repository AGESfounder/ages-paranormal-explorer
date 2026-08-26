import { Marker } from 'react-leaflet';
import { useRef, useEffect } from 'react';

// Wraps react-leaflet's Marker with long-press-to-drag behavior.
// Dragging is disabled by default — the user must press and hold for
// LONG_PRESS_DELAY before the marker becomes draggable. This prevents
// accidental marker movement when panning/zooming the map.
const LONG_PRESS_DELAY = 500;

export default function LongPressMarker({ draggable = false, onMarkerDragEnd, stopId, children, eventHandlers, ...props }) {
  const markerRef = useRef(null);
  const pressTimer = useRef(null);

  // Disable dragging as soon as the marker instance is available —
  // long press is required to enable it. Runs during commit (before paint)
  // so the user never sees the marker in a draggable state.
  const setMarkerRef = (ref) => {
    markerRef.current = ref;
    if (ref && draggable && ref.dragging) {
      ref.dragging.disable();
    }
  };

  useEffect(() => {
    return () => clearTimeout(pressTimer.current);
  }, []);

  const startPress = () => {
    if (!draggable) return;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      const marker = markerRef.current;
      if (marker && marker.dragging) {
        marker.dragging.enable();
        marker._icon?.classList.add('marker-ready-to-drag');
      }
    }, LONG_PRESS_DELAY);
  };

  const cancelPress = () => {
    clearTimeout(pressTimer.current);
  };

  const handleDragEnd = (e) => {
    onMarkerDragEnd?.(stopId, e.target.getLatLng());
    const marker = markerRef.current;
    if (marker && marker.dragging) {
      marker.dragging.disable();
      marker._icon?.classList.remove('marker-ready-to-drag');
    }
  };

  return (
    <Marker
      {...props}
      draggable={draggable}
      ref={setMarkerRef}
      eventHandlers={{
        mousedown: startPress,
        touchstart: startPress,
        mouseup: cancelPress,
        touchend: cancelPress,
        mouseout: cancelPress,
        dragend: handleDragEnd,
      }}
    >
      {children}
    </Marker>
  );
}