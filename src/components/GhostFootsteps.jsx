import React from 'react';
import { motion } from 'framer-motion';

// A trail of realistic right-pointing footsteps walking across the top of each page.
// The blue glow passes slowly from step to step, left to right.
const STEPS = [
  { x: 5, y: 11, scale: 0.85 },
  { x: 24, y: 14, scale: 0.95 },
  { x: 44, y: 9, scale: 1 },
  { x: 64, y: 13, scale: 0.95 },
  { x: 90, y: 10, scale: 0.85 },
];

const CYCLE = 7; // seconds for the full glow cycle
const GLOW = 1.4; // seconds each step stays lit

// Footprint silhouette: heel (left), defined arch, ball, toes (right). Points right.
const FOOT_PATH =
  'M -7 0 C -7 -3.2, -4 -3.2, -3 -2 C -2 -1, -1 -1.6, 0 -1.8 C 1 -2, 3 -2.4, 4 -1.8 C 4.6 -1.3, 4.6 1.3, 4 1.8 C 3 2.4, 1 2, 0 1.8 C -1 1.6, -2 1, -3 2 C -4 3.2, -7 3.2, -7 0 Z';

const TOES = [
  { cx: 5.4, cy: -1.5, rx: 1, ry: 0.8 },
  { cx: 6.1, cy: -0.2, rx: 0.9, ry: 0.7 },
  { cx: 5.7, cy: 1, rx: 0.9, ry: 0.7 },
  { cx: 4.8, cy: 1.9, rx: 0.8, ry: 0.6 },
];

function Footprint({ x, y, scale, index }) {
  return (
    <motion.g
      transform={`translate(${x} ${y}) scale(${scale})`}
      initial={{ opacity: 0.12 }}
      animate={{ opacity: [0.12, 0.12, 0.95, 0.12, 0.12] }}
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
      <path d={FOOT_PATH} fill="hsl(199,89%,62%)" />
      {TOES.map((t, i) => (
        <ellipse key={i} cx={t.cx} cy={t.cy} rx={t.rx} ry={t.ry} fill="hsl(199,89%,62%)" />
      ))}
    </motion.g>
  );
}

export default function GhostFootsteps() {
  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="absolute top-0 left-0 w-full h-[24%]"
      style={{ filter: 'drop-shadow(0 0 5px hsl(199,89%,48%,0.85))' }}
    >
      {STEPS.map((s, i) => (
        <Footprint key={i} {...s} index={i} />
      ))}
    </svg>
  );
}