import React from 'react';
import GhostBackground from './GhostBackground';

export default function PageContainer({ children, className = '' }) {
  return (
    <div className="min-h-dvh bg-background relative overflow-x-hidden">
      <GhostBackground />
      <div className={`relative z-10 ${className}`}>{children}</div>
    </div>
  );
}