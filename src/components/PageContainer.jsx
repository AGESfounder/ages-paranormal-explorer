import React from 'react';
import GhostBackground from './GhostBackground';

export default function PageContainer({ children, className = '' }) {
  return (
    // min-h-app = shared viewport policy (100dvh with vh fallback, see index.css)
    <div className="min-h-app bg-background relative overflow-x-hidden">
      <GhostBackground />
      <div className={`relative z-10 ${className}`}>{children}</div>
    </div>
  );
}