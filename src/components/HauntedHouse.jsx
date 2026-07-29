import React from 'react';
import { motion } from 'framer-motion';

// Custom haunted house silhouette with glowing electric-blue windows.
export default function HauntedHouse({ className = '' }) {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      animate={{
        filter: [
          'drop-shadow(0 0 10px hsl(199,89%,48%,0.35))',
          'drop-shadow(0 0 20px hsl(199,89%,48%,0.65))',
          'drop-shadow(0 0 10px hsl(199,89%,48%,0.35))',
        ],
      }}
      transition={{ duration: 3, repeat: Infinity }}
    >
      <defs>
        <linearGradient id="houseBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(222,40%,18%)" />
          <stop offset="100%" stopColor="hsl(222,50%,9%)" />
        </linearGradient>
        <radialGradient id="windowGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(199,100%,75%)" />
          <stop offset="60%" stopColor="hsl(199,89%,58%)" />
          <stop offset="100%" stopColor="hsl(199,89%,48%)" />
        </radialGradient>
      </defs>

      {/* Main house body */}
      <path
        d="M14 52 L14 88 L40 88 L40 60 L60 60 L60 88 L86 88 L86 52 L72 52 L72 30 L50 14 L28 30 L28 52 Z"
        fill="url(#houseBody)"
        stroke="hsl(199,89%,48%)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Left tower roof */}
      <path
        d="M28 30 L50 14 L72 30 Z"
        fill="url(#houseBody)"
        stroke="hsl(199,89%,48%)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />

      {/* Chimney */}
      <rect x="62" y="20" width="6" height="12" fill="url(#houseBody)" stroke="hsl(199,89%,48%)" strokeWidth="1" />

      {/* Attic window (round) */}
      <circle cx="50" cy="40" r="4.5" fill="url(#windowGlow)" />
      <circle cx="50" cy="40" r="4.5" fill="none" stroke="hsl(199,89%,65%)" strokeWidth="0.6" opacity="0.8" />

      {/* Lower windows */}
      <rect x="22" y="66" width="8" height="10" rx="1" fill="url(#windowGlow)" />
      <rect x="70" y="66" width="8" height="10" rx="1" fill="url(#windowGlow)" />

      {/* Window crosses */}
      <line x1="26" y1="66" x2="26" y2="76" stroke="hsl(222,50%,9%)" strokeWidth="0.8" />
      <line x1="22" y1="71" x2="30" y2="71" stroke="hsl(222,50%,9%)" strokeWidth="0.8" />
      <line x1="74" y1="66" x2="74" y2="76" stroke="hsl(222,50%,9%)" strokeWidth="0.8" />
      <line x1="70" y1="71" x2="78" y2="71" stroke="hsl(222,50%,9%)" strokeWidth="0.8" />

      {/* Door */}
      <rect x="44" y="70" width="12" height="18" rx="6" fill="hsl(222,50%,7%)" stroke="hsl(199,89%,48%)" strokeWidth="1" />
      <circle cx="53" cy="79" r="0.9" fill="hsl(199,89%,65%)" />
    </motion.svg>
  );
}