import React from 'react';
import { motion } from 'framer-motion';
import ToolDevice from './ToolDevice';

// One toolkit tile: the tool's 3D device on top, its name and description
// below. Same tap target and same onSelect handling as before — only the
// presentation changed.
export default function ToolTile({ tool, index, active, onSelect }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileTap={{ scale: 0.97, y: 1 }}
      onClick={() => onSelect(tool)}
      className={`p-2 rounded-xl border transition-all cursor-pointer shadow-lg ${
        active ? 'border-primary/60 bg-primary/5' : 'border-border/40 bg-card/30 hover:border-primary/30 hover:bg-card/50'
      }`}
    >
      <ToolDevice type={tool.type} icon={tool.icon} stencil={tool.stencil} />

      {/* A reserved tile is an empty slot kept for a tool that does not exist yet:
          the chassis is drawn, its face and caption are left blank. */}
      {tool.placeholder ? (
        <div className="px-1.5 pt-2.5 pb-1" />
      ) : (
        <div className="px-1.5 pt-2.5 pb-1">
          <span className="inline-block text-[9px] px-1.5 py-0.5 rounded font-heading uppercase tracking-wider bg-primary/10 text-primary mb-1.5">
            Tap to Open
          </span>
          <p className="text-xs font-medium text-foreground">{tool.name}</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{tool.desc}</p>
        </div>
      )}
    </motion.div>
  );
}