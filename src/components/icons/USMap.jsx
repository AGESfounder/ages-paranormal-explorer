import React from 'react';

// A simplified outline of the contiguous United States.
// Line-style (stroke only, uses currentColor) to match the app's lucide icons.
export default function USMap({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 62"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M14 11 L40 9 L64 8 L82 10 Q88 12 87 17 L86 25 Q87 31 85 35 L83 38 Q86 44 88 49 Q85 54 82 51 L80 43 L72 43 L62 44 L54 46 Q50 51 46 54 Q42 50 38 46 L31 39 L23 29 L16 19 Z" />
    </svg>
  );
}