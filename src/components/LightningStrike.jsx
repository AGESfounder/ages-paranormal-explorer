import React from 'react';
import { motion } from 'framer-motion';

// A single elongated lightning bolt that periodically flashes like a strike.
// `angle` slants the bolt (lean away from the tombstone); `delay` staggers
// the flash so multiple bolts illuminate in rotation.
export default function LightningStrike({ angle = 12, delay = 0, width = 14, height = 32, className = '' }) {
  return (
    <motion.div className={`absolute pointer-events-none ${className}`} style={{ rotate: angle }}>
      {/* Strike illumination burst */}
      <motion.div
        className="absolute -inset-6 rounded-full blur-xl"
        style={{ background: 'radial-gradient(circle, hsla(199,100%,82%,0.9) 0%, hsla(199,90%,60%,0.2) 45%, transparent 70%)' }}
        animate={{ opacity: [0, 0, 0.85, 0.15, 0.7, 0, 0] }}
        transition={{ duration: 5, times: [0, 0.46, 0.5, 0.55, 0.6, 0.66, 1], repeat: Infinity, ease: 'easeOut', delay }}
      />
      {/* Elongated bolt */}
      <motion.svg
        width={width} height={height} viewBox="0 0 24 48" xmlns="http://www.w3.org/2000/svg"
        animate={{
          opacity: [0.35, 0.35, 1, 0.5, 1, 0.35, 0.35],
          filter: [
            'drop-shadow(0 0 2px hsl(199,100%,70%))',
            'drop-shadow(0 0 2px hsl(199,100%,70%))',
            'drop-shadow(0 0 12px hsl(199,100%,92%)) drop-shadow(0 0 20px hsl(199,100%,72%))',
            'drop-shadow(0 0 4px hsl(199,100%,82%))',
            'drop-shadow(0 0 12px hsl(199,100%,92%)) drop-shadow(0 0 20px hsl(199,100%,72%))',
            'drop-shadow(0 0 2px hsl(199,100%,70%))',
            'drop-shadow(0 0 2px hsl(199,100%,70%))',
          ],
        }}
        transition={{ duration: 5, times: [0, 0.46, 0.5, 0.55, 0.6, 0.66, 1], repeat: Infinity, ease: 'easeOut', delay }}
      >
        <path d="M14 0 L4 27 L11 27 L8 48 L21 20 L13 20 Z" fill="hsl(199,100%,82%)" stroke="hsl(199,100%,96%)" strokeWidth="1" strokeLinejoin="round" />
      </motion.svg>
    </motion.div>
  );
}