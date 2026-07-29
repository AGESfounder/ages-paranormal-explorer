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
      <svg viewBox="0 0 100 120" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="stoneBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(222,30%,24%)" />
            <stop offset="100%" stopColor="hsl(222,40%,12%)" />
          </linearGradient>
        </defs>

        {/* Ground mound */}
        <ellipse cx="50" cy="112" rx="36" ry="8" fill="hsl(222,40%,8%)" opacity="0.8" />

        {/* Tombstone */}
        <path
          d="M22 112 L22 44 Q22 18 50 18 Q78 18 78 44 L78 112 Z"
          fill="url(#stoneBody)"
          stroke="hsl(199,89%,48%)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Inner border */}
        <path
          d="M30 104 L30 46 Q30 26 50 26 Q70 26 70 46 L70 104 Z"
          fill="none"
          stroke="hsl(199,89%,48%)"
          strokeWidth="0.8"
          opacity="0.5"
        />

        {/* Glowing text */}
        <text
          x="50"
          y="50"
          textAnchor="middle"
          fontFamily="'Germania One', cursive"
          fontSize="15"
          fill="hsl(199,100%,72%)"
          style={{ filter: 'drop-shadow(0 0 5px hsl(199,89%,48%,1))' }}
        >
          Energy
        </text>
        <text
          x="50"
          y="70"
          textAnchor="middle"
          fontFamily="'Germania One', cursive"
          fontSize="15"
          fill="hsl(199,100%,72%)"
          style={{ filter: 'drop-shadow(0 0 5px hsl(199,89%,48%,1))' }}
        >
          Never
        </text>
        <text
          x="50"
          y="90"
          textAnchor="middle"
          fontFamily="'Germania One', cursive"
          fontSize="15"
          fill="hsl(199,100%,72%)"
          style={{ filter: 'drop-shadow(0 0 5px hsl(199,89%,48%,1))' }}
        >
          Dies…
        </text>
      </svg>
    </motion.div>
  );
}