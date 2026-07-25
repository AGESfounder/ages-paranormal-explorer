import React, { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

const THRESHOLD = 70;
const MAX = 110;

// Touch pull-to-refresh wrapper. Attaches to window scroll: when the user
// swipes down at the top of the page (scrollTop <= 0), a spinner indicator
// grows; releasing past the threshold triggers `onRefresh`. No-ops on desktop
// (no touch events) so existing desktop patterns are untouched.
export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pullRef = useRef(0);
  const pulling = useRef(false);
  const refreshRef = useRef(onRefresh);
  const containerRef = useRef(null);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onStart = (e) => {
      if (window.scrollY <= 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    };
    const onMove = (e) => {
      if (!pulling.current || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) {
        e.preventDefault();
        const p = Math.min(dy * 0.5, MAX);
        pullRef.current = p;
        setPull(p);
      }
    };
    const onEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        try { await refreshRef.current?.(); } catch {}
        setRefreshing(false);
      }
      pullRef.current = 0;
      setPull(0);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [refreshing]);

  const progress = Math.min(pull / THRESHOLD, 1);

  return (
    <>
      <div className="flex items-center justify-center overflow-hidden transition-[height] duration-150 ease-out" style={{ height: pull }}>
        <div className="flex items-center justify-center" style={{ opacity: refreshing ? 1 : progress }}>
          {refreshing ? (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          ) : (
            <RefreshCw className="w-5 h-5 text-primary transition-transform" style={{ transform: `rotate(${progress * 360}deg)` }} />
          )}
        </div>
      </div>
      <div ref={containerRef}>{children}</div>
    </>
  );
}