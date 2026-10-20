import React from 'react';
import { motion } from 'framer-motion';

// The anomaly indicator on the sweepers' screens.
//
// On the depth sensor it carries the figure the sensor confirmed: a little stick
// figure — the same body shape the phone's own recognition found — beside the word
// ANOMALY, and MOVING when that figure is the one travelling between frames. The
// contrast scan has no skeleton to show, so it keeps the plain warning box these
// tools have always used.
function StickFigure({ moving }) {
  return (
    <motion.svg
      viewBox="0 0 16 24"
      className="w-4 h-6 shrink-0"
      aria-hidden="true"
      animate={moving ? { rotate: [-4, 4, -4] } : { rotate: 0 }}
      transition={moving ? { repeat: Infinity, duration: 1.1, ease: 'easeInOut' } : { duration: 0.2 }}
    >
      <circle cx="8" cy="3.6" r="2.6" fill="none" stroke="white" strokeWidth="1.6" />
      <path
        d="M8 6.2v8.4M8 8.6l-4.6 2.6M8 8.6l4.6 2.6M8 14.6l-3.4 7M8 14.6l3.4 7"
        fill="none"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

export default function AnomalyFigureBadge({ active, moving, method }) {
  if (!active) return null;
  const depth = method === 'depth';
  return (
    <div className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-none">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex items-center gap-2 px-2.5 py-1 rounded bg-red-500/90 border border-red-300/50"
      >
        {depth && <StickFigure moving={moving} />}
        <div className="leading-tight">
          <p className="text-[10px] font-mono text-white font-bold tracking-wider">
            {depth ? 'ANOMALY' : '⚠ ANOMALY DETECTED'}
          </p>
          {depth && (
            <p className="text-[8px] font-mono text-white/85 tracking-wider">
              {moving ? 'FIGURE MOVING' : 'FIGURE IN VIEW'}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}