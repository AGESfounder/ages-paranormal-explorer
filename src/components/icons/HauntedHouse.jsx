import React from 'react';

// A spooky haunted house silhouette (two pitched roofs, crooked chimney,
// door, window, moon). Line-style to match the app's lucide icons.
export default function HauntedHouse({ className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Moon */}
      <circle cx="18.5" cy="5.5" r="2.5" />
      {/* Crooked chimney on the tall roof */}
      <path d="M11 6.5 L11 4 L12.5 4 L12.5 6" />
      {/* House silhouette with two pitched roofs */}
      <path d="M3 20 V11 H7.5 V8 L11 11 V6.5 L16 11 H21 V20 Z" />
      {/* Door */}
      <rect x="9.5" y="15.5" width="3" height="4.5" rx="0.4" />
      {/* Window + cross */}
      <rect x="14" y="14" width="2.6" height="2.6" rx="0.3" />
      <path d="M14 15.3 H16.6 M15.3 14 V16.6" />
    </svg>
  );
}