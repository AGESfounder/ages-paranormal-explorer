import React from 'react';
import { motion } from 'framer-motion';

// A sparse winding trail of glowing electric-blue footsteps near the top of each page.
const FOOTPRINTS = [
  { x: 12, y: 6, r: -8, s: 1 },
  { x: 18, y: 9, r: 4, s: 0.95 },
  { x: 14, y: 13, r: -6, s: 0.9 },
  { x: 20, y: 17, r: 5, s: 0.85 },
  { x: 80, y: 7, r: 6, s: 0.95 },
  { x: 86, y: 11, r: -5, s: 0.9 },
  { x: 82, y: 15, r: 7, s: 0.85 },
];

function Footprint({ x, y, r, s, delay }) {
  return (
    <motion.g
      transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.15, 0.5, 0.15] }}
      transition={{ duration: 3.5, repeat: Infinity, delay }}
    >
      <ellipse cx="-2" cy="0" rx="1.6" ry="3" fill="hsl(199,89%,60%)" />
      <ellipse cx="2" cy="2.4" rx="1.6" ry="3" fill="hsl(199,89%,60%)" />
    </motion.g>
  );
}

export default function GhostFootsteps() {
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className="absolute top-0 left-0 w-full h-[30%]"
      style={{ filter: 'drop-shadow(0 0 3px hsl(199,89%,48%,0.6))' }}
    >
      {FOOTPRINTS.map((f, i) => (
        <Footprint key={i} {...f} delay={i * 0.4} />
      ))}
    </svg>
  );
}