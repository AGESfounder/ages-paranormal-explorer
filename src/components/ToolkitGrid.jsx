import React from 'react';
import ToolTile from './toolkit/ToolTile';

export default function ToolkitGrid({ tools, activeTool, onSelect }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tools.map((tool, i) => (
        <ToolTile
          key={tool.name}
          tool={tool}
          index={i}
          active={activeTool?.name === tool.name}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}