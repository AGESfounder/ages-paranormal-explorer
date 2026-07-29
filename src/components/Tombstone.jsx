import React from 'react';
import { motion } from 'framer-motion';

// A glowing tombstone displaying "Energy Never Dies…" in electric blue.
export default function Tombstone({ className = '' }) {
  return (
    <motion.div
      className={`relative flex flex-col items-center justify-center ${className}`}
      animate={{
        filter: [
          'drop-shadow(0 0 10px hsl(199,89%,48%,0.35))',
          'drop-shadow(0 0 20px hsl(199,89%,48%,0.6))',
          'drop-shadow(0 0 10px hsl(199,89%,48%,0.35))',
        ],
      }}
      transition={{ duration: 3, repeat: Infinity }}
    >
      <svg viewBox="0 0 100 124" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="stoneFace" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(220,28%,42%)" />
            <stop offset="45%" stopColor="hsl(222,30%,28%)" />
            <stop offset="100%" stopColor="hsl(222,38%,15%)" />
          </linearGradient>
          <linearGradient id="stoneSide" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="hsl(222,32%,22%)" />
            <stop offset="100%" stopColor="hsl(222,42%,9%)" />
          </linearGradient>
          <linearGradient id="stoneCap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(218,26%,48%)" />
            <stop offset="100%" stopColor="hsl(220,28%,32%)" />
          </linearGradient>
          <linearGradient id="baseTop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(220,24%,36%)" />
            <stop offset="100%" stopColor="hsl(222,30%,22%)" />
          </linearGradient>
          <linearGradient id="baseFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(222,32%,24%)" />
            <stop offset="100%" stopColor="hsl(222,42%,11%)" />
          </linearGradient>
          <radialGradient id="stoneSheen" cx="0.34" cy="0.22" r="0.85">
            <stop offset="0%" stopColor="hsla(205,45%,78%,0.4)" />
            <stop offset="55%" stopColor="hsla(205,45%,78%,0)" />
          </radialGradient>
          <radialGradient id="groundShadow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="hsla(222,55%,2%,0.75)" />
            <stop offset="100%" stopColor="hsla(222,55%,2%,0)" />
          </radialGradient>
        </defs>

        {/* Soft ground shadow */}
        <ellipse cx="50" cy="120" rx="42" ry="6.5" fill="url(#groundShadow)" />

        {/* Base slab — top face (3D) */}
        <path d="M18 112 L26 106 L84 106 L90 112 Z" fill="url(#baseTop)" stroke="hsl(199,70%,42%)" strokeWidth="0.5" opacity="0.9" />
        {/* Base slab — front face */}
        <path d="M18 112 L18 119 L90 119 L90 112 Z" fill="url(#baseFront)" stroke="hsl(199,70%,42%)" strokeWidth="0.5" opacity="0.9" />

        {/* Tombstone top cap (rounded thickness, 3D) */}
        <path d="M50 18 Q78 18 78 44 L84 50 Q84 24 56 24 Z" fill="url(#stoneCap)" stroke="hsl(199,70%,42%)" strokeWidth="0.5" opacity="0.92" />
        {/* Tombstone right wall (3D extrusion) */}
        <path d="M78 44 L84 50 L84 106 L78 106 Z" fill="url(#stoneSide)" stroke="hsl(199,70%,42%)" strokeWidth="0.5" opacity="0.92" />

        {/* Tombstone front face */}
        <path
          d="M22 106 L22 44 Q22 18 50 18 Q78 18 78 44 L78 106 Z"
          fill="url(#stoneFace)"
          stroke="hsl(199,89%,48%)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        {/* 3D lighting sheen */}
        <path d="M22 106 L22 44 Q22 18 50 18 Q78 18 78 44 L78 106 Z" fill="url(#stoneSheen)" />
        {/* Right-side shading for depth */}
        <path d="M60 106 L60 44 Q60 24 78 34 L78 106 Z" fill="hsla(222,48%,5%,0.42)" />

        {/* Top arch bevel highlight */}
        <path d="M24 46 Q24 21 50 21" fill="none" stroke="hsla(205,55%,85%,0.55)" strokeWidth="1" strokeLinecap="round" />

        {/* Cracks / aging */}
        <path d="M50 19 L52 31 L49 39 L53 47" fill="none" stroke="hsla(222,45%,6%,0.5)" strokeWidth="0.5" />
        <path d="M30 72 L34 80 L31 88" fill="none" stroke="hsla(222,45%,6%,0.4)" strokeWidth="0.4" />
        <path d="M70 62 L66 70 L68 76" fill="none" stroke="hsla(222,45%,6%,0.35)" strokeWidth="0.4" />

        {/* Moss / age spots */}
        <ellipse cx="34" cy="98" rx="5" ry="2.4" fill="hsla(140,25%,32%,0.3)" />
        <ellipse cx="68" cy="101" rx="4" ry="2" fill="hsla(140,25%,30%,0.25)" />

        {/* Recessed inner panel */}
        <path
          d="M30 100 L30 48 Q30 28 50 28 Q70 28 70 48 L70 100 Z"
          fill="hsla(222,42%,9%,0.4)"
          stroke="hsl(199,89%,48%)"
          strokeWidth="0.5"
          opacity="0.55"
        />

        {/* Glowing text */}
        <text
          x="30"
          y="50"
          textAnchor="start"
          fontFamily="'Germania One', cursive"
          fontSize="14"
          fill="hsl(199,100%,74%)"
          style={{ filter: 'drop-shadow(0 0 5px hsl(199,89%,48%,1))' }}
        >
          Energy
        </text>
        <text
          x="30"
          y="70"
          textAnchor="start"
          fontFamily="'Germania One', cursive"
          fontSize="14"
          fill="hsl(199,100%,74%)"
          style={{ filter: 'drop-shadow(0 0 5px hsl(199,89%,48%,1))' }}
        >
          Never
        </text>
        <text
          x="30"
          y="90"
          textAnchor="start"
          fontFamily="'Germania One', cursive"
          fontSize="14"
          fill="hsl(199,100%,74%)"
          style={{ filter: 'drop-shadow(0 0 5px hsl(199,89%,48%,1))' }}
        >
          Dies…
        </text>
      </svg>
    </motion.div>
  );
}