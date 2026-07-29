import React from 'react';
import { motion } from 'framer-motion';

// A horizontal row of footsteps across the top of each page.
// Each footprint glows in sequence from left to right.
const COUNT = 7;
const STEP = 100 / (COUNT + 1);

function Footprint({ index }) {
  const x = STEP * (index + 1);
  const y = 12 + (index % 2 === 0 ? 0 : 3);
  const total = 5; // seconds for full cycle
  const delay = (total / COUNT) * index;

  return (
    <motion.g
      transform={`translate(${x} ${y})`}
      initial={{ opacity: 0.15 }}
      animate={{ opacity: [0.15, 0.85, 0.15] }}
      transition={{ duration: total / COUNT, repeat: Infinity, delay, ease: 'easeInOut' }}
    >
      <ellipse cx="-2.2" cy="0" rx="2" ry="3.5" fill="hsl(199,89%,62%)" />
      <ellipse cx="2.2" cy="2.6" rx="2" ry="3.5" fill="hsl(199,89%,62%)" />
    </motion.g>
  );
}

export default function GhostFootsteps() {
  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="absolute top-0 left-0 w-full h-[24%]"
      style={{ filter: 'drop-shadow(0 0 4px hsl(199,89%,48%,0.7))' }}
    >
      {Array.from({ length: COUNT }).map((_, i) => (
        <Footprint key={i} index={i} />
      ))}
    </svg>
  );
}