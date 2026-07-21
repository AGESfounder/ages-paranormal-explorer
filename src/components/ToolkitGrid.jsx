import React, { useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { motion } from 'framer-motion';
import { GripVertical } from 'lucide-react';

function cardClass(activeTool, tool, dragging) {
  return [
    'p-3.5 rounded-xl border transition-all cursor-pointer select-none',
    dragging ? 'shadow-[0_8px_24px_rgba(0,0,0,0.55)] ring-2 ring-primary/70 opacity-95' : '',
    activeTool?.name === tool.name ? 'border-primary/60 bg-primary/5' : 'border-border/40 bg-card/30 hover:border-primary/30 hover:bg-card/50',
  ].filter(Boolean).join(' ');
}

function CardInner({ tool, activeTool, isAdmin }) {
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-md ${activeTool?.name === tool.name ? 'bg-primary/20' : 'bg-secondary/30'}`}>
          <tool.icon className={`w-4 h-4 ${activeTool?.name === tool.name ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        {isAdmin && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 ml-auto" />}
        <span className="text-[9px] px-1.5 py-0.5 rounded font-heading uppercase tracking-wider bg-primary/10 text-primary">Tap to Open</span>
      </div>
      <p className="text-xs font-medium text-foreground mb-1">{tool.name}</p>
      <p className="text-[10px] text-muted-foreground leading-relaxed">{tool.desc}</p>
    </>
  );
}

export default function ToolkitGrid({ tools, activeTool, onSelect, isAdmin, onReorder }) {
  const draggedRef = useRef(false);

  const handleDragEnd = (result) => {
    draggedRef.current = true;
    setTimeout(() => { draggedRef.current = false; }, 50);
    if (!result.destination || result.source.index === result.destination.index) return;
    const next = Array.from(tools);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    onReorder(next);
  };

  const handleClick = (tool) => {
    if (draggedRef.current) { draggedRef.current = false; return; }
    onSelect(tool);
  };

  if (!isAdmin) {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        {tools.map((tool, i) => (
          <motion.div
            key={tool.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onSelect(tool)}
            className={cardClass(activeTool, tool, false)}
          >
            <CardInner tool={tool} activeTool={activeTool} isAdmin={false} />
          </motion.div>
        ))}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="toolkit-grid" direction="horizontal">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-2 gap-2.5">
            {tools.map((tool, i) => (
              <Draggable key={tool.name} draggableId={tool.name} index={i}>
                {(p, snap) => (
                  <div
                    ref={p.innerRef}
                    {...p.draggableProps}
                    {...p.dragHandleProps}
                    onClick={() => handleClick(tool)}
                    className={cardClass(activeTool, tool, snap.isDragging)}
                  >
                    <CardInner tool={tool} activeTool={activeTool} isAdmin={isAdmin} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}