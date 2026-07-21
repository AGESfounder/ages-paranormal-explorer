import React from 'react';
import { motion } from 'framer-motion';

export default function ToolkitGrid({ tools, activeTool, onSelect }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tools.map((tool, i) => (
        <motion.div
          key={tool.name}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          onClick={() => onSelect(tool)}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${activeTool?.name === tool.name ? 'border-primary/60 bg-primary/5' : 'border-border/40 bg-card/30 hover:border-primary/30 hover:bg-card/50'}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-1.5 rounded-md ${activeTool?.name === tool.name ? 'bg-primary/20' : 'bg-secondary/30'}`}>
              <tool.icon className={`w-4 h-4 ${activeTool?.name === tool.name ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded font-heading uppercase tracking-wider bg-primary/10 text-primary">Tap to Open</span>
          </div>
          <p className="text-xs font-medium text-foreground mb-1">{tool.name}</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">{tool.desc}</p>
        </motion.div>
      ))}
    </div>
  );
}