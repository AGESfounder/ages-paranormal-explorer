import React from 'react';
import { motion } from 'framer-motion';

// A trail of shoe-sole footprints walking across the top of a page or header.
// The blue glow passes slowly from step to step, left to right.
// `top` values are in px so the prints sit correctly in both a full viewport
// (GhostBackground) and a short sticky SectionHeader.
const STEPS = [
  { left: 4, top: 14, size: 22, rotate: -4 },
  { left: 24, top: 18, size: 24, rotate: 3 },
  { left: 44, top: 11, size: 26, rotate: -3 },
  { left: 64, top: 17, size: 24, rotate: 4 },
  { left: 92, top: 13, size: 22, rotate: -2 },
];

const CYCLE = 7; // seconds for the full glow cycle
const GLOW = 1.4; // seconds each step stays lit

// Shoe-sole silhouette: heel (left, narrower), arch (middle dip), toe (right, broader). Points right.
const SHOE_PATH =
  'M -7 0 C -7 -2.6, -5 -2.6, -4 -1.8 C -3.2 -1.2, -2.6 -1.4, -1.6 -1.8 C 0 -2.4, 2 -2.8, 4 -2.6 C 6 -2.4, 7 -1.8, 7 0 C 7 1.8, 6 2.4, 4 2.6 C 2 2.8, 0 2.4, -1.6 1.8 C -2.6 1.4, -3.2 1.2, -4 1.8 C -5 2.6, -7 2.6, -7 0 Z';

function Footprint({ left, top, size, rotate, index }) {
  return (
    <motion.div
      className="absolute"
      style={{ left: `${left}%`, top: `${top}px`, width: size, height: size * 0.5 }}
      initial={{ opacity: 0.14 }}
      animate={{
        opacity: [0.14, 0.14, 1, 0.14, 0.14],
        scale: [1, 1, 1.25, 1, 1],
      }}
      transition={{
        duration: CYCLE,
        repeat: Infinity,
        ease: 'easeInOut',
        times: [
          0,
          Math.max(0, (index * GLOW) / CYCLE - 0.001),
          ((index + 0.5) * GLOW) / CYCLE,
          ((index + 1) * GLOW) / CYCLE,
          1,
        ],
      }}
    >
      <svg viewBox="-8 -4 16 8" width="100%" height="100%" style={{ transform: `rotate(${rotate}deg)` }}>
        <path d={SHOE_PATH} fill="hsl(199,100%,70%)" />
      </svg>
    </motion.div>
  );
}

export default function GhostFootsteps() {
  return (
    <div
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      style={{ filter: 'drop-shadow(0 0 8px hsl(199,89%,55%,1)) drop-shadow(0 0 16px hsl(199,89%,60%,0.8))' }}
    >
      {STEPS.map((s, i) => (
        <Footprint key={i} {...s} index={i} />
      ))}
    </div>
  );
}