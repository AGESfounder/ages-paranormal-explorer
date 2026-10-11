import React from 'react';

// One toolkit tool, drawn as a small instrument.
//
// The 3D look (bevelled body lit from the top-left, recessed face, contact
// shadow) comes from the shared `tkd` chassis in index.css; the tool's own
// identity comes from its `tkd-<type>` skin — body tone, accent hue and face
// pattern — plus its icon as the glowing control emblem.
//
// size: 'md' (tile) | 'sm' (opened-tool header badge).
export default function ToolDevice({ type, icon: Icon, size = 'md', className = '' }) {
  return (
    <div className={`tkd tkd-${type} ${size === 'sm' ? 'tkd-sm' : ''} ${className}`}>
      <div className="tkd-face" />
      <div className="tkd-emblem">{Icon ? <Icon /> : null}</div>
    </div>
  );
}