import { Marker } from 'react-leaflet';
import { useRef, useEffect } from 'react';

// Wraps react-leaflet's Marker with long-press-to-drag behavior.
//
// FLOW:
// 1. User touches marker → map pans normally (no propagation stopped).
// 2. If user moves > 10px → cancel long-press (they're panning the map).
// 3. If user holds still for LONG_PRESS_DELAY → marker glows, drag begins.
// 4. During drag, capture-phase document listeners intercept touchmove
//    BEFORE the map's pan handler, so only the marker moves.
// 5. On release, marker pins at that spot and onMarkerDragEnd is called.
//
// The map can be panned/zoomed freely — the long-press only activates
// when the user presses and holds a marker without moving.
const LONG_PRESS_DELAY = 500;
const MOVE_THRESHOLD = 10; // px — cancel long-press if finger moves more than this

export default function LongPressMarker({ draggable = false, onMarkerDragEnd, stopId, children, eventHandlers, ...props }) {
  const markerRef = useRef(null);
  const pressTimer = useRef(null);
  const isDragging = useRef(false);
  const lastInputType = useRef(null);
  const startPos = useRef(null);
  const moveDetector = useRef(null);
  const dragMove = useRef(null);
  const dragEnd = useRef(null);

  // Refs to avoid stale closures
  const draggableRef = useRef(draggable);
  draggableRef.current = draggable;
  const onDragEndRef = useRef(onMarkerDragEnd);
  onDragEndRef.current = onMarkerDragEnd;
  const stopIdRef = useRef(stopId);
  stopIdRef.current = stopId;

  useEffect(() => {
    return () => {
      clearTimeout(pressTimer.current);
      removeMoveDetector();
      removeDragListeners();
    };
  }, []);

  const removeMoveDetector = () => {
    if (moveDetector.current) {
      document.removeEventListener('touchmove', moveDetector.current, true);
      document.removeEventListener('mousemove', moveDetector.current);
      moveDetector.current = null;
    }
  };

  const removeDragListeners = () => {
    if (dragMove.current) {
      document.removeEventListener('touchmove', dragMove.current, true);
      document.removeEventListener('mousemove', dragMove.current);
    }
    if (dragEnd.current) {
      document.removeEventListener('touchend', dragEnd.current, true);
      document.removeEventListener('mouseup', dragEnd.current);
    }
    dragMove.current = null;
    dragEnd.current = null;
  };

  // Attach native listeners to the marker icon element.
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
        if (lastInputType.current === 'touch' && !isTouch) return;
        lastInputType.current = isTouch ? 'touch' : 'mouse';
        clearTimeout(pressTimer.current);
        const point = e.touches ? e.touches[0] : e;
        startPos.current = { x: point.clientX, y: point.clientY };

        // Movement detector — cancels long-press if user pans the map.
        // Capture phase, but does NOT stop propagation (map pans normally).
        moveDetector.current = (ev) => {
          if (isDragging.current) return;
          const p = ev.touches ? ev.touches[0] : ev;
          const dx = p.clientX - startPos.current.x;
          const dy = p.clientY - startPos.current.y;
          if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
            clearTimeout(pressTimer.current);
            removeMoveDetector();
          }
        };
        document.addEventListener('touchmove', moveDetector.current, { capture: true, passive: true });
        document.addEventListener('mousemove', moveDetector.current);

        // Long-press timer
        pressTimer.current = setTimeout(() => {
          const m = markerRef.current;
          if (!m) return;
          isDragging.current = true;
          m._icon?.classList.add('marker-ready-to-drag');
          removeMoveDetector();

          // Disable map dragging so a second finger can't pan during drag
          const map = m._map;
          if (map && map.dragging) map.dragging.disable();

          // Capture-phase drag handler — fires BEFORE the map's bubble-phase
          // pan handler, so stopImmediatePropagation prevents the map from moving.
          dragMove.current = (ev) => {
            if (!isDragging.current || !markerRef.current) return;
            ev.preventDefault();
            ev.stopImmediatePropagation();
            const p = ev.touches ? ev.touches[0] : ev;
            const map = markerRef.current._map;
            const rect = map._container.getBoundingClientRect();
            const latLng = map.containerPointToLatLng([p.clientX - rect.left, p.clientY - rect.top]);
            markerRef.current.setLatLng(latLng);
          };

          dragEnd.current = (ev) => {
            if (!isDragging.current) return;
            ev.stopImmediatePropagation();
            isDragging.current = false;
            const m2 = markerRef.current;
            if (m2) {
              m2._icon?.classList.remove('marker-ready-to-drag');
              const latLng = m2.getLatLng();
              onDragEndRef.current?.(stopIdRef.current, latLng);
            }
            const map = m2?._map;
            if (map && map.dragging) map.dragging.enable();
            removeDragListeners();
          };

          document.addEventListener('touchmove', dragMove.current, { capture: true, passive: false });
          document.addEventListener('mousemove', dragMove.current);
          document.addEventListener('touchend', dragEnd.current, { capture: true });
          document.addEventListener('mouseup', dragEnd.current);
        }, LONG_PRESS_DELAY);
      };

      const onEnd = (e) => {
        if (lastInputType.current === 'touch' && e.type !== 'touchend') return;
        if (!isDragging.current) {
          clearTimeout(pressTimer.current);
          removeMoveDetector();
        }
      };

      const onOut = (e) => {
        if (lastInputType.current === 'touch') return;
        if (!isDragging.current) {
          clearTimeout(pressTimer.current);
          removeMoveDetector();
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