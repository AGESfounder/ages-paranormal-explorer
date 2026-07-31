import React from 'react';
import { Eye, DoorOpen } from 'lucide-react';

const LABELS = { exterior_only: 'Exterior Only', exterior_interior: 'Ext + Int' };
const ICONS = { exterior_only: Eye, exterior_interior: DoorOpen };
const STYLES = {
  exterior_only: 'bg-cyan-glow/15 text-cyan-glow border border-cyan-glow/30',
  exterior_interior: 'bg-primary/15 text-primary border border-primary/30',
};

export default function AccessTypeBadge({ accessType, className = '' }) {
  if (!accessType || !LABELS[accessType]) return null;
  const Icon = ICONS[accessType];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-heading font-bold uppercase tracking-wider whitespace-nowrap ${STYLES[accessType]} ${className}`}>
      <Icon className="w-3 h-3" />
      {LABELS[accessType]}
    </span>
  );
}