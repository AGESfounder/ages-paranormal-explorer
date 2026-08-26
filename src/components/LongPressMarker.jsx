import { Marker } from 'react-leaflet';
import { useRef, useEffect } from 'react';

// Wraps react-leaflet's Marker with long-press-to-drag behavior.
// The user must press and hold for LONG_PRESS_DELAY before the marker
// becomes draggable. This prevents accidental marker movement when
// panning/zooming the map.
//
// KEY ARCHITECTURE: Native event listeners are attached directly to the
// marker's icon DOM element (not via react-leaflet's eventHandlers).
// This lets us call stopPropagation() on touchstart/mousedown BEFORE the
// event bubbles to the map container — preventing the map's pan handler
// from stealing the touch gesture. react-leaflet's eventHandlers fire
// only AFTER the event reaches the map container (Leaflet uses event
// delegation), which is too late to stop the pan.
//
// Click events are NOT stopped, so popups still open normally.
const LONG_PRESS_DELAY = 500;

export default function LongPressMarker({ draggable = false, onMarkerDragEnd, stopId, children, eventHandlers, ...props }) {
  const markerRef = useRef(null);
  const pressTimer = useRef(null);
  const isDragging = useRef(false);
  const lastInputType = useRef(null);
  const moveHandler = useRef(null);
  const endHandler = useRef(null);

  // Refs to avoid stale closures — the native listeners are set up once
  // (when the icon becomes available) and must always use the latest props.
  const draggableRef = useRef(draggable);
  draggableRef.current = draggable;
  const onDragEndRef = useRef(onMarkerDragEnd);
  onDragEndRef.current = onMarkerDragEnd;
  const stopIdRef = useRef(stopId);
  stopIdRef.current = stopId;

  // Unmount cleanup
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

  // Attach native listeners to the marker icon element. Uses requestAnimationFrame
  // to retry until the icon is available (Leaflet creates it asynchronously).
  useEffect(() => {
    if (!draggable) return;
    let rafId;
    let iconCleanup;

    const setup = () => {
      const marker = markerRef.current;
      if (!marker) { rafId = requestAnimationFrame(setup); return; }
      const icon = marker._icon;
      if (!icon) { rafId = requestAnimationFrame(setup); return; }

      const onStart = (e) => {
        if (!draggableRef.current) return;
        const isTouch = e.type === 'touchstart';
        // Ignore synthetic mousedown that browsers fire after touchstart.
        if (lastInputType.current === 'touch' && !isTouch) return;
        lastInputType.current = isTouch ? 'touch' : 'mouse';
        clearTimeout(pressTimer.current);
        pressTimer.current = setTimeout(() => {
          const m = markerRef.current;
          if (!m) return;
          isDragging.current = true;
          m._icon?.classList.add('marker-ready-to-drag');

          // Custom move handler — updates marker position in real time.
          moveHandler.current = (ev) => {
            if (!isDragging.current || !markerRef.current) return;
            if (ev.cancelable) ev.preventDefault();
            const point = ev.touches ? ev.touches[0] : ev;
            const map = markerRef.current._map;
            const rect = map._container.getBoundingClientRect();
            const latLng = map.containerPointToLatLng([point.clientX - rect.left, point.clientY - rect.top]);
            markerRef.current.setLatLng(latLng);
          };

          // Custom end handler — finalizes position and calls callback.
          endHandler.current = () => {
            if (!isDragging.current) return;
            isDragging.current = false;
            const m = markerRef.current;
            if (m) {
              m._icon?.classList.remove('marker-ready-to-drag');
              const latLng = m.getLatLng();
              onDragEndRef.current?.(stopIdRef.current, latLng);
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
        // CRITICAL: Stop propagation before the event reaches the map
        // container — prevents the map's pan handler from stealing the touch.
        e.stopPropagation();
      };

      const onEnd = (e) => {
        // Ignore synthetic mouseup/mouseout during touch interaction.
        if (lastInputType.current === 'touch' && e.type !== 'touchend') return;
        if (!isDragging.current) {
          clearTimeout(pressTimer.current);
        }
        e.stopPropagation();
      };

      const onOut = (e) => {
        if (lastInputType.current === 'touch') return;
        if (!isDragging.current) {
          clearTimeout(pressTimer.current);
        }
      };

      icon.addEventListener('touchstart', onStart, { passive: true });
      icon.addEventListener('touchend', onEnd, { passive: true });
      icon.addEventListener('mousedown', onStart);
      icon.addEventListener('mouseup', onEnd);
      icon.addEventListener('mouseout', onOut);

      iconCleanup = () => {
        icon.removeEventListener('touchstart', onStart);
        icon.removeEventListener('touchend', onEnd);
        icon.removeEventListener('mousedown', onStart);
        icon.removeEventListener('mouseup', onEnd);
        icon.removeEventListener('mouseout', onOut);
      };
    };

    setup();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (iconCleanup) iconCleanup();
    };
  }, [draggable]);

  return (
    <Marker
      {...props}
      draggable={false}
      ref={(ref) => { markerRef.current = ref; }}
    >
      {children}
    </Marker>
  );
}