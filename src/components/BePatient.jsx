import React from 'react';

// Reusable "Be Patient" indicator that glows in a pulsating bold light.
// Render it next to any button whose action is still in progress.
export default function BePatient({ className = '' }) {
  return (
    <span
      className={`text-[10px] font-bold text-primary animate-glow-pulse tracking-[0.2em] uppercase ${className}`}
    >
      Be Patient
    </span>
  );
}