import React from 'react';

// A more accurate outline of the contiguous United States, tracing the real
// coastline: Pacific Northwest → Canadian border → Great Lakes dip → New
// England → Florida peninsula → Gulf coast → Texas/Mexico border → California.
// Line-style (stroke only, uses currentColor) to match the app's lucide icons.
export default function USMap({ className = '' }) {
  return (
    <svg
      viewBox="0 0 100 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M 2.2 2.7 L 51.7 1.2 L 63 3.7 L 73 11 L 71.7 17.4 L 81.7 14.4 L 96.7 5.2 L 91.7 17.6 L 86.7 21.8 L 81.7 34.8 L 75 43.4 L 76.3 58.8 L 73.7 62 L 72.5 53.4 L 68.3 48.4 L 60 48.4 L 52 49.9 L 47.5 58.4 L 32.5 44 L 20 41.7 L 14.8 42.2 L 13 38.5 L 6 29 L 3.3 13.7 Z" />
    </svg>
  );
}