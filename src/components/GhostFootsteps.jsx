import React from 'react';
import { motion } from 'framer-motion';

// A winding trail of glowing electric-blue footsteps used as ambient background decor.
// Rendered inside GhostBackground so it appears subtly across all pages.
const FOOTPRINTS = [
  { x: 8, y: 16, r: -8, s: 1 },
  { x: 14, y: 26, r: 6, s: 0.95 },
  { x: 10, y: 38, r: -4, s: 0.9 },
  { x: 18, y: 50, r: 8, s: 0.85 },
  { x: 12, y: 62, r: -6, s: 0.8 },
  { x: 20, y: 74, r: 5, s: 0.75 },
  { x: 16, y: 86, r: -3, s: 0.7 },
  { x: 82, y: 20, r: 6, s: 0.95 },
  { x: 88, y: 32, r: -5, s: 0.9 },
  { x: 84, y: 44, r: 7, s: 0.85 },
  { x: 90, y: 56, r: -4, s: 0.8 },
  { x: 84, y: 68, r: 6, s: 0.75 },
  { x: 88, y: 80, r: -7, s: 0.7 },
];

function Footprint({ x, y, r, s, delay }) {
  return (
    <motion.g
      transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.15, 0.5, 0.15] }}
      transition={{ duration: 3.5, repeat: Infinity, delay }}
    >
      {/* Left foot */}
      <ellipse cx="-2" cy="0" rx="1.6" ry="3" fill="hsl(199,89%,60%)" />
      {/* Right foot */}
      <ellipse cx="2" cy="2.4" rx="1.6" ry="3" fill="hsl(199,89%,60%)" />
    </motion.g>
  );
}

export default function GhostFootsteps() {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
      style={{ filter: 'drop-shadow(0 0 3px hsl(199,89%,48%,0.6))' }}
    >
      {FOOTPRINTS.map((f, i) => (
        <Footprint key={i} {...f} delay={i * 0.4} />
      ))}
    </svg>
  );
}