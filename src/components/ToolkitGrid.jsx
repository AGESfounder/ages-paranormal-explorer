import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { GripVertical } from 'lucide-react';

const COLS = 2;
const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;

function cardClass(activeTool, tool, dragging, isPlaceholder, isTarget) {
  return [
    'p-3.5 rounded-xl border transition-colors cursor-pointer select-none',
    isPlaceholder ? 'border-dashed border-primary/40 bg-primary/5 opacity-30' : '',
    isTarget ? 'ring-2 ring-primary/70 border-primary/60 bg-primary/10' : '',
    !isPlaceholder && !isTarget
      ? (activeTool?.name === tool.name ? 'border-primary/60 bg-primary/5' : 'border-border/40 bg-card/30 hover:border-primary/30 hover:bg-card/50')
      : '',
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
  // Pad with empty slots so total cells are even (equal columns) and at least one empty exists.
  const emptyCount = useMemo(() => {
    const rem = tools.length % COLS;
    return rem === 0 ? COLS : COLS - rem;
  }, [tools.length]);

  const cells = useMemo(() => [...tools, ...Array(emptyCount).fill(null)], [tools, emptyCount]);

  const gridRef = useRef(null);
  const cellRefs = useRef([]);
  const pressTimer = useRef(null);
  const downInfo = useRef(null);
  const dragInfo = useRef(null);
  const dropTargetRef = useRef(null);

  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const hitTest = (x, y) => {
    for (let i = 0; i < cellRefs.current.length; i++) {
      const el = cellRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return null;
  };

  const beginDrag = (index) => {
    const el = cellRefs.current[index];
    const rect = el?.getBoundingClientRect();
    const info = downInfo.current;
    if (!info || !rect) return;
    const offsetX = info.x - rect.left;
    const offsetY = info.y - rect.top;
    dragInfo.current = { index, tool: cells[index] };
    setDragging({ index, x: info.x, y: info.y, offsetX, offsetY, width: rect.width, height: rect.height, tool: cells[index] });
    if (gridRef.current && info.pointerId != null) {
      try { gridRef.current.setPointerCapture(info.pointerId); } catch (e) {}
    }
  };

  const onPointerDownCell = (e, index) => {
    if (!isAdmin) return;
    const tool = cells[index];
    if (!tool) return;
    e.preventDefault();
    downInfo.current = { index, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    pressTimer.current = setTimeout(() => beginDrag(index), LONG_PRESS_MS);
  };

  const onPointerMove = (e) => {
    const info = downInfo.current;
    if (!info) return;
    if (!dragInfo.current) {
      const dx = e.clientX - info.x;
      const dy = e.clientY - info.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE) {
        if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
        downInfo.current = null;
      }
      return;
    }
    setDragging((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const t = hitTest(e.clientX, e.clientY);
    dropTargetRef.current = t;
    setDropTarget(t);
  };

  const finishDrag = (e) => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
    const info = downInfo.current;
    downInfo.current = null;

    if (!dragInfo.current) {
      // Short press = tap to open
      if (info) {
        const tool = cells[info.index];
        if (tool) onSelect(tool);
      }
      return;
    }

    const from = dragInfo.current.index;
    const to = dropTargetRef.current;
    dragInfo.current = null;
    dropTargetRef.current = null;
    if (gridRef.current && info?.pointerId != null) {
      try { gridRef.current.releasePointerCapture(info.pointerId); } catch (e2) {}
    }
    setDragging(null);
    setDropTarget(null);

    if (to != null && to !== from) {
      const next = [...cells];
      [next[from], next[to]] = [next[to], next[from]];
      onReorder(next.filter(Boolean));
    }
  };

  // ---- Non-admin: plain grid (tap to open) ----
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
            className={cardClass(activeTool, tool, false, false, false)}
          >
            <CardInner tool={tool} activeTool={activeTool} isAdmin={false} />
          </motion.div>
        ))}
      </div>
    );
  }

  // ---- Admin: fixed-cell swap grid with long-press drag ----
  return (
    <>
      <div
        ref={gridRef}
        className="grid grid-cols-2 gap-2.5"
        style={{ touchAction: 'none' }}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        {cells.map((tool, i) => {
          const isPlaceholder = dragging?.index === i;
          const isTarget = dropTarget === i && dragInfo.current != null && dropTarget !== dragging?.index;
          if (!tool) {
            return (
              <div
                key={`empty-${i}`}
                ref={(el) => (cellRefs.current[i] = el)}
                className={`rounded-xl border-2 border-dashed flex items-center justify-center min-h-[88px] ${isTarget ? 'border-primary/70 bg-primary/10' : 'border-border/40 bg-card/20'}`}
              >
                <span className="text-[10px] text-muted-foreground/40 font-heading uppercase tracking-widest">Drop here</span>
              </div>
            );
          }
          return (
            <div
              key={tool.name}
              ref={(el) => (cellRefs.current[i] = el)}
              onPointerDown={(e) => onPointerDownCell(e, i)}
              onContextMenu={(e) => e.preventDefault()}
              className={cardClass(activeTool, tool, false, isPlaceholder, isTarget)}
            >
              <CardInner tool={tool} activeTool={activeTool} isAdmin={isAdmin} />
            </div>
          );
        })}
      </div>

      {dragging && dragging.tool && (
        <div
          className="fixed z-50 pointer-events-none rounded-xl border border-primary/60 bg-card shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
          style={{
            left: dragging.x - dragging.offsetX,
            top: dragging.y - dragging.offsetY,
            width: dragging.width,
            height: dragging.height,
            transform: 'scale(1.06)',
            opacity: 0.95,
          }}
        >
          <CardInner tool={dragging.tool} activeTool={activeTool} isAdmin={isAdmin} />
        </div>
      )}
    </>
  );
}